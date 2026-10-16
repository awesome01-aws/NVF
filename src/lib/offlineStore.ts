/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Client, IncubatorRecord, Flock, FeedRecord, PoultrySale, Mortality, Expense, RabbitAnimal, RabbitHutch, RabbitBreeding, RabbitLitter, RabbitMove, RabbitLoss, RabbitSale, AnimalCareRecord, QuailEggUse, DailyEggCollection } from '../types';
import { getCameroonTodayISO } from '../utils/dateUtils';
import { apiUrl } from './apiOrigin';
import { applyFarmAction, isProtectedFarmMutation, quailEggBalance } from './farmActions';

export interface DbData {
  users?: any[];
  clients: Client[];
  incubator_records: IncubatorRecord[];
  flocks: Flock[];
  feed_records: FeedRecord[];
  poultry_sales: PoultrySale[];
  mortality: Mortality[];
  expenses: Expense[];
  rabbits?: RabbitAnimal[];
  rabbit_hutches?: RabbitHutch[];
  rabbit_breedings?: RabbitBreeding[];
  rabbit_litters?: RabbitLitter[];
  rabbit_moves?: RabbitMove[];
  rabbit_losses?: RabbitLoss[];
  rabbit_sales?: RabbitSale[];
  rabbit_eaten?: import('../types').RabbitEaten[];
  animal_care?: AnimalCareRecord[];
  quail_egg_use?: QuailEggUse[];
  daily_egg_collections?: DailyEggCollection[];
  fowls_eaten?: import('../types').FowlEatenRecord[];
}

export interface QueuedMutation {
  id: string;
  timestamp: number;
  endpoint: string;
  method: 'POST' | 'PUT' | 'DELETE';
  body?: any;
  type: string;
  description: string;
  /** Unique ID sent as X-NVF-Request-Id, set when the change is queued. Older queued items fall back to `id`. */
  requestId?: string;
  /**
   * Missing = waiting to send.
   * 'failed'    = the server refused it (its message is in `error`); tried again on the next sync, never blocks others.
   * 'duplicate' = looks like an entry someone else already made; waits for "Keep both" or "Discard".
   * 'held'      = an earlier change it depends on (e.g. creating the same record) did not save yet.
   */
  status?: 'failed' | 'duplicate' | 'held';
  error?: string;
  duplicateOf?: { by?: string; summary?: string };
  /** Set by "Keep both": resend without the possible-duplicate check. */
  allowDuplicate?: boolean;
}

const DB_CACHE_KEY = 'nvf_offline_db_cache_v2';
const SYNC_QUEUE_KEY = 'nvf_offline_sync_queue_v2';
const SYNC_PROBLEM_KEY = 'nvf_offline_sync_problem_v1';
const DEVICE_ID_KEY = 'nvf_device_id_v1';

/** Random ID for queued changes. crypto.randomUUID is missing on plain-http pages and old WebViews. */
export function newClientId(): string {
  const c: any = (globalThis as any).crypto;
  if (c && typeof c.randomUUID === 'function') {
    try { return c.randomUUID(); } catch (_) { /* fall through */ }
  }
  const bytes = new Uint8Array(16);
  if (c && typeof c.getRandomValues === 'function') c.getRandomValues(bytes);
  else for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Stable ID for this phone, so the server can tell "another phone made this" from "this phone". */
function getDeviceId(): string {
  let id = localStorage.getItem(DEVICE_ID_KEY);
  if (!id || !/^[\w-]{8,100}$/.test(id)) {
    id = newClientId();
    try { localStorage.setItem(DEVICE_ID_KEY, id); } catch (_) { /* storage full: send a per-session ID */ }
  }
  return id;
}

/** Changes that the sync can send right now (not waiting on the person or on an earlier change). */
export function getSendableQueue(): QueuedMutation[] {
  return getSyncQueue().filter(item => !item.status);
}

/** Changes that need the person to look at them (refused, possible duplicate, or waiting on one of those). */
export function getAttentionQueue(): QueuedMutation[] {
  return getSyncQueue().filter(item => !!item.status);
}
export function getSyncProblem(): string | null { return localStorage.getItem(SYNC_PROBLEM_KEY); }
// Capture the browser transport before api.ts installs its offline interceptor.
const networkFetch = window.fetch.bind(window);

// Event emitter helpers
export function notifyOfflineChange(status?: string, change?: 'data' | 'queue') {
  window.dispatchEvent(new CustomEvent('nvf_offline_change', { detail: { status, change } }));
}

export function getStandardRateBySpecies(eggType?: string): number {
  const t = String(eggType || '').toLowerCase().trim();
  if (t.includes('quail') || t.includes('cailles') || t.includes('caille')) {
    return 100;
  }
  if (
    t.includes('turkey') || t.includes('dindon') || t.includes('dinde') ||
    t.includes('duck') || t.includes('canard') ||
    t.includes('goose') || t.includes('oie')
  ) {
    return 500;
  }
  return 200;
}

export function computeAmountDue(record: {
  specialCase?: string;
  eggType?: string;
  eggsCollected?: number;
  ratePerEgg?: number;
  customRate?: number;
  eggsAfterScan?: number | null;
  chicksHatched?: number | null;
}): { rate: number; amountDue: number } {
  const sc = String(record.specialCase || 'Standard').trim();
  const stdRate = getStandardRateBySpecies(record.eggType);
  let rate = stdRate;

  if (sc === '150 Per Egg Brought' || sc === 'Discount') {
    rate = 150;
  } else if (sc === 'Free') {
    rate = 0;
  } else if (sc === 'Custom') {
    if (record.customRate !== undefined && record.customRate !== null && !isNaN(Number(record.customRate)) && Number(record.customRate) > 0) {
      rate = Number(record.customRate);
    } else if (record.ratePerEgg !== undefined && record.ratePerEgg !== null && !isNaN(Number(record.ratePerEgg)) && Number(record.ratePerEgg) > 0) {
      rate = Number(record.ratePerEgg);
    } else {
      rate = stdRate;
    }
  } else {
    if (record.customRate !== undefined && record.customRate !== null && !isNaN(Number(record.customRate)) && Number(record.customRate) > 0) {
      rate = Number(record.customRate);
    } else if (record.ratePerEgg !== undefined && record.ratePerEgg !== null && !isNaN(Number(record.ratePerEgg)) && Number(record.ratePerEgg) > 0 && record.ratePerEgg !== 200 && record.ratePerEgg !== 150 && record.ratePerEgg !== 500 && record.ratePerEgg !== 100) {
      rate = Number(record.ratePerEgg);
    } else {
      rate = stdRate;
    }
  }

  const eggs = Number(record.eggsCollected || 0);

  if (sc === 'Free') {
    return { rate: 0, amountDue: 0 };
  }
  if (sc === '150 Per Egg Brought' || sc === 'Discount') {
    return { rate: 150, amountDue: eggs * 150 };
  }
  if (sc === 'Per Chick') {
    const hatched = (record.chicksHatched !== null && record.chicksHatched !== undefined && !isNaN(Number(record.chicksHatched)))
      ? Number(record.chicksHatched)
      : 0;
    return { rate, amountDue: hatched * rate };
  }
  if (sc === 'Per Egg After Scan') {
    const scanned = (record.eggsAfterScan !== null && record.eggsAfterScan !== undefined && !isNaN(Number(record.eggsAfterScan)))
      ? Number(record.eggsAfterScan)
      : 0;
    return { rate, amountDue: scanned * rate };
  }

  return { rate, amountDue: eggs * rate };
}

// 1. Database Cache Operations
export function getOfflineDb(): DbData {
  try {
    const raw = localStorage.getItem(DB_CACHE_KEY);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch (err) {
    console.error('Failed to parse offline DB cache:', err);
  }
  return {
    clients: [],
    incubator_records: [],
    flocks: [],
    feed_records: [],
    poultry_sales: [],
    mortality: [],
    expenses: []
  };
}

export function saveOfflineDb(db: DbData, notifyDataChange = false): void {
  localStorage.setItem(DB_CACHE_KEY, JSON.stringify(db));
  // A refreshed cache is not a new edit. Emitting a data event for every GET
  // makes App fetch again indefinitely.
  if (notifyDataChange) notifyOfflineChange(undefined, 'data');
}

// 2. Pending Sync Queue Operations
export function getSyncQueue(): QueuedMutation[] {
  try {
    const raw = localStorage.getItem(SYNC_QUEUE_KEY);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch (err) {
    console.error('Failed to parse sync queue:', err);
  }
  return [];
}

export function saveSyncQueue(queue: QueuedMutation[]): void {
  localStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify(queue));
  notifyOfflineChange(undefined, 'queue');
}

export function queueMutation(mutation: Omit<QueuedMutation, 'id' | 'timestamp'>): QueuedMutation {
  const queue = getSyncQueue();
  // The request ID is fixed now, at creation, so every later retry of this change carries the same ID.
  const id = newClientId();
  const newItem: QueuedMutation = {
    ...mutation,
    id,
    requestId: id,
    timestamp: Date.now()
  };
  queue.push(newItem);
  saveSyncQueue(queue);
  return newItem;
}

export function clearSyncQueue(): void {
  localStorage.removeItem(SYNC_QUEUE_KEY);
  notifyOfflineChange(undefined, 'queue');
}

// 3. Local Offline Mutation Handlers
// Apply mutations locally to offline DB cache immediately and queue for server sync
export function executeLocalMutation(
  endpoint: string,
  method: string,
  body: any
): { responseData: any; offlineQueued: boolean } {
  const db = getOfflineDb();
  let responseData: any = { success: true };
  let description = `${method} ${endpoint}`;

  try {
    // --- DAILY EGGS ---
    if (isProtectedFarmMutation(db as any, endpoint, method, body || {})) throw new Error('Use linked Farm actions for rabbit and quail stock changes.');
    if ((endpoint === '/api/daily_egg_collections' && method === 'POST') || (endpoint.startsWith('/api/daily_egg_collections/') && method === 'PUT')) {
      const rows = (db.daily_egg_collections ||= []);
      const date = String(body.date || getCameroonTodayISO());
      const index = rows.findIndex(row => row.id === body.id || row.date === date || (method === 'PUT' && endpoint.endsWith(`/${row.id}`)));
      if (method === 'PUT' && index < 0) throw new Error('Egg log is no longer on this phone. Refresh before editing.');
      const previous = index >= 0 ? rows[index] : undefined;
      const counts = ['brahmaEggs', 'turkeyEggs', 'quailEggs'].map(key => body[key] === undefined ? Number((previous as any)?.[key] || 0) : Number(body[key]));
      if (counts.some(value => !Number.isSafeInteger(value) || value < 0)) throw new Error('Egg counts must be zero or a positive whole number.');
      const record: DailyEggCollection = { id: previous?.id || body.id || crypto.randomUUID(), date, brahmaEggs: counts[0], turkeyEggs: counts[1], quailEggs: counts[2], totalEggs: counts[0] + counts[1] + counts[2], poultryRecorded: true, recordedBy: String(body.recordedBy || JSON.parse(localStorage.getItem('nvf_operator_user') || '{}').name || 'Family member'), notes: String(body.notes || '') };
      if (index >= 0) rows[index] = record; else rows.push(record);
      if (quailEggBalance(db) < 0) throw new Error('This would make quail egg stock negative.');
      body.id = record.id;
      responseData = { success: true, record };
      description = `Daily eggs: ${date} (${record.totalEggs} total)`;
    } else if (endpoint === '/api/farm/actions' && method === 'POST') {
      responseData = { success: true, result: applyFarmAction(db as any, body) };
      description = `Farm: ${body.kind}`;
    } else if (endpoint === '/api/flocks' && method === 'POST') {
      const flockId = body.id || crypto.randomUUID();
      const newFlock: Flock = {
        id: flockId,
        name: String(body.name || '').trim(),
        breed: String(body.breed || '').trim(),
        quantity: Number(body.quantity || 0),
        ageWeeks: Number(body.ageWeeks || 0),
        dateAdded: String(body.dateAdded || getCameroonTodayISO()),
        species: body.species || 'Chicken',
        notes: body.notes ? String(body.notes).trim() : ''
      };
      const existsIdx = db.flocks.findIndex(f => f.id === flockId);
      if (existsIdx !== -1) {
        db.flocks[existsIdx] = newFlock;
      } else {
        db.flocks.push(newFlock);
      }
      responseData = newFlock;
      description = `Add Flock: ${newFlock.name} (${newFlock.quantity} birds)`;
      body.id = flockId;
    } else if (endpoint.startsWith('/api/flocks/') && method === 'PUT') {
      const id = endpoint.replace('/api/flocks/', '');
      const idx = db.flocks.findIndex(f => f.id === id);
      if (idx !== -1) {
        db.flocks[idx] = { ...db.flocks[idx], ...body };
        responseData = db.flocks[idx];
        description = `Update Flock: ${db.flocks[idx].name}`;
      }
    } else if (endpoint.startsWith('/api/flocks/') && method === 'DELETE') {
      const id = endpoint.replace('/api/flocks/', '');
      const flock = db.flocks.find(f => f.id === id);
      db.flocks = db.flocks.filter(f => f.id !== id);
      db.mortality = db.mortality.filter(m => m.flockId !== id);
      description = `Delete Flock: ${flock?.name || id}`;
    }

    // --- FEED RECORDS ---
    else if (endpoint === '/api/feed' && method === 'POST') {
      const feedId = body.id || crypto.randomUUID();
      const bagsBought = Number(body.bagsBought || 0);
      const costBag = Number(body.costBag || 0);
      const newFeed: FeedRecord = {
        id: feedId,
        date: String(body.date || getCameroonTodayISO()),
        feedType: String(body.feedType || '').trim(),
        species: body.species === 'Rabbit' || body.species === 'Quail' ? body.species : 'Poultry',
        bagsBought,
        weightPerBag: Number(body.weightPerBag || 50),
        costBag,
        totalCost: bagsBought * costBag,
        stockRemaining: Number(body.stockRemaining || 0)
      };
      const existsIdx = db.feed_records.findIndex(f => f.id === feedId);
      if (existsIdx !== -1) {
        db.feed_records[existsIdx] = newFeed;
      } else {
        db.feed_records.push(newFeed);
      }
      responseData = newFeed;
      description = `Add Feed: ${newFeed.feedType} (${bagsBought} bags)`;
      body.id = feedId;
    } else if (endpoint.startsWith('/api/feed/') && method === 'PUT') {
      const id = endpoint.replace('/api/feed/', '');
      const idx = db.feed_records.findIndex(f => f.id === id);
      if (idx !== -1) {
        db.feed_records[idx] = { ...db.feed_records[idx], ...body };
        responseData = db.feed_records[idx];
        description = `Update Feed Record: ${db.feed_records[idx].feedType}`;
      }
    } else if (endpoint.startsWith('/api/feed/') && method === 'DELETE') {
      const id = endpoint.replace('/api/feed/', '');
      db.feed_records = db.feed_records.filter(f => f.id !== id);
      description = `Delete Feed Record: ${id}`;
    }

    // --- POULTRY SALES ---
    else if (endpoint === '/api/sales' && method === 'POST') {
      const saleId = body.id || crypto.randomUUID();
      const qty = Number(body.quantity || 0);
      const price = Number(body.unitPrice || 0);
      if (body.flockId) {
        const flock = db.flocks.find(f => f.id === body.flockId);
        if (flock) {
          flock.quantity = Math.max(0, flock.quantity - qty);
        }
      }
      const newSale: PoultrySale = {
        id: saleId,
        date: String(body.date || getCameroonTodayISO()),
        itemType: body.itemType,
        quantity: qty,
        unitPrice: price,
        totalAmount: qty * price,
        buyerName: String(body.buyerName || '').trim(),
        flockId: body.flockId || '',
        ageWeeks: body.ageWeeks ? Number(body.ageWeeks) : undefined,
        notes: body.notes ? String(body.notes).trim() : ''
      };
      const existsIdx = db.poultry_sales.findIndex(s => s.id === saleId);
      if (existsIdx !== -1) {
        db.poultry_sales[existsIdx] = newSale;
      } else {
        db.poultry_sales.push(newSale);
      }
      responseData = newSale;
      description = `Sale: ${qty}x ${newSale.itemType} to ${newSale.buyerName}`;
      body.id = saleId;
    } else if (endpoint.startsWith('/api/sales/') && method === 'PUT') {
      const id = endpoint.replace('/api/sales/', '');
      const idx = db.poultry_sales.findIndex(s => s.id === id);
      if (idx !== -1) {
        db.poultry_sales[idx] = { ...db.poultry_sales[idx], ...body };
        responseData = db.poultry_sales[idx];
        description = `Update Sale: ${db.poultry_sales[idx].itemType}`;
      }
    } else if (endpoint.startsWith('/api/sales/') && method === 'DELETE') {
      const id = endpoint.replace('/api/sales/', '');
      db.poultry_sales = db.poultry_sales.filter(s => s.id !== id);
      description = `Delete Sale Record`;
    }

    // --- MORTALITY ---
    else if (endpoint === '/api/mortality' && method === 'POST') {
      const mortId = body.id || crypto.randomUUID();
      const qty = Number(body.quantity || 0);
      const flock = db.flocks.find(f => f.id === body.flockId);
      if (flock) {
        flock.quantity = Math.max(0, flock.quantity - qty);
      }
      const newMort: Mortality = {
        id: mortId,
        date: String(body.date || getCameroonTodayISO()),
        flockId: String(body.flockId),
        flockName: flock ? flock.name : 'Flock',
        quantity: qty,
        cause: body.cause ? String(body.cause).trim() : ''
      };
      const existsIdx = db.mortality.findIndex(m => m.id === mortId);
      if (existsIdx !== -1) {
        db.mortality[existsIdx] = newMort;
      } else {
        db.mortality.push(newMort);
      }
      responseData = newMort;
      description = `Mortality: ${qty} birds (${newMort.flockName})`;
      body.id = mortId;
    } else if (endpoint.startsWith('/api/mortality/') && method === 'DELETE') {
      const id = endpoint.replace('/api/mortality/', '');
      const mort = db.mortality.find(m => m.id === id);
      if (mort) {
        const flock = db.flocks.find(f => f.id === mort.flockId);
        if (flock) flock.quantity += mort.quantity;
      }
      db.mortality = db.mortality.filter(m => m.id !== id);
      description = `Delete Mortality Record`;
    }

    // --- EXPENSES ---
    else if (endpoint === '/api/expenses' && method === 'POST') {
      const expId = body.id || crypto.randomUUID();
      const newExp: Expense = {
        id: expId,
        date: String(body.date || getCameroonTodayISO()),
        category: body.category,
        description: String(body.description || '').trim(),
        amount: Number(body.amount || 0)
      };
      const existsIdx = db.expenses.findIndex(e => e.id === expId);
      if (existsIdx !== -1) {
        db.expenses[existsIdx] = newExp;
      } else {
        db.expenses.push(newExp);
      }
      responseData = newExp;
      description = `Expense: ${newExp.category} (${newExp.amount} FCFA)`;
      body.id = expId;
    } else if (endpoint.startsWith('/api/expenses/') && method === 'PUT') {
      const id = endpoint.replace('/api/expenses/', '');
      const idx = db.expenses.findIndex(e => e.id === id);
      if (idx !== -1) {
        db.expenses[idx] = { ...db.expenses[idx], ...body };
        responseData = db.expenses[idx];
        description = `Update Expense: ${db.expenses[idx].category}`;
      }
    } else if (endpoint.startsWith('/api/expenses/') && method === 'DELETE') {
      const id = endpoint.replace('/api/expenses/', '');
      db.expenses = db.expenses.filter(e => e.id !== id);
      description = `Delete Expense Record`;
    }

    // --- CLIENTS ---
    else if (endpoint === '/api/clients' && method === 'POST') {
      const clientId = body.id || crypto.randomUUID();
      const mark = String(body.mark || '').trim().toUpperCase();
      const duplicate = db.clients.find(c => c.mark === mark && c.id !== clientId);
      if (duplicate) {
        responseData = { error: `Client mark [${mark}] is already assigned to ${duplicate.name}. Client marks must be unique.` };
        description = `Register Client Failed (Duplicate Mark)`;
        return { responseData, offlineQueued: false };
      }
      let client = db.clients.find(c => c.id === clientId);
      if (client) {
        client.name = String(body.name || '').trim();
        client.mark = mark;
        client.phone = String(body.phone || '').trim();
        client.location = String(body.location || '').trim();
        if (body.specialCase) client.specialCase = body.specialCase;
        if (body.overdraft !== undefined) client.overdraft = Number(body.overdraft) || 0;
      } else {
        client = {
          id: clientId,
          name: String(body.name || '').trim(),
          mark,
          phone: String(body.phone || '').trim(),
          location: String(body.location || '').trim(),
          specialCase: body.specialCase || 'Standard',
          overdraft: Math.max(0, Number(body.overdraft) || 0)
        };
        db.clients.push(client);
      }
      responseData = client;
      description = `Register Client: ${client.name} [${client.mark}]`;
      body.id = clientId;
    } else if (endpoint.startsWith('/api/clients/') && method === 'PUT') {
      const id = endpoint.replace('/api/clients/', '');
      const idx = db.clients.findIndex(c => c.id === id);
      if (idx !== -1) {
        const oldMark = db.clients[idx].mark;
        if (body.mark) {
          const cleanedMark = String(body.mark).trim().toUpperCase();
          const duplicate = db.clients.find(c => c.mark === cleanedMark && c.id !== id);
          if (duplicate) {
            responseData = { error: `Client mark [${cleanedMark}] is already assigned to ${duplicate.name}. Client marks must be unique.` };
            description = `Update Client Failed (Duplicate Mark)`;
            return { responseData, offlineQueued: false };
          }
        }
        db.clients[idx] = { ...db.clients[idx], ...body };
        if (body.mark) {
          const cleanedMark = String(body.mark).trim().toUpperCase();
          db.clients[idx].mark = cleanedMark;
          db.incubator_records.forEach((r) => {
            if (r.clientId === id || (oldMark && r.clientMark === oldMark && r.clientName === db.clients[idx].name)) {
              r.clientMark = cleanedMark;
            }
          });
        }
        if (body.specialCase && body.scope === 'all_time') {
          db.incubator_records.forEach((r) => {
            if (r.clientId === id) {
              r.specialCase = body.specialCase;
              const computed = computeAmountDue(r);
              r.ratePerEgg = computed.rate;
              r.amountDue = computed.amountDue;
            }
          });
        }
        responseData = db.clients[idx];
        description = `Update Client: ${db.clients[idx].name}`;
      }
    } else if (endpoint.includes('/pay-debt')) {
      const clientId = endpoint.split('/')[3];
      const client = db.clients.find(c => c.id === clientId);
      const amount = Number(body.paymentAmount || 0);
      if (client && amount > 0) {
        let pAmount = amount;
        const unpaid = db.incubator_records
          .filter(r => r.clientId === clientId)
          .sort((a, b) => new Date(a.dateBrought).getTime() - new Date(b.dateBrought).getTime());
        for (const record of unpaid) {
          const owed = record.amountDue - record.amountPaid - (record.overdraftUsed || 0);
          if (owed > 0) {
            if (pAmount >= owed) {
              record.amountPaid += owed;
              pAmount -= owed;
            } else {
              record.amountPaid += pAmount;
              pAmount = 0;
              break;
            }
          }
        }
        if (pAmount > 0) {
          client.overdraft = (client.overdraft || 0) + pAmount;
        }
        description = `Client Debt Payment: ${amount} FCFA (${client.name})`;
      }
    } else if (endpoint.includes('/update-ledger')) {
      const clientId = endpoint.split('/')[3];
      const client = db.clients.find(c => c.id === clientId);
      let totalPaid = Math.max(0, Number(body.totalPaid || 0));
      if (client) {
        const records = db.incubator_records
          .filter(r => r.clientId === clientId)
          .sort((a, b) => new Date(a.dateBrought).getTime() - new Date(b.dateBrought).getTime());
        for (const record of records) {
          const netDue = Math.max(0, record.amountDue - (record.overdraftUsed || 0));
          if (totalPaid >= netDue) {
            record.amountPaid = netDue;
            totalPaid -= netDue;
          } else {
            record.amountPaid = totalPaid;
            totalPaid = 0;
          }
        }
        client.overdraft = totalPaid;
        description = `Update Client Ledger: ${client.name}`;
      }
    }

    // --- INCUBATOR RECORDS ---
    else if (endpoint === '/api/incubator' && method === 'POST') {
      const batchId = body.id || crypto.randomUUID();
      const client = db.clients.find(c => c.id === body.clientId);
      const eggs = Number(body.eggsCollected || 0);
      const sc = body.specialCase || (client ? client.specialCase : 'Standard') || 'Standard';
      
      const computed = computeAmountDue({
        specialCase: sc,
        eggsCollected: eggs,
        customRate: body.customRate !== undefined ? Number(body.customRate) : undefined,
        ratePerEgg: body.ratePerEgg !== undefined ? Number(body.ratePerEgg) : undefined,
        eggsAfterScan: body.eggsAfterScan !== undefined ? body.eggsAfterScan : null,
        chicksHatched: body.chicksHatched !== undefined ? body.chicksHatched : null
      });

      const rate = computed.rate;
      const amountDue = computed.amountDue;

      const baseDate = new Date(body.dateBrought);
      const calcOffset = (offset: number) => {
        const d = new Date(baseDate.getTime());
        d.setDate(d.getDate() + offset);
        return d.toISOString().split('T')[0];
      };

      const parsedEggType = body.eggType || 'Brahma';
      let scanOffset: number | null = 8;
      let transferOffset = 18;
      let hatchOffset = 21;

      if (parsedEggType === 'Turkey') { scanOffset = 10; transferOffset = 25; hatchOffset = 28; }
      else if (parsedEggType === 'Quail') { scanOffset = null; transferOffset = 15; hatchOffset = 18; }
      else if (parsedEggType === 'Goose') { scanOffset = 10; transferOffset = 26; hatchOffset = 30; }

      const day8Date = scanOffset !== null ? calcOffset(scanOffset) : '';
      const day18Date = calcOffset(transferOffset);
      const day21Date = calcOffset(hatchOffset);

      let overdraftUsed = 0;
      if (client && body.overdraftUsed) {
        client.overdraft = client.overdraft || 0;
        overdraftUsed = Math.min(client.overdraft, Number(body.overdraftUsed), amountDue);
        client.overdraft -= overdraftUsed;
      }

      const newBatch: IncubatorRecord = {
        id: batchId,
        clientId: body.clientId,
        clientName: client ? client.name : (body.clientName || 'Client'),
        clientMark: client ? client.mark : (body.clientMark || 'XX'),
        clientPhone: client ? client.phone : (body.clientPhone || ''),
        eggType: parsedEggType,
        dateBrought: String(body.dateBrought),
        createdAt: body.createdAt || new Date().toISOString(),
        day8Date,
        day18Date,
        day21Date,
        eggsCollected: eggs,
        specialCase: sc,
        ratePerEgg: rate,
        amountDue,
        amountPaid: Math.max(0, Number(body.amountPaid || 0)),
        overdraftUsed,
        eggsAfterScan: body.eggsAfterScan !== undefined ? body.eggsAfterScan : null,
        chicksHatched: body.chicksHatched !== undefined ? body.chicksHatched : null,
        notes: body.notes ? String(body.notes).trim() : ''
      };

      const existsIdx = db.incubator_records.findIndex(r => r.id === batchId);
      if (existsIdx !== -1) {
        db.incubator_records[existsIdx] = newBatch;
      } else {
        db.incubator_records.push(newBatch);
      }
      responseData = newBatch;
      description = `Incubator Batch: ${eggs}x ${parsedEggType} eggs (${newBatch.clientMark})`;
      body.id = batchId;
    } else if (endpoint.startsWith('/api/incubator/') && method === 'PUT') {
      const id = endpoint.replace('/api/incubator/', '');
      const idx = db.incubator_records.findIndex(r => r.id === id);
      if (idx !== -1) {
        db.incubator_records[idx] = { ...db.incubator_records[idx], ...body };
        const computed = computeAmountDue(db.incubator_records[idx]);
        db.incubator_records[idx].ratePerEgg = computed.rate;
        db.incubator_records[idx].amountDue = computed.amountDue;
        responseData = db.incubator_records[idx];
        description = `Update Incubator Batch: ${db.incubator_records[idx].clientMark}`;
      }
    } else if (endpoint.startsWith('/api/incubator/') && method === 'DELETE') {
      const id = endpoint.replace('/api/incubator/', '');
      db.incubator_records = db.incubator_records.filter(r => r.id !== id);
      description = `Delete Incubator Batch`;
    }

    // --- BULK OPERATIONS ---
    else if (endpoint === '/api/bulk-delete' && method === 'POST') {
      const { type, ids } = body || {};
      if (type && Array.isArray(ids)) {
        if (type === 'incubator') db.incubator_records = db.incubator_records.filter(r => !ids.includes(r.id));
        else if (type === 'flocks') db.flocks = db.flocks.filter(r => !ids.includes(r.id));
        else if (type === 'feed') db.feed_records = db.feed_records.filter(r => !ids.includes(r.id));
        else if (type === 'sales') db.poultry_sales = db.poultry_sales.filter(r => !ids.includes(r.id));
        else if (type === 'mortality') db.mortality = db.mortality.filter(r => !ids.includes(r.id));
        else if (type === 'expenses') db.expenses = db.expenses.filter(r => !ids.includes(r.id));
        else if (type === 'fowls_eaten') db.fowls_eaten = (db.fowls_eaten || []).filter(r => !ids.includes(r.id));
        description = `Bulk Delete: ${ids.length} ${type} records`;
      }
    } else if (endpoint === '/api/bulk-update' && method === 'POST') {
      const { type, ids, updates } = body || {};
      if (type && Array.isArray(ids) && updates) {
        let key = '';
        if (type === 'incubator') key = 'incubator_records';
        else if (type === 'flocks') key = 'flocks';
        else if (type === 'feed') key = 'feed_records';
        else if (type === 'sales') key = 'poultry_sales';
        else if (type === 'mortality') key = 'mortality';
        else if (type === 'expenses') key = 'expenses';
        else if (type === 'fowls_eaten') key = 'fowls_eaten';

        if (key && key in db) {
          (db as any)[key] = ((db as any)[key] || []).map((r: any) => {
            if (ids.includes(r.id)) {
              return { ...r, ...updates };
            }
            return r;
          });
        }
        description = `Bulk Update: ${ids.length} ${type} records`;
      }
    }

    if (description === `${method} ${endpoint}`) {
      return { responseData: { success: false, error: 'This action needs a connection. Please try again online.' }, offlineQueued: false };
    }

    // Persist the queue before showing a local success. A full phone storage area must fail visibly.
    queueMutation({
      endpoint,
      method: method as any,
      body,
      type: endpoint.split('/')[2] || 'record',
      description
    });
    saveOfflineDb(db, true);

    return { responseData, offlineQueued: true };
  } catch (err) {
    console.error('Error executing local offline mutation:', err);
    return { responseData: { success: false, error: err instanceof Error ? err.message : 'Local offline store error' }, offlineQueued: false };
  }
}

// 4. Synchronization Engine
/** ID of the record a queued create makes (only creates name their record in body.id). */
function createdRecordId(item: QueuedMutation): string | undefined {
  const id = item.method === 'POST' ? item.body?.id : undefined;
  return typeof id === 'string' && id.length >= 8 ? id : undefined;
}

/** True when `item` refers to the record `rootId` (by URL or anywhere in its body). Record IDs are random, so a text match is safe. */
function refersTo(item: QueuedMutation, rootId: string): boolean {
  if (item.endpoint.includes(rootId)) return true;
  try { return JSON.stringify(item.body ?? null).includes(rootId); } catch (_) { return false; }
}

/** Save new fields for one queued item, keeping any items added while the sync runs. */
function updateQueuedItem(id: string, changes: Partial<QueuedMutation>): void {
  saveSyncQueue(getSyncQueue().map(queued => {
    if (queued.id !== id) return queued;
    const next: QueuedMutation = { ...queued, ...changes };
    (Object.keys(changes) as (keyof QueuedMutation)[]).forEach(key => { if (changes[key] === undefined) delete next[key]; });
    return next;
  }));
}

/** The status codes after which a change should simply be sent again later (server busy, timeout, cloud conflict). */
function isTemporaryFailure(status: number, body: any): boolean {
  return status === 408 || status === 429 || status >= 500 || (status === 409 && body?.code === 'CLOUD_CONFLICT');
}

let syncInProgress = false;
/**
 * Send queued changes in order.
 * - A change the server refuses (4xx) is marked 'failed' with the server's message and the next change is sent.
 * - A possible duplicate (409 POSSIBLE_DUPLICATE) waits for "Keep both" or "Discard"; the next change is sent.
 * - A change that refers to a record whose create did not save is 'held' instead of being sent.
 * - No connection, a server error, or a cloud conflict stops here and keeps the order for the next try.
 * - Sign-in problems (401/403) stop here too; the change itself is fine.
 * Every request carries the change's fixed request ID, so a retry after a lost reply is never applied twice.
 */
export async function syncPendingQueue(token: string): Promise<{ success: boolean; syncedCount: number; retryable: boolean; stopped: boolean; needsAttention: number }> {
  const finish = (result: { success: boolean; syncedCount: number; retryable: boolean; stopped: boolean }) => ({ ...result, needsAttention: getAttentionQueue().length });
  if (syncInProgress) return finish({ success: false, syncedCount: 0, retryable: true, stopped: true });
  // Failed changes are tried again on each sync (the farm may have changed); duplicates wait for the person.
  const queue = getSyncQueue().filter(item => item.status !== 'duplicate').sort((a, b) => a.timestamp - b.timestamp);
  if (queue.length === 0) {
    return finish({ success: getSyncQueue().length === 0, syncedCount: 0, retryable: false, stopped: false });
  }

  syncInProgress = true;
  notifyOfflineChange();
  let synced = 0;
  let retryable = false;
  let stopped = false;
  const deviceId = getDeviceId();
  try {
    for (const listed of queue) {
      const current = getSyncQueue();
      const item = current.find(queued => queued.id === listed.id);
      if (!item || item.status === 'duplicate') continue; // discarded or changed meanwhile

      // Hold a change that refers to a record whose earlier create has not saved.
      const blocker = current.find(other => other.id !== item.id && other.status && other.timestamp <= item.timestamp
        && createdRecordId(other) && refersTo(item, createdRecordId(other)!));
      if (blocker) {
        if (item.status !== 'held') updateQueuedItem(item.id, { status: 'held', error: `Waiting for an earlier change that did not save: ${blocker.description}`, duplicateOf: undefined });
        continue;
      }
      // Its earlier change has now saved (or was discarded): it is an ordinary waiting change again.
      if (item.status === 'held') updateQueuedItem(item.id, { status: undefined, error: undefined });

      const requestId = item.requestId || item.id;
      const headers: Record<string, string> = { 'Authorization': token, 'Content-Type': 'application/json', 'X-NVF-Device-Id': deviceId };
      if (/^[\w-]{8,100}$/.test(String(requestId))) headers['X-NVF-Request-Id'] = String(requestId);
      if (item.allowDuplicate) headers['X-NVF-Force-Duplicate'] = '1';
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 12000);
      let response: Response;
      try {
        response = await networkFetch(apiUrl(item.endpoint), {
          method: item.method,
          headers,
          body: item.body ? JSON.stringify(item.body) : undefined,
          signal: controller.signal
        });
      } finally {
        clearTimeout(timeout);
      }

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        const message = typeof body.error === 'string' ? body.error : `Server rejected a change (${response.status}).`;
        if (response.status === 409 && body?.code === 'POSSIBLE_DUPLICATE') {
          updateQueuedItem(item.id, { status: 'duplicate', error: message, duplicateOf: { by: body.duplicate?.by, summary: body.duplicate?.summary } });
          continue;
        }
        if (isTemporaryFailure(response.status, body) || response.status === 401 || response.status === 403) {
          localStorage.setItem(SYNC_PROBLEM_KEY, message);
          retryable = isTemporaryFailure(response.status, body);
          stopped = true;
          break;
        }
        // Refused for this change only: keep it for the person and move on.
        updateQueuedItem(item.id, { status: 'failed', error: message, duplicateOf: undefined });
        continue;
      }
      // Remove only this acknowledged operation. Keep operations added while sync is running.
      saveSyncQueue(getSyncQueue().filter(queued => queued.id !== item.id));
      synced++;
    }
    if (!stopped) localStorage.removeItem(SYNC_PROBLEM_KEY);
  } catch (err) {
    localStorage.setItem(SYNC_PROBLEM_KEY, 'Cannot reach the farm server. Retry when connected.');
    console.warn('Pending changes remain on this device:', err);
    retryable = true;
    stopped = true;
  } finally {
    syncInProgress = false;
  }
  const remaining = getSyncQueue().length;
  if (!stopped && getSendableQueue().length === 0) {
    notifyOfflineChange();
    // Fetch fresh database snapshot from server (changes that did not save drop out of the phone's copy).
    await refreshOfflineCache(token);
  } else {
    notifyOfflineChange();
  }

  return finish({ success: remaining === 0, syncedCount: synced, retryable, stopped });
}

/** Replace the phone's copy with the server's data. */
async function refreshOfflineCache(token: string): Promise<void> {
  try {
    const dataRes = await networkFetch(apiUrl('/api/data'), { headers: { 'Authorization': token } });
    if (dataRes.ok) {
      const freshDb = await dataRes.json();
      saveOfflineDb(freshDb, true);
    }
  } catch (e) {}
}

/** "Retry": send a refused or held change again on the next sync. */
export function retryQueuedChange(id: string): void {
  updateQueuedItem(id, { status: undefined, error: undefined, duplicateOf: undefined });
}

/** "Keep both": send a possible duplicate again, telling the server it is intended. */
export function keepBothQueuedChange(id: string): void {
  updateQueuedItem(id, { status: undefined, error: undefined, duplicateOf: undefined, allowDuplicate: true });
}

/**
 * "Discard": remove one change from this phone. Nothing on the server is deleted.
 * Later changes that were held because of it are released (sent normally; the server decides).
 */
export async function discardQueuedChange(id: string, token?: string | null): Promise<void> {
  const queue = getSyncQueue();
  const removed = queue.find(item => item.id === id);
  if (!removed) return;
  const rootId = createdRecordId(removed);
  saveSyncQueue(queue.filter(item => item.id !== id).map(item => {
    if (item.status === 'held' && rootId && refersTo(item, rootId)) {
      const { status, error, ...rest } = item;
      return rest;
    }
    return item;
  }));
  // The phone's copy still shows the discarded change; reload it when nothing else is waiting to send.
  if (token && navigator.onLine && getSendableQueue().length === 0) await refreshOfflineCache(token);
}
