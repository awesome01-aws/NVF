import test from 'node:test';
import assert from 'node:assert/strict';

test('data polling never replays a pending write or emits another data refresh', async () => {
  const storage = new Map();
  const events = [];
  const requests = [];
  const farm = { clients: [], incubator_records: [], flocks: [], feed_records: [], poultry_sales: [], mortality: [], expenses: [], cages: [] };
  storage.set('nvf_offline_db_cache_v2', JSON.stringify(farm));
  storage.set('nvf_offline_sync_queue_v2', JSON.stringify([{ id: 'queued-1', timestamp: 1, endpoint: '/api/farm/actions', method: 'POST', body: { id: 'cage-test-001', kind: 'farm_cage_add', payload: { animalType: 'Rabbit', blockName: 'House', cageName: 'R1' } }, type: 'farm', description: 'Add cage' }]));
  globalThis.localStorage = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) };
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { onLine: true } });
  globalThis.CustomEvent = class { constructor(type, options) { this.type = type; this.detail = options?.detail; } };
  globalThis.window = {
    dispatchEvent: event => events.push(event),
    fetch: async (path) => {
      requests.push(path);
      return new Response(JSON.stringify(farm), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
  };

  const { setupOfflineInterceptor } = await import('../src/lib/api.ts');
  const { syncPendingQueue, getSyncQueue } = await import('../src/lib/offlineStore.ts');
  setupOfflineInterceptor();

  for (let i = 0; i < 3; i++) {
    const response = await window.fetch('/api/data', { headers: { Authorization: 'open-access-operator' } });
    assert.equal(response.headers.get('X-NVF-Offline'), 'pending');
  }
  assert.equal(requests.length, 0, 'routine reads must not retry the queued cage');
  assert.equal(events.length, 0, 'routine reads must not restart App data loading');

  // Explicit replay is still allowed and removes only the acknowledged action.
  const result = await syncPendingQueue('open-access-operator');
  assert.equal(result.success, true);
  assert.equal(getSyncQueue().length, 0);
  assert.equal(requests.filter(path => path === '/api/farm/actions').length, 1);
  assert.equal(events.filter(event => event.detail?.change === 'data').length, 1);

  await window.fetch('/api/data', { headers: { Authorization: 'open-access-operator' } });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(events.filter(event => event.detail?.change === 'data').length, 1, 'cache refresh must not emit another data event');
});

test('failed replay keeps the queued cage and reports whether another automatic attempt is useful', async () => {
  const storage = new Map();
  const farm = { clients: [], incubator_records: [], flocks: [], feed_records: [], poultry_sales: [], mortality: [], expenses: [] };
  let status = 503;
  storage.set('nvf_offline_db_cache_v2', JSON.stringify(farm));
  storage.set('nvf_offline_sync_queue_v2', JSON.stringify([{ id: 'queued-2', timestamp: 1, endpoint: '/api/farm/actions', method: 'POST', body: { id: 'cage-test-002', kind: 'farm_cage_add', payload: { animalType: 'Rabbit', blockName: 'House', cageName: 'R2' } }, type: 'farm', description: 'Add cage' }]));
  globalThis.localStorage = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) };
  globalThis.CustomEvent = class { constructor(type, options) { this.type = type; this.detail = options?.detail; } };
  globalThis.window = { dispatchEvent: () => {}, fetch: async path => path === '/api/data' ? new Response(JSON.stringify(farm), { status: 200 }) : new Response(JSON.stringify({ error: 'Server rejected the change' }), { status }) };
  const { syncPendingQueue, getSyncQueue } = await import(`../src/lib/offlineStore.ts?failure=${Date.now()}`);
  assert.equal((await syncPendingQueue('open-access-operator')).retryable, true);
  assert.equal(getSyncQueue().length, 1);
  status = 400;
  assert.equal((await syncPendingQueue('open-access-operator')).retryable, false);
  assert.equal(getSyncQueue().length, 1);
  status = 200;
  assert.equal((await syncPendingQueue('open-access-operator')).success, true);
  assert.equal(getSyncQueue().length, 0);
});
