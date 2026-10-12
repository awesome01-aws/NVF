import type { DbSchema, PoultrySale, Mortality, FowlEatenRecord, RabbitAnimal } from '../types';

const dayMs = 86400000;
export function rabbitAgeDays(animal: RabbitAnimal, today: string): number | undefined {
  const base = animal.birthDate || (animal.initialAgeWeeks !== undefined ? animal.acquiredDate : undefined);
  if (!base) return undefined;
  const elapsed = (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${base}T00:00:00Z`)) / dayMs;
  return Number.isFinite(elapsed) ? Math.max(0, Math.floor(elapsed) + (animal.birthDate ? 0 : (animal.initialAgeWeeks || 0) * 7)) : undefined;
}
export function rabbitAgeLabel(animal: RabbitAnimal, today: string): string {
  const days = rabbitAgeDays(animal, today);
  return days === undefined ? 'Age not recorded' : `${Math.floor(days / 7)} weeks, ${days % 7} days${animal.birthDate ? '' : ' (estimated)'}`;
}
export function rabbitChoices(db: Partial<DbSchema>) {
  const active = (db.rabbits || []).filter(item => item.status === 'active');
  return [
    ...active.filter(item => !item.grouped).map(item => ({ id: `rabbit:${item.id}`, label: `Rabbit · ${item.name || item.id}`, ids: [item.id] })),
    ...(db.rabbit_litters || []).map(litter => {
      const ids = active.filter(item => item.grouped && item.litterId === litter.id).map(item => item.id);
      const mother = (db.rabbits || []).find(item => item.id === litter.doeId);
      return { id: `litter:${litter.id}`, label: `Rabbit litter · ${mother?.name || litter.doeId} · ${ids.length} bunnies`, ids };
    }).filter(item => item.ids.length)
  ];
}
export function selectedRabbitIds(db: Partial<DbSchema>, target: string, quantity: number): string[] {
  const choice = rabbitChoices(db).find(item => item.id === target);
  if (!choice || !Number.isSafeInteger(quantity) || quantity < 1 || quantity > choice.ids.length) throw new Error('Choose live rabbits and a count within the available stock.');
  return choice.ids.slice(0, quantity);
}

/** Read-only projection of the existing species ledgers into the common Farm tables. */
export function farmRecordViews(db: Partial<DbSchema>) {
  const quail = (id: string) => (db.flocks || []).some(f => f.id === id && `${f.species || ''} ${f.breed || ''}`.toLowerCase().includes('quail'));
  const names = (ids: string[]) => ids.map(id => (db.rabbits || []).find(item => item.id === id)?.name || id).join(', ');
  const poultry_sales: PoultrySale[] = [
    ...(db.poultry_sales || []).filter(item => !item.voided).map(item => ({ ...item, stockAction: item.stockAction || (item.species === 'Quail' ? item.itemType === 'Quail Egg' ? 'quail_egg_use_void' : 'quail_live_sale_void' : undefined) })),
    ...(db.rabbit_sales || []).filter(item => !item.voided).map(item => ({ id: item.id, date: item.date, itemType: 'Rabbit' as const, species: 'Rabbit' as const, quantity: item.rabbitIds.length, unitPrice: item.totalAmount / item.rabbitIds.length, totalAmount: item.totalAmount, buyerName: item.buyerName, notes: names(item.rabbitIds), stockAction: 'rabbit_sale_void' }))
  ];
  const mortality: Mortality[] = [
    ...(db.mortality || []).filter(item => !item.voided).map(item => ({ ...item, stockAction: item.stockAction || (quail(item.flockId) ? 'quail_loss_void' : undefined) })),
    ...(db.rabbit_losses || []).filter(item => !item.voided).map(item => ({ id: item.id, date: item.date, flockId: '', flockName: `Rabbits · ${names(item.rabbitIds)}`, quantity: item.rabbitIds.length, cause: item.cause, stockAction: 'rabbit_loss_void' }))
  ];
  const fowls_eaten: FowlEatenRecord[] = [
    ...(db.fowls_eaten || []).filter(item => !item.voided),
    ...(db.rabbit_eaten || []).filter(item => !item.voided).map(item => ({ id: item.id, date: item.date, flockId: '', flockName: names(item.rabbitIds), species: 'Rabbit' as const, quantity: item.rabbitIds.length, ageWeeks: 0, notes: item.notes, stockAction: 'rabbit_eaten_void' }))
  ];
  return { poultry_sales, mortality, fowls_eaten };
}

export interface RabbitReminder { id: string; title: string; description: string; expectedDate: string; rabbitId: string; breedingId?: string }
export function rabbitReminders(db: Partial<DbSchema>, today: string): RabbitReminder[] {
  const reminders: RabbitReminder[] = [];
  for (const animal of db.rabbits || []) {
    if (animal.status !== 'active' || animal.sex !== 'female') continue;
    const name = animal.name || animal.id;
    const age = rabbitAgeDays(animal, today);
    if (age !== undefined && age >= (animal.maturityAgeWeeks || 26) * 7 && !animal.maturityAcknowledged && !(db.rabbit_breedings || []).some(item => item.doeId === animal.id)) {
      reminders.push({ id: `rabbit-mature-${animal.id}`, rabbitId: animal.id, expectedDate: today, title: `${name}: maturity review due`, description: `Reached your ${(animal.maturityAgeWeeks || 26)}-week reminder age. Check condition and breed suitability before planning breeding.` });
    }
    for (const breeding of db.rabbit_breedings || []) {
      if (breeding.doeId !== animal.id || breeding.closed || (db.rabbit_litters || []).some(item => item.breedingId === breeding.id)) continue;
      const expected = breeding.expectedDate || new Date(Date.parse(`${breeding.date}T00:00:00Z`) + 31 * dayMs).toISOString().slice(0, 10);
      const remaining = Math.round((Date.parse(`${expected}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / dayMs);
      if (remaining > 3) continue;
      reminders.push({ id: `rabbit-birth-${breeding.id}-${remaining <= 0 ? 'due' : 'nest'}`, rabbitId: animal.id, breedingId: breeding.id, expectedDate: expected, title: remaining < 0 ? `${name}: birth record overdue` : remaining === 0 ? `${name}: birth expected today` : `${name}: prepare the nest`, description: `Expected birth ${expected}${remaining > 0 ? ` (in ${remaining} days)` : ''}. Check the doe and nest; record the litter or close the breeding if it did not result in a litter.` });
    }
  }
  return reminders;
}
