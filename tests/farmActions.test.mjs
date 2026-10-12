import test from 'node:test';
import assert from 'node:assert/strict';
import { applyFarmAction, quailEggBalance } from '../src/lib/farmActions.ts';

function emptyFarm() {
  return { users: [], clients: [], incubator_records: [{ id: 'client-quail', clientId: 'client-1', clientName: 'Client', clientMark: 'CL', eggType: 'Quail', dateBrought: '2026-10-01', day8Date: '2026-10-09', day18Date: '2026-10-16', day21Date: '2026-10-19', eggsCollected: 12, specialCase: 'Standard', ratePerEgg: 100, amountDue: 1200, amountPaid: 0, eggsAfterScan: null, chicksHatched: null, clientPhone: '' }], flocks: [{ id: 'quail-flock', name: 'Breeders', breed: 'Quail', species: 'Quail', quantity: 5, ageWeeks: 9, dateAdded: '2026-09-01' }], cages: [{ id: 'cage-1', blockName: 'BLOCK Q', cageName: 'Q1' }], cage_allocations: [], feed_records: [], poultry_sales: [], mortality: [], expenses: [], cage_transfers: [], daily_egg_collections: [{ id: 'old-eggs', date: '2026-10-01', brahmaEggs: 4, turkeyEggs: 1, totalEggs: 5 }] };
}
const apply = (db, id, kind, payload) => applyFarmAction(db, { id, kind, payload });

test('rabbit kits keep unique parent links through naming, sale, and reversal', () => {
  const db = emptyFarm();
  apply(db, 'hutch-001', 'rabbit_hutch', { name: 'Hutch A' });
  apply(db, 'doe-0001', 'rabbit_add', { name: 'Molly', sex: 'female', date: '2026-09-01', hutchId: 'hutch-001' });
  apply(db, 'buck-001', 'rabbit_add', { name: 'Max', sex: 'male', date: '2026-09-01' });
  apply(db, 'breed-001', 'rabbit_breeding', { doeId: 'doe-0001', buckId: 'buck-001', date: '2026-09-02' });
  const litter = apply(db, 'litter-01', 'rabbit_litter', { doeId: 'doe-0001', buckId: 'buck-001', breedingId: 'breed-001', quantity: 3, date: '2026-10-01' });
  assert.equal(litter.kitIds.length, 3);
  assert.equal(new Set(litter.kitIds).size, 3);
  assert.ok(litter.kitIds.every(id => db.rabbits.find(r => r.id === id)?.motherId === 'doe-0001' && db.rabbits.find(r => r.id === id)?.fatherId === 'buck-001'));
  apply(db, 'care-litter', 'rabbit_care', { targetId: litter.id, careKind: 'feed', detail: 'Hay', amount: 0.5, date: '2026-10-02' });
  assert.equal(db.animal_care[0].targetId, litter.id);
  apply(db, 'promote1', 'rabbit_individualize', { rabbitId: litter.kitIds[0], name: 'Snow', sex: 'female' });
  assert.equal(db.rabbits.filter(r => r.status === 'active').length, 5);
  assert.equal(db.rabbits.find(r => r.id === litter.kitIds[0]).grouped, false);
  apply(db, 'sale-001', 'rabbit_sale', { rabbitIds: [litter.kitIds[1]], buyerName: 'Buyer', totalAmount: 2000, date: '2026-10-03' });
  assert.equal(db.rabbits.filter(r => r.status === 'active').length, 4);
  apply(db, 'sale-001', 'rabbit_sale', { rabbitIds: [litter.kitIds[1]], buyerName: 'Buyer', totalAmount: 2000, date: '2026-10-03' });
  assert.equal(db.rabbit_sales.length, 1);
  apply(db, 'undo-sale1', 'rabbit_sale_void', { saleId: 'sale-001' });
  assert.equal(db.rabbits.filter(r => r.status === 'active').length, 5);
  apply(db, 'loss-001', 'rabbit_loss', { rabbitIds: [litter.kitIds[2]], date: '2026-10-04' });
  apply(db, 'undo-loss1', 'rabbit_loss_void', { lossId: 'loss-001' });
  assert.equal(db.rabbits.filter(r => r.status === 'active').length, 5);
  assert.throws(() => apply(structuredClone(db), 'bad-litter', 'rabbit_litter', { doeId: 'buck-001', buckId: 'doe-0001', quantity: 2, date: '2026-10-01' }), /female/);
});

test('quail eggs, farm-owned hatches, and sales adjust stock once without mixing client batches', () => {
  const db = emptyFarm();
  db.cages.push({ id: 'cage-2', blockName: 'BLOCK Q', cageName: 'Q2' });
  const addedFlock = apply(db, 'new-quail-01', 'quail_flock_add', { name: 'Young quail', quantity: 4, ageWeeks: 0, cageId: 'cage-1', date: '2026-10-01' });
  assert.equal(addedFlock.quantity, 4);
  apply(db, 'move-quail-1', 'quail_move', { flockId: addedFlock.id, cageId: 'cage-2', date: '2026-10-02' });
  assert.equal(db.cage_allocations.find(item => item.flockName === 'Young quail').cageName, 'Q2');
  assert.equal(db.flocks.find(item => item.id === addedFlock.id).quantity, 4);
  apply(db, 'move-quail-1', 'quail_move', { flockId: addedFlock.id, cageId: 'cage-2', date: '2026-10-02' });
  assert.equal(db.cage_transfers.length, 1);
  apply(db, 'eggs-001', 'quail_eggs', { date: '2026-10-01', quantity: 10 });
  assert.equal(db.daily_egg_collections[0].totalEggs, 15);
  assert.equal(db.incubator_records[0].ownerType, undefined);
  apply(db, 'use-sold1', 'quail_egg_use', { date: '2026-10-02', useKind: 'sold', quantity: 2, buyerName: 'Buyer', amount: 500 });
  apply(db, 'use-eaten', 'quail_egg_use', { date: '2026-10-02', useKind: 'eaten', quantity: 1 });
  apply(db, 'use-set01', 'quail_egg_use', { date: '2026-10-02', useKind: 'set', quantity: 3 });
  assert.equal(quailEggBalance(db), 4);
  const farmBatch = db.incubator_records.find(r => r.ownerType === 'farm');
  assert.equal(farmBatch.eggsCollected, 3);
  assert.equal(db.incubator_records.find(r => r.id === 'client-quail').clientId, 'client-1');
  apply(db, 'hatch-001', 'quail_hatch', { incubatorId: farmBatch.id, chicksHatched: 2 });
  apply(db, 'move-chicks', 'quail_hatch_to_flock', { incubatorId: farmBatch.id, date: '2026-10-20', name: 'October chicks', cageId: 'cage-1' });
  apply(db, 'move-chicks', 'quail_hatch_to_flock', { incubatorId: farmBatch.id, date: '2026-10-20', name: 'October chicks', cageId: 'cage-1' });
  assert.equal(db.flocks.length, 3);
  assert.equal(db.flocks.find(f => f.name === 'October chicks').quantity, 2);
  apply(db, 'live-sale1', 'quail_live_sale', { flockId: 'quail-flock', quantity: 2, amount: 1000, buyerName: 'Buyer', date: '2026-10-03' });
  assert.equal(db.flocks[0].quantity, 3);
  apply(db, 'void-sale1', 'quail_live_sale_void', { saleId: 'live-sale1' });
  assert.equal(db.flocks[0].quantity, 5);
  const legacyQuail = { ...db.flocks[0], id: 'legacy-quail', species: undefined };
  db.flocks.push(legacyQuail);
  apply(db, 'care-legacy', 'quail_care', { targetId: legacyQuail.id, careKind: 'health', detail: 'Healthy', date: '2026-10-03' });
  assert.equal(db.animal_care.at(-1).targetId, legacyQuail.id);
  apply(db, 'loss-quail', 'quail_loss', { flockId: 'quail-flock', quantity: 1, date: '2026-10-03' });
  apply(db, 'void-loss1', 'quail_loss_void', { lossId: 'loss-quail' });
  assert.equal(db.flocks[0].quantity, 5);
  apply(db, 'void-eggs1', 'quail_egg_use_void', { useId: 'use-sold1' });
  assert.equal(quailEggBalance(db), 6);
  assert.equal(db.poultry_sales.find(s => s.id === 'sale-use-sold1').voided, true);
  assert.throws(() => apply(structuredClone(db), 'void-set01', 'quail_egg_use_void', { useId: 'use-set01' }), /hatch result/);
  assert.throws(() => apply(structuredClone(db), 'bad-sale1', 'quail_live_sale', { flockId: 'quail-flock', quantity: 99, amount: 1, buyerName: 'Buyer', date: '2026-10-03' }), /Not enough/);
});

test('cage count correction changes live flock and housing once, and requires a reason and current count', () => {
  const db = emptyFarm();
  db.cage_allocations.push({ id: 'flock-quail-flock', blockName: 'BLOCK Q', cageName: 'Q1', flockName: 'Breeders', species: 'Quail', quantity: 5, ageWeeks: 9, dateAdded: '2026-09-01', dateTransferred: '2026-09-01' });
  const payload = { allocationId: 'flock-quail-flock', expectedQuantity: 5, quantity: 7, reason: 'Two birds missed during the first count', date: '2026-10-10' };
  const saved = apply(db, 'correct-001', 'cage_count_correct', payload);
  assert.equal(saved.previousQuantity, 5);
  assert.equal(db.flocks[0].quantity, 7);
  assert.equal(db.cage_allocations[0].quantity, 7);
  assert.equal(db.cage_count_corrections[0].reason, payload.reason);
  assert.deepEqual(apply(db, 'correct-001', 'cage_count_correct', payload), { alreadySaved: true });
  assert.equal(db.cage_count_corrections.length, 1);
  assert.throws(() => apply(db, 'correct-002', 'cage_count_correct', { ...payload, quantity: 8 }), /changed on another device/);
  assert.throws(() => apply(db, 'correct-003', 'cage_count_correct', { ...payload, expectedQuantity: 7, quantity: 8, reason: 'No' }), /at least 5/);
  assert.equal(db.flocks[0].quantity, 7);
});

test('rabbit and quail actions stay in the phone queue until the shared server acknowledges them', async () => {
  const storage = new Map();
  let serverAccepts = false;
  const requests = [];
  globalThis.localStorage = {
    getItem: key => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
    removeItem: key => storage.delete(key)
  };
  globalThis.CustomEvent = class { constructor(type, options) { this.type = type; this.detail = options?.detail; } };
  globalThis.window = {
    dispatchEvent: () => {},
    fetch: async (path, options) => {
      requests.push({ path, options });
      if (path === '/api/data') return { ok: true, json: async () => emptyFarm() };
      return { ok: serverAccepts, json: async () => ({ success: serverAccepts }) };
    }
  };
  const { executeLocalMutation, getOfflineDb, getSyncQueue, syncPendingQueue } = await import('../src/lib/offlineStore.ts');
  storage.set('nvf_offline_db_cache_v2', JSON.stringify(emptyFarm()));
  const result = executeLocalMutation('/api/farm/actions', 'POST', { id: 'offline-rabbit', kind: 'rabbit_add', payload: { name: 'Coco', sex: 'female', date: '2026-10-01' } });
  assert.equal(result.offlineQueued, true);
  assert.equal(getOfflineDb().rabbits[0].name, 'Coco');
  assert.equal(getSyncQueue().length, 1);
  assert.equal((await syncPendingQueue('family-token')).syncedCount, 0);
  assert.equal(getSyncQueue().length, 1);
  serverAccepts = true;
  assert.equal((await syncPendingQueue('family-token')).syncedCount, 1);
  assert.equal(getSyncQueue().length, 0);
  assert.equal(requests.filter(item => item.path === '/api/farm/actions').length, 2);
  const correction = executeLocalMutation('/api/farm/actions', 'POST', { id: 'offline-count', kind: 'cage_count_correct', payload: { allocationId: 'flock-quail-flock', expectedQuantity: 5, quantity: 7, reason: 'Two birds missed at first count', date: '2026-10-10' } });
  assert.equal(correction.offlineQueued, true);
  assert.equal(getOfflineDb().flocks[0].quantity, 7);
  assert.equal((await syncPendingQueue('family-token')).syncedCount, 1);
  const eggs = executeLocalMutation('/api/daily_egg_collections', 'POST', { date: '2026-10-10', brahmaEggs: 0, turkeyEggs: 0, quailEggs: 8, expected: null });
  assert.equal(eggs.offlineQueued, true);
  assert.equal(getOfflineDb().daily_egg_collections.find(row => row.date === '2026-10-10').totalEggs, 8);
  assert.equal((await syncPendingQueue('family-token')).syncedCount, 1);
  assert.equal(getSyncQueue().length, 0);
});
