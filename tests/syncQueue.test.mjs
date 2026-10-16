// Offline queue robustness: request IDs, refused changes, possible duplicates, held changes.
import test from 'node:test';
import assert from 'node:assert/strict';

let loadCount = 0;
/** Fresh offlineStore with a fake phone (localStorage) and a fake server (`respond`). */
async function phone(queue, respond) {
  const storage = new Map();
  const sent = [];
  const farm = { clients: [], incubator_records: [], flocks: [], feed_records: [], poultry_sales: [], mortality: [], expenses: [] };
  storage.set('nvf_offline_db_cache_v2', JSON.stringify(farm));
  storage.set('nvf_offline_sync_queue_v2', JSON.stringify(queue));
  globalThis.localStorage = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, String(value)), removeItem: key => storage.delete(key) };
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { onLine: true } });
  globalThis.CustomEvent = class { constructor(type, options) { this.type = type; this.detail = options?.detail; } };
  globalThis.window = {
    dispatchEvent: () => {},
    fetch: async (path, init = {}) => {
      if (path === '/api/data') return new Response(JSON.stringify(farm), { status: 200 });
      const call = { path, method: init.method, headers: init.headers || {}, body: init.body ? JSON.parse(init.body) : undefined };
      sent.push(call);
      const [status, body] = await respond(call, sent.length);
      return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
    }
  };
  const store = await import(`../src/lib/offlineStore.ts?phone=${++loadCount}`);
  return { store, sent, storage };
}
const item = (id, timestamp, endpoint, method, body, extra = {}) => ({ id, requestId: id, timestamp, endpoint, method, body, type: endpoint.split('/')[2], description: `${method} ${endpoint}`, ...extra });
const ok = [200, { success: true }];

test('every new queued change gets its own request ID when it is queued', async () => {
  const { store } = await phone([], () => ok);
  const a = store.queueMutation({ endpoint: '/api/sales', method: 'POST', body: { id: 'sale-0001' }, type: 'sales', description: 'Sale' });
  const b = store.queueMutation({ endpoint: '/api/sales', method: 'POST', body: { id: 'sale-0002' }, type: 'sales', description: 'Sale' });
  assert.match(a.requestId, /^[\w-]{8,100}$/);
  assert.notEqual(a.requestId, b.requestId);
  assert.equal(store.getSyncQueue()[0].requestId, a.requestId, 'the ID is stored with the queued change');
  // Fallback when crypto.randomUUID is missing (plain http page / old WebView).
  const saved = globalThis.crypto.randomUUID;
  Object.defineProperty(globalThis.crypto, 'randomUUID', { configurable: true, value: undefined });
  try {
    const id = store.newClientId();
    assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  } finally {
    Object.defineProperty(globalThis.crypto, 'randomUUID', { configurable: true, value: saved });
  }
});

test('a retry after a lost reply sends the same request ID; old queued items without one still sync', async () => {
  let fail = true;
  const { store, sent } = await phone([
    item('req-retry-0001', 1, '/api/sales', 'POST', { id: 'sale-retry-1', quantity: 1 }),
    { id: 'legacy-item-0001', timestamp: 2, endpoint: '/api/expenses', method: 'POST', body: { id: 'exp-legacy-1' }, type: 'expenses', description: 'Old item' }
  ], () => { if (fail) { fail = false; throw new TypeError('Failed to fetch'); } return ok; });
  const first = await store.syncPendingQueue('token');
  assert.equal(first.stopped, true);
  assert.equal(first.retryable, true);
  assert.equal(store.getSyncQueue().length, 2);
  const second = await store.syncPendingQueue('token');
  assert.equal(second.success, true);
  assert.equal(store.getSyncQueue().length, 0);
  assert.equal(sent[0].headers['X-NVF-Request-Id'], 'req-retry-0001');
  assert.equal(sent[1].headers['X-NVF-Request-Id'], 'req-retry-0001', 'same ID on the retry');
  assert.equal(sent[2].headers['X-NVF-Request-Id'], 'legacy-item-0001', 'old items use their queue ID');
  assert.ok(sent[0].headers['X-NVF-Device-Id']);
  assert.equal(sent[0].headers['X-NVF-Device-Id'], sent[2].headers['X-NVF-Device-Id'], 'one stable device ID');
});

test('a refused change does not block later changes and keeps the server message', async () => {
  const { store, sent } = await phone([
    item('req-bad-00001', 1, '/api/mortality', 'POST', { id: 'mort-bad-1', flockId: 'gone' }),
    item('req-good-0001', 2, '/api/expenses', 'POST', { id: 'exp-good-1' }),
    item('req-good-0002', 3, '/api/sales', 'POST', { id: 'sale-good-1' })
  ], call => call.path === '/api/mortality' ? [404, { error: 'Flock does not exist.' }] : ok);
  const result = await store.syncPendingQueue('token');
  assert.equal(result.stopped, false);
  assert.equal(result.syncedCount, 2);
  assert.equal(result.needsAttention, 1);
  assert.deepEqual(sent.map(call => call.path), ['/api/mortality', '/api/expenses', '/api/sales']);
  const [left] = store.getSyncQueue();
  assert.equal(left.id, 'req-bad-00001');
  assert.equal(left.status, 'failed');
  assert.equal(left.error, 'Flock does not exist.');
  assert.equal(store.getSendableQueue().length, 0, 'a refused change does not keep the automatic sync running');
  assert.equal(globalThis.localStorage.getItem('nvf_offline_sync_problem_v1'), null);
});

test('no connection or a server error stops and keeps the order', async () => {
  let mode = 'network';
  const { store, sent } = await phone([
    item('req-order-001', 1, '/api/sales', 'POST', { id: 'sale-order-1' }),
    item('req-order-002', 2, '/api/sales', 'POST', { id: 'sale-order-2' }),
    item('req-order-003', 3, '/api/sales', 'POST', { id: 'sale-order-3' })
  ], (call, n) => {
    if (mode === 'network' && call.body.id === 'sale-order-2') throw new TypeError('Failed to fetch');
    if (mode === '503' && call.body.id === 'sale-order-2') return [503, { error: 'Farm data was not saved to the cloud. Please try again.' }];
    if (mode === 'conflict' && call.body.id === 'sale-order-2') return [409, { error: 'Farm data changed on another device.', code: 'CLOUD_CONFLICT' }];
    return ok;
  });
  let result = await store.syncPendingQueue('token');
  assert.equal(result.stopped, true);
  assert.equal(result.retryable, true);
  assert.deepEqual(store.getSyncQueue().map(q => q.id), ['req-order-002', 'req-order-003']);
  assert.ok(!store.getSyncQueue().some(q => q.status), 'nothing is marked failed for a network problem');
  for (mode of ['503', 'conflict']) {
    result = await store.syncPendingQueue('token');
    assert.equal(result.stopped, true, mode);
    assert.equal(result.retryable, true, mode);
    assert.deepEqual(store.getSyncQueue().map(q => q.id), ['req-order-002', 'req-order-003'], mode);
    assert.ok(!store.getSyncQueue().some(q => q.status), mode);
  }
  assert.ok(!sent.some(call => call.body.id === 'sale-order-3'), 'nothing after the stop was sent');
  mode = 'fine';
  result = await store.syncPendingQueue('token');
  assert.equal(result.success, true);
  assert.deepEqual(sent.slice(-2).map(call => call.body.id), ['sale-order-2', 'sale-order-3']);
});

test('sign-in problems stop the queue without marking the change as refused', async () => {
  const { store } = await phone([item('req-auth-0001', 1, '/api/sales', 'POST', { id: 'sale-auth-1' })], () => [401, { error: 'Unauthorized access: Please sign in.' }]);
  const result = await store.syncPendingQueue('token');
  assert.equal(result.stopped, true);
  assert.equal(result.retryable, false);
  assert.equal(store.getSyncQueue()[0].status, undefined);
});

test('possible duplicate waits for the person: Keep both resends with the force flag, Discard removes it', async () => {
  const duplicate = [409, { error: 'This looks like an entry already made by Dad: sale.', code: 'POSSIBLE_DUPLICATE', duplicate: { by: 'Dad', summary: 'sale on 2026-10-01: 2 Egg Tray to Ama (4000 FCFA)' } }];
  const { store, sent } = await phone([
    item('req-dup-00001', 1, '/api/sales', 'POST', { id: 'sale-dup-1' }),
    item('req-dup-00002', 2, '/api/mortality', 'POST', { id: 'mort-dup-1' }),
    item('req-after-001', 3, '/api/expenses', 'POST', { id: 'exp-after-1' })
  ], call => call.headers['X-NVF-Force-Duplicate'] === '1' || call.path === '/api/expenses' ? ok : duplicate);
  let result = await store.syncPendingQueue('token');
  assert.equal(result.syncedCount, 1, 'the later unrelated change still synced');
  let queue = store.getSyncQueue();
  assert.deepEqual(queue.map(q => q.status), ['duplicate', 'duplicate']);
  assert.equal(queue[0].duplicateOf.by, 'Dad');
  assert.match(queue[0].duplicateOf.summary, /2 Egg Tray/);
  // Duplicates are not re-sent on their own.
  const before = sent.length;
  await store.syncPendingQueue('token');
  assert.equal(sent.length, before);
  // Keep both
  store.keepBothQueuedChange('req-dup-00001');
  result = await store.syncPendingQueue('token');
  assert.equal(sent.at(-1).headers['X-NVF-Force-Duplicate'], '1');
  assert.equal(sent.at(-1).headers['X-NVF-Request-Id'], 'req-dup-00001', 'same request ID on Keep both');
  queue = store.getSyncQueue();
  assert.deepEqual(queue.map(q => q.id), ['req-dup-00002']);
  // Discard
  const sentBeforeDiscard = sent.length;
  await store.discardQueuedChange('req-dup-00002', 'token');
  assert.equal(store.getSyncQueue().length, 0);
  assert.equal(sent.length, sentBeforeDiscard, 'Discard never sends a delete to the server');
});

test('a change to a record whose create did not save is held, not sent; Retry of the create releases it', async () => {
  let accept = false;
  const { store, sent } = await phone([
    item('req-create-01', 1, '/api/sales', 'POST', { id: 'sale-held-0001', quantity: 2 }),
    item('req-update-01', 2, '/api/sales/sale-held-0001', 'PUT', { quantity: 3 }),
    item('req-other-001', 3, '/api/expenses', 'POST', { id: 'exp-other-1' })
  ], call => call.path === '/api/sales' && !accept ? [400, { error: 'Missing required sales fields.' }] : ok);
  await store.syncPendingQueue('token');
  let queue = store.getSyncQueue();
  assert.deepEqual(queue.map(q => [q.id, q.status]), [['req-create-01', 'failed'], ['req-update-01', 'held']]);
  assert.match(queue[1].error, /earlier change/);
  assert.ok(!sent.some(call => call.path === '/api/sales/sale-held-0001'), 'the update was not sent');
  assert.ok(sent.some(call => call.path === '/api/expenses'), 'unrelated change still synced');
  accept = true;
  store.retryQueuedChange('req-create-01');
  const result = await store.syncPendingQueue('token');
  assert.equal(result.success, true);
  assert.deepEqual(sent.slice(-2).map(call => call.path), ['/api/sales', '/api/sales/sale-held-0001'], 'create first, then its update');
});

test('discarding a refused create releases held changes instead of deleting them', async () => {
  const { store } = await phone([
    item('req-create-02', 1, '/api/feed', 'POST', { id: 'feed-held-0001' }),
    item('req-update-02', 2, '/api/feed/feed-held-0001', 'PUT', { bagsBought: 3 })
  ], call => call.method === 'POST' ? [400, { error: 'Missing required feed record fields.' }] : [404, { error: 'Feed record not found.' }]);
  await store.syncPendingQueue('token');
  assert.deepEqual(store.getSyncQueue().map(q => q.status), ['failed', 'held']);
  await store.discardQueuedChange('req-create-02', 'token');
  assert.deepEqual(store.getSyncQueue().map(q => [q.id, q.status]), [['req-update-02', undefined]], 'held change is kept and released');
  await store.syncPendingQueue('token');
  assert.equal(store.getSyncQueue()[0].status, 'failed');
  assert.equal(store.getSyncQueue()[0].error, 'Feed record not found.');
});
