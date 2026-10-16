// Small data-integrity rules: honest flock deletes, cage deletes by unique ID, and older routes
// that must follow the same linked-stock rules as the main routes. Local mode only, temp data.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
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

/** Start the built server on an empty temp folder (open access, local storage only). */
async function farm(run) {
  const dataDir = mkdtempSync(join(tmpdir(), 'nvf-integrity-'));
  const port = await freePort();
  const base = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, [join(process.cwd(), 'dist/server.cjs')], {
    cwd: dataDir, env: { ...process.env, PORT: String(port), NVF_DATA_DIR: dataDir, NODE_ENV: 'production', NVF_LOCAL_ONLY: '1', NVF_OPEN_ACCESS: '1' }, stdio: 'ignore'
  });
  try {
    let up = false;
    for (let i = 0; i < 900 && !up; i++) {
      if (child.exitCode !== null) throw new Error(`Server stopped with ${child.exitCode}`);
      try { up = (await fetch(`${base}/api/auth/status`)).ok; } catch (_) {}
      if (!up) await new Promise(resolve => setTimeout(resolve, 100));
    }
    if (!up) throw new Error('Server did not start');
    const call = async (method, path, body, headers = {}) => {
      const response = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
      return { status: response.status, body: await response.json().catch(() => ({})) };
    };
    const action = async (kind, payload) => {
      const result = await call('POST', '/api/farm/actions', { id: crypto.randomUUID(), kind, payload });
      assert.equal(result.status, 200, `${kind}: ${JSON.stringify(result.body)}`);
      return result.body.result;
    };
    const data = async () => (await call('GET', '/api/data')).body;
    const flock = async (name, quantity = 10) => {
      const result = await call('POST', '/api/flocks', { name, breed: 'Brahma', quantity, ageWeeks: 2, dateAdded: '2026-10-01', notes: 'ST 1' });
      assert.equal(result.status, 200);
      return result.body;
    };
    await run({ call, action, data, flock });
  } finally {
    child.kill();
    if (child.exitCode === null) await new Promise(resolve => child.once('exit', resolve));
    rmSync(dataDir, { recursive: true, force: true });
  }
}

test('flock delete: 404 with a plain message when nothing matched; bulk delete reports what was not found', async () => {
  await farm(async ({ call, data, flock }) => {
    const missing = await call('DELETE', '/api/flocks/no-such-flock-1');
    assert.equal(missing.status, 404);
    assert.equal(missing.body.error, 'That flock was not found. It may already have been deleted.');
    assert.equal(missing.body.code, 'ALREADY_DELETED');

    const one = await flock('Delete me');
    await call('POST', '/api/cage_allocations', { blockName: 'BLOCK 0', cageName: 'ST 1', flockName: 'Delete me', quantity: 10 });
    await call('POST', '/api/mortality', { date: '2026-10-02', flockId: one.id, quantity: 1 });
    const before = (await data()).activity_log.length;
    assert.equal((await call('DELETE', `/api/flocks/${one.id}`)).status, 200);
    let farmNow = await data();
    assert.ok(!farmNow.flocks.some(f => f.id === one.id));
    assert.ok(!farmNow.cage_allocations.some(a => a.flockName === 'Delete me'), 'its cage row goes too');
    assert.ok(!farmNow.mortality.some(m => m.flockId === one.id), 'its loss records go too');
    const again = await call('DELETE', `/api/flocks/${one.id}`);
    assert.equal(again.status, 404);
    assert.equal((await data()).activity_log.length, before + 1, 'a delete that matched nothing saves nothing');

    // Bulk: deletes the ones found, reports the missing ones.
    const a = await flock('Bulk A');
    const b = await flock('Bulk B');
    const keep = await flock('Bulk keep');
    const partial = await call('POST', '/api/bulk-delete', { type: 'flocks', ids: [a.id, 'gone-flock-9', b.id] });
    assert.equal(partial.status, 200);
    assert.equal(partial.body.deletedCount, 2);
    assert.equal(partial.body.count, 2);
    assert.deepEqual(partial.body.notFoundIds, ['gone-flock-9']);
    farmNow = await data();
    assert.deepEqual(farmNow.flocks.filter(f => f.name.startsWith('Bulk')).map(f => f.id), [keep.id]);

    const none = await call('POST', '/api/bulk-delete', { type: 'flocks', ids: [a.id, b.id] });
    assert.equal(none.status, 404);
    assert.equal(none.body.code, 'ALREADY_DELETED');
    assert.deepEqual(none.body.notFoundIds, [a.id, b.id]);
    assert.equal((await data()).flocks.filter(f => f.id === keep.id).length, 1, 'nothing else touched');

    // A queued offline delete replayed with its request ID after the flock is gone gets the same clear answer.
    const replay = await call('DELETE', `/api/flocks/${a.id}`, undefined, { 'X-NVF-Request-Id': 'queued-delete-0001', 'X-NVF-Device-Id': 'phone-device-0001' });
    assert.equal(replay.status, 404);
    assert.equal(replay.body.code, 'ALREADY_DELETED');
  });
});

test('cage delete uses the unique ID; a name alone is accepted only when exactly one cage has it', async () => {
  await farm(async ({ call, action, data }) => {
    const north = await action('farm_cage_add', { animalType: 'Poultry', blockName: 'NORTH', cageName: 'TWIN' });
    const south = await action('farm_cage_add', { animalType: 'Poultry', blockName: 'SOUTH', cageName: 'TWIN' });
    // Birds live in the NORTH twin only.
    await call('POST', '/api/cage_allocations', { blockName: 'NORTH', cageName: 'TWIN', flockName: 'North birds', quantity: 4 });

    // Name only, two cages have it: refused, nothing deleted.
    const ambiguous = await call('DELETE', '/api/cages/twin');
    assert.equal(ambiguous.status, 409);
    assert.equal(ambiguous.body.code, 'AMBIGUOUS_CAGE_NAME');
    assert.match(ambiguous.body.error, /More than one cage is called 'TWIN'/);
    let cages = (await data()).cages;
    assert.ok(cages.some(c => c.id === north.id) && cages.some(c => c.id === south.id));

    // By ID: the empty SOUTH twin is removed; the occupied NORTH twin is untouched.
    assert.equal((await call('DELETE', `/api/cages/${south.id}`)).status, 200);
    cages = (await data()).cages;
    assert.ok(cages.some(c => c.id === north.id) && !cages.some(c => c.id === south.id));
    // The occupied one is still protected when deleted by ID.
    assert.equal((await call('DELETE', `/api/cages/${north.id}`)).status, 409);

    // Name only, exactly one cage has it now: accepted (backward compatible), still with the same rules.
    assert.equal((await call('DELETE', '/api/cages/TWIN')).status, 409, 'occupied cage still refused');
    const lone = await action('farm_cage_add', { animalType: 'Poultry', blockName: 'EAST', cageName: 'SOLO' });
    assert.equal((await call('DELETE', '/api/cages/solo')).status, 200);
    assert.ok(!(await data()).cages.some(c => c.id === lone.id));
    assert.equal((await call('DELETE', '/api/cages/solo')).status, 404);
  });
});

test('older routes follow the same linked-stock rules as the main routes', async () => {
  await farm(async ({ call, action, data, flock }) => {
    // Quail flock in its own cage, made the normal way.
    const cage = await action('farm_cage_add', { animalType: 'Quail', blockName: 'QUAIL HOUSE', cageName: 'Q1' });
    const other = await action('farm_cage_add', { animalType: 'Quail', blockName: 'QUAIL HOUSE', cageName: 'Q2' });
    const quail = await action('quail_flock_add', { date: '2026-10-01', name: 'Layers', quantity: 30, ageWeeks: 6, cageId: cage.id });
    const rowId = `flock-${quail.id}`;
    assert.equal((await data()).cage_allocations.find(a => a.id === rowId).quantity, 30);

    // Hand-made quail cage rows and bird transfers are refused (they would bypass the quail flock).
    assert.equal((await call('POST', '/api/cage_allocations', { blockName: 'QUAIL HOUSE', cageName: 'Q2', flockName: 'Ghost quail', species: 'Quail', quantity: 9 })).status, 409);
    assert.equal((await call('POST', '/api/cage_transfers', { species: 'Chicken', flockName: 'Layers', fromCage: 'Q1', toCage: 'Q2', quantity: 5, flockId: quail.id })).status, 409);
    assert.equal((await call('POST', '/api/cage_transfers', { species: 'Chicken', flockName: 'Anything', fromCage: 'Q1', toCage: 'Q2', quantity: 5 })).status, 409, 'cannot take birds out of a quail row by cage name');
    // Moving quail to another cage through the generic row edit is refused; a plain note edit still works.
    assert.equal((await call('PUT', `/api/cage_allocations/${rowId}`, { cageName: 'Q2', blockName: 'QUAIL HOUSE' })).status, 409);
    assert.equal((await call('PUT', `/api/cage_allocations/${rowId}`, { cageName: 'Q1', blockName: 'QUAIL HOUSE', notes: 'Near the door' })).status, 200);
    let farmNow = await data();
    assert.equal(farmNow.cage_allocations.filter(a => a.flockName === 'Layers').length, 1);
    assert.equal(farmNow.cage_allocations.find(a => a.id === rowId).cageName, 'Q1');
    assert.equal(farmNow.cage_allocations.find(a => a.id === rowId).quantity, 30);
    assert.ok(!farmNow.cage_allocations.some(a => a.flockName === 'Ghost quail'));

    // Deleting the quail flock through the older cage-row route now clears its cage row too
    // (it used to leave a ghost count of 30 that also blocked the cage from being deleted).
    const removed = await call('DELETE', `/api/cage_allocations/${rowId}`);
    assert.equal(removed.status, 200);
    assert.equal(removed.body.deletedType, 'flock');
    farmNow = await data();
    assert.ok(!farmNow.flocks.some(f => f.id === quail.id));
    assert.ok(!farmNow.cage_allocations.some(a => a.id === rowId || a.flockName === 'Layers'));
    assert.equal((await call('DELETE', `/api/cages/${cage.id}`)).status, 200, 'the now-empty cage can be removed');
    assert.equal((await call('DELETE', `/api/cages/${other.id}`)).status, 200);

    // Chicken flock: older routes keep the cage row in step with the flock count.
    const hens = await flock('Hens', 20);
    await call('POST', '/api/cage_allocations', { blockName: 'BLOCK 0', cageName: 'ST 1', flockName: 'Hens', quantity: 20 });
    const row = () => data().then(d => d.cage_allocations.find(a => a.flockName === 'Hens'));
    const loss = (await call('POST', '/api/mortality', { date: '2026-10-02', flockId: hens.id, quantity: 3 })).body;
    assert.equal((await row()).quantity, 17);
    assert.equal((await call('DELETE', `/api/mortality/${loss.id}`)).status, 200);
    assert.equal((await row()).quantity, 20, 'removing a loss restores the cage row as well as the flock');
    const meal = (await call('POST', '/api/fowls-eaten', { date: '2026-10-02', flockId: hens.id, quantity: 2 })).body;
    assert.equal((await row()).quantity, 18);
    assert.equal((await call('DELETE', `/api/fowls-eaten/${meal.id}`)).status, 200);
    assert.equal((await row()).quantity, 20);
    // /api/bulk-update for flocks uses the bulk flock rules (cage row follows).
    assert.equal((await call('POST', '/api/bulk-update', { type: 'flocks', ids: [hens.id], updates: { quantity: 19 } })).status, 200);
    assert.equal((await row()).quantity, 19);
    // POST /api/flocks with an existing id is an edit: rename carries the cage row along.
    const renamed = await call('POST', '/api/flocks', { id: hens.id, name: 'Hens A', breed: 'Brahma', quantity: 19, ageWeeks: 2, dateAdded: '2026-10-01' });
    assert.equal(renamed.status, 200);
    farmNow = await data();
    assert.equal(farmNow.flocks.filter(f => f.id === hens.id).length, 1);
    assert.equal(farmNow.cage_allocations.find(a => a.flockName === 'Hens A')?.quantity, 19);

    // The legacy batch /api/sync route: flock edits, deletes and loss removals follow the same rules.
    const sync = items => call('POST', '/api/sync', { items });
    const syncLoss = (await call('POST', '/api/mortality', { date: '2026-10-03', flockId: hens.id, quantity: 4 })).body;
    assert.equal((await sync([{ endpoint: `/api/mortality/${syncLoss.id}`, method: 'DELETE', timestamp: 1 }])).status, 200);
    assert.equal((await data()).flocks.find(f => f.id === hens.id).quantity, 19, 'sync loss removal gives the birds back');
    assert.equal((await data()).cage_allocations.find(a => a.flockName === 'Hens A').quantity, 19);
    assert.equal((await sync([{ endpoint: `/api/flocks/${hens.id}`, method: 'PUT', body: { quantity: 15 }, timestamp: 2 }])).status, 200);
    assert.equal((await data()).cage_allocations.find(a => a.flockName === 'Hens A').quantity, 15);
    assert.equal((await sync([{ endpoint: `/api/flocks/${hens.id}`, method: 'DELETE', timestamp: 3 }, { endpoint: '/api/flocks/never-existed-1', method: 'DELETE', timestamp: 4 }])).status, 200);
    farmNow = await data();
    assert.ok(!farmNow.flocks.some(f => f.id === hens.id));
    assert.ok(!farmNow.cage_allocations.some(a => a.flockName === 'Hens A'), 'sync flock delete clears its cage row');
    const b1 = await flock('Batch sync 1');
    await call('POST', '/api/cage_allocations', { blockName: 'BLOCK 0', cageName: 'ST 2', flockName: 'Batch sync 1', quantity: 10 });
    assert.equal((await sync([{ endpoint: '/api/bulk-delete', method: 'POST', body: { type: 'flocks', ids: [b1.id] }, timestamp: 5 }])).status, 200);
    assert.ok(!(await data()).cage_allocations.some(a => a.flockName === 'Batch sync 1'));
  });
});
