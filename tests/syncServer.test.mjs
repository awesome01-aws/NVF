// Server side of offline sync safety: request IDs (no double saves) and possible-duplicate checks.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';

async function freePort() {
  const server = createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}

async function start(dataDir, env, args = [join(process.cwd(), 'dist/server.cjs')]) {
  const port = await freePort();
  const child = spawn(process.execPath, args, { cwd: dataDir, env: { ...process.env, PORT: String(port), NVF_DATA_DIR: dataDir, NODE_ENV: 'production', ...env }, stdio: 'ignore' });
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 900; i++) {
    if (child.exitCode !== null) throw new Error(`Server stopped with ${child.exitCode}`);
    try { if ((await fetch(`${base}/api/auth/status`)).ok) return { child, base }; } catch (_) {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  child.kill();
  throw new Error('Server did not start');
}
async function stop(child) {
  child.kill();
  if (child.exitCode === null) await new Promise(resolve => child.once('exit', resolve));
}

function client(base) {
  const call = async (method, path, body, headers = {}) => {
    const response = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: response.status, body: await response.json().catch(() => ({})) };
  };
  return { call, post: (path, body, headers) => call('POST', path, body, headers) };
}
const sync = (token, requestId, deviceId, extra = {}) => ({ Authorization: token, 'X-NVF-Request-Id': requestId, 'X-NVF-Device-Id': deviceId, ...extra });

test('request IDs, possible duplicates, Keep both, and unchanged behaviour without IDs', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'nvf-sync-test-'));
  let server;
  try {
    server = await start(dataDir, { NVF_LOCAL_ONLY: '1', NVF_OPEN_ACCESS: '0' });
    const { call, post } = client(server.base);
    assert.equal((await post('/api/auth/register', { username: 'dad', name: 'Dad', password: 'strong-pass-123' })).status, 200);
    const dad = (await post('/api/auth/login', { username: 'dad', password: 'strong-pass-123' })).body.token;
    assert.equal((await post('/api/auth/register', { username: 'child', name: 'Child', password: 'strong-pass-456' }, { Authorization: dad })).status, 200);
    const kid = (await post('/api/auth/login', { username: 'child', password: 'strong-pass-456' })).body.token;
    const data = async () => (await call('GET', '/api/data', undefined, { Authorization: dad })).body;
    const flock = (await post('/api/flocks', { name: 'Sync hens', breed: 'Brahma', quantity: 50, ageWeeks: 20, dateAdded: '2026-09-01' }, { Authorization: dad })).body;
    const flockQty = async () => (await data()).flocks.find(item => item.id === flock.id).quantity;

    // 1. Same request ID twice (lost reply): saved once. No body.id, so only the request ID prevents a second sale.
    const sale = { date: '2026-10-01', itemType: 'Live Bird', quantity: 2, unitPrice: 3000, buyerName: 'Ama', flockId: flock.id };
    const first = await post('/api/sales', sale, sync(dad, 'req-sale-dad-0001', 'device-dad-0001'));
    assert.equal(first.status, 200);
    assert.equal(first.body.totalAmount, 6000);
    const replay = await post('/api/sales', sale, sync(dad, 'req-sale-dad-0001', 'device-dad-0001'));
    assert.equal(replay.status, 200);
    assert.equal(replay.body.success, true);
    assert.equal(replay.body.alreadySaved, true);
    assert.equal((await data()).poultry_sales.length, 1);
    assert.equal(await flockQty(), 48, 'flock count went down once');

    // 2. Same sale typed on another phone by another person: flagged, nothing saved or deleted.
    const dup = await post('/api/sales', { ...sale, buyerName: ' ama ' }, sync(kid, 'req-sale-kid-0001', 'device-kid-0001'));
    assert.equal(dup.status, 409);
    assert.equal(dup.body.code, 'POSSIBLE_DUPLICATE');
    assert.equal(dup.body.duplicate.by, 'Dad');
    assert.equal(dup.body.duplicate.recordId, first.body.id);
    assert.match(dup.body.error, /already made by Dad: sale on 2026-10-01: 2 Live Bird to Ama \(6000 FCFA\)/);
    assert.equal((await data()).poultry_sales.length, 1);
    assert.equal(await flockQty(), 48);
    // A different amount is not a duplicate.
    const other = await post('/api/sales', { ...sale, quantity: 1 }, sync(kid, 'req-sale-kid-0002', 'device-kid-0001'));
    assert.equal(other.status, 200);
    assert.equal(await flockQty(), 47);

    // 3. Keep both: same request ID with the force flag saves it; replaying that ID does not add a third.
    const keep = await post('/api/sales', sale, sync(kid, 'req-sale-kid-0001', 'device-kid-0001', { 'X-NVF-Force-Duplicate': '1' }));
    assert.equal(keep.status, 200);
    assert.equal((await post('/api/sales', sale, sync(kid, 'req-sale-kid-0001', 'device-kid-0001', { 'X-NVF-Force-Duplicate': '1' }))).body.alreadySaved, true);
    assert.equal((await data()).poultry_sales.length, 3);
    assert.equal(await flockQty(), 45);

    // 4. The same phone sending a second identical entry is not called "someone else".
    const loss = { date: '2026-10-02', flockId: flock.id, quantity: 1, cause: 'Sick' };
    assert.equal((await post('/api/mortality', loss, sync(dad, 'req-loss-dad-0001', 'device-dad-0001'))).status, 200);
    assert.equal((await post('/api/mortality', loss, sync(dad, 'req-loss-dad-0002', 'device-dad-0001'))).status, 200);
    const lossDup = await post('/api/mortality', loss, sync(kid, 'req-loss-kid-0001', 'device-kid-0001'));
    assert.equal(lossDup.status, 409);
    assert.match(lossDup.body.error, /loss on 2026-10-02: 1 from Sync hens/);
    assert.equal(await flockQty(), 43);

    // 5. Requests without a request ID behave exactly as before: no replay, no duplicate check.
    const plain = { date: '2026-10-03', category: 'Feed', description: 'Maize', amount: 5000 };
    assert.equal((await post('/api/expenses', plain, { Authorization: dad })).status, 200);
    assert.equal((await post('/api/expenses', plain, { Authorization: kid })).status, 200);
    assert.equal((await data()).expenses.filter(item => item.date === '2026-10-03').length, 2);
    // ...but an online entry is still known, so a synced copy from another phone is flagged.
    const expDup = await post('/api/expenses', plain, sync(kid, 'req-exp-kid-00001', 'device-kid-0001'));
    assert.equal(expDup.status, 409);
    assert.match(expDup.body.error, /already made by (Dad|Child)/);

    // 6. Upserting the same record ID is an update, not a duplicate.
    const feed = { id: 'feed-sync-0001', date: '2026-10-04', feedType: 'Layer mash', bagsBought: 2, weightPerBag: 50, costBag: 15000, stockRemaining: 2 };
    assert.equal((await post('/api/feed', feed, sync(dad, 'req-feed-dad-0001', 'device-dad-0001'))).status, 200);
    assert.equal((await post('/api/feed', { ...feed, stockRemaining: 1 }, sync(kid, 'req-feed-kid-0001', 'device-kid-0001'))).status, 200);
    assert.equal((await post('/api/feed', { ...feed, id: 'feed-sync-0002' }, sync(kid, 'req-feed-kid-0002', 'device-kid-0001'))).status, 409);

    // 7. Incubator batch and quail farm actions are checked too.
    const clientRec = (await post('/api/clients', { name: 'Sync Client', mark: 'SY', phone: '237600000001', location: 'Buea' }, { Authorization: dad })).body;
    const batch = { clientId: clientRec.id, dateBrought: '2026-10-05', eggsCollected: 30, specialCase: 'Standard', eggType: 'Brahma' };
    assert.equal((await post('/api/incubator', batch, sync(dad, 'req-inc-dad-00001', 'device-dad-0001'))).status, 200);
    assert.equal((await post('/api/incubator', batch, sync(kid, 'req-inc-kid-00001', 'device-kid-0001'))).status, 409);
    assert.equal((await data()).incubator_records.filter(item => item.clientId === clientRec.id).length, 1);
    assert.equal((await post('/api/farm/actions', { id: 'cage-sync-q1', kind: 'farm_cage_add', payload: { animalType: 'Quail', blockName: 'Birds', cageName: 'Q-SYNC' } }, { Authorization: dad })).status, 200);
    const qflock = (await post('/api/farm/actions', { id: 'qflock-sync-1', kind: 'quail_flock_add', payload: { name: 'Sync quail', date: '2026-10-01', ageWeeks: 6, quantity: 20, cageId: 'cage-sync-q1' } }, { Authorization: dad })).body.result;
    const qloss = (id) => ({ id, kind: 'quail_loss', payload: { date: '2026-10-05', flockId: qflock.id, quantity: 2, cause: 'Cold' } });
    assert.equal((await post('/api/farm/actions', qloss('qloss-dad-0001'), sync(dad, 'req-qloss-dad-01', 'device-dad-0001'))).status, 200);
    const qdup = await post('/api/farm/actions', qloss('qloss-kid-0001'), sync(kid, 'req-qloss-kid-01', 'device-kid-0001'));
    assert.equal(qdup.status, 409);
    assert.match(qdup.body.error, /quail loss on 2026-10-05: 2 from Sync quail/);
    assert.equal((await data()).flocks.find(item => item.id === qflock.id).quantity, 18);
    assert.equal((await post('/api/farm/actions', qloss('qloss-kid-0001'), sync(kid, 'req-qloss-kid-01', 'device-kid-0001', { 'X-NVF-Force-Duplicate': '1' }))).status, 200);
    assert.equal((await data()).flocks.find(item => item.id === qflock.id).quantity, 16);

    // 8. A refused change does not mark its request ID as processed: fixing it and resending works.
    const bad = await post('/api/mortality', { date: '2026-10-06', flockId: 'no-such-flock', quantity: 1 }, sync(kid, 'req-bad-kid-00001', 'device-kid-0001'));
    assert.equal(bad.status, 404);
    assert.equal((await post('/api/mortality', { date: '2026-10-06', flockId: flock.id, quantity: 1 }, sync(kid, 'req-bad-kid-00001', 'device-kid-0001'))).status, 200);

    // 9. Daily eggs keep the existing same-day rule (no duplicate prompt).
    const eggs = await post('/api/daily_egg_collections', { date: '2026-10-07', brahmaEggs: 5, turkeyEggs: 0, expected: null }, sync(dad, 'req-egg-dad-00001', 'device-dad-0001'));
    assert.equal(eggs.status, 200);
    const eggs2 = await post('/api/daily_egg_collections', { date: '2026-10-07', brahmaEggs: 5, turkeyEggs: 0, expected: null }, sync(kid, 'req-egg-kid-00001', 'device-kid-0001'));
    assert.equal(eggs2.status, 409);
    assert.notEqual(eggs2.body.code, 'POSSIBLE_DUPLICATE');

    // The bookkeeping lists stay out of the app data and are bounded.
    const snapshot = await data();
    assert.equal(snapshot.sync_request_receipts, undefined);
    assert.equal(snapshot.sync_recent_creates, undefined);
  } finally {
    if (server) await stop(server.child);
    rmSync(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});

test('cloud mode: a failed cloud save does not remember the request ID, so the retry is saved once', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'nvf-sync-cloud-'));
  writeFileSync(join(dataDir, 'firebase-applet-config.json'), JSON.stringify({ projectId: 'test-project', firestoreDatabaseId: 'test-db' }));
  let server;
  try {
    server = await start(dataDir, { NVF_LOCAL_ONLY: '0', NVF_OPEN_ACCESS: '1', NVF_TEST_FAIL_FIRST_WRITE: '1' }, ['--require', join(process.cwd(), 'tests/mockFirestore.cjs'), join(process.cwd(), 'dist/server.cjs')]);
    const { call, post } = client(server.base);
    const expense = { date: '2026-10-01', category: 'Feed', description: 'Bran', amount: 2500 };
    const headers = { 'X-NVF-Request-Id': 'req-cloud-000001', 'X-NVF-Device-Id': 'device-cloud-001' };
    assert.equal((await post('/api/expenses', expense, headers)).status, 503, 'first cloud write fails');
    const retry = await post('/api/expenses', expense, headers);
    assert.equal(retry.status, 200);
    assert.equal(retry.body.alreadySaved, undefined, 'the retry is really applied');
    assert.equal((await post('/api/expenses', expense, headers)).body.alreadySaved, true);
    assert.equal((await call('GET', '/api/data')).body.expenses.length, 1);
  } finally {
    if (server) await stop(server.child);
    rmSync(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});
