import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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

async function startServer(port, dataDir, envOverrides = {}) {
  const child = spawn(process.execPath, ['dist/server.cjs'], {
    cwd: process.cwd(), env: { ...process.env, PORT: String(port), NVF_DATA_DIR: dataDir, NODE_ENV: 'production', NVF_LOCAL_ONLY: '1', NVF_OPEN_ACCESS: '0', ...envOverrides }, stdio: 'ignore'
  });
  for (let i = 0; i < 900; i++) {
    if (child.exitCode !== null) throw new Error(`Server stopped with ${child.exitCode}`);
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/auth/status`);
      if (response.ok) return child;
    } catch (_) {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  child.kill();
  throw new Error('Server did not start');
}

test('family sessions, shared records, offline rejection and durable storage', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'nvf-test-'));
  const port = await freePort();
  const base = `http://127.0.0.1:${port}`;
  let server;
  const request = async (path, options = {}) => {
    const response = await fetch(base + path, options);
    return { status: response.status, body: await response.json() };
  };
  const post = (path, body, token) => request(path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: token } : {}) }, body: JSON.stringify(body) });
  try {
    server = await startServer(port, dataDir);
    assert.equal((await fetch(base + '/api/auth/status', { headers: { Origin: 'https://untrusted.example' } })).status, 403);
    assert.equal((await fetch(base + '/api/auth/status', { headers: { Origin: base } })).status, 200);
    const worker = await (await fetch(base + '/sw.js')).text();
    assert.match(worker, /nvf-shell-[0-9a-f]{12}/);
    assert.match(worker, /\/assets\/IncubatorMod-/);
    assert.doesNotMatch(worker, /__NVF_CACHE_NAME__/);
    assert.equal((await request('/api/data')).status, 401);
    assert.equal((await request('/api/cages')).status, 401);
    assert.equal((await request('/api/cage_allocations')).status, 401);
    assert.equal((await post('/api/auth/register', { username: 'dad', name: 'Dad', password: 'strong-pass-123' })).status, 200);
    assert.equal((await request('/api/data', { headers: { Authorization: 'dad' } })).status, 401);
    assert.equal((await post('/api/auth/register', { username: 'child', name: 'Child', password: 'strong-pass-456' })).status, 401);

    const dad = await post('/api/auth/login', { username: 'dad', password: 'strong-pass-123' });
    assert.equal(dad.status, 200);
    assert.ok(dad.body.token.length >= 32);
    assert.equal((await request('/api/data', { headers: { Authorization: dad.body.user.id } })).status, 401);
    assert.equal((await post('/api/auth/register', { username: 'child', name: 'Child', password: 'strong-pass-456' }, dad.body.token)).status, 200);
    const child = await post('/api/auth/login', { username: 'child', password: 'strong-pass-456' });
    assert.equal(child.status, 200);

    assert.equal((await post('/api/farm/actions', { id: 'hutch-auth', kind: 'rabbit_hutch', payload: { name: 'Family hutch' } })).status, 401);
    assert.equal((await post('/api/farm/actions', { id: 'hutch-auth', kind: 'rabbit_hutch', payload: { name: 'Family hutch' } }, dad.body.token)).status, 200);
    assert.equal((await post('/api/farm/actions', { id: 'rabbit-dad', kind: 'rabbit_add', payload: { name: 'Molly', sex: 'female', date: '2026-09-28', hutchId: 'hutch-auth' } }, dad.body.token)).status, 200);
    const seenByChild = await request('/api/data', { headers: { Authorization: child.body.token } });
    assert.equal(seenByChild.body.rabbits.find(item => item.id === 'rabbit-dad')?.name, 'Molly');
    assert.equal(seenByChild.body.rabbit_hutches[0]?.name, 'Family hutch');
    assert.equal(seenByChild.body.cages.find(item => item.id === 'hutch-auth')?.animalType, 'Rabbit');
    const rabbitMeal = { id: 'family-rabbit-meal', kind: 'rabbit_eaten', payload: { date: '2026-10-01', rabbitIds: ['rabbit-dad'] } };
    assert.equal((await post('/api/farm/actions', rabbitMeal, child.body.token)).status, 200);
    assert.equal((await post('/api/farm/actions', rabbitMeal, dad.body.token)).status, 200);
    const seenMeal = await request('/api/data', { headers: { Authorization: dad.body.token } });
    assert.equal(seenMeal.body.rabbits[0].status, 'eaten');
    assert.equal(seenMeal.body.rabbit_eaten.length, 1);
    assert.equal((await post('/api/farm/actions', { id: 'undo-family-meal', kind: 'rabbit_eaten_void', payload: { recordId: rabbitMeal.id } }, dad.body.token)).status, 200);
    assert.equal((await post('/api/farm/actions', { id: 'family-rabbit-sale', kind: 'rabbit_sale', payload: { date: '2026-10-01', rabbitIds: ['rabbit-dad'], buyerName: 'Buyer', totalAmount: 1500 } }, child.body.token)).status, 200);
    assert.equal((await request('/api/sales/family-rabbit-sale', { method: 'DELETE', headers: { Authorization: dad.body.token } })).status, 409);
    assert.equal((await post('/api/bulk-delete', { type: 'sales', ids: ['family-rabbit-sale'] }, dad.body.token)).status, 409);
    assert.equal((await post('/api/sync', { items: [{ id: 'legacy-sale-delete', endpoint: '/api/sales/family-rabbit-sale', method: 'DELETE' }] }, dad.body.token)).status, 409);
    assert.equal((await post('/api/farm/actions', { id: 'undo-family-sale', kind: 'rabbit_sale_void', payload: { saleId: 'family-rabbit-sale' } }, dad.body.token)).status, 200);
    assert.equal((await post('/api/farm/actions', { id: 'quail-eggs-family', kind: 'quail_eggs', payload: { date: '2026-10-01', quantity: 6 } }, dad.body.token)).status, 200);
    const poultryEggs = await post('/api/daily_egg_collections', { date: '2026-10-01', brahmaEggs: 3, turkeyEggs: 1 }, child.body.token);
    assert.equal(poultryEggs.status, 200);
    assert.equal(poultryEggs.body.record.totalEggs, 10);
    assert.equal((await request(`/api/daily_egg_collections/${poultryEggs.body.record.id}`, { method: 'DELETE', headers: { Authorization: dad.body.token } })).status, 200);
    const afterPoultryDelete = await request('/api/data', { headers: { Authorization: child.body.token } });
    assert.equal(afterPoultryDelete.body.daily_egg_collections.find(item => item.date === '2026-10-01')?.quailEggs, 6);
    const quailOnlyEggs = await post('/api/daily_egg_collections', { date: '2026-10-03', brahmaEggs: 0, turkeyEggs: 0, quailEggs: 8, expected: null }, child.body.token);
    assert.equal(quailOnlyEggs.status, 200);
    assert.equal(quailOnlyEggs.body.record.totalEggs, 8);
    assert.equal((await post('/api/daily_egg_collections', { date: '2026-10-04', brahmaEggs: 1.5, turkeyEggs: 0, quailEggs: 0 }, child.body.token)).status, 400);
    const originalEggCounts = { id: quailOnlyEggs.body.record.id, brahmaEggs: 0, turkeyEggs: 0, quailEggs: 8 };
    assert.equal((await request(`/api/daily_egg_collections/${originalEggCounts.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: dad.body.token }, body: JSON.stringify({ date: '2026-10-03', quailEggs: 9, expected: originalEggCounts }) })).status, 200);
    assert.equal((await request(`/api/daily_egg_collections/${originalEggCounts.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: child.body.token }, body: JSON.stringify({ date: '2026-10-03', quailEggs: 10, expected: originalEggCounts }) })).status, 409);
    assert.equal((await post('/api/farm/actions', { id: 'farm-eggs-set', kind: 'quail_egg_use', payload: { date: '2026-10-02', useKind: 'set', quantity: 2 } }, dad.body.token)).status, 200);
    const farmBatchId = 'farm-farm-eggs-set';
    assert.equal((await request(`/api/incubator/${farmBatchId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: dad.body.token }, body: JSON.stringify({ chicksHatched: 2 }) })).status, 409);
    assert.equal((await request(`/api/incubator/${farmBatchId}`, { method: 'DELETE', headers: { Authorization: dad.body.token } })).status, 409);
    assert.equal((await post('/api/bulk-delete', { type: 'incubator', ids: [farmBatchId] }, dad.body.token)).status, 409);

    const flock = await post('/api/flocks', { name: 'Test hens', breed: 'Brahma', quantity: 12, ageWeeks: 2, dateAdded: '2026-09-28' }, dad.body.token);
    assert.equal(flock.status, 200);
    const shared = await request('/api/data', { headers: { Authorization: child.body.token } });
    assert.equal(shared.status, 200);
    assert.ok(shared.body.flocks.some(item => item.name === 'Test hens'));
    const allocation = await post('/api/cage_allocations', { blockName: 'BLOCK 1', cageName: 'CAGE B', flockName: 'Test hens', species: 'Chicken', quantity: 12, ageWeeks: 2, dateAdded: '2026-09-28' }, dad.body.token);
    assert.equal(allocation.status, 200);
    const correction = await post('/api/farm/actions', { id: 'count-family-001', kind: 'cage_count_correct', payload: { allocationId: `flock-${flock.body.id}`, expectedQuantity: 12, quantity: 10, reason: 'Two chicks were counted twice', date: '2026-10-10' } }, child.body.token);
    assert.equal(correction.status, 200);
    const afterCount = await request('/api/data', { headers: { Authorization: dad.body.token } });
    assert.equal(afterCount.body.flocks.find(item => item.id === flock.body.id)?.quantity, 10);
    assert.equal(afterCount.body.cage_allocations.find(item => item.flockName === 'Test hens')?.quantity, 10);
    assert.equal(afterCount.body.cage_count_corrections[0].reason, 'Two chicks were counted twice');
    assert.ok(afterCount.body.activity_log.some(item => item.actor === 'Child' && item.action === 'Corrected cage count' && item.detail.includes('12 → 10')));
    assert.equal((await request(`/api/cage_allocations/flock-${flock.body.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: dad.body.token }, body: JSON.stringify({ quantity: 9 }) })).status, 400);
    assert.equal(shared.body.sessions, undefined);
    assert.equal((await post('/api/sync', { items: [{ id: 'x', endpoint: '/api/unsupported', method: 'POST', body: {} }] }, dad.body.token)).status, 409);

    const file = JSON.parse(readFileSync(join(dataDir, 'db.json'), 'utf8'));
    assert.ok(file.flocks.some(item => item.name === 'Test hens'));
    assert.ok(file.users.every(user => user.passwordHash.startsWith('scrypt:')));

    server.kill();
    await new Promise(resolve => server.once('exit', resolve));
    server = await startServer(port, dataDir);
    const afterRestart = await request('/api/data', { headers: { Authorization: child.body.token } });
    assert.equal(afterRestart.status, 200);
    assert.ok(afterRestart.body.flocks.some(item => item.name === 'Test hens'));
    const removed = await request(`/api/flocks/${flock.body.id}`, { method: 'DELETE', headers: { Authorization: dad.body.token } });
    assert.equal(removed.status, 200);
    server.kill();
    await new Promise(resolve => server.once('exit', resolve));
    server = await startServer(port, dataDir);
    const afterDeleteRestart = await request('/api/data', { headers: { Authorization: dad.body.token } });
    assert.equal(afterDeleteRestart.body.flocks.some(item => item.name === 'Test hens'), false);
    assert.equal((await post('/api/auth/logout', {}, child.body.token)).status, 200);
    assert.equal((await request('/api/data', { headers: { Authorization: child.body.token } })).status, 401);
  } finally {
    server?.kill();
    rmSync(dataDir, { recursive: true, force: true });
  }
});

test('open access skips sign-in, keeps shared records, and does not expose stored accounts', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'nvf-open-test-'));
  const port = await freePort();
  const base = `http://127.0.0.1:${port}`;
  let server;
  const post = (path, body) => fetch(base + path, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
  });
  try {
    server = await startServer(port, dataDir);
    assert.equal((await post('/api/auth/register', { username: 'dad', name: 'Dad', password: 'strong-pass-123' })).status, 200);
    server.kill();
    await new Promise(resolve => server.once('exit', resolve));

    server = await startServer(port, dataDir, { NVF_OPEN_ACCESS: '1' });
    const status = await (await fetch(base + '/api/auth/status')).json();
    assert.equal(status.authDisabled, true);
    assert.equal(status.setupRequired, false);
    assert.equal(status.userCount, 1);
    assert.equal((await post('/api/auth/login', { username: 'dad', password: 'strong-pass-123' })).status, 410);
    assert.equal((await post('/api/auth/register', { username: 'other', name: 'Other', password: 'strong-pass-456' })).status, 410);

    const firstPhone = await fetch(base + '/api/data');
    assert.equal(firstPhone.status, 200);
    const initialData = await firstPhone.json();
    assert.deepEqual(initialData.users, []);
    assert.equal(initialData.sessions, undefined);
    assert.equal((await fetch(base + '/api/db-raw')).status, 200);

    const action = { id: 'open-hutch', kind: 'rabbit_hutch', payload: { name: 'Family hutch' } };
    assert.equal((await post('/api/farm/actions', action)).status, 200);
    assert.equal((await post('/api/farm/actions', action)).status, 200);
    const secondPhone = await (await fetch(base + '/api/data')).json();
    assert.equal(secondPhone.rabbit_hutches.filter(item => item.id === 'open-hutch').length, 1);
    assert.ok(secondPhone.activity_log.some(item => item.actor === 'Farm member' && item.action === 'Recorded rabbit hutch'));
    assert.equal((await fetch(base + '/api/data', { headers: { Origin: 'https://untrusted.example' } })).status, 403);

    server.kill();
    await new Promise(resolve => server.once('exit', resolve));
    server = await startServer(port, dataDir, { NVF_OPEN_ACCESS: '1' });
    const afterRestart = await (await fetch(base + '/api/data')).json();
    assert.equal(afterRestart.rabbit_hutches.filter(item => item.id === 'open-hutch').length, 1);
    const stored = JSON.parse(readFileSync(join(dataDir, 'db.json'), 'utf8'));
    assert.equal(stored.users[0].name, 'Dad');
  } finally {
    server?.kill();
    rmSync(dataDir, { recursive: true, force: true });
  }
});

test('production refuses disposable local storage without explicit local-only mode', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'nvf-no-cloud-test-'));
  const port = await freePort();
  const child = spawn(process.execPath, ['dist/server.cjs'], {
    cwd: process.cwd(),
    env: { ...process.env, PORT: String(port), NVF_DATA_DIR: dataDir, NODE_ENV: 'production', NVF_LOCAL_ONLY: '0' },
    stdio: 'ignore'
  });
  try {
    const exitCode = await Promise.race([
      new Promise(resolve => child.once('exit', resolve)),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Production server unexpectedly stayed alive')), 90000))
    ]);
    assert.notEqual(exitCode, 0);
  } finally {
    child.kill();
    if (child.exitCode === null) await new Promise(resolve => child.once('exit', resolve));
    rmSync(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});

test('cloud mode ignores stale local data and acknowledges only committed Firestore writes', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'nvf-cloud-test-'));
  const port = await freePort();
  const base = `http://127.0.0.1:${port}`;
  const serverPath = join(process.cwd(), 'dist/server.cjs');
  const mockPath = join(process.cwd(), 'tests/mockFirestore.cjs');
  writeFileSync(join(dataDir, 'firebase-applet-config.json'), JSON.stringify({ projectId: 'test-project', firestoreDatabaseId: 'test-db' }));
  writeFileSync(join(dataDir, 'db.json'), JSON.stringify({ users: [{ id: 'stale', username: 'stale', passwordHash: 'old', name: 'Stale' }] }));
  const child = spawn(process.execPath, ['--require', mockPath, serverPath], {
    cwd: dataDir,
    env: { ...process.env, NODE_ENV: 'production', NVF_DATA_DIR: dataDir, PORT: String(port), NVF_LOCAL_ONLY: '0', NVF_OPEN_ACCESS: '0', NVF_TEST_FAIL_FIRST_WRITE: '1' },
    stdio: 'ignore'
  });
  try {
    let ready = false;
    for (let i = 0; i < 200; i++) {
      try {
        const result = await fetch(base + '/api/auth/status');
        if (result.ok) { ready = true; break; }
      } catch (_) {}
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.equal(ready, true);
    assert.equal((await (await fetch(base + '/api/auth/status')).json()).userCount, 0);
    const registration = () => fetch(base + '/api/auth/register', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Dad', username: 'dad', password: 'strong-pass-123' })
    });
    const failed = await registration();
    assert.equal(failed.status, 503);
    assert.equal((await (await fetch(base + '/api/auth/status')).json()).userCount, 0);
    const started = Date.now();
    const saved = await registration();
    assert.equal(saved.status, 200);
    assert.ok(Date.now() - started >= 200, 'API must wait for the Firestore transaction');
    assert.equal((await (await fetch(base + '/api/auth/status')).json()).userCount, 1);
  } finally {
    child.kill();
    if (child.exitCode === null) await new Promise(resolve => child.once('exit', resolve));
    rmSync(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});

test('one-time loopback account recovery keeps existing records and closes after use', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'nvf-recovery-test-'));
  const port = await freePort();
  const base = `http://127.0.0.1:${port}`;
  const post = async (path, body, token) => {
    const response = await fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: token } : {}) }, body: JSON.stringify(body) });
    return { status: response.status, body: await response.json() };
  };
  let server;
  const recoveryEnv = { NVF_LOCAL_ACCOUNT_RECOVERY: '1', NVF_HOST: '127.0.0.1' };
  try {
    server = await startServer(port, dataDir);
    assert.equal((await post('/api/auth/register', { username: 'first', name: 'First', password: 'first-pass-123' })).status, 200);
    const first = await post('/api/auth/login', { username: 'first', password: 'first-pass-123' });
    assert.equal(first.status, 200);
    assert.equal((await post('/api/flocks', { name: 'Existing hens', breed: 'Brahma', quantity: 5, ageWeeks: 2, dateAdded: '2026-09-28' }, first.body.token)).status, 200);
    server.kill();
    await new Promise(resolve => server.once('exit', resolve));

    server = await startServer(port, dataDir, recoveryEnv);
    const statusBefore = await (await fetch(base + '/api/auth/status')).json();
    assert.equal(statusBefore.setupRequired, false);
    assert.equal(statusBefore.localRecoveryAllowed, true);
    assert.equal((await post('/api/auth/register', { username: 'recovered', name: 'Recovered', password: 'recovery-pass-123' })).status, 200);
    const statusAfter = await (await fetch(base + '/api/auth/status')).json();
    assert.equal(statusAfter.localRecoveryAllowed, false);
    assert.equal((await post('/api/auth/register', { username: 'extra', name: 'Extra', password: 'extra-pass-123' })).status, 401);
    const recovered = await post('/api/auth/login', { username: 'recovered', password: 'recovery-pass-123' });
    assert.equal(recovered.status, 200);
    const shared = await (await fetch(base + '/api/data', { headers: { Authorization: recovered.body.token } })).json();
    assert.ok(shared.flocks.some(flock => flock.name === 'Existing hens'));

    server.kill();
    await new Promise(resolve => server.once('exit', resolve));
    server = await startServer(port, dataDir, recoveryEnv);
    assert.equal((await (await fetch(base + '/api/auth/status')).json()).localRecoveryAllowed, false);
  } finally {
    server?.kill();
    rmSync(dataDir, { recursive: true, force: true });
  }
});

test('rabbit housing can be deleted, keeps history, and egg imports keep the other species', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'nvf-test-'));
  const port = await freePort();
  const base = `http://127.0.0.1:${port}`;
  let server;
  const call = async (method, path, body) => {
    const response = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    return { status: response.status, body: await response.json() };
  };
  const action = (kind, payload) => call('POST', '/api/farm/actions', { id: crypto.randomUUID(), kind, payload });
  try {
    server = await startServer(port, dataDir, { NVF_OPEN_ACCESS: '1' });
    const empty = (await action('farm_cage_add', { animalType: 'Rabbit', blockName: 'House', cageName: 'R1' })).body.result;
    const removed = await call('DELETE', `/api/cages/${empty.id}`);
    assert.equal(removed.status, 200);
    let data = (await call('GET', '/api/data')).body;
    assert.ok(!data.cages.some(c => c.id === empty.id) && !data.rabbit_hutches.some(h => h.id === empty.id));

    const used = (await action('farm_cage_add', { animalType: 'Rabbit', blockName: 'House', cageName: 'R2' })).body.result;
    const spare = (await action('farm_cage_add', { animalType: 'Rabbit', blockName: 'House', cageName: 'R3' })).body.result;
    const doe = (await action('rabbit_add', { date: '2026-10-01', name: 'Doe', sex: 'female', hutchId: used.id })).body.result;
    const occupied = await call('DELETE', `/api/cages/${used.id}`);
    assert.equal(occupied.status, 409);
    assert.match(occupied.body.error, /Move the 1 rabbit/);
    assert.equal((await action('rabbit_move', { date: '2026-10-02', rabbitIds: [doe.id], toHutchId: spare.id })).status, 200);
    const archived = await call('DELETE', `/api/cages/${used.id}`);
    assert.equal(archived.status, 200);
    assert.equal(archived.body.archived, true);
    data = (await call('GET', '/api/data')).body;
    assert.equal(data.rabbit_hutches.find(h => h.id === used.id).archived, true);
    assert.equal((await action('rabbit_move', { date: '2026-10-03', rabbitIds: [doe.id], toHutchId: used.id })).status, 400);

    assert.equal((await call('POST', '/api/daily_egg_collections', { date: '2026-10-01', brahmaEggs: 40, turkeyEggs: 0, quailEggs: 0, expected: null })).status, 200);
    assert.equal((await call('POST', '/api/daily_egg_collections', { date: '2026-10-01', turkeyEggs: 5 })).status, 200);
    const day = (await call('GET', '/api/data')).body.daily_egg_collections.find(r => r.date === '2026-10-01');
    assert.deepEqual([day.brahmaEggs, day.turkeyEggs, day.totalEggs], [40, 5, 45]);
  } finally {
    server?.kill();
    rmSync(dataDir, { recursive: true, force: true });
  }
});
