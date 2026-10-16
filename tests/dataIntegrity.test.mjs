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
