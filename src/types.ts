/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface User {
  id: string;
  username: string;
  name: string;
}

export type SpecialCase =
  | 'Standard'
  | '150 Per Egg Brought'
  | 'Per Chick'
  | 'Per Egg After Scan'
  | 'Discount'
  | 'Free'
  | 'Custom';

export interface Client {
  id: string;
  name: string;
  mark: string; // 2 letters, unique, capitalised
  phone: string;
  location: string;
  overdraft?: number; // client's credit overdraft balance
  specialCase?: SpecialCase;
}

export interface IncubatorRecord {
  id: string;
  ownerType?: 'client' | 'farm'; // older records belong to clients
  flockTransferId?: string; // farm hatch added to quail stock exactly once
  clientId: string;
  clientName: string;
  clientMark: string;
  eggType?: 'Brahma' | 'Turkey' | 'Goose' | 'Quail' | 'Duck' | string;
  dateBrought: string; // YYYY-MM-DD
  createdAt?: string; // ISO timestamp string for exact creation time
  day8Date: string; // YYYY-MM-DD auto-calculated (dateBrought + 8 days)
  day18Date: string; // YYYY-MM-DD auto-calculated (dateBrought + 18)
  day21Date: string; // YYYY-MM-DD auto-calculated (dateBrought + 21)
  eggsCollected: number;
  specialCase: SpecialCase;
  ratePerEgg: number; // calculated at creation
  amountDue: number; // auto-calculated: eggsCollected * ratePerEgg
  amountPaid: number; // manual input
  overdraftUsed?: number; // overdraft deducted at creation
  overdraftGenerated?: number; // excess amount paid stored as client credit
  eggsAfterScan: number | null; // entered on Day 8
  chicksHatched: number | null; // entered on Day 21
  clientPhone: string;
  notes?: string;
}

export type BirdSpecies = 'Chicken' | 'Turkey' | 'Agric Fowls' | 'Quail' | 'Chicks' | 'Poults' | string;

export type CountMode = 'single' | 'multi' | 'multi_species' | 'sex_breakdown';

export interface SpeciesCount {
  species: string;
  quantity: number;
  cocksCount?: number;
  hensCount?: number;
}

export interface Flock {
  id: string;
  name: string;
  breed: string;
  quantity: number;
  ageWeeks: number;
  initialAgeWeeks?: number;
  dateAdded: string; // YYYY-MM-DD
  species?: BirdSpecies;
  countMode?: CountMode;
  cocksCount?: number;
  hensCount?: number;
  speciesBreakdown?: SpeciesCount[];
  notes?: string;
}

export interface FeedRecord {
  id: string;
  date: string; // YYYY-MM-DD
  feedType: string;
  bagsBought: number;
  weightPerBag: number; // kg
  costBag: number; // FCFA
  totalCost: number; // auto-calculated
  stockRemaining: number;
  species?: 'Rabbit' | 'Quail' | 'Poultry';
}

export type PoultryItemType = 'Fowl' | 'Egg' | 'Fertilized Egg' | 'Chick' | 'Turkey' | 'Feed' | 'Rabbit' | 'Quail' | 'Quail Chick' | 'Quail Egg';

export interface PoultrySale {
  id: string;
  date: string; // YYYY-MM-DD
  itemType: PoultryItemType;
  quantity: number;
  unitPrice: number; // FCFA
  totalAmount: number; // auto-calculated
  buyerName: string;
  flockId?: string;
  ageWeeks?: number;
  notes?: string;
  species?: 'Chicken' | 'Turkey' | 'Quail' | 'Rabbit';
  stockAction?: string;
  voided?: boolean;
}

export interface Mortality {
  stockAction?: string;
  id: string;
  date: string; // YYYY-MM-DD
  flockId: string;
  flockName: string;
  quantity: number;
  cause?: string;
  voided?: boolean;
}

export type ExpenseCategory = 'Vaccine' | 'Transport' | 'Labor' | 'Electricity' | 'Repair' | 'Other';

export interface Expense {
  id: string;
  date: string; // YYYY-MM-DD
  category: ExpenseCategory;
  description: string;
  amount: number; // FCFA
  species?: 'Rabbit' | 'Quail' | 'Poultry';
}

export interface CageTransfer {
  id: string;
  date: string; // YYYY-MM-DD
  flockId?: string;
  flockName: string;
  species?: BirdSpecies;
  breed?: string; // 'Gobbler' | 'Hen' | breed
  fromCage: string;
  toCage: string;
  quantity: number;
  ageWeeks?: number;
  notes?: string;
}

export interface CageLocation {
  id: string;
  blockName: string;
  cageName: string;
  animalType?: 'Rabbit' | 'Quail' | 'Poultry';
}

export interface CageAllocation {
  id: string;
  blockName: string;
  cageName: string;
  flockName: string;
  species?: BirdSpecies;
  quantity: number;
  ageWeeks: number;
  initialAgeWeeks?: number;
  dateAdded: string; // YYYY-MM-DD
  dateTransferred: string; // YYYY-MM-DD
  countMode?: CountMode;
  cocksCount?: number;
  hensCount?: number;
  speciesBreakdown?: SpeciesCount[];
  notes?: string;
}

export interface DailyEggCollection {
  id: string;
  date: string; // YYYY-MM-DD
  brahmaEggs: number;
  turkeyEggs: number;
  quailEggs?: number;
  poultryRecorded?: boolean;
  totalEggs: number; // brahmaEggs + turkeyEggs + quailEggs
  recordedBy?: string;
  notes?: string;
}

export interface RabbitAnimal {
  id: string;
  name?: string;
  tag?: string;
  sex: 'female' | 'male' | 'unknown';
  breed?: string;
  birthDate?: string;
  initialAgeWeeks?: number;
  maturityAgeWeeks?: number;
  maturityAcknowledged?: boolean;
  acquiredDate?: string;
  litterId?: string;
  motherId?: string;
  fatherId?: string;
  hutchId?: string;
  grouped: boolean;
  status: 'active' | 'sold' | 'deceased' | 'eaten';
  notes?: string;
}

export interface RabbitHutch { id: string; name: string; cageId?: string; notes?: string; archived?: boolean }
export interface RabbitBreeding { id: string; date: string; doeId: string; buckId: string; expectedDate?: string; closed?: boolean; notes?: string }
export interface RabbitLitter { id: string; birthDate: string; doeId: string; buckId: string; breedingId?: string; kitIds: string[]; notes?: string }
export interface RabbitMove { id: string; date: string; rabbitIds: string[]; fromHutchId?: string; toHutchId: string; notes?: string }
export interface RabbitLoss { id: string; date: string; rabbitIds: string[]; cause?: string; voided?: boolean }
export interface RabbitSale { id: string; date: string; rabbitIds: string[]; buyerName: string; totalAmount: number; voided?: boolean }
export interface RabbitEaten { id: string; date: string; rabbitIds: string[]; notes?: string; voided?: boolean }
export interface AnimalCareRecord { id: string; date: string; species: 'Rabbit' | 'Quail'; targetId: string; kind: 'health' | 'weight' | 'feed'; detail?: string; amount?: number; unit?: 'kg' | 'g' | 'FCFA'; notes?: string }
export interface QuailEggUse { id: string; date: string; kind: 'sold' | 'eaten' | 'set' | 'adjustment'; quantity: number; buyerName?: string; amount?: number; incubatorId?: string; saleId?: string; notes?: string; voided?: boolean }
export interface CageCountCorrection { id: string; date: string; allocationId: string; flockId?: string; cageName: string; flockName: string; previousQuantity: number; quantity: number; reason: string; recordedBy?: string }
export interface FarmActivity { id: string; at: string; actor: string; action: string; detail?: string }

export interface FowlEatenRecord {
  stockAction?: string;
  voided?: boolean;
  id: string;
  date: string; // YYYY-MM-DD
  flockId: string;
  flockName: string;
  species?: 'Chicken' | 'Turkey' | 'Quail' | 'Rabbit';
  breed?: string;
  quantity: number;
  ageWeeks: number;
  notes?: string;
}

export interface DbSchema {
  users: Array<User & { passwordHash: string }>;
  clients: Client[];
  incubator_records: IncubatorRecord[];
  flocks: Flock[];
  feed_records: FeedRecord[];
  poultry_sales: PoultrySale[];
  mortality: Mortality[];
  expenses: Expense[];
  cage_transfers: CageTransfer[];
  cages?: CageLocation[];
  cage_allocations?: CageAllocation[];
  daily_egg_collections?: DailyEggCollection[];
  fowls_eaten?: FowlEatenRecord[];
  rabbits?: RabbitAnimal[];
  rabbit_hutches?: RabbitHutch[];
  rabbit_breedings?: RabbitBreeding[];
  rabbit_litters?: RabbitLitter[];
  rabbit_moves?: RabbitMove[];
  rabbit_losses?: RabbitLoss[];
  rabbit_sales?: RabbitSale[];
  rabbit_eaten?: RabbitEaten[];
  animal_care?: AnimalCareRecord[];
  quail_egg_use?: QuailEggUse[];
  farm_action_receipts?: string[];
  cage_count_corrections?: CageCountCorrection[];
  activity_log?: FarmActivity[];
}

export type ActiveTab = 'home' | 'farm' | 'incubator' | 'reports';
