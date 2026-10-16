import type { DbSchema, IncubatorRecord } from '../types';
import { rabbitReminders } from './farmViews';
import { formatDateDDMMYYYY } from '../utils/dateUtils';

/** One reminder shown in the bell list and (once) as a phone notification. */
export interface ActiveNotification {
  id: string;
  type: 'candling' | 'day18' | 'day21' | 'eggCollection' | 'rabbit';
  title: string;
  description: string;
  clientName?: string;
  clientMark?: string;
  clientPhone?: string;
  eggsCollected?: number;
  expectedDate?: string;
  record?: IncubatorRecord;
}

const dayMs = 24 * 60 * 60 * 1000;

/** Incubation milestones per species. candle -1 means no candling reminder. */
export function incubationDays(species: string) {
  if (species === 'Turkey') return { candle: 10, transfer: 25, hatch: 28 };
  if (species === 'Quail') return { candle: -1, transfer: 15, hatch: 18 };
  if (species === 'Goose') return { candle: 10, transfer: 26, hatch: 30 };
  return { candle: 8, transfer: 18, hatch: 21 };
}

const addDaysISO = (iso: string, days: number) => {
  const t = Date.parse(`${String(iso).slice(0, 10)}T00:00:00Z`);
  return Number.isFinite(t) ? new Date(t + days * dayMs).toISOString().slice(0, 10) : undefined;
};

export function currentFarmHour(now = new Date()) {
  return Number(new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hourCycle: 'h23', timeZone: 'Africa/Douala' }).format(now));
}

/**
 * Every active reminder, in one place, so the bell list, the bell badge and phone
 * notifications always agree. Logic moved unchanged from NotificationHub, plus candling.
 */
export function farmReminders(db: Partial<DbSchema>, todayStr: string, currentHour = currentFarmHour()): ActiveNotification[] {
  const list: ActiveNotification[] = rabbitReminders(db, todayStr).map(item => ({ ...item, type: 'rabbit' as const }));
  const todayTime = new Date(todayStr).getTime();

  const hasEggRecordToday = (db.daily_egg_collections || []).some((rec: any) => rec.date === todayStr && rec.poultryRecorded !== false);
  if (currentHour >= 18 && !hasEggRecordToday) {
    list.push({
      id: `egg-alert-${todayStr}`,
      type: 'eggCollection',
      title: '🥚 6:00 PM Daily Egg Collection Alert!',
      description: `Daily farm egg collection for today (${formatDateDDMMYYYY(todayStr)}) has not been logged yet. Please enter today's egg counts.`,
      expectedDate: todayStr
    });
  }

  for (const rec of (db.incubator_records || []) as IncubatorRecord[]) {
    if (rec.ownerType === 'farm') continue;
    const daysDiff = Math.floor((todayTime - new Date(rec.dateBrought).getTime()) / dayMs);
    const species = rec.eggType || 'Brahma';
    const d = incubationDays(species);
    const notHatched = rec.chicksHatched === null || rec.chicksHatched === undefined;
    const scanned = rec.eggsAfterScan !== null && rec.eggsAfterScan !== undefined;
    const client = { clientName: rec.clientName, clientMark: rec.clientMark, clientPhone: rec.clientPhone, eggsCollected: rec.eggsCollected, record: rec };

    // Candling: from candling day until the scan result is recorded (stops at transfer day).
    if (d.candle > 0 && !scanned && notHatched && daysDiff >= d.candle && daysDiff < d.transfer) {
      list.push({
        id: `candle-${rec.id}`,
        type: 'candling',
        title: `${species} Day ${d.candle}: Candle the eggs`,
        description: `${rec.clientName} (${rec.clientMark}) • Candle ${rec.eggsCollected} eggs and record how many are fertile.`,
        expectedDate: addDaysISO(rec.dateBrought, d.candle),
        ...client
      });
    }

    // Hatcher transfer. Quail needs no scan; other species need the candling result first.
    const readyForTransfer = species === 'Quail' || scanned;
    if (readyForTransfer && notHatched && daysDiff >= d.transfer && daysDiff < d.hatch) {
      list.push({
        id: `day18-${rec.id}`,
        type: 'day18',
        title: `${species} Day ${d.transfer}: Send to Hatcher`,
        description: `${rec.clientName} (${rec.clientMark}) • ${scanned ? rec.eggsAfterScan : rec.eggsCollected} / ${rec.eggsCollected} eggs must be transferred from incubator to hatcher trays.`,
        expectedDate: rec.day18Date,
        ...client
      });
    }

    if (notHatched && daysDiff >= d.hatch) {
      list.push({
        id: `day21-${rec.id}`,
        type: 'day21',
        title: `${species} Day ${d.hatch}: Hatch Complete!`,
        description: `${rec.clientName} (${rec.clientMark}) • Day ${d.hatch} cycle complete for ${rec.eggsCollected} eggs. Count hatched chicks, and call client immediately.`,
        expectedDate: rec.day21Date,
        ...client
      });
    }
  }
  return list;
}

/** Which app screen a reminder opens when its phone notification is tapped. */
export function reminderSection(type: ActiveNotification['type']): 'rabbits' | 'incubator' | 'eggs' {
  if (type === 'rabbit') return 'rabbits';
  if (type === 'eggCollection') return 'eggs';
  return 'incubator';
}
