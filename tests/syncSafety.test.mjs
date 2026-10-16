// Bounds and matching rules of the sync bookkeeping kept in the farm document.
import test from 'node:test';
import assert from 'node:assert/strict';
import { addRequestReceipt, hasRequestReceipt, addRecentCreates, duplicateRuleFor, findPossibleDuplicate, isValidClientId } from '../src/lib/syncSafety.ts';

test('request receipts stay small: newest 500, at most 30 days', () => {
  const db = {};
  const now = Date.now();
  addRequestReceipt(db, 'req-very-old-01', now - 31 * 24 * 3600 * 1000);
  for (let i = 0; i < 600; i++) addRequestReceipt(db, `req-${String(i).padStart(6, '0')}`, now);
  assert.equal(db.sync_request_receipts.length, 500);
  assert.equal(hasRequestReceipt(db, 'req-very-old-01'), false);
  assert.equal(hasRequestReceipt(db, 'req-000599'), true);
  assert.equal(hasRequestReceipt(db, 'req-000050'), false);
  addRequestReceipt(db, 'req-000599', now);
  assert.equal(db.sync_request_receipts.filter(entry => entry.i === 'req-000599').length, 1, 'no repeated entries');
  assert.ok(JSON.stringify(db).length < 40_000);
  assert.equal(isValidClientId('short'), false);
  assert.equal(isValidClientId('ok-id-123'), true);
  assert.equal(isValidClientId('bad id with spaces'), false);
});

test('duplicate matching: only recent records from another request or phone, never reversed ones', () => {
  const now = Date.now();
  const db = { mortality: [{ id: 'mort-a-0001', date: '2026-10-01', flockId: 'f1', flockName: 'Hens', quantity: 2 }] };
  addRecentCreates(db, 'mortality', new Set(), { by: 'Dad', q: 'req-a-000001', d: 'device-a-01' }, now);
  const rule = duplicateRuleFor('/api/mortality', 'POST', {});
  const body = { date: '2026-10-01', flockId: 'f1', quantity: '2' };
  assert.equal(findPossibleDuplicate(db, rule, body, { q: 'req-b-000001', d: 'device-b-01' }, now)?.by, 'Dad');
  assert.equal(findPossibleDuplicate(db, rule, body, { q: 'req-a-000001', d: 'device-b-01' }, now), null, 'same request');
  assert.equal(findPossibleDuplicate(db, rule, body, { q: 'req-c-000001', d: 'device-a-01' }, now), null, 'same phone');
  assert.equal(findPossibleDuplicate(db, rule, { ...body, quantity: 3 }, { q: 'req-b-000001' }, now), null, 'different number');
  assert.equal(findPossibleDuplicate(db, rule, { ...body, id: 'mort-a-0001' }, { q: 'req-b-000001' }, now), null, 'same record ID is an update');
  assert.equal(findPossibleDuplicate(db, rule, body, { q: 'req-b-000001' }, now + 49 * 3600 * 1000), null, 'older than 48 hours');
  db.mortality[0].voided = true;
  assert.equal(findPossibleDuplicate(db, rule, body, { q: 'req-b-000001' }, now), null, 'reversed records do not count');
  // Old records (no recent-create entry) are never matched.
  assert.equal(findPossibleDuplicate({ mortality: [{ id: 'old-1', date: '2026-10-01', flockId: 'f1', quantity: 2 }] }, rule, body, { q: 'req-b-000001' }, now), null);
  // Structural creates and egg days are not checked.
  assert.equal(duplicateRuleFor('/api/flocks', 'POST', {}), undefined);
  assert.equal(duplicateRuleFor('/api/daily_egg_collections', 'POST', {}), undefined);
  assert.equal(duplicateRuleFor('/api/farm/actions', 'POST', { kind: 'quail_eggs' }), undefined);
  assert.equal(duplicateRuleFor('/api/farm/actions', 'POST', { kind: 'rabbit_add' }), undefined);
  assert.equal(duplicateRuleFor('/api/sales', 'PUT', {}), undefined);
  // Recent-create list is bounded.
  const big = { expenses: [] };
  for (let i = 0; i < 300; i++) { big.expenses.push({ id: `exp-${String(i).padStart(5, '0')}` }); }
  addRecentCreates(big, 'expenses', new Set(), {}, now);
  assert.equal(big.sync_recent_creates.length, 200);
});
