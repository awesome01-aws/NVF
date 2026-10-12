/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface ShortcutDef {
  id: string;
  title: string;
  subtitle: string;
  category: 'Farm' | 'Incubator';
  tab: 'farm' | 'incubator';
  quickFormKey: string;
  iconName: string;
  accent: 'amber' | 'indigo' | 'rose' | 'emerald' | 'purple' | 'teal' | 'orange' | 'sky';
}

export const ALL_SHORTCUTS: Record<string, ShortcutDef> = {
  rabbits: { id: 'rabbits', title: 'Add Rabbit', subtitle: 'Rabbits and litters', category: 'Farm', tab: 'farm', quickFormKey: 'rabbits', iconName: 'Rabbit', accent: 'emerald' },
  quail: { id: 'quail', title: 'Manage Quail', subtitle: 'Birds, eggs and farm hatches', category: 'Farm', tab: 'farm', quickFormKey: 'quail', iconName: 'Egg', accent: 'teal' },
  quail_flock_add: { id: 'quail_flock_add', title: 'Add Quail', subtitle: 'Start a quail flock', category: 'Farm', tab: 'farm', quickFormKey: 'quail_flock_add', iconName: 'Egg', accent: 'teal' },
  egg_collection: {
    id: 'egg_collection',
    title: 'Record Eggs',
    subtitle: 'Daily Egg Collection',
    category: 'Farm',
    tab: 'farm',
    quickFormKey: 'egg_collection',
    iconName: 'Egg',
    accent: 'amber'
  },
  transfer: {
    id: 'transfer',
    title: 'Transfer Fowls',
    subtitle: 'Cage & House Movement',
    category: 'Farm',
    tab: 'farm',
    quickFormKey: 'transfer',
    iconName: 'ArrowRightLeft',
    accent: 'indigo'
  },
  mortality: {
    id: 'mortality',
    title: 'Record Mortality',
    subtitle: 'Log Fowl Loss / Deaths',
    category: 'Farm',
    tab: 'farm',
    quickFormKey: 'mortality',
    iconName: 'AlertTriangle',
    accent: 'rose'
  },
  batch: {
    id: 'batch',
    title: 'Add Egg Batch',
    subtitle: 'Incubator Setting Entry',
    category: 'Incubator',
    tab: 'incubator',
    quickFormKey: 'batch',
    iconName: 'PlusCircle',
    accent: 'emerald'
  },
  client: {
    id: 'client',
    title: 'New Client',
    subtitle: 'Register Marking & Name',
    category: 'Incubator',
    tab: 'incubator',
    quickFormKey: 'client',
    iconName: 'UserPlus',
    accent: 'purple'
  },
  feed: {
    id: 'feed',
    title: 'Log Poultry Feed',
    subtitle: 'Bags & Feed Purchase',
    category: 'Farm',
    tab: 'farm',
    quickFormKey: 'feed',
    iconName: 'TrendingUp',
    accent: 'teal'
  },
  sales: {
    id: 'sales',
    title: 'Record Poultry Sale',
    subtitle: 'Fowl & Turkey Sales',
    category: 'Farm',
    tab: 'farm',
    quickFormKey: 'sales',
    iconName: 'DollarSign',
    accent: 'emerald'
  },
  expense: {
    id: 'expense',
    title: 'Log Expense',
    subtitle: 'Transport & Meds',
    category: 'Farm',
    tab: 'farm',
    quickFormKey: 'expense',
    iconName: 'Receipt',
    accent: 'rose'
  },
  fowls_eaten: {
    id: 'fowls_eaten',
    title: 'Record Fowls Eaten',
    subtitle: 'Home Consumption',
    category: 'Farm',
    tab: 'farm',
    quickFormKey: 'fowls_eaten',
    iconName: 'Utensils',
    accent: 'orange'
  },
  flock: {
    id: 'flock',
    title: 'Add Fowl Batch',
    subtitle: 'Grow New Fowls / Turkeys',
    category: 'Farm',
    tab: 'farm',
    quickFormKey: 'flock',
    iconName: 'Plus',
    accent: 'sky'
  }
};

const RECENT_KEY = 'nvf_recent_shortcuts';
const COUNTS_KEY = 'nvf_frequent_shortcuts_counts';

// Default initial state for a fresh session
const DEFAULT_RECENTS = ['transfer', 'mortality', 'egg_collection', 'batch'];
const DEFAULT_COUNTS: Record<string, number> = {
  egg_collection: 18,
  batch: 14,
  transfer: 12,
  mortality: 9,
  sales: 7,
  feed: 5,
  client: 4,
  expense: 3,
  fowls_eaten: 2,
  flock: 1
};

export function getRecentShortcutIds(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    if (!raw) return DEFAULT_RECENTS;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) return parsed;
  } catch (e) {
    // fallback
  }
  return DEFAULT_RECENTS;
}

export function getFrequentShortcutCounts(): Record<string, number> {
  try {
    const raw = localStorage.getItem(COUNTS_KEY);
    if (!raw) return DEFAULT_COUNTS;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') return { ...DEFAULT_COUNTS, ...parsed };
  } catch (e) {
    // fallback
  }
  return DEFAULT_COUNTS;
}

export function recordShortcutUsage(id: string) {
  if (!ALL_SHORTCUTS[id]) return;

  // 1. Update Recents (unshift to front, dedup, max 6)
  const currentRecents = getRecentShortcutIds();
  const filtered = currentRecents.filter((item) => item !== id);
  const updatedRecents = [id, ...filtered].slice(0, 6);
  localStorage.setItem(RECENT_KEY, JSON.stringify(updatedRecents));

  // 2. Update Counts
  const currentCounts = getFrequentShortcutCounts();
  currentCounts[id] = (currentCounts[id] || 0) + 1;
  localStorage.setItem(COUNTS_KEY, JSON.stringify(currentCounts));

  // Dispatch custom event so open views sync state immediately
  window.dispatchEvent(new CustomEvent('nvf_shortcuts_updated'));
}
