/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Offline sync safety (server side, pure helpers over the farm database object).
 *
 * 1. Request receipts (idempotency): a phone sends each queued change with a
 *    unique X-NVF-Request-Id. When the change is saved, the ID is written in the
 *    SAME save as the change, so "saved" and "remembered" can never disagree.
 *    If the phone sends the same ID again (lost reply, retry), the server answers
 *    success without applying the change a second time.
 * 2. Possible duplicates: two people (or two phones) may type the same sale or
 *    loss while offline. When a synced create looks exactly like a record that
 *    another request created in the last 48 hours, the server does not save it
 *    and asks the phone to let the person decide ("Keep both" or "Discard").
 *    Nothing is ever deleted by this check.
 *
 * Both lists are small and bounded so the single Firestore document stays small.
 */

export const REQUEST_ID_HEADER = 'x-nvf-request-id';
export const DEVICE_ID_HEADER = 'x-nvf-device-id';
export const FORCE_DUPLICATE_HEADER = 'x-nvf-force-duplicate';
export const POSSIBLE_DUPLICATE_CODE = 'POSSIBLE_DUPLICATE';

const RECEIPT_LIMIT = 500;
const RECEIPT_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const RECENT_CREATE_LIMIT = 200;
export const DUPLICATE_WINDOW_MS = 48 * 60 * 60 * 1000;

/** Request receipt: i = request ID, t = time saved (ms). Short keys keep the document small. */
export interface RequestReceipt { i: string; t: number }
/** A record created recently: c = collection, r = record ID, t = time (ms), by = person, q = request ID, d = device ID. */
export interface RecentCreate { c: string; r: string; t: number; by?: string; q?: string; d?: string }

export function isValidClientId(value: unknown): value is string {
  return typeof value === 'string' && /^[\w-]{8,100}$/.test(value);
}

export function hasRequestReceipt(db: any, requestId: string): boolean {
  return Array.isArray(db?.sync_request_receipts) && db.sync_request_receipts.some((entry: RequestReceipt) => entry?.i === requestId);
}

/** Remember a processed request ID. Drops entries older than 30 days and keeps the newest 500. */
export function addRequestReceipt(db: any, requestId: string, now = Date.now()): void {
  const kept = (Array.isArray(db.sync_request_receipts) ? db.sync_request_receipts : [])
    .filter((entry: RequestReceipt) => entry && entry.i !== requestId && now - Number(entry.t) < RECEIPT_MAX_AGE_MS);
  kept.push({ i: requestId, t: now });
  db.sync_request_receipts = kept.slice(-RECEIPT_LIMIT);
}

/** Remember records created by this request (only new IDs). Drops entries older than 48 hours and keeps the newest 200. */
export function addRecentCreates(db: any, collection: string, beforeIds: Set<string>, meta: { by?: string; q?: string; d?: string }, now = Date.now()): void {
  const rows = Array.isArray(db?.[collection]) ? db[collection] : [];
  const created = rows.filter((row: any) => row && typeof row.id === 'string' && !beforeIds.has(row.id)).map((row: any) => row.id as string);
  if (!created.length && !Array.isArray(db.sync_recent_creates)) return;
  const kept = (Array.isArray(db.sync_recent_creates) ? db.sync_recent_creates : [])
    .filter((entry: RecentCreate) => entry && now - Number(entry.t) < DUPLICATE_WINDOW_MS && !(entry.c === collection && created.includes(entry.r)));
  created.forEach((id: string) => kept.push({ c: collection, r: id, t: now, ...(meta.by ? { by: meta.by.slice(0, 60) } : {}), ...(meta.q ? { q: meta.q } : {}), ...(meta.d ? { d: meta.d } : {}) }));
  db.sync_recent_creates = kept.slice(-RECENT_CREATE_LIMIT);
}

// --- Duplicate rules -------------------------------------------------------
// Each rule turns the incoming request and a saved record into the same short
// "fingerprint" text. Equal fingerprints mean "looks like the same entry".

const n = (value: unknown) => { const num = Number(value); return Number.isFinite(num) ? String(num) : ''; };
const s = (value: unknown) => String(value ?? '').trim().toLowerCase();
const money = (value: unknown) => `${Number(value) || 0} FCFA`;

interface DuplicateRule {
  collection: string;
  /** Fingerprint of the incoming change, or null when the change cannot be compared. */
  fromRequest: (body: any) => string | null;
  /** Fingerprint of a saved record, or null when it should never match (e.g. reversed). */
  fromRecord: (record: any) => string | null;
  summary: (record: any) => string;
  /** The ID the new record will get, so an update of the same record is not called a duplicate. */
  newId: (body: any) => string | undefined;
}

const active = (record: any) => record && !record.voided;
const bodyId = (body: any) => (typeof body?.id === 'string' ? body.id : undefined);

const RULES: Record<string, DuplicateRule> = {
  '/api/sales': {
    collection: 'poultry_sales',
    fromRequest: b => b?.date && b?.itemType ? ['sale', s(b.date), s(b.itemType), s(b.flockId), n(b.quantity), n(b.unitPrice), s(b.buyerName)].join('|') : null,
    fromRecord: r => active(r) ? ['sale', s(r.date), s(r.itemType), s(r.flockId), n(r.quantity), n(r.unitPrice), s(r.buyerName)].join('|') : null,
    summary: r => `sale on ${r.date}: ${r.quantity} ${r.itemType} to ${r.buyerName || 'a buyer'} (${money(r.totalAmount)})`,
    newId: bodyId
  },
  '/api/mortality': {
    collection: 'mortality',
    fromRequest: b => b?.date && b?.flockId ? ['loss', s(b.date), s(b.flockId), n(b.quantity)].join('|') : null,
    fromRecord: r => active(r) ? ['loss', s(r.date), s(r.flockId), n(r.quantity)].join('|') : null,
    summary: r => `loss on ${r.date}: ${r.quantity} from ${r.flockName || 'a flock'}`,
    newId: bodyId
  },
  '/api/fowls-eaten': {
    collection: 'fowls_eaten',
    fromRequest: b => b?.date && b?.flockId ? ['home', s(b.date), s(b.flockId), n(b.quantity)].join('|') : null,
    fromRecord: r => active(r) ? ['home', s(r.date), s(r.flockId), n(r.quantity)].join('|') : null,
    summary: r => `home use on ${r.date}: ${r.quantity} from ${r.flockName || 'a flock'}`,
    newId: bodyId
  },
  '/api/feed': {
    collection: 'feed_records',
    fromRequest: b => b?.date && b?.feedType ? ['feed', s(b.date), s(b.feedType), s(b.species === 'Rabbit' || b.species === 'Quail' ? b.species : 'Poultry'), n(b.bagsBought), n(b.costBag)].join('|') : null,
    fromRecord: r => active(r) ? ['feed', s(r.date), s(r.feedType), s(r.species || 'Poultry'), n(r.bagsBought), n(r.costBag)].join('|') : null,
    summary: r => `feed on ${r.date}: ${r.bagsBought} bag(s) of ${r.feedType} (${money(r.totalCost)})`,
    newId: bodyId
  },
  '/api/expenses': {
    collection: 'expenses',
    fromRequest: b => b?.date && b?.category ? ['expense', s(b.date), s(b.category), n(b.amount)].join('|') : null,
    fromRecord: r => active(r) ? ['expense', s(r.date), s(r.category), n(r.amount)].join('|') : null,
    summary: r => `expense on ${r.date}: ${r.category}, ${r.description || ''} (${money(r.amount)})`.replace(',  (', ' ('),
    newId: bodyId
  },
  '/api/incubator': {
    collection: 'incubator_records',
    fromRequest: b => b?.clientId && b?.dateBrought ? ['incubator', s(b.clientId), s(b.dateBrought), s(b.eggType || 'Brahma'), n(b.eggsCollected)].join('|') : null,
    fromRecord: r => active(r) && r.ownerType !== 'farm' ? ['incubator', s(r.clientId), s(r.dateBrought), s(r.eggType || 'Brahma'), n(r.eggsCollected)].join('|') : null,
    summary: r => `incubator batch on ${r.dateBrought}: ${r.eggsCollected} ${r.eggType || ''} eggs for ${r.clientName || 'a client'}`.replace('  ', ' '),
    newId: bodyId
  }
};

// Linked farm actions (quail and rabbit/quail care and costs). Rabbit sales,
// losses and home use pick individual rabbits, so a second copy is already
// refused by the farm rules ("rabbit is no longer active"); they are not listed here.
const p = (b: any) => (b && typeof b.payload === 'object' && b.payload) || {};
const actionId = (b: any) => (typeof b?.id === 'string' ? b.id : undefined);
const FARM_ACTION_RULES: Record<string, DuplicateRule> = {
  quail_live_sale: {
    collection: 'poultry_sales',
    fromRequest: b => ['qsale', s(p(b).date), s(p(b).isChick ? 'Quail Chick' : 'Quail'), s(p(b).flockId), n(p(b).quantity), n(p(b).amount)].join('|'),
    fromRecord: r => active(r) && r.stockAction === 'quail_live_sale_void' ? ['qsale', s(r.date), s(r.itemType), s(r.flockId), n(r.quantity), n(r.totalAmount)].join('|') : null,
    summary: r => `quail sale on ${r.date}: ${r.quantity} ${r.itemType} to ${r.buyerName || 'a buyer'} (${money(r.totalAmount)})`,
    newId: actionId
  },
  quail_loss: {
    collection: 'mortality',
    fromRequest: b => ['qloss', s(p(b).date), s(p(b).flockId), n(p(b).quantity)].join('|'),
    fromRecord: r => active(r) && r.stockAction === 'quail_loss_void' ? ['qloss', s(r.date), s(r.flockId), n(r.quantity)].join('|') : null,
    summary: r => `quail loss on ${r.date}: ${r.quantity} from ${r.flockName || 'a flock'}`,
    newId: actionId
  },
  quail_eaten: {
    collection: 'fowls_eaten',
    fromRequest: b => ['qhome', s(p(b).date), s(p(b).flockId), n(p(b).quantity)].join('|'),
    fromRecord: r => active(r) && r.stockAction === 'quail_eaten_void' ? ['qhome', s(r.date), s(r.flockId), n(r.quantity)].join('|') : null,
    summary: r => `quail home use on ${r.date}: ${r.quantity} from ${r.flockName || 'a flock'}`,
    newId: actionId
  },
  quail_egg_use: {
    collection: 'quail_egg_use',
    // Stock adjustments are corrections, not entries; they are never compared.
    fromRequest: b => p(b).useKind === 'adjustment' ? null : ['qegg', s(p(b).date), s(p(b).useKind), n(p(b).quantity), p(b).useKind === 'sold' ? n(p(b).amount) : ''].join('|'),
    fromRecord: r => active(r) && r.kind !== 'adjustment' ? ['qegg', s(r.date), s(r.kind), n(r.quantity), r.kind === 'sold' ? n(r.amount) : ''].join('|') : null,
    summary: r => `quail eggs ${r.kind === 'set' ? 'set in the incubator' : r.kind} on ${r.date}: ${r.quantity} egg(s)${r.kind === 'sold' ? ` (${money(r.amount)})` : ''}`,
    newId: actionId
  },
  animal_expense: {
    collection: 'expenses',
    fromRequest: b => ['aexpense', s(p(b).date), s(p(b).species), n(p(b).amount)].join('|'),
    fromRecord: r => active(r) && r.species ? ['aexpense', s(r.date), s(r.species), n(r.amount)].join('|') : null,
    summary: r => `${String(r.species || '').toLowerCase()} cost on ${r.date}: ${r.description || ''} (${money(r.amount)})`,
    newId: actionId
  },
  rabbit_care: careRule(),
  quail_care: careRule()
};

function careRule(): DuplicateRule {
  return {
    collection: 'animal_care',
    // Amount only counts for feed and weight (health notes have no amount).
    fromRequest: b => ['care', s(p(b).date), s(b?.kind === 'rabbit_care' ? 'Rabbit' : 'Quail'), s(p(b).targetId), s(p(b).careKind), ['feed', 'weight'].includes(p(b).careKind) ? n(p(b).amount) : '', s(p(b).detail)].join('|'),
    fromRecord: r => active(r) ? ['care', s(r.date), s(r.species), s(r.targetId), s(r.kind), ['feed', 'weight'].includes(r.kind) ? n(r.amount) : '', s(r.detail)].join('|') : null,
    summary: r => `${String(r.species || '').toLowerCase()} ${r.kind} on ${r.date}${r.detail ? `: ${r.detail}` : ''}`,
    newId: actionId
  };
}

/** The duplicate rule for a create request, or undefined when the route is not checked. */
export function duplicateRuleFor(path: string, method: string, body: any): DuplicateRule | undefined {
  if (method !== 'POST') return undefined;
  if (path === '/api/farm/actions') return FARM_ACTION_RULES[String(body?.kind || '')];
  return RULES[path];
}

export interface PossibleDuplicate { recordId: string; by?: string; summary: string; at: number }

/**
 * Look for a record that looks the same and was created in the last 48 hours by
 * a different request (and, when both are known, a different phone).
 * Older records, records from before this check existed, and reversed records are never matched.
 */
export function findPossibleDuplicate(db: any, rule: DuplicateRule, body: any, incoming: { q?: string; d?: string }, now = Date.now()): PossibleDuplicate | null {
  const fingerprint = rule.fromRequest(body);
  if (!fingerprint) return null;
  const newId = rule.newId(body);
  const rows: any[] = Array.isArray(db?.[rule.collection]) ? db[rule.collection] : [];
  // Re-sending the same record ID is an update of that record, not a second entry.
  if (newId && rows.some(row => row?.id === newId)) return null;
  if (newId && rule.newId === actionId && Array.isArray(db?.farm_action_receipts) && db.farm_action_receipts.includes(newId)) return null;
  const recent: RecentCreate[] = Array.isArray(db?.sync_recent_creates) ? db.sync_recent_creates : [];
  for (const entry of [...recent].reverse()) {
    if (!entry || entry.c !== rule.collection || now - Number(entry.t) >= DUPLICATE_WINDOW_MS) continue;
    if (incoming.q && entry.q === incoming.q) continue;
    if (incoming.d && entry.d && incoming.d === entry.d) continue; // same phone: not "someone else"
    const record = rows.find(row => row?.id === entry.r);
    if (!record || rule.fromRecord(record) !== fingerprint) continue;
    return { recordId: record.id, by: entry.by, summary: rule.summary(record), at: Number(entry.t) };
  }
  return null;
}
