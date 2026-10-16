import React from 'react';
import { ArrowRight, Plus } from 'lucide-react';
import type { DbSchema, RabbitAnimal, RabbitLitter } from '../types';
import { getCameroonTodayISO } from '../utils/dateUtils';
import { quailEggBalance } from '../lib/farmActions';
import { rabbitAgeLabel, rabbitReminders } from '../lib/farmViews';
import { useFarmToday } from '../lib/useFarmToday';

type Data = Partial<DbSchema>;
type ActionKind = string;
const inputClass = 'mt-1 w-full min-h-12 rounded-xl border border-emerald-200 bg-white px-3 text-base text-slate-900';
const buttonClass = 'min-h-12 rounded-xl bg-emerald-700 px-4 font-semibold text-white disabled:opacity-60';
const smallButton = 'min-h-11 rounded-xl border border-emerald-200 bg-white px-3 text-sm font-semibold text-emerald-900';

function Field({ label, value, onChange, type = 'text', required = false, min, step }: { label: string; value: string; onChange: (value: string) => void; type?: string; required?: boolean; min?: string; step?: string }) {
  return <label className="block text-sm font-semibold text-slate-700">{label}<input aria-label={label} className={inputClass} type={type} value={value} onChange={event => onChange(event.target.value)} required={required} min={min} step={step} /></label>;
}
function Select({ label, value, onChange, children, required = true }: { label: string; value: string; onChange: (value: string) => void; children: React.ReactNode; required?: boolean }) {
  return <label className="block text-sm font-semibold text-slate-700">{label}<select aria-label={label} className={inputClass} value={value} onChange={event => onChange(event.target.value)} required={required}><option value="">Choose…</option>{children}</select></label>;
}
function RecordGroup({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return <details className="rounded-2xl border border-emerald-100 bg-white p-4"><summary className="min-h-9 cursor-pointer text-base font-bold text-emerald-950">{title} <span className="text-sm font-medium text-slate-500">({count})</span></summary><div className="mt-3 space-y-2 text-sm text-slate-700">{count ? children : <p>No records yet.</p>}</div></details>;
}
export function useFarmAction(token: string, refresh: () => void) {
  const saving = React.useRef(false);
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState('');
  const [error, setError] = React.useState('');
  const run = async (kind: ActionKind, payload: Record<string, unknown>) => {
    if (saving.current) return false;
    saving.current = true;
    setBusy(true); setMessage(''); setError('');
    try {
      const response = await fetch('/api/farm/actions', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: token }, body: JSON.stringify({ id: crypto.randomUUID(), kind, payload }) });
      const body = await response.json();
      if (!response.ok || !body.success) throw new Error(body.error || 'Could not save this record.');
      setMessage(response.status === 202 ? 'Saved on this phone. It will sync when connected.' : 'Saved for the family.');
      refresh();
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save this record.');
      return false;
    } finally { saving.current = false; setBusy(false); }
  };
  const clear = () => { setMessage(''); setError(''); };
  return { busy, message, error, run, clear };
}

/** Delete a rabbit/quail cage or hutch with an in-app two-tap confirm (no window.confirm: Android WebViews may block it). */
export function useHousingRemoval(token: string, refresh: () => void) {
  const [confirmId, setConfirmId] = React.useState('');
  const [busyId, setBusyId] = React.useState('');
  const [message, setMessage] = React.useState('');
  const [error, setError] = React.useState('');
  const remove = async (id: string, name: string) => {
    if (busyId) return;
    if (confirmId !== id) { setConfirmId(id); setMessage(''); setError(''); return; }
    setConfirmId(''); setBusyId(id); setMessage(''); setError('');
    try {
      const response = await fetch(`/api/cages/${encodeURIComponent(id)}`, { method: 'DELETE', headers: { Authorization: token } });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'Could not delete this cage or hutch.');
      setMessage(body.archived ? `${name} removed. Its past records are kept.` : `${name} deleted.`);
      refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not delete this cage or hutch.');
    } finally { setBusyId(''); }
  };
  return { confirmId, busyId, message, error, remove, cancel: () => setConfirmId('') };
}

export function HousingDeleteButton({ id, name, removal }: { id: string; name: string; removal: ReturnType<typeof useHousingRemoval> }) {
  const confirming = removal.confirmId === id;
  return <span className="inline-flex shrink-0 items-center gap-1">
    <button type="button" aria-label={confirming ? `Confirm delete ${name}` : `Delete ${name}`} disabled={!!removal.busyId} onClick={() => removal.remove(id, name)} className={`min-h-9 rounded-lg px-2 text-xs font-semibold ${confirming ? 'bg-rose-600 text-white' : 'border border-rose-200 text-rose-700'} disabled:opacity-50`}>{removal.busyId === id ? 'Deleting…' : confirming ? 'Tap to confirm' : 'Delete'}</button>
    {confirming && <button type="button" onClick={removal.cancel} className="min-h-9 rounded-lg border border-slate-200 px-2 text-xs font-semibold text-slate-700">Cancel</button>}
  </span>;
}

const rabbitTasks = [
  ['rabbit_add', 'Add a rabbit'], ['rabbit_update', 'Edit a rabbit'], ['rabbit_hutch', 'Add a hutch'], ['rabbit_breeding', 'Crossed a rabbit (breeding)'],
  ['rabbit_litter', 'Record a litter'], ['rabbit_individualize', 'Name or separate a bunny'], ['rabbit_move', 'Move rabbits'],
  ['rabbit_care', 'Health, weight or feed'], ['rabbit_loss', 'Record a loss'], ['rabbit_sale', 'Sell live rabbits'], ['rabbit_eaten', 'Record rabbits used at home'],
  ['animal_expense', 'Record a rabbit cost']
] as const;

export function RabbitSection({ data, token, refresh, initialTask }: { data: Data; token: string; refresh: () => void; initialTask?: string }) {
  const today = useFarmToday();
  const rabbits = data.rabbits || [];
  const allHutches = data.rabbit_hutches || [];
  const hutches = allHutches.filter(item => !item.archived);
  const housingRemoval = useHousingRemoval(token, refresh);
  const breedings = data.rabbit_breedings || [];
  const litters = data.rabbit_litters || [];
  const active = rabbits.filter(item => item.status === 'active');
  const grouped = active.filter(item => item.grouped);
  const [task, setTask] = React.useState<string>(initialTask || 'rabbit_add');
  const [f, setF] = React.useState<Record<string, string>>({ date: getCameroonTodayISO(), sex: 'unknown', careKind: 'health' });
  const { busy, message, error, run } = useFarmAction(token, refresh);
  const set = (key: string) => (value: string) => setF(previous => ({ ...previous, [key]: value }));
  React.useEffect(() => { if (initialTask && rabbitTasks.some(([key]) => key === initialTask)) setTask(initialTask); }, [initialTask]);
  const nameOf = (id?: string) => rabbits.find(item => item.id === id)?.name || id || 'Unknown';
  const groupedIn = (litter: RabbitLitter) => litter.kitIds.map(id => rabbits.find(item => item.id === id)).filter((item): item is RabbitAnimal => !!item && item.status === 'active' && item.grouped);
  const selectedRabbits = (quantity?: number) => {
    if (f.target?.startsWith('litter:')) {
      const litter = litters.find(item => item.id === f.target.slice(7));
      const kits = litter ? groupedIn(litter) : [];
      if (!kits.length || (quantity && quantity > kits.length)) throw new Error('Choose an available number of bunnies from this litter.');
      return kits.slice(0, quantity || kits.length).map(item => item.id);
    }
    if (!f.target || !active.some(item => item.id === f.target)) throw new Error('Choose a rabbit or litter.');
    return [f.target];
  };
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      const common = { date: f.date || getCameroonTodayISO() };
      let payload: Record<string, unknown> = common;
      if (task === 'rabbit_add') payload = { ...common, name: f.name, tag: f.tag, sex: f.sex, breed: f.breed, hutchId: f.hutchId, notes: f.notes, birthDate: f.birthDate || undefined, initialAgeWeeks: f.ageWeeks || undefined, maturityAgeWeeks: Number(f.maturityAgeWeeks || 26) };
      if (task === 'rabbit_update') payload = { rabbitId: f.rabbitId, name: f.name, tag: f.tag, sex: f.sex, breed: f.breed, hutchId: f.hutchId, notes: f.notes, birthDate: f.birthDate || undefined, initialAgeWeeks: f.ageWeeks || undefined, maturityAgeWeeks: Number(f.maturityAgeWeeks || 26) };
      if (task === 'rabbit_hutch') payload = { name: f.name, notes: f.notes };
      if (task === 'rabbit_breeding') payload = { ...common, doeId: f.doeId, buckId: f.buckId, expectedDate: f.expectedDate, notes: f.notes };
      if (task === 'rabbit_litter') payload = { ...common, doeId: f.doeId, buckId: f.buckId, breedingId: f.breedingId, quantity: Number(f.quantity), notes: f.notes };
      if (task === 'rabbit_individualize') payload = { rabbitId: f.rabbitId, name: f.name, sex: f.sex, hutchId: f.hutchId };
      if (task === 'rabbit_move') payload = { ...common, rabbitIds: selectedRabbits(), toHutchId: f.hutchId, notes: f.notes };
      if (task === 'rabbit_care') payload = { ...common, targetId: f.target?.startsWith('litter:') ? f.target.slice(7) : f.target, careKind: f.careKind, detail: f.detail, amount: f.amount ? Number(f.amount) : undefined, notes: f.notes };
      if (task === 'rabbit_loss') payload = { ...common, rabbitIds: selectedRabbits(f.quantity ? Number(f.quantity) : undefined), cause: f.detail };
      if (task === 'rabbit_sale') payload = { ...common, rabbitIds: selectedRabbits(f.quantity ? Number(f.quantity) : undefined), buyerName: f.buyerName, totalAmount: Number(f.amount) };
      if (task === 'rabbit_eaten') payload = { ...common, rabbitIds: selectedRabbits(f.quantity ? Number(f.quantity) : undefined), notes: f.notes };
      if (task === 'animal_expense') payload = { ...common, species: 'Rabbit', description: f.detail, amount: Number(f.amount) };
      if (await run(task, payload)) setF({ date: getCameroonTodayISO(), sex: 'unknown', careKind: 'health' });
    } catch (cause) { window.alert(cause instanceof Error ? cause.message : 'Choose a valid rabbit.'); }
  };
  const activeCount = active.length;
  return <section id="section_rabbits" className="space-y-4">
    <div className="rounded-3xl bg-emerald-900 p-5 text-white"><h2 className="text-2xl font-bold">Rabbits</h2><p className="mt-1 text-sm text-emerald-100">{activeCount} on the farm · {grouped.length} bunnies still shown with their litters</p></div>
    <form onSubmit={submit} className="rounded-3xl border border-emerald-100 bg-white p-4 space-y-3">
      <h3 className="text-lg font-bold text-emerald-950">What would you like to record?</h3>
      <p className="text-sm text-slate-600">Sales, losses and household use also appear in the shared Farm tables. Each entry updates live stock once.</p>
      <Select label="Rabbit task" value={task} onChange={value => { setTask(value); setF({ date: getCameroonTodayISO(), sex: 'unknown', careKind: 'health' }); }}>{rabbitTasks.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</Select>
      {task === 'rabbit_hutch' && <Field label="Hutch or pen name" value={f.name || ''} onChange={set('name')} required />}
      {task === 'rabbit_add' && <><Field label="Rabbit name" value={f.name || ''} onChange={set('name')} required /><Field label="Tag or ear ID (optional)" value={f.tag || ''} onChange={set('tag')} /><Field label="Breed (optional)" value={f.breed || ''} onChange={set('breed')} /></>}
      {task === 'rabbit_update' && <><Select label="Rabbit to edit" value={f.rabbitId || ''} onChange={value => { const animal = active.find(item => item.id === value); setF(previous => ({ ...previous, rabbitId: value, name: animal?.name || '', tag: animal?.tag || '', breed: animal?.breed || '', sex: animal?.sex || 'unknown', hutchId: animal?.hutchId || '', notes: animal?.notes || '', birthDate: animal?.birthDate || '', ageWeeks: animal?.initialAgeWeeks === undefined ? '' : String(animal.initialAgeWeeks), maturityAgeWeeks: String(animal?.maturityAgeWeeks || 26) })); }}>{active.filter(item => !item.grouped).map(item => <option key={item.id} value={item.id}>{item.name || item.id}</option>)}</Select><Field label="Name" value={f.name || ''} onChange={set('name')} /><Field label="Tag or ear ID" value={f.tag || ''} onChange={set('tag')} /><Field label="Breed" value={f.breed || ''} onChange={set('breed')} /></>}
      {['rabbit_add', 'rabbit_update'].includes(task) && <><Field label="Birth date (if known)" type="date" value={f.birthDate || ''} onChange={set('birthDate')} />{!f.birthDate && <Field label="Age in weeks when acquired (if known)" type="number" min="0" value={f.ageWeeks || ''} onChange={set('ageWeeks')} />}<p className="text-sm text-slate-600">Age advances automatically from the birth date, or from the starting age on the date acquired.</p>{f.sex === 'female' && <><Field label="Maturity reminder age (weeks)" type="number" min="1" value={f.maturityAgeWeeks || '26'} onChange={set('maturityAgeWeeks')} /><p className="text-xs text-slate-500">Set this for your breed. The reminder asks you to check readiness; age alone does not confirm it.</p></>}</>}
      {['rabbit_add', 'rabbit_update', 'rabbit_individualize'].includes(task) && <Select label="Sex" value={f.sex || 'unknown'} onChange={set('sex')}><option value="unknown">Not known yet</option><option value="female">Female</option><option value="male">Male</option></Select>}
      {['rabbit_breeding', 'rabbit_litter'].includes(task) && <><Select label="Mother (doe)" value={f.doeId || ''} onChange={set('doeId')}>{rabbits.filter(item => item.sex === 'female' && !item.grouped).map(item => <option key={item.id} value={item.id}>{item.name || item.id}</option>)}</Select><Select label="Father (buck)" value={f.buckId || ''} onChange={set('buckId')}>{rabbits.filter(item => item.sex === 'male' && !item.grouped).map(item => <option key={item.id} value={item.id}>{item.name || item.id}</option>)}</Select></>}
      {['rabbit_breeding', 'rabbit_litter'].includes(task) && (!rabbits.some(item => item.sex === 'female' && !item.grouped) || !rabbits.some(item => item.sex === 'male' && !item.grouped)) && <p className="text-sm text-amber-800">Add a female and a male rabbit before recording breeding or a litter.</p>}
      {task === 'rabbit_breeding' && <Field label="Expected kindling date (optional)" type="date" value={f.expectedDate || ''} onChange={set('expectedDate')} />}
      {task === 'rabbit_litter' && <><Field label="Number of bunnies born" type="number" min="1" value={f.quantity || ''} onChange={set('quantity')} required /><Select label="Related breeding (optional)" required={false} value={f.breedingId || ''} onChange={set('breedingId')}>{breedings.map(item => <option key={item.id} value={item.id}>{item.date} · {nameOf(item.doeId)} + {nameOf(item.buckId)}</option>)}</Select><p className="text-sm text-slate-600">Each bunny receives its own ID and both parent links automatically.</p></>}
      {task === 'rabbit_individualize' && <><Select label="Bunny to name or separate" value={f.rabbitId || ''} onChange={set('rabbitId')}>{grouped.map(item => <option key={item.id} value={item.id}>{item.id} · {nameOf(item.motherId)}’s litter</option>)}</Select><Field label="Bunny’s name" value={f.name || ''} onChange={set('name')} required /></>}
      {['rabbit_move', 'rabbit_care', 'rabbit_loss', 'rabbit_sale', 'rabbit_eaten'].includes(task) && <Select label="Rabbit or litter" value={f.target || ''} onChange={set('target')}>{active.filter(item => !item.grouped).map(item => <option key={item.id} value={item.id}>{item.name || item.id}</option>)}{litters.filter(item => groupedIn(item).length).map(item => <option key={item.id} value={`litter:${item.id}`}>{nameOf(item.doeId)}’s litter · {groupedIn(item).length} grouped bunnies</option>)}</Select>}
      {['rabbit_add', 'rabbit_update', 'rabbit_individualize', 'rabbit_move'].includes(task) && <Select label={task === 'rabbit_move' ? 'Move to hutch' : 'Hutch (optional)'} required={task === 'rabbit_move'} value={f.hutchId || ''} onChange={set('hutchId')}>{hutches.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</Select>}
      {task === 'rabbit_care' && <><Select label="Record type" value={f.careKind || 'health'} onChange={set('careKind')}><option value="health">Health or treatment</option><option value="weight">Weight</option><option value="feed">Feed used</option></Select>{f.careKind !== 'weight' && <Field label={f.careKind === 'feed' ? 'Feed type' : 'Observation or treatment'} value={f.detail || ''} onChange={set('detail')} required />}{f.careKind !== 'health' && <Field label={f.careKind === 'weight' ? 'Weight (grams)' : 'Feed used (kg)'} type="number" step="0.01" min="0.01" value={f.amount || ''} onChange={set('amount')} required />}</>}
      {['rabbit_loss', 'rabbit_sale', 'rabbit_eaten'].includes(task) && f.target?.startsWith('litter:') && <Field label="How many bunnies from this litter? (blank means all)" type="number" min="1" value={f.quantity || ''} onChange={set('quantity')} />}
      {task === 'rabbit_loss' && <Field label="Cause or notes (optional)" value={f.detail || ''} onChange={set('detail')} />}
      {task === 'rabbit_sale' && <><Field label="Buyer name" value={f.buyerName || ''} onChange={set('buyerName')} required /><Field label="Total price (FCFA)" type="number" min="0" value={f.amount || ''} onChange={set('amount')} required /></>}
      {task === 'animal_expense' && <><Field label="What was the cost for?" value={f.detail || ''} onChange={set('detail')} required /><Field label="Amount (FCFA)" type="number" min="0" value={f.amount || ''} onChange={set('amount')} required /></>}
      {task !== 'rabbit_hutch' && task !== 'rabbit_individualize' && task !== 'rabbit_update' && <Field label={task === 'rabbit_add' ? 'Date acquired' : task === 'rabbit_litter' ? 'Birth date' : 'Date'} type="date" value={f.date || ''} onChange={set('date')} required />}
      {['rabbit_add', 'rabbit_update', 'rabbit_hutch', 'rabbit_breeding', 'rabbit_litter', 'rabbit_move', 'rabbit_care', 'rabbit_eaten'].includes(task) && <Field label="Notes (optional)" value={f.notes || ''} onChange={set('notes')} />}
      <button type="submit" disabled={busy} className={buttonClass}>{busy ? 'Saving…' : 'Save record'}</button>
      {message && <p role="status" className="text-sm text-emerald-800">{message}</p>}{error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
    </form>
    <div className="grid gap-3 sm:grid-cols-2">
      <RecordGroup title="Individual rabbits" count={active.filter(item => !item.grouped).length}>{active.filter(item => !item.grouped).map(item => <p key={item.id} className="rounded-xl bg-slate-50 p-3"><strong>{item.name || item.id}</strong> · {item.sex} · {allHutches.find(h => h.id === item.hutchId)?.name || 'No hutch'}<br/>{rabbitAgeLabel(item, today)}<br/><span className="text-xs">ID {item.id}{item.motherId ? ` · Mother ${nameOf(item.motherId)} · Father ${nameOf(item.fatherId)}` : ''}</span></p>)}</RecordGroup>
      <RecordGroup title="Rabbit reminders" count={rabbitReminders(data, today).length}>{rabbitReminders(data, today).map(item => <div key={item.id} className="rounded-xl bg-amber-50 p-3 space-y-2"><strong>{item.title}</strong><p>{item.description}</p><button type="button" className={smallButton} disabled={busy} onClick={() => run(item.breedingId ? 'rabbit_breeding_close' : 'rabbit_maturity_ack', item.breedingId ? { breedingId: item.breedingId } : { rabbitId: item.rabbitId })}>{item.breedingId ? 'Close breeding without a litter' : 'Mark readiness reviewed'}</button>{item.breedingId && <button type="button" className={smallButton} onClick={() => { const breeding = breedings.find(b => b.id === item.breedingId)!; setTask('rabbit_litter'); setF({ date: today, doeId: breeding.doeId, buckId: breeding.buckId, breedingId: breeding.id }); }}>Record litter</button>}</div>)}</RecordGroup>
      <RecordGroup title="Rabbits used at home" count={(data.rabbit_eaten || []).filter(item => !item.voided).length}>{(data.rabbit_eaten || []).filter(item => !item.voided).map(item => <div key={item.id} className="flex items-center justify-between gap-2"><span>{item.date} · {item.rabbitIds.length} used at home</span><button type="button" className={smallButton} disabled={busy} onClick={() => run('rabbit_eaten_void', { recordId: item.id })}>Reverse</button></div>)}</RecordGroup>
      <RecordGroup title="Litters and grouped bunnies" count={litters.length}>{litters.map(item => <p key={item.id} className="rounded-xl bg-slate-50 p-3"><strong>{item.birthDate} · {nameOf(item.doeId)} + {nameOf(item.buckId)}</strong><br/>{groupedIn(item).length} grouped · {item.kitIds.length} born · litter ID {item.id}</p>)}</RecordGroup>
      <RecordGroup title="Breeding" count={breedings.length}>{breedings.slice().reverse().map(item => <p key={item.id}>{item.date} · {nameOf(item.doeId)} + {nameOf(item.buckId)}{item.expectedDate ? ` · Expected ${item.expectedDate}` : ''}</p>)}</RecordGroup>
      <RecordGroup title="Hutches and moves" count={hutches.length + (data.rabbit_moves || []).length}>{hutches.map(item => <div key={item.id} className="flex items-center justify-between gap-2"><span className="min-w-0 break-words">{item.name} · {active.filter(r => r.hutchId === item.id).length} rabbits</span><HousingDeleteButton id={item.id} name={item.name} removal={housingRemoval} /></div>)}{(data.rabbit_moves || []).slice().reverse().map(item => <p key={item.id}>{item.date} · {item.rabbitIds.length} moved to {allHutches.find(h => h.id === item.toHutchId)?.name}</p>)}</RecordGroup>
      {(housingRemoval.error || housingRemoval.message) && <div className="sm:col-span-2">{housingRemoval.error && <p role="alert" className="text-sm text-rose-700">{housingRemoval.error}</p>}{housingRemoval.message && <p role="status" className="text-sm text-emerald-800">{housingRemoval.message}</p>}</div>}
      <RecordGroup title="Health, weights and feed" count={(data.animal_care || []).filter(item => item.species === 'Rabbit').length}>{(data.animal_care || []).filter(item => item.species === 'Rabbit').slice().reverse().map(item => <p key={item.id}>{item.date} · {item.kind} · {nameOf(item.targetId)} {item.amount ? `· ${item.amount} ${item.unit}` : ''} {item.detail}</p>)}</RecordGroup>
      <RecordGroup title="Losses" count={(data.rabbit_losses || []).filter(item => !item.voided).length}>{(data.rabbit_losses || []).filter(item => !item.voided).slice().reverse().map(item => <div key={item.id} className="flex items-center justify-between gap-2"><span>{item.date} · {item.rabbitIds.length} lost · {item.cause || 'No cause recorded'}</span><button type="button" className={smallButton} disabled={busy} onClick={() => run('rabbit_loss_void', { lossId: item.id })}>Reverse</button></div>)}</RecordGroup>
      <RecordGroup title="Live-rabbit sales" count={(data.rabbit_sales || []).filter(item => !item.voided).length}>{(data.rabbit_sales || []).filter(item => !item.voided).slice().reverse().map(item => <div key={item.id} className="flex items-center justify-between gap-2"><span>{item.date} · {item.rabbitIds.length} to {item.buyerName} · {item.totalAmount.toLocaleString()} FCFA</span><button type="button" className={smallButton} disabled={busy} onClick={() => run('rabbit_sale_void', { saleId: item.id })}>Reverse</button></div>)}</RecordGroup>
      <RecordGroup title="Rabbit costs" count={(data.expenses || []).filter(item => item.species === 'Rabbit').length + (data.feed_records || []).filter(item => item.species === 'Rabbit').length}>{(data.expenses || []).filter(item => item.species === 'Rabbit').slice().reverse().map(item => <p key={item.id}>{item.date} · {item.description} · {item.amount.toLocaleString()} FCFA</p>)}{(data.feed_records || []).filter(item => item.species === 'Rabbit').slice().reverse().map(item => <p key={item.id}>{item.date} · {item.feedType} feed · {item.totalCost.toLocaleString()} FCFA</p>)}</RecordGroup>
    </div>
  </section>;
}

const quailTasks = [
  ['quail_flock_add', 'Add a quail flock'], ['quail_move', 'Move quail to a cage'],
  ['quail_eggs', 'Record quail eggs'], ['quail_egg_use', 'Sell, eat or set eggs'],
  ['quail_hatch', 'Record a farm hatch'], ['quail_hatch_to_flock', 'Add hatched chicks to flock'],
  ['quail_care', 'Health, weight or feed'], ['quail_loss', 'Record bird loss'], ['quail_eaten', 'Record quail used at home'],
  ['quail_live_sale', 'Sell live quail'], ['animal_expense', 'Record a quail cost']
] as const;

export function QuailSection({ data, token, refresh, initialTask }: { data: Data; token: string; refresh: () => void; initialTask?: string }) {
  const flocks = (data.flocks || []).filter(item => item.species === 'Quail' || item.breed?.toLowerCase().includes('quail'));
  const flockIds = new Set(flocks.map(item => item.id));
  const farmBatches = (data.incubator_records || []).filter(item => item.ownerType === 'farm' && item.eggType === 'Quail');
  const uses = (data.quail_egg_use || []).filter(item => !item.voided);
  const eggRows = (data.daily_egg_collections || []).filter(item => (item.quailEggs || 0) > 0);
  const quailSales = (data.poultry_sales || []).filter(item => item.species === 'Quail' && !item.voided);
  const quailLosses = (data.mortality || []).filter(item => flockIds.has(item.flockId) && !item.voided);
  const [task, setTask] = React.useState<string>('quail_eggs');
  const [f, setF] = React.useState<Record<string, string>>({ date: getCameroonTodayISO(), careKind: 'health', useKind: 'sold' });
  const { busy, message, error, run } = useFarmAction(token, refresh);
  React.useEffect(() => { if (initialTask && quailTasks.some(([key]) => key === initialTask)) setTask(initialTask); }, [initialTask]);
  const set = (key: string) => (value: string) => setF(previous => ({ ...previous, [key]: value }));
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const common = { date: f.date || getCameroonTodayISO() };
    let payload: Record<string, unknown> = common;
    if (task === 'quail_flock_add') payload = { ...common, name: f.name, quantity: Number(f.quantity), ageWeeks: Number(f.ageWeeks || 0), cageId: f.cageId };
    if (task === 'quail_move') payload = { ...common, flockId: f.flockId, cageId: f.cageId, notes: f.notes };
    if (task === 'quail_eggs') payload = { ...common, quantity: Number(f.quantity) };
    if (task === 'quail_egg_use') payload = { ...common, useKind: f.useKind, quantity: Number(f.quantity), buyerName: f.buyerName, amount: f.amount ? Number(f.amount) : undefined, notes: f.notes };
    if (task === 'quail_hatch') payload = { incubatorId: f.incubatorId, chicksHatched: Number(f.quantity) };
    if (task === 'quail_hatch_to_flock') payload = { ...common, incubatorId: f.incubatorId, name: f.name, cageId: f.cageId };
    if (task === 'quail_care') payload = { ...common, targetId: f.flockId, careKind: f.careKind, detail: f.detail, amount: f.amount ? Number(f.amount) : undefined, notes: f.notes };
    if (task === 'quail_loss') payload = { ...common, flockId: f.flockId, quantity: Number(f.quantity), cause: f.detail };
    if (task === 'quail_eaten') payload = { ...common, flockId: f.flockId, quantity: Number(f.quantity), notes: f.notes };
    if (task === 'quail_live_sale') payload = { ...common, flockId: f.flockId, quantity: Number(f.quantity), amount: Number(f.amount), buyerName: f.buyerName, isChick: f.isChick === 'yes', notes: f.notes };
    if (task === 'animal_expense') payload = { ...common, species: 'Quail', description: f.detail, amount: Number(f.amount) };
    if (await run(task, payload)) setF({ date: getCameroonTodayISO(), careKind: 'health', useKind: 'sold' });
  };
  const quailCount = flocks.reduce((sum, item) => sum + item.quantity, 0);
  return <section id="section_quail" className="space-y-4">
    <div className="rounded-3xl bg-emerald-900 p-5 text-white"><h2 className="text-2xl font-bold">Quail</h2><p className="mt-1 text-sm text-emerald-100">{quailCount.toLocaleString()} birds on the farm · {quailEggBalance(data as DbSchema).toLocaleString()} eggs available</p><p className="mt-1 text-xs text-emerald-200">Client egg batches stay in Incubator and are not counted here.</p></div>
    <div className="grid grid-cols-2 gap-2"><button type="button" className={smallButton} onClick={() => { setTask('quail_flock_add'); setF({ date: getCameroonTodayISO() }); }}><Plus size={16} className="inline" /> Add quail flock</button><button type="button" className={smallButton} onClick={() => { setTask('quail_move'); setF({ date: getCameroonTodayISO() }); }}>Move quail between cages <ArrowRight size={14} className="inline" /></button></div>
    <form onSubmit={submit} className="rounded-3xl border border-emerald-100 bg-white p-4 space-y-3">
      <h3 className="text-lg font-bold text-emerald-950">What would you like to record?</h3>
      <Select label="Quail task" value={task} onChange={value => { setTask(value); setF({ date: getCameroonTodayISO(), careKind: 'health', useKind: 'sold' }); }}>{quailTasks.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</Select>
      {task === 'quail_flock_add' && <><Field label="Flock name" value={f.name || ''} onChange={set('name')} required /><Field label="Birds in this flock" type="number" min="1" value={f.quantity || ''} onChange={set('quantity')} required /><Field label="Age in weeks (optional)" type="number" min="0" value={f.ageWeeks || ''} onChange={set('ageWeeks')} /></>}
      {task === 'quail_move' && <Select label="Quail flock to move" value={f.flockId || ''} onChange={set('flockId')}>{flocks.map(item => <option key={item.id} value={item.id}>{item.name} · {item.quantity} birds</option>)}</Select>}
      {['quail_flock_add', 'quail_move'].includes(task) && <Select label="Bird cage" value={f.cageId || ''} onChange={set('cageId')}>{(data.cages || []).filter(item => item.animalType !== 'Rabbit').map(item => <option key={item.id} value={item.id}>{item.blockName} · {item.cageName}</option>)}</Select>}
      {['quail_flock_add', 'quail_move'].includes(task) && !(data.cages || []).length && <p className="text-sm text-amber-800">Add a bird cage in Flocks and cages before saving quail.</p>}
      {task === 'quail_eggs' && <p className="text-sm text-slate-600">Enter the total quail eggs collected on this date. Saving the same date updates that day’s count.</p>}
      {task === 'quail_egg_use' && <><Select label="What happened to the eggs?" value={f.useKind || 'sold'} onChange={set('useKind')}><option value="sold">Sold</option><option value="eaten">Used at home</option><option value="set">Set for farm hatching</option><option value="adjustment">Correct opening or stock balance</option></Select>{f.useKind === 'adjustment' && <p className="text-sm text-slate-600">Use a positive number to add eggs or a negative number to correct stock down. Add a reason below.</p>}</>}
      {['quail_eggs', 'quail_egg_use', 'quail_hatch', 'quail_loss', 'quail_eaten', 'quail_live_sale'].includes(task) && <Field label={task === 'quail_hatch' ? 'Chicks hatched' : task === 'quail_live_sale' || task === 'quail_loss' || task === 'quail_eaten' ? 'Birds' : 'Eggs'} type="number" min={task === 'quail_eggs' || task === 'quail_hatch' ? '0' : task === 'quail_egg_use' && f.useKind === 'adjustment' ? undefined : '1'} value={f.quantity || ''} onChange={set('quantity')} required />}
      {['quail_hatch', 'quail_hatch_to_flock'].includes(task) && <Select label="Farm-owned quail batch" value={f.incubatorId || ''} onChange={set('incubatorId')}>{farmBatches.filter(item => task === 'quail_hatch' ? !item.flockTransferId : item.chicksHatched != null && item.chicksHatched > 0 && !item.flockTransferId).map(item => <option key={item.id} value={item.id}>{item.dateBrought} · {item.eggsCollected} eggs · {item.chicksHatched == null ? 'Hatch pending' : `${item.chicksHatched} chicks`}</option>)}</Select>}
      {task === 'quail_hatch_to_flock' && <><Field label="New flock name" value={f.name || ''} onChange={set('name')} required /><Select label="Bird cage" value={f.cageId || ''} onChange={set('cageId')}>{(data.cages || []).filter(item => item.animalType !== 'Rabbit').map(item => <option key={item.id} value={item.id}>{item.blockName} · {item.cageName}</option>)}</Select></>}
      {['quail_care', 'quail_loss', 'quail_eaten', 'quail_live_sale'].includes(task) && <Select label="Quail flock" value={f.flockId || ''} onChange={set('flockId')}>{flocks.map(item => <option key={item.id} value={item.id}>{item.name} · {item.quantity} birds</option>)}</Select>}
      {task === 'quail_care' && <><Select label="Record type" value={f.careKind || 'health'} onChange={set('careKind')}><option value="health">Health or treatment</option><option value="weight">Weight</option><option value="feed">Feed used</option></Select>{f.careKind !== 'weight' && <Field label={f.careKind === 'feed' ? 'Feed type' : 'Observation or treatment'} value={f.detail || ''} onChange={set('detail')} required />}{f.careKind !== 'health' && <Field label={f.careKind === 'weight' ? 'Weight (grams)' : 'Feed used (kg)'} type="number" step="0.01" min="0.01" value={f.amount || ''} onChange={set('amount')} required />}</>}
      {task === 'quail_loss' && <Field label="Cause or notes (optional)" value={f.detail || ''} onChange={set('detail')} />}
      {(task === 'quail_live_sale' || task === 'quail_egg_use' && f.useKind === 'sold') && <><Field label="Buyer name" value={f.buyerName || ''} onChange={set('buyerName')} required /><Field label="Total price (FCFA)" type="number" min="0" value={f.amount || ''} onChange={set('amount')} required /></>}
      {task === 'quail_live_sale' && <label className="flex min-h-11 items-center gap-2 text-sm font-semibold text-slate-700"><input type="checkbox" checked={f.isChick === 'yes'} onChange={event => set('isChick')(event.target.checked ? 'yes' : 'no')} /> These are chicks</label>}
      {task === 'animal_expense' && <><Field label="What was the cost for?" value={f.detail || ''} onChange={set('detail')} required /><Field label="Amount (FCFA)" type="number" min="0" value={f.amount || ''} onChange={set('amount')} required /></>}
      {task !== 'quail_hatch' && <Field label="Date" type="date" value={f.date || ''} onChange={set('date')} required />}
      {['quail_egg_use', 'quail_care', 'quail_live_sale', 'quail_eaten', 'quail_move'].includes(task) && <Field label={f.useKind === 'adjustment' && task === 'quail_egg_use' ? 'Reason for correction' : 'Notes (optional)'} value={f.notes || ''} onChange={set('notes')} required={f.useKind === 'adjustment' && task === 'quail_egg_use'} />}
      <button type="submit" disabled={busy} className={buttonClass}>{busy ? 'Saving…' : 'Save record'}</button>
      {message && <p role="status" className="text-sm text-emerald-800">{message}</p>}{error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
    </form>
    <div className="grid gap-3 sm:grid-cols-2">
      <RecordGroup title="Quail flocks and cages" count={flocks.length}>{flocks.map(item => <p key={item.id} className="rounded-xl bg-slate-50 p-3"><strong>{item.name}</strong> · {item.quantity} birds<br/><span className="text-xs">{(data.cage_allocations || []).find(cage => cage.flockName === item.name)?.cageName || item.notes || 'No cage recorded'}</span></p>)}</RecordGroup>
      <RecordGroup title="Daily quail eggs" count={eggRows.length}>{eggRows.slice().reverse().map(item => <p key={item.id}>{item.date} · {item.quailEggs || 0} collected</p>)}</RecordGroup>
      <RecordGroup title="Egg use and sales" count={uses.length}>{uses.slice().reverse().map(item => <div key={item.id} className="flex items-center justify-between gap-2"><span>{item.date} · {item.kind} · {item.quantity} eggs{item.amount != null ? ` · ${item.amount.toLocaleString()} FCFA` : ''}</span><button type="button" className={smallButton} disabled={busy} onClick={() => run('quail_egg_use_void', { useId: item.id })}>Reverse</button></div>)}</RecordGroup>
      <RecordGroup title="Farm-owned hatch batches" count={farmBatches.length}>{farmBatches.slice().reverse().map(item => <p key={item.id}>{item.dateBrought} · {item.eggsCollected} set · {item.chicksHatched == null ? 'Hatch pending' : `${item.chicksHatched} hatched`}{item.flockTransferId ? ' · Added to flock' : ''}</p>)}</RecordGroup>
      <RecordGroup title="Feed, health and weights" count={(data.animal_care || []).filter(item => item.species === 'Quail').length}>{(data.animal_care || []).filter(item => item.species === 'Quail').slice().reverse().map(item => <p key={item.id}>{item.date} · {item.kind} · {flocks.find(flock => flock.id === item.targetId)?.name || item.targetId} {item.amount ? `· ${item.amount} ${item.unit}` : ''} {item.detail}</p>)}</RecordGroup>
      <RecordGroup title="Cage moves" count={(data.cage_transfers || []).filter(item => item.species === 'Quail').length}>{(data.cage_transfers || []).filter(item => item.species === 'Quail').slice().reverse().map(item => <p key={item.id}>{item.date} · {item.quantity} birds · {item.fromCage} → {item.toCage}</p>)}</RecordGroup>
      <RecordGroup title="Bird losses" count={quailLosses.length}>{quailLosses.slice().reverse().map(item => <div key={item.id} className="flex items-center justify-between gap-2"><span>{item.date} · {item.quantity} from {item.flockName} · {item.cause || 'No cause recorded'}</span><button type="button" className={smallButton} disabled={busy} onClick={() => run('quail_loss_void', { lossId: item.id })}>Reverse</button></div>)}</RecordGroup>
      <RecordGroup title="Quail sales" count={quailSales.length}>{quailSales.slice().reverse().map(item => <div key={item.id} className="flex items-center justify-between gap-2"><span>{item.date} · {item.quantity} {item.itemType} · {item.totalAmount.toLocaleString()} FCFA</span>{item.itemType !== 'Quail Egg' && <button type="button" className={smallButton} disabled={busy} onClick={() => run('quail_live_sale_void', { saleId: item.id })}>Reverse</button>}</div>)}</RecordGroup>
      <RecordGroup title="Quail costs" count={(data.expenses || []).filter(item => item.species === 'Quail').length + (data.feed_records || []).filter(item => item.species === 'Quail').length}>{(data.expenses || []).filter(item => item.species === 'Quail').slice().reverse().map(item => <p key={item.id}>{item.date} · {item.description} · {item.amount.toLocaleString()} FCFA</p>)}{(data.feed_records || []).filter(item => item.species === 'Quail').slice().reverse().map(item => <p key={item.id}>{item.date} · {item.feedType} feed · {item.totalCost.toLocaleString()} FCFA</p>)}</RecordGroup>
    </div>
  </section>;
}
