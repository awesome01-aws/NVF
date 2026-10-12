const Module = require('node:module');
const originalLoad = Module._load;

let document = {
  users: [], sessions: [], clients: [], incubator_records: [], flocks: [],
  feed_records: [], poultry_sales: [], mortality: [], expenses: [],
  cage_transfers: [], daily_egg_collections: [], fowls_eaten: [], cages: [], cage_allocations: []
};
let failNextWrite = process.env.NVF_TEST_FAIL_FIRST_WRITE === '1';
const reference = {
  get: async () => ({ exists: true, data: () => structuredClone(document) })
};
const firestore = {
  doc: () => reference,
  runTransaction: async callback => {
    let staged;
    const transaction = {
      get: reference.get,
      set: (_ref, data) => { staged = structuredClone(data); }
    };
    const result = await callback(transaction);
    await new Promise(resolve => setTimeout(resolve, 250));
    if (failNextWrite) {
      failNextWrite = false;
      throw new Error('Simulated Firestore write failure');
    }
    document = staged;
    return result;
  }
};

Module._load = function(request, parent, isMain) {
  if (request === 'firebase-admin/app') {
    return { initializeApp: () => ({}), applicationDefault: () => ({}) };
  }
  if (request === 'firebase-admin/firestore') {
    return { getFirestore: () => firestore };
  }
  return originalLoad.call(this, request, parent, isMain);
};
