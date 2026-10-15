import React from 'react';
import type { DbSchema } from '../types';
import { useFarmAction, useHousingRemoval, HousingDeleteButton } from './FarmAnimalsMod';
import { rabbitChoices, selectedRabbitIds, rabbitAgeLabel } from '../lib/farmViews';
import { useFarmToday } from '../lib/useFarmToday';

const input = 'mt-1 min-h-12 w-full rounded-xl border border-emerald-200 bg-white px-3 text-base';
export function SharedAnimalHousing({ data, token, refresh, initialTask = 'create', initialAnimalType = 'Rabbit' }: { data: Partial<DbSchema>; token: string; refresh: () => void; initialTask?: string; initialAnimalType?: string }) {
  const today = useFarmToday();
  const [task, setTask] = React.useState(initialTask);
  const [animalType, setAnimalType] = React.useState(initialAnimalType);
  const [block, setBlock] = React.useState('');
  const [name, setName] = React.useState('');
  const [target, setTarget] = React.useState('');
  const [cageId, setCageId] = React.useState('');
  const [quantity, setQuantity] = React.useState('1');
  const [date, setDate] = React.useState(today);
  const [validation, setValidation] = React.useState('');
  const action = useFarmAction(token, refresh);
  const removal = useHousingRemoval(token, refresh);
  const liveHutches = (data.rabbit_hutches || []).filter(h => !h.archived);
  const choices = rabbitChoices(data);
  const quail = (data.flocks || []).filter(f => `${f.species || ''} ${f.breed || ''}`.toLowerCase().includes('quail'));
  const cages = [
    ...(data.cages || []).filter(c => c.animalType === 'Rabbit' || c.animalType === 'Quail' || quail.some(f => (data.cage_allocations || []).some(a => a.flockName === f.name && a.blockName === c.blockName && a.cageName === c.cageName))),
    ...liveHutches.filter(h => !(data.cages || []).some(c => c.id === h.cageId || c.id === h.id)).map(h => ({ id: h.id, animalType: 'Rabbit' as const, blockName: 'Rabbits', cageName: h.name }))
  ];
  const save = async (event: React.FormEvent) => {
    event.preventDefault(); setValidation('');
    try {
      const kind = task === 'create' ? 'farm_cage_add' : animalType === 'Rabbit' ? 'rabbit_move' : 'quail_move';
      const payload = task === 'create' ? { animalType, blockName: block, cageName: name } : animalType === 'Rabbit' ? { date, rabbitIds: selectedRabbitIds(data, target, Number(quantity)), toHutchId: cageId } : { date, flockId: target, cageId };
      if (await action.run(kind, payload)) { setName(''); setTarget(''); setCageId(''); setQuantity('1'); }
    } catch (error) { setValidation(error instanceof Error ? error.message : 'Choose available animals.'); }
  };
  return <section id="section_animal_housing" aria-label="Rabbit and quail cages" className="mb-6 space-y-4 rounded-2xl border border-emerald-200 bg-emerald-50/50 p-4">
    <div><h3 className="text-lg font-bold text-emerald-950">Rabbit and quail cages</h3><p className="text-sm text-slate-600">Register housing, then choose which animals live there. Counts always come from live inventory.</p></div>
    <form onSubmit={save} className="space-y-3">
      <label className="block text-sm font-semibold">Housing action<select aria-label="Housing action" className={input} value={task} onChange={e => { setTask(e.target.value); setTarget(''); }}><option value="create">Add a cage or hutch</option><option value="assign">Assign or move animals</option></select></label>
      <label className="block text-sm font-semibold">Animal type<select aria-label="Animal type" className={input} value={animalType} onChange={e => { setAnimalType(e.target.value); setTarget(''); setCageId(''); }}><option value="Rabbit">Rabbit</option><option value="Quail">Quail</option></select></label>
      {task === 'create' ? <><label className="block text-sm font-semibold">Block or location<input className={input} required value={block} onChange={e => setBlock(e.target.value)} placeholder="e.g. Rabbit house" /></label><label className="block text-sm font-semibold">Cage or hutch name<input className={input} required value={name} onChange={e => setName(e.target.value)} placeholder="e.g. R1" /></label></> : <>
        <label className="block text-sm font-semibold">{animalType === 'Rabbit' ? 'Rabbit or litter' : 'Quail flock'}<select aria-label={animalType === 'Rabbit' ? 'Rabbit or litter' : 'Quail flock'} className={input} required value={target} onChange={e => setTarget(e.target.value)}><option value="">Choose…</option>{animalType === 'Rabbit' ? choices.map(c => <option key={c.id} value={c.id}>{c.label}</option>) : quail.filter(f => f.quantity > 0).map(f => <option key={f.id} value={f.id}>{f.name} · {f.quantity} birds</option>)}</select></label>
        {animalType === 'Rabbit' && <label className="block text-sm font-semibold">Number of rabbits<input className={input} required type="number" min="1" step="1" value={quantity} onChange={e => setQuantity(e.target.value)} /></label>}
        <label className="block text-sm font-semibold">Move to<select aria-label="Move to" className={input} required value={cageId} onChange={e => setCageId(e.target.value)}><option value="">Choose housing…</option>{animalType === 'Rabbit' ? liveHutches.map(h => <option key={h.id} value={h.id}>{h.name}</option>) : (data.cages || []).filter(c => c.animalType !== 'Rabbit').map(c => <option key={c.id} value={c.id}>{c.blockName} · {c.cageName}</option>)}</select></label>
        <label className="block text-sm font-semibold">Move date<input className={input} required type="date" value={date} onChange={e => setDate(e.target.value)} /></label>
        {animalType === 'Quail' && <p className="text-sm text-slate-600">Moves the whole flock without increasing stock.</p>}
      </>}
      <button type="submit" disabled={action.busy} className="min-h-12 rounded-xl bg-emerald-700 px-4 font-semibold text-white disabled:opacity-50">{action.busy ? 'Saving…' : task === 'create' ? 'Save housing' : 'Save move'}</button>
      {(validation || action.error) && <p role="alert" className="text-sm text-rose-700">{validation || action.error}</p>}{action.message && <p role="status" className="text-sm text-emerald-800">{action.message}</p>}
    </form>
    {removal.error && <p role="alert" className="text-sm text-rose-700">{removal.error}</p>}{removal.message && <p role="status" className="text-sm text-emerald-800">{removal.message}</p>}
    <div className="grid gap-3 sm:grid-cols-2">{cages.map(cage => {
      const hutch = liveHutches.find(h => h.id === cage.id || h.cageId === cage.id);
      const rabbits = (data.rabbits || []).filter(r => r.status === 'active' && hutch && r.hutchId === hutch.id);
      const flocks = quail.filter(f => { const allocation = (data.cage_allocations || []).find(a => a.id === `flock-${f.id}` || a.flockName === f.name); return allocation ? allocation.cageName === cage.cageName && allocation.blockName === cage.blockName : f.notes === cage.cageName; });
      const count = rabbits.length + flocks.reduce((sum, f) => sum + f.quantity, 0);
      const grouped = new Map<string, number>();
      rabbits.filter(r => r.grouped).forEach(r => grouped.set(r.litterId || r.id, (grouped.get(r.litterId || r.id) || 0) + 1));
      return <div key={cage.id} className="min-w-0 rounded-xl border border-emerald-100 bg-white p-3 text-sm"><div className="flex items-start justify-between gap-2"><strong className="min-w-0 break-words">{cage.blockName} · {cage.cageName}</strong><HousingDeleteButton id={cage.id} name={`${cage.blockName} · ${cage.cageName}`} removal={removal} /></div><p>{cage.animalType || 'Quail'} · {count} alive</p>{rabbits.filter(r => !r.grouped).map(r => <p key={r.id} className="break-words">{r.name || r.id} · {rabbitAgeLabel(r, today)}</p>)}{[...grouped].map(([id, n]) => <p key={id}>{n} grouped bunnies · litter {id}</p>)}{flocks.map(f => <p key={f.id}>{f.name} · {f.quantity} quail</p>)}{!count && <p className="text-slate-500">Empty</p>}</div>;
    })}</div>
  </section>;
}
