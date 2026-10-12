import React from 'react';
import { ArrowRight, ArrowRightLeft, Bird, Egg, HeartPulse, Package, Receipt, ShoppingBag, Users, Utensils, BarChart3, Plus, X, RotateCcw, Rabbit } from 'lucide-react';
import { ActiveTab, DailyEggCollection, Expense, FeedRecord, Flock, IncubatorRecord, PoultrySale, RabbitSale, DbSchema } from '../types';
import { rabbitReminders } from '../lib/farmViews';
import { useFarmToday } from '../lib/useFarmToday';
import { useFarmNotifications } from '../lib/farmNotifications';
import { getCameroonTodayISO } from '../utils/dateUtils';
import { recordShortcutUsage } from '../utils/shortcutTracker';

interface Props {
  db: Partial<DbSchema> & {
    flocks: Flock[];
    incubator_records: IncubatorRecord[];
    poultry_sales: PoultrySale[];
    rabbit_sales?: RabbitSale[];
    daily_egg_collections?: DailyEggCollection[];
    feed_records?: FeedRecord[];
    expenses?: Expense[];
  };
  currentUserName?: string;
  setActiveTab: (tab: ActiveTab) => void;
  onTriggerQuickForm: (key: string) => void;
  onOpenEditRecord: (record: IncubatorRecord) => void;
}

interface HatcheryTask {
  id: string;
  title: string;
  detail: string;
  record: IncubatorRecord;
}

export default function HomeDashboard({ db, currentUserName, setActiveTab, onTriggerQuickForm, onOpenEditRecord }: Props) {
  const today = useFarmToday();
  const rabbitTasks = rabbitReminders(db, today);
  useFarmNotifications(rabbitTasks);
  const todayTime = Date.parse(`${today}T00:00:00Z`);
  const [dismissedTasks, setDismissedTasks] = React.useState<string[]>([]);
  const [eggReminderDismissed, setEggReminderDismissed] = React.useState(false);
  const [showAllTasks, setShowAllTasks] = React.useState(false);
  const [showMoreActions, setShowMoreActions] = React.useState(false);
  const birds = (db.flocks || []).reduce((sum, flock) => sum + (Number(flock.quantity) || 0), 0);
  const activeBatches = (db.incubator_records || []).filter(batch => batch.chicksHatched == null).length;
  const incubatingEggs = (db.incubator_records || []).filter(batch => batch.chicksHatched == null).reduce((sum, batch) => sum + (Number(batch.eggsCollected) || 0), 0);
  const eggsToday = (db.daily_egg_collections || []).find(record => record.date === today)?.totalEggs || 0;
  const eggsLoggedToday = (db.daily_egg_collections || []).some(record => record.date === today && (record.poultryRecorded !== false || (record.quailEggs || 0) > 0));

  const hatcheryTasks: HatcheryTask[] = [];
  for (const record of db.incubator_records || []) {
    if (record.ownerType === 'farm') continue;
    if (record.chicksHatched != null) continue;
    const broughtTime = Date.parse(`${record.dateBrought}T00:00:00Z`);
    if (!Number.isFinite(broughtTime)) continue;
    const days = Math.floor((todayTime - broughtTime) / 86400000);
    const species = record.eggType || 'Brahma';
    const schedule = species === 'Turkey' ? [10, 25, 28] : species === 'Quail' ? [-1, 15, 18] : species === 'Goose' ? [10, 26, 30] : [8, 18, 21];
    const client = `${record.clientName} (${record.clientMark})`;
    if (schedule[0] >= 0 && days >= schedule[0] && record.eggsAfterScan == null) {
      hatcheryTasks.push({ id: `scan-${record.id}`, title: `Day ${schedule[0]} scan due`, detail: `${client} · ${record.eggsCollected} ${species} eggs`, record });
    }
    if (days >= schedule[1] && (species === 'Quail' || record.eggsAfterScan != null)) {
      hatcheryTasks.push({ id: `transfer-${record.id}`, title: `Day ${schedule[1]} transfer due`, detail: `${client} · move eggs to hatching trays`, record });
    }
    if (days >= schedule[2]) {
      hatcheryTasks.push({ id: `hatch-${record.id}`, title: `Day ${schedule[2]} hatch count due`, detail: `${client} · record hatched chicks`, record });
    }
  }
  const visibleTasks = hatcheryTasks
    .filter(task => !dismissedTasks.includes(task.id))
    .sort((a, b) => b.record.dateBrought.localeCompare(a.record.dateBrought));
  const displayedTasks = showAllTasks ? visibleTasks : visibleTasks.slice(0, 3);
  const hourAtFarm = Number(new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hourCycle: 'h23', timeZone: 'Africa/Douala' }).format(new Date()));
  const eggReminderDue = hourAtFarm >= 18 && !eggsLoggedToday && !eggReminderDismissed;

  const inLastSevenDays = (date: string) => {
    const recordTime = Date.parse(`${date}T00:00:00Z`);
    return Number.isFinite(recordTime) && recordTime >= todayTime - 6 * 86400000 && recordTime <= todayTime;
  };
  const eggsSet = (db.incubator_records || []).filter(record => inLastSevenDays(record.dateBrought)).reduce((sum, record) => sum + (Number(record.eggsCollected) || 0), 0);
  const chicksHatched = (db.incubator_records || []).filter(record => record.chicksHatched != null && inLastSevenDays(record.dateBrought)).reduce((sum, record) => sum + (Number(record.chicksHatched) || 0), 0);
  const revenue = (db.poultry_sales || []).filter(record => !record.voided && inLastSevenDays(record.date)).reduce((sum, record) => sum + (Number(record.totalAmount) || 0), 0)
    + (db.rabbit_sales || []).filter(record => !record.voided && inLastSevenDays(record.date)).reduce((sum, record) => sum + (Number(record.totalAmount) || 0), 0)
    + (db.incubator_records || []).filter(record => inLastSevenDays(record.dateBrought)).reduce((sum, record) => sum + (Number(record.amountPaid) || 0), 0);
  const expenses = (db.expenses || []).filter(record => inLastSevenDays(record.date)).reduce((sum, record) => sum + (Number(record.amount) || 0), 0)
    + (db.feed_records || []).filter(record => inLastSevenDays(record.date)).reduce((sum, record) => sum + (Number(record.totalCost) || 0), 0);

  const open = (tab: ActiveTab, key?: string) => {
    if (key) {
      recordShortcutUsage(key);
      onTriggerQuickForm(key);
    }
    setActiveTab(tab);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const primaryActions = [
    { label: 'Record eggs', help: "Enter today's egg count", icon: Egg, tab: 'farm' as ActiveTab, key: 'egg_collection' },
    { label: 'Record a sale', help: 'Birds, meat or eggs sold', icon: ShoppingBag, tab: 'farm' as ActiveTab, key: 'sales' },
    { label: 'Add a flock', help: 'New birds on the farm', icon: Bird, tab: 'farm' as ActiveTab, key: 'flock' },
    { label: 'Add an egg batch', help: 'Start incubation for a client', icon: Plus, tab: 'incubator' as ActiveTab, key: 'batch' },
    { label: 'Move an animal', help: 'Rabbit or quail to another cage', icon: ArrowRightLeft, tab: 'farm' as ActiveTab, key: 'animal_move' },
    { label: 'Correct cage count', help: 'Update chicks or birds and explain why', icon: RotateCcw, tab: 'farm' as ActiveTab, key: 'cage_count' },
  ];
  const moreActions = [
    { label: 'Add rabbit', icon: Rabbit, key: 'rabbits' },
    { label: 'Add quail', icon: Egg, key: 'quail_flock_add' },
    { label: 'Feed', icon: Package, key: 'feed' },
    { label: 'Expenses', icon: Receipt, key: 'expense' },
    { label: 'Animal loss', icon: HeartPulse, key: 'mortality' },
    { label: 'Animals used at home', icon: Utensils, key: 'fowls_eaten' },
  ];

  return <div id="dashboard_tab" className="space-y-6 pb-12">
    <section className="rounded-3xl bg-emerald-900 text-white p-6 sm:p-8 shadow-lg shadow-emerald-950/10">
      <p className="text-emerald-200 text-sm font-medium">New Vision Farms · {new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeZone: 'Africa/Douala' }).format(new Date())}</p>
      <h1 className="text-3xl sm:text-4xl font-bold tracking-tight mt-2">Hello{currentUserName ? `, ${currentUserName.split(' ')[0]}` : ''}</h1>
      <p className="text-emerald-100 mt-2 max-w-xl">What would you like to do on the farm today?</p>
      <button type="button" onClick={() => birds > 0 && !eggsLoggedToday ? open('farm', 'egg_collection') : visibleTasks.length ? onOpenEditRecord(visibleTasks[0].record) : rabbitTasks.length ? open('farm', 'rabbits') : birds === 0 ? open('farm', 'flock') : open('farm')}
        className="mt-6 w-full sm:w-auto min-h-14 px-5 rounded-2xl bg-white text-emerald-900 font-bold text-base flex items-center justify-center gap-3 hover:bg-emerald-50 focus-visible:outline focus-visible:outline-4 focus-visible:outline-emerald-300">
        {birds > 0 && !eggsLoggedToday ? 'Record today’s eggs' : visibleTasks.length ? `Next: ${visibleTasks[0].title}` : rabbitTasks.length ? `Next: ${rabbitTasks[0].title}` : birds === 0 ? 'Add your first flock' : 'View farm records'} <ArrowRight size={20} />
      </button>
    </section>

    <section aria-label="Farm at a glance" className="grid grid-cols-3 gap-2 sm:gap-4">
      {[
        { label: 'Birds', value: birds.toLocaleString() },
        { label: 'Eggs today', value: eggsToday.toLocaleString() },
        { label: 'Active batches', value: activeBatches.toLocaleString() },
      ].map(item => <div key={item.label} className="bg-white border border-emerald-100 rounded-2xl p-3 sm:p-5 min-w-0">
        <strong className="block text-2xl sm:text-3xl text-emerald-900 leading-tight">{item.value}</strong>
        <span className="block text-xs sm:text-sm text-slate-600 mt-1 font-medium">{item.label}</span>
      </div>)}
    </section>

    {rabbitTasks.length > 0 && <section aria-label="Rabbit reminders" className="space-y-3 rounded-2xl border border-amber-200 bg-amber-50 p-4"><h2 className="text-lg font-bold text-emerald-950">Rabbit reminders</h2>{rabbitTasks.map(task => <button type="button" key={task.id} onClick={() => open('farm', 'rabbits')} className="min-h-12 w-full rounded-xl bg-white p-3 text-left"><strong className="block">{task.title}</strong><span className="text-sm text-slate-600">{task.description}</span><span className="mt-1 block text-sm font-semibold text-emerald-800">Open rabbit records →</span></button>)}</section>}

    {activeBatches > 0 && <button type="button" onClick={() => open('incubator', 'active_batches')} className="w-full min-h-12 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-left text-sm font-semibold text-emerald-900 flex items-center justify-between gap-3">
      <span>{incubatingEggs.toLocaleString()} eggs in {activeBatches} active {activeBatches === 1 ? 'batch' : 'batches'}</span><span className="inline-flex items-center gap-1 whitespace-nowrap">View batches <ArrowRight size={16} /></span>
    </button>}

    {(eggReminderDue || visibleTasks.length > 0 || dismissedTasks.length > 0) && <section aria-labelledby="farm-tasks-heading" className="rounded-3xl border border-amber-200 bg-amber-50/60 p-4 sm:p-5 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div><h2 id="farm-tasks-heading" className="text-xl font-bold text-slate-900">Needs attention</h2><p className="text-sm text-slate-600">Tap a task to update its record.</p></div>
        {dismissedTasks.length > 0 && <button type="button" onClick={() => setDismissedTasks([])} className="min-h-11 shrink-0 px-2 text-sm font-semibold text-emerald-800 flex items-center gap-1"><RotateCcw size={16} /> Restore</button>}
      </div>
      {eggReminderDue && <div className="rounded-2xl bg-white border border-amber-200 p-3 flex items-center gap-2">
        <button type="button" onClick={() => open('farm', 'egg_collection')} className="min-h-12 flex-1 text-left"><strong className="block text-sm text-slate-900">Today's egg count is still missing</strong><span className="text-xs text-slate-600">Record chicken, turkey and quail eggs collected today.</span></button>
        <button type="button" onClick={() => setEggReminderDismissed(true)} aria-label="Dismiss egg collection reminder" className="min-h-11 min-w-11 flex items-center justify-center text-slate-500"><X size={18} /></button>
      </div>}
      {displayedTasks.map(task => <div key={task.id} className="rounded-2xl bg-white border border-amber-200 p-3 flex items-center gap-2">
        <button type="button" onClick={() => onOpenEditRecord(task.record)} className="min-h-12 flex-1 text-left"><strong className="block text-sm text-slate-900">{task.title}</strong><span className="text-xs text-slate-600">{task.detail}</span></button>
        <button type="button" onClick={() => setDismissedTasks(previous => [...previous, task.id])} aria-label={`Dismiss ${task.title} for ${task.record.clientName}`} className="min-h-11 min-w-11 flex items-center justify-center text-slate-500"><X size={18} /></button>
      </div>)}
      {visibleTasks.length > 3 && <button type="button" onClick={() => setShowAllTasks(value => !value)} className="w-full min-h-11 rounded-xl border border-amber-300 bg-white px-4 text-sm font-semibold text-emerald-900">{showAllTasks ? 'Show fewer tasks' : `Show all ${visibleTasks.length} hatchery tasks`}</button>}
    </section>}

    <section aria-labelledby="quick-actions-heading">
      <div className="mb-3"><h2 id="quick-actions-heading" className="text-xl font-bold text-emerald-950">Record something</h2><p className="text-sm text-slate-600">Tap one action to go straight to its form.</p></div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {primaryActions.map(action => <button key={action.label} type="button" onClick={() => open(action.tab, action.key)}
          className="w-full min-h-20 bg-white border border-emerald-100 rounded-2xl p-4 text-left flex items-center gap-4 shadow-sm hover:border-emerald-400 hover:shadow-md active:scale-[0.99] focus-visible:outline focus-visible:outline-4 focus-visible:outline-emerald-300">
          <span className="h-12 w-12 shrink-0 rounded-2xl bg-emerald-100 text-emerald-800 flex items-center justify-center"><action.icon size={23} /></span>
          <span className="flex-1 min-w-0"><strong className="block text-base text-slate-900">{action.label}</strong><span className="block text-sm text-slate-600">{action.help}</span></span>
          <ArrowRight size={19} className="text-emerald-700 shrink-0" />
        </button>)}
      </div>
    </section>

    <section aria-labelledby="more-actions-heading">
      <button type="button" aria-expanded={showMoreActions} onClick={() => setShowMoreActions(value => !value)} className="mb-3 min-h-12 w-full rounded-2xl border border-emerald-200 bg-emerald-50 px-4 text-left text-lg font-bold text-emerald-950 flex items-center justify-between"><span id="more-actions-heading">More tasks</span><span className="text-sm">{showMoreActions ? 'Hide −' : 'Show +'}</span></button>
      {showMoreActions && <>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {moreActions.map(action => <button key={action.label} type="button" onClick={() => open('farm', action.key)}
          className="min-h-20 bg-white border border-emerald-100 rounded-2xl p-4 text-left flex flex-col justify-between gap-2 font-semibold text-slate-800 hover:border-emerald-400 focus-visible:outline focus-visible:outline-4 focus-visible:outline-emerald-300">
          <action.icon size={22} className="text-emerald-700" /><span>{action.label}</span>
        </button>)}
      </div>
      <div className="grid grid-cols-2 gap-3 mt-3">
        <button type="button" onClick={() => open('incubator', 'client')} className="min-h-14 bg-emerald-50 text-emerald-900 border border-emerald-100 rounded-2xl px-4 font-semibold flex items-center gap-3"><Users size={20}/> Clients <ArrowRight size={16} className="ml-auto" /></button>
        <button type="button" onClick={() => open('reports')} className="min-h-14 bg-emerald-50 text-emerald-900 border border-emerald-100 rounded-2xl px-4 font-semibold flex items-center gap-3"><BarChart3 size={20}/> Reports <ArrowRight size={16} className="ml-auto" /></button>
      </div>
      </>}
    </section>

    <section aria-labelledby="family-activity-heading" className="rounded-2xl border border-emerald-100 bg-white p-4 sm:p-5">
      <h2 id="family-activity-heading" className="text-xl font-bold text-emerald-950">Family activity</h2>
      <p className="mt-1 text-sm text-slate-600">Recent changes saved for everyone. Open the relevant record to correct a mistake.</p>
      {(db.activity_log || []).length ? <ol className="mt-3 divide-y divide-emerald-100">{(db.activity_log || []).slice(0, 6).map(item => <li key={item.id} className="py-3 text-sm flex items-start gap-2"><div className="min-w-0 flex-1"><strong className="text-slate-900">{item.actor}</strong> <span className="text-slate-700">{item.action.toLowerCase()}</span>{item.detail && <span className="block text-slate-600">{item.detail}</span>}<time className="block text-xs text-slate-500 mt-1" dateTime={item.at}>{new Date(item.at).toLocaleString()}</time></div><button type="button" onClick={() => open(item.action.includes('incubator') || item.action.includes('client') ? 'incubator' : 'farm', item.action.includes('egg') ? 'egg_collection' : item.action.includes('cage') ? 'cage_count' : item.action.includes('sale') ? 'sales' : undefined)} className="min-h-11 rounded-xl border border-emerald-200 px-3 text-sm font-semibold text-emerald-900">Review</button></li>)}</ol> : <p className="mt-3 text-sm text-slate-500">New shared changes will appear here.</p>}
    </section>

    <section aria-labelledby="weekly-snapshot-heading">
      <div className="mb-3"><h2 id="weekly-snapshot-heading" className="text-xl font-bold text-emerald-950">Last 7 days</h2><p className="text-sm text-slate-600">Farm activity and money recorded this week.</p></div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Eggs set', value: eggsSet.toLocaleString(), unit: 'eggs' },
          { label: 'Chicks hatched', value: chicksHatched.toLocaleString(), unit: 'chicks' },
          { label: 'Revenue', value: revenue.toLocaleString(), unit: 'FCFA' },
          { label: 'Expenses', value: expenses.toLocaleString(), unit: 'FCFA' },
        ].map(item => <div key={item.label} className="rounded-2xl border border-emerald-100 bg-white p-4 min-w-0">
          <span className="block text-sm text-slate-600">{item.label}</span><strong className="block mt-1 text-xl font-bold text-emerald-950 break-words">{item.value}</strong><span className="text-xs text-slate-500">{item.unit}</span>
        </div>)}
      </div>
    </section>
  </div>;
}
