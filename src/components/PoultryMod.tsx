/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { 
  Plus, Minus, Egg, Heart, Trash2, Calendar, Edit3, DollarSign, Package, User, AlertCircle, ShoppingCart, ArrowRightLeft, MoveRight, Home, Layers, Search, ArrowUpDown, SlidersHorizontal, Grid, Check, X, ChevronDown, Filter, Building, CheckCircle2, History, Maximize2, Minimize2, Sprout, ZoomIn, ZoomOut, RotateCcw,
  Receipt, Utensils, UtensilsCrossed, Skull, TrendingDown, Sparkles, LayoutGrid
} from 'lucide-react';
import { Flock, FeedRecord, PoultrySale, Mortality, Expense, ActiveTab, CageTransfer, CageLocation, CageAllocation, DailyEggCollection, FowlEatenRecord, DbSchema, IncubatorRecord } from '../types';
import { RabbitSection, QuailSection, useFarmAction } from './FarmAnimalsMod';
import { SharedAnimalHousing } from './SharedAnimalHousing';
import { farmRecordViews, rabbitChoices, selectedRabbitIds } from '../lib/farmViews';
import { recordShortcutUsage } from '../utils/shortcutTracker';
import { useFormAutoSave, DraftSavedBadge } from '../lib/useFormAutoSave';
import { getCameroonTodayISO, formatDateDDMMYYYY, parseDateToISO, calculateCurrentAgeWeeks, formatFlockAge, formatAgeDisplay, calculateFlockAge, parseNumericAgeWeeks } from '../utils/dateUtils';

interface PoultryModProps {
  data: Partial<DbSchema> & {
    incubator_records: IncubatorRecord[];
    flocks: Flock[];
    feed_records: FeedRecord[];
    poultry_sales: PoultrySale[];
    mortality: Mortality[];
    expenses: Expense[];
    cage_transfers?: CageTransfer[];
    cages?: CageLocation[];
    cage_allocations?: CageAllocation[];
    daily_egg_collections?: DailyEggCollection[];
    fowls_eaten?: FowlEatenRecord[];
  };
  triggerRefresh: () => void;
  quickFormKey: string | null;
  setQuickFormKey: (key: string | null) => void;
  token: string;
}

const DEFAULT_FARM_CAGES: CageLocation[] = [
  // BLOCK 0
  { id: 'c-0-1', blockName: 'BLOCK 0', cageName: 'ST 1' },
  { id: 'c-0-2', blockName: 'BLOCK 0', cageName: 'ST 2' },
  { id: 'c-0-3', blockName: 'BLOCK 0', cageName: 'ST 3' },
  { id: 'c-0-4', blockName: 'BLOCK 0', cageName: 'ST 4' },
  { id: 'c-0-5', blockName: 'BLOCK 0', cageName: 'ST2' },
  { id: 'c-0-6', blockName: 'BLOCK 0', cageName: 'ST4' },
  // BLOCK 1
  { id: 'c-1-1', blockName: 'BLOCK 1', cageName: 'CAGE B' },
  { id: 'c-1-2', blockName: 'BLOCK 1', cageName: 'CAGE C' },
  { id: 'c-1-3', blockName: 'BLOCK 1', cageName: 'CAGE D' },
  { id: 'c-1-4', blockName: 'BLOCK 1', cageName: 'CAGE B1' },
  { id: 'c-1-5', blockName: 'BLOCK 1', cageName: 'CAGE C1' },
  // BLOCK 2
  { id: 'c-2-1', blockName: 'BLOCK 2', cageName: 'CAGE A' },
  { id: 'c-2-2', blockName: 'BLOCK 2', cageName: 'A FLOOR' },
  { id: 'c-2-3', blockName: 'BLOCK 2', cageName: 'O FLOOR' },
  { id: 'c-2-4', blockName: 'BLOCK 2', cageName: 'STO 1' },
  { id: 'c-2-5', blockName: 'BLOCK 2', cageName: 'STO 2' },
  { id: 'c-2-6', blockName: 'BLOCK 2', cageName: 'STO 3' },
  { id: 'c-2-7', blockName: 'BLOCK 2', cageName: 'STO 4' },
  { id: 'c-2-8', blockName: 'BLOCK 2', cageName: 'STO 0' },
  { id: 'c-2-9', blockName: 'BLOCK 2', cageName: 'CAGE P' },
  { id: 'c-2-10', blockName: 'BLOCK 2', cageName: 'CAGE Q' },
  { id: 'c-2-11', blockName: 'BLOCK 2', cageName: 'CAGE R' },
  { id: 'c-2-12', blockName: 'BLOCK 2', cageName: 'CAGE S' },
  { id: 'c-2-13', blockName: 'BLOCK 2', cageName: 'CAGE T' },
  { id: 'c-2-14', blockName: 'BLOCK 2', cageName: 'CAGE U' },
  { id: 'c-2-15', blockName: 'BLOCK 2', cageName: 'CAGE M' },
  // BLOCK 3
  { id: 'c-3-1', blockName: 'BLOCK 3', cageName: 'H FLOOR' },
  { id: 'c-3-2', blockName: 'BLOCK 3', cageName: 'N FLOOR' },
  { id: 'c-3-3', blockName: 'BLOCK 3', cageName: 'CAGE K' },
  { id: 'c-3-4', blockName: 'BLOCK 3', cageName: 'CAGE L' },
  { id: 'c-3-5', blockName: 'BLOCK 3', cageName: 'CAGE J' },
  { id: 'c-3-6', blockName: 'BLOCK 3', cageName: 'CAGE J1' },
  { id: 'c-3-7', blockName: 'BLOCK 3', cageName: 'GR 1' },
  { id: 'c-3-8', blockName: 'BLOCK 3', cageName: 'GR 2' },
  { id: 'c-3-9', blockName: 'BLOCK 3', cageName: 'GR 3' },
  { id: 'c-3-10', blockName: 'BLOCK 3', cageName: 'CAGE G' },
  { id: 'c-3-11', blockName: 'BLOCK 3', cageName: 'CAGE F' },
  { id: 'c-3-12', blockName: 'BLOCK 3', cageName: 'IN 1' },
  { id: 'c-3-13', blockName: 'BLOCK 3', cageName: 'IN 2' },
  { id: 'c-3-14', blockName: 'BLOCK 3', cageName: 'IN 3' },
  { id: 'c-3-15', blockName: 'BLOCK 3', cageName: 'IN 4' }
];

function SearchableCageSelect({
  label,
  value,
  onChange,
  cages,
  placeholder,
  required = false,
  occupancyMap
}: {
  label: string;
  value: string;
  onChange: (val: string) => void;
  cages: CageLocation[];
  placeholder?: string;
  required?: boolean;
  occupancyMap?: Map<string, CageAllocation[]>;
}) {
  const [query, setQuery] = useState(value || '');
  const [isOpen, setIsOpen] = useState(false);

  React.useEffect(() => {
    setQuery(value);
  }, [value]);

  const filtered = cages.filter(c =>
    c.cageName.toLowerCase().includes(query.toLowerCase()) ||
    c.blockName.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div className="relative">
      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1 ml-1">{label}</label>
      <div className="relative">
        <input
          type="text"
          value={query}
          required={required}
          onChange={(e) => {
            setQuery(e.target.value);
            onChange(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          placeholder={placeholder || 'Type or select cage...'}
          className="w-full text-xs font-bold p-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none pr-8 transition-all"
        />
        <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
      </div>

      {isOpen && filtered.length > 0 && (
        <div className="absolute z-30 left-0 right-0 mt-1 max-h-52 overflow-y-auto bg-white border border-slate-200 rounded-2xl shadow-xl divide-y divide-slate-100">
          {filtered.map((c, idx) => {
            const cKey = (c.cageName || '').toUpperCase().trim();
            const occ = occupancyMap ? (occupancyMap.get(cKey) || []) : [];
            const isShared = occ.length >= 2;
            return (
              <button
                key={`${c.id || idx}-${c.cageName}`}
                type="button"
                onClick={() => {
                  onChange(c.cageName);
                  setQuery(c.cageName);
                  setIsOpen(false);
                }}
                className="w-full text-left px-3.5 py-2.5 text-xs hover:bg-emerald-50/80 flex items-center justify-between transition-colors cursor-pointer"
              >
                <div className="flex flex-col gap-0.5">
                  <div className="font-bold text-slate-800 flex items-center gap-1.5">
                    <span>{c.cageName}</span>
                    {isShared && (
                      <span className="px-1.5 py-0.5 bg-amber-100 text-amber-900 text-[9px] font-black rounded border border-amber-300">
                        👥 {occ.length} Batches Co-Housed
                      </span>
                    )}
                  </div>
                  {occ.length === 1 && (
                    <span className="text-[10px] text-slate-500 font-medium">
                      1 batch inside: {occ[0].flockName} ({occ[0].quantity} birds)
                    </span>
                  )}
                  {occ.length > 1 && (
                    <span className="text-[10px] text-amber-700 font-medium">
                      {occ.map(b => b.flockName).join(', ')} ({occ.reduce((acc, x) => acc + x.quantity, 0)} birds total)
                    </span>
                  )}
                </div>
                <span className="px-2 py-0.5 text-[10px] font-extrabold bg-slate-100 text-slate-600 rounded-md uppercase shrink-0">
                  {c.blockName}
                </span>
              </button>
            );
          })}
        </div>
      )}
      {isOpen && (
        <div 
          className="fixed inset-0 z-20" 
          onClick={() => setIsOpen(false)} 
        />
      )}
    </div>
  );
}

export default function PoultryMod({
  data: rawData,
  triggerRefresh,
  quickFormKey,
  setQuickFormKey,
  token
}: PoultryModProps) {
  const data = { ...rawData, ...farmRecordViews(rawData) };
  const farmAction = useFarmAction(token, triggerRefresh);
  const [housingRequest, setHousingRequest] = useState({ version: 0, animalType: 'Rabbit', task: 'create' });
  const openAnimalHousing = (species: string) => { setHousingRequest(prev => ({ version: prev.version + 1, animalType: species, task: 'assign' })); setTimeout(() => document.getElementById('section_animal_housing')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50); };
  const sharedRabbitChoices = rabbitChoices(rawData);
  const isQuailFlock = (id: string) => rawData.flocks.some(f => f.id === id && `${f.species || ''} ${f.breed || ''}`.toLowerCase().includes('quail'));
  const reverseFarmRecord = async (endpoint: string, id: string) => {
    if (endpoint === '/api/sales') {
      const row = data.poultry_sales.find(item => item.id === id);
      if (row?.stockAction) return farmAction.run(row.stockAction, row.stockAction === 'quail_egg_use_void' ? { useId: rawData.quail_egg_use?.find(use => use.saleId === id)?.id } : { saleId: id });
    }
    if (endpoint === '/api/mortality' && data.mortality.find(item => item.id === id)?.stockAction) return farmAction.run(data.mortality.find(item => item.id === id)!.stockAction!, { lossId: id });
    if (endpoint === '/api/fowls-eaten' && data.fowls_eaten.find(item => item.id === id)?.stockAction) return farmAction.run(data.fowls_eaten.find(item => item.id === id)!.stockAction!, { recordId: id });
    return undefined;
  };
  const [, setNowTick] = useState<number>(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNowTick(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);
  // Automatic Dynamic Age Segment calculations for dashboard counters across all farm flocks & allocations
  const getAgeGroupCounts = (speciesTarget: 'Turkey' | 'Chicken') => {
    let dayOlds = 0;   // < 1 week
    let growers = 0;   // 1 to 23 weeks
    let layers = 0;    // 24+ weeks

    const isTurkey = (sp?: string, br?: string, nm?: string, nt?: string) => {
      const s = `${sp || ''} ${br || ''} ${nm || ''} ${nt || ''}`.toLowerCase();
      return s.includes('turkey') || s.includes('gobbler') || s.includes('hen') || s.includes('poult') || s.includes('tky');
    };

    const isQuail = (sp?: string, br?: string) => {
      const s = `${sp || ''} ${br || ''}`.toLowerCase();
      return s.includes('quail');
    };

    (data?.flocks || []).forEach(f => {
      const ageInfo = calculateFlockAge(f.dateAdded, f.initialAgeWeeks ?? 0);
      const age = ageInfo.weeks + (ageInfo.days / 7);
      const mainSpecies = f.species || '';
      const mainBreed = f.breed || '';
      const mainName = f.name || '';
      const mainNotes = f.notes || '';

      if (((f.countMode as string) === 'multi_species' || f.countMode === 'multi') && Array.isArray(f.speciesBreakdown) && f.speciesBreakdown.length > 0) {
        f.speciesBreakdown.forEach(sb => {
          const sbSp = (sb.species || '').toLowerCase();
          const sbQty = Number(sb.quantity) || 0;
          if (sbQty <= 0) return;

          let matchesTarget = false;
          if (speciesTarget === 'Turkey') {
            matchesTarget = sbSp.includes('turkey') || sbSp.includes('poult') || sbSp.includes('gobbler') || sbSp.includes('hen');
          } else {
            matchesTarget = !sbSp.includes('turkey') && !sbSp.includes('poult') && !sbSp.includes('gobbler') && !sbSp.includes('hen') && !sbSp.includes('quail');
          }

          if (matchesTarget) {
            if (age < 1) dayOlds += sbQty;
            else if (age < 24) growers += sbQty;
            else layers += sbQty;
          }
        });
      } else {
        const qty = Number(f.quantity) || 0;
        if (qty <= 0) return;

        let matchesTarget = false;
        if (speciesTarget === 'Turkey') {
          matchesTarget = isTurkey(mainSpecies, mainBreed, mainName, mainNotes);
        } else {
          matchesTarget = !isTurkey(mainSpecies, mainBreed, mainName, mainNotes) && !isQuail(mainSpecies, mainBreed);
        }

        if (matchesTarget) {
          if (age < 1) dayOlds += qty;
          else if (age < 24) growers += qty;
          else layers += qty;
        }
      }
    });

    const total = dayOlds + growers + layers;
    return { dayOlds, growers, layers, total };
  };

  const chickenMetrics = getAgeGroupCounts('Chicken');
  const turkeyMetrics = getAgeGroupCounts('Turkey');

  const chickenDayOlds = chickenMetrics.dayOlds;
  const chickenGrowers = chickenMetrics.growers;
  const chickenLayers = chickenMetrics.layers;
  const totalChickens = chickenMetrics.total;

  const turkeyDayOlds = turkeyMetrics.dayOlds;
  const turkeyGrowers = turkeyMetrics.growers;
  const turkeyLayers = turkeyMetrics.layers;
  const totalTurkeys = turkeyMetrics.total;

  // Collapsible state toggles
  const [activeFormSection, setActiveFormSection] = useState<string | null>(quickFormKey);
  const [farmSubSection, setFarmSubSection] = useState<'overview' | 'all' | 'flocks' | 'rabbits' | 'quail' | 'eggs' | 'sales' | 'feed' | 'mortality' | 'eaten' | 'expenses'>('overview');
  const [rabbitShortcutVersion, setRabbitShortcutVersion] = useState(0);
  const [quailShortcutVersion, setQuailShortcutVersion] = useState(0);

  React.useEffect(() => {
    if (quickFormKey) {
      if (quickFormKey === 'rabbit_add' || quickFormKey === 'rabbits') {
        setActiveFormSection('rabbit_add');
        setFarmSubSection('rabbits');
      } else if (quickFormKey === 'quail' || quickFormKey === 'quail_eggs') {
        setFarmSubSection('quail');
      } else if (quickFormKey === 'quail_flock_add') {
        setActiveFormSection('quail_flock_add');
        setFarmSubSection('quail');
      } else if (quickFormKey === 'egg_collection' || quickFormKey === 'egg') {
        const todayEggs = rawData.daily_egg_collections?.find(row => row.date === getCameroonTodayISO());
        if (todayEggs) {
          setEditingEggColl(todayEggs);
          setEggFormDate(todayEggs.date);
          setEggFormBrahma(String(todayEggs.brahmaEggs || 0));
          setEggFormTurkey(String(todayEggs.turkeyEggs || 0));
          setEggFormQuail(String(todayEggs.quailEggs || 0));
          setEggFormRecordedBy(todayEggs.recordedBy || '');
          setEggFormNotes(todayEggs.notes || '');
        }
        setIsEggCollFormOpen(true);
        setFarmSubSection('eggs');
      } else if (quickFormKey === 'animal_move') {
        setHousingRequest(previous => ({ ...previous, version: previous.version + 1, task: 'assign' }));
        setFarmSubSection('flocks');
      } else if (quickFormKey === 'cage_count') {
        setCorrectionModalOpen(true);
        setFarmSubSection('flocks');
      } else if (quickFormKey === 'flock' || quickFormKey === 'transfer') {
        setActiveFormSection(quickFormKey);
        setFarmSubSection('flocks');
      } else if (quickFormKey === 'sale' || quickFormKey === 'sales') {
        setActiveFormSection('sales');
        setFarmSubSection('sales');
      } else if (quickFormKey === 'feed') {
        setActiveFormSection(quickFormKey);
        setFarmSubSection('feed');
      } else if (quickFormKey === 'mortality') {
        setActiveFormSection(quickFormKey);
        setFarmSubSection('mortality');
      } else if (quickFormKey === 'eaten' || quickFormKey === 'fowls_eaten') {
        setActiveFormSection('fowls_eaten');
        setFarmSubSection('eaten');
      } else if (quickFormKey === 'expense') {
        setActiveFormSection(quickFormKey);
        setFarmSubSection('expenses');
      } else {
        setActiveFormSection(quickFormKey);
      }
      const keyToScroll = quickFormKey === 'animal_move' ? 'section_animal_housing' : quickFormKey === 'cage_count' ? 'section_flocks' : quickFormKey === 'sale' ? 'sales' : quickFormKey === 'eaten' ? 'fowls_eaten' : quickFormKey;
      setQuickFormKey(null);

      setTimeout(() => {
        const el = document.getElementById(keyToScroll) || document.getElementById(`${keyToScroll}-form-section`) ||
                   document.getElementById(`form_section_${keyToScroll}`) || 
                   document.getElementById(`qa_log_${keyToScroll}`);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 150);
    }
  }, [quickFormKey, setQuickFormKey]);

  // Form Fields
  // Flocks
  const [flockName, setFlockName] = useState('');
  const [flockBreed, setFlockBreed] = useState('Brahma');
  const [flockQty, setFlockQty] = useState('');
  const [flockAge, setFlockAge] = useState('');
  const [flockDate, setFlockDate] = useState(getCameroonTodayISO());
  const [flockSpecies, setFlockSpecies] = useState<string>('Chicken');
  const [turkeyType, setTurkeyType] = useState<'Gobbler' | 'Hen'>('Gobbler');
  const [flockNotes, setFlockNotes] = useState('');
  const [flockCountMode, setFlockCountMode] = useState<'single' | 'sex_breakdown' | 'multi_species'>('single');
  const [flockCocksCount, setFlockCocksCount] = useState<string>('0');
  const [flockHensCount, setFlockHensCount] = useState<string>('0');
  const [flockSpeciesBreakdown, setFlockSpeciesBreakdown] = useState<Array<{ species: string; quantity: string }>>([
    { species: 'Turkey', quantity: '7' },
    { species: 'Chicks', quantity: '2' }
  ]);

  // Flock Editing Modal/Fields states
  const [editingFlock, setEditingFlock] = useState<Flock | null>(null);
  const [editFlockName, setEditFlockName] = useState('');
  const [editFlockBreed, setEditFlockBreed] = useState('');
  const [editFlockQty, setEditFlockQty] = useState('');
  const [editFlockAge, setEditFlockAge] = useState('');
  const [editFlockDate, setEditFlockDate] = useState('');
  const [editFlockSpecies, setEditFlockSpecies] = useState<string>('Chicken');
  const [editTurkeyType, setEditTurkeyType] = useState<'Gobbler' | 'Hen'>('Gobbler');
  const [editFlockNotes, setEditFlockNotes] = useState('');
  const [editFlockCountMode, setEditFlockCountMode] = useState<'single' | 'sex_breakdown' | 'multi_species'>('single');
  const [editFlockCocksCount, setEditFlockCocksCount] = useState<string>('0');
  const [editFlockHensCount, setEditFlockHensCount] = useState<string>('0');
  const [editFlockSpeciesBreakdown, setEditFlockSpeciesBreakdown] = useState<Array<{ species: string; quantity: string }>>([
    { species: 'Turkey', quantity: '7' },
    { species: 'Chicks', quantity: '2' }
  ]);

  // Cage Transfer Form State
  const [transferSpecies, setTransferSpecies] = useState<string>('Chicken');
  const [transferFlockName, setTransferFlockName] = useState('');
  const [transferFromCage, setTransferFromCage] = useState('');
  const [transferToCage, setTransferToCage] = useState('');
  const [transferQty, setTransferQty] = useState('');
  const [transferDate, setTransferDate] = useState(getCameroonTodayISO());
  const [transferNotes, setTransferNotes] = useState('');
  const [transferAgeWeeks, setTransferAgeWeeks] = useState('');
  const [transferSourceFlockId, setTransferSourceFlockId] = useState('');
  const [transferType, setTransferType] = useState<'full' | 'partial'>('full');

  // Add Cage Form state
  const [isAddCageOpen, setIsAddCageOpen] = useState(false);
  const [newBlockName, setNewBlockName] = useState('BLOCK 0');
  const [newCageName, setNewCageName] = useState('');

  // Bulk Edit Flocks Modal State
  const [isBulkEditFlocksOpen, setIsBulkEditFlocksOpen] = useState(false);
  const [bulkEditForm, setBulkEditForm] = useState<{
    species: string;
    breed: string;
    ageWeeks: string;
    dateAdded: string;
    notes: string;
    quantity: string;
  }>({
    species: '',
    breed: '',
    ageWeeks: '',
    dateAdded: '',
    notes: '',
    quantity: ''
  });

  // Custom Delete Confirmation Modal state
  const [deleteConfirmModal, setDeleteConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    confirmText?: string;
    action: () => Promise<void> | void;
  } | null>(null);

  const confirmDelete = (
    title: string,
    message: string,
    action: () => Promise<void> | void,
    confirmText: string = 'Delete'
  ) => {
    setDeleteConfirmModal({
      isOpen: true,
      title,
      message,
      confirmText,
      action
    });
  };

  // Fullscreen Table Overlay state & Zoom scale (default 85% high-density fit)
  const [fullscreenTable, setFullscreenTable] = useState<{
    title: string;
    subtitle?: string;
    badge?: string;
    icon?: React.ReactNode;
    content: React.ReactNode;
  } | null>(null);
  const [fullscreenZoom, setFullscreenZoom] = useState<number>(85);

  const touchStartDistRef = useRef<number | null>(null);
  const touchStartZoomRef = useRef<number>(85);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && fullscreenTable) {
        setFullscreenTable(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [fullscreenTable]);

  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 2) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      touchStartDistRef.current = dist;
      touchStartZoomRef.current = fullscreenZoom;
    }
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 2 && touchStartDistRef.current !== null) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      const scaleFactor = dist / touchStartDistRef.current;
      const newZoom = Math.min(200, Math.max(35, Math.round(touchStartZoomRef.current * scaleFactor)));
      setFullscreenZoom(newZoom);
    }
  };

  const handleTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length < 2) {
      touchStartDistRef.current = null;
    }
  };

  const formatShortBatch = (name: string) => {
    if (!name) return '';
    return name
      .replace(/(?:Flock|Brooder|Growing)\s+/gi, '')
      .replace(/Batch\s*#/gi, '#')
      .replace(/Batch\s+(\d+)/gi, '#$1')
      .trim();
  };

  // Grow New Fowl Batches / Registered Flocks Table Search & Filters
  const [flocksSearch, setFlocksSearch] = useState('');
  const [flocksSpeciesFilter, setFlocksSpeciesFilter] = useState<'ALL' | 'Chicken' | 'Turkey'>('ALL');

  // Filtered Flocks list
  const filteredFlocks = React.useMemo(() => {
    return (data.flocks || []).filter((f) => {
      const sp = (f.species || '').toLowerCase();
      const br = (f.breed || '').toLowerCase();
      const nm = (f.name || '').toLowerCase();
      const isTurkey = sp.includes('turkey') || br.includes('turkey') || br === 'gobbler' || nm.includes('turkey');
      const isQuail = sp.includes('quail');

      if (flocksSpeciesFilter === 'Turkey' && !isTurkey) return false;
      if (flocksSpeciesFilter === 'Chicken' && (isTurkey || isQuail)) return false;

      if (flocksSearch.trim()) {
        const q = flocksSearch.toLowerCase();
        const matchName = nm.includes(q);
        const matchBreed = br.includes(q);
        const matchNotes = (f.notes || '').toLowerCase().includes(q);
        const matchSpecies = sp.includes(q);
        return matchName || matchBreed || matchNotes || matchSpecies;
      }
      return true;
    });
  }, [data.flocks, flocksSpeciesFilter, flocksSearch]);

  // Live Cage Block Distribution state
  const [distSearch, setDistSearch] = useState('');
  const [distBlockFilter, setDistBlockFilter] = useState('ALL');
  const [distSortBy, setDistSortBy] = useState<'qty_desc' | 'qty_asc' | 'block' | 'cage' | 'date' | 'age'>('qty_desc');
  const [distViewMode, setDistViewMode] = useState<'batch' | 'shared' | 'summary'>('batch');

  // Allocation editing
  const [editingAlloc, setEditingAlloc] = useState<CageAllocation | null>(null);
  const [correctionModalOpen, setCorrectionModalOpen] = useState(false);
  const [correctionAllocationId, setCorrectionAllocationId] = useState('');
  const [correctionQuantity, setCorrectionQuantity] = useState('');
  const [correctionReason, setCorrectionReason] = useState('');
  const [editAllocForm, setEditAllocForm] = useState<Partial<CageAllocation>>({});

  // Direct Add Allocation Modal
  const [isAddAllocOpen, setIsAddAllocOpen] = useState(false);
  const [addAllocForm, setAddAllocForm] = useState<{
    blockName: string;
    cageName: string;
    flockName: string;
    species: 'Chicken' | 'Turkey';
    quantity: string;
    ageWeeks: string;
    dateAdded: string;
    dateTransferred: string;
    notes: string;
  }>({
    blockName: 'BLOCK 0',
    cageName: '',
    flockName: '',
    species: 'Chicken',
    quantity: '',
    ageWeeks: '0',
    dateAdded: getCameroonTodayISO(),
    dateTransferred: getCameroonTodayISO(),
    notes: ''
  });

  // Merged All Cages
  const allFarmCages = React.useMemo(() => {
    if (data.cages && Array.isArray(data.cages)) {
      return data.cages;
    }
    return DEFAULT_FARM_CAGES;
  }, [data.cages]);

  // Grouped Cages by Block Name for Select Dropdowns
  const groupedCages = React.useMemo<Record<string, CageLocation[]>>(() => {
    const groups: Record<string, CageLocation[]> = {};
    allFarmCages.forEach(c => {
      const block = c.blockName || 'UNASSIGNED';
      if (!groups[block]) groups[block] = [];
      groups[block].push(c);
    });
    return groups;
  }, [allFarmCages]);

  const handleQuickAssignFlockCage = async (flockId: string, newCage: string) => {
    try {
      const res = await fetch(`/api/flocks/${flockId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': token },
        body: JSON.stringify({ notes: newCage })
      });
      if (res.ok) {
        setSuccessMsg(`Flock cage location updated to ${newCage}!`);
        triggerRefresh();
      } else {
        const resData = await res.json().catch(() => ({}));
        setErrorMsg(resData.error || 'Could not change the flock cage.');
      }
    } catch (err) {
      console.error('Failed to update flock cage:', err);
      setErrorMsg('Could not change the flock cage.');
    }
  };

  // Automatically update transferAgeWeeks when transferSourceFlockId or transferDate changes
  React.useEffect(() => {
    if (transferSourceFlockId) {
      const sel = (data.flocks || []).find(f => f.id === transferSourceFlockId);
      if (sel) {
        const computedAgeStr = formatFlockAge(sel.dateAdded, sel.initialAgeWeeks ?? 0, transferDate);
        setTransferAgeWeeks(computedAgeStr);
      }
    }
  }, [transferDate, transferSourceFlockId, data.flocks]);

  // Synthesized Live Cage Allocations combining active flocks and manual cage allocations
  const liveAllocations = React.useMemo(() => {
    const list: CageAllocation[] = [];
    const seenFlockNames = new Set<string>();

    (data.flocks || []).forEach(f => {
      if (f.quantity <= 0) return;

      const normName = f.name.trim().toLowerCase();
      const savedAllocation = (data.cage_allocations || []).find(a => a.id === `flock-${f.id}` || a.flockName === f.name);
      const rawNotes = (f.notes || '').trim();
      const cleanCageName = savedAllocation?.cageName || rawNotes.replace(/\s*\(.*\)/g, '').trim() || 'UNASSIGNED CAGE';
      const matchedCage = allFarmCages.find(c => c.cageName.toUpperCase() === cleanCageName.toUpperCase());
      const blockName = savedAllocation?.blockName || (matchedCage ? matchedCage.blockName : 'BLOCK 0');
      const computedAge = calculateCurrentAgeWeeks(f.dateAdded, f.initialAgeWeeks ?? 0);

      list.push({
        id: `flock-${f.id}`,
        blockName,
        cageName: cleanCageName,
        flockName: f.name,
        species: (f.species || 'Chicken') as any,
        quantity: f.quantity,
        ageWeeks: computedAge,
        initialAgeWeeks: f.initialAgeWeeks ?? 0,
        dateAdded: f.dateAdded,
        dateTransferred: f.dateAdded,
        countMode: f.countMode,
        cocksCount: f.cocksCount,
        hensCount: f.hensCount,
        speciesBreakdown: f.speciesBreakdown,
        notes: f.breed ? `Breed: ${f.breed}` : (rawNotes !== cleanCageName ? rawNotes : '')
      });
      seenFlockNames.add(normName);
    });

    for (const hutch of data.rabbit_hutches || []) {
      const occupants = (data.rabbits || []).filter(r => r.status === 'active' && r.hutchId === hutch.id);
      if (!occupants.length) continue;
      const cage = allFarmCages.find(c => c.id === hutch.cageId || c.id === hutch.id);
      list.push({ id: `rabbit-housing-${hutch.id}`, blockName: cage?.blockName || 'Rabbits', cageName: cage?.cageName || hutch.name, flockName: occupants.map(r => r.grouped ? 'Grouped bunny' : r.name || r.id).join(', '), species: 'Rabbit', quantity: occupants.length, ageWeeks: 0, dateAdded: occupants[0].birthDate || occupants[0].acquiredDate || getCameroonTodayISO(), dateTransferred: getCameroonTodayISO(), notes: 'Live rabbit housing; assign or move using the rabbit housing controls.' });
    }
    (data.cage_allocations || []).forEach(a => {
      // Deduplicate manual cage allocations if flockName is already represented by an active flock
      const normName = (a.flockName || '').trim().toLowerCase();
      if (normName && seenFlockNames.has(normName)) return;
      if (!list.some(existing => existing.id === a.id)) {
        list.push(a);
        if (normName) seenFlockNames.add(normName);
      }
    });

    return list;
  }, [data.flocks, data.cage_allocations, data.rabbits, data.rabbit_hutches, allFarmCages]);
  const correctionAllocation = liveAllocations.find(item => item.id === correctionAllocationId);
  const openCountCorrection = (allocation?: CageAllocation) => {
    setCorrectionAllocationId(allocation?.id || '');
    setCorrectionQuantity(allocation ? String(allocation.quantity) : '');
    setCorrectionReason('');
    setCorrectionModalOpen(true);
  };
  const saveCountCorrection = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!correctionAllocation) return;
    if (await farmAction.run('cage_count_correct', { allocationId: correctionAllocation.id, expectedQuantity: correctionAllocation.quantity, quantity: Number(correctionQuantity), reason: correctionReason, date: getCameroonTodayISO() })) {
      setCorrectionModalOpen(false);
      setCorrectionReason('');
    }
  };

  // Map of cage name (uppercase) -> array of allocations in that cage for multi-batch detection
  const cageOccupancyMap = React.useMemo(() => {
    const map = new Map<string, CageAllocation[]>();
    liveAllocations.forEach(a => {
      const cKey = (a.cageName || '').toUpperCase().trim();
      if (!cKey || cKey === 'UNASSIGNED CAGE') return;
      const existing = map.get(cKey) || [];
      existing.push(a);
      map.set(cKey, existing);
    });
    return map;
  }, [liveAllocations]);

  // Helper label for cage select options showing occupant batch count
  const getCageOptionLabel = (c: CageLocation) => {
    const cKey = (c.cageName || '').toUpperCase().trim();
    const occ = cageOccupancyMap.get(cKey) || [];
    if (occ.length === 0) {
      return `${c.blockName} — ${c.cageName} (Empty / Available)`;
    }
    if (occ.length === 1) {
      return `${c.blockName} — ${c.cageName} (${formatShortBatch(occ[0].flockName)} - ${occ[0].quantity} birds)`;
    }
    const totalBirds = occ.reduce((sum, b) => sum + (b.quantity || 0), 0);
    return `${c.blockName} — ${c.cageName} (${occ.length} batches - ${totalBirds} total birds)`;
  };

  // Render breakdown badge component
  const renderBreakdownBadge = (item: {
    quantity: number;
    countMode?: string;
    cocksCount?: number;
    hensCount?: number;
    speciesBreakdown?: Array<{ species: string; quantity: number }>;
    species?: string;
  }) => {
    const mode = item.countMode;
    const cocks = item.cocksCount || 0;
    const hens = item.hensCount || 0;
    const sb = item.speciesBreakdown || [];

    if (mode === 'sex_breakdown' || (cocks > 0 || hens > 0)) {
      return (
        <div className="flex flex-col gap-0.5">
          <span className="font-black text-slate-900 text-xs">{item.quantity} Fowls</span>
          <div className="flex flex-wrap gap-1">
            {cocks > 0 && (
              <span className="px-1.5 py-0.5 bg-blue-100 text-blue-900 rounded font-bold text-[10px] border border-blue-200">
                🐓 {cocks} Cock{cocks > 1 ? 's' : ''}
              </span>
            )}
            {hens > 0 && (
              <span className="px-1.5 py-0.5 bg-pink-100 text-pink-900 rounded font-bold text-[10px] border border-pink-200">
                🐔 {hens} Hen{hens > 1 ? 's' : ''}
              </span>
            )}
          </div>
        </div>
      );
    }

    if (mode === 'multi_species' || sb.length > 0) {
      return (
        <div className="flex flex-col gap-0.5">
          <span className="font-black text-slate-900 text-xs">{item.quantity} Total</span>
          <div className="flex flex-wrap gap-1">
            {sb.map((row, idx) => {
              const spLower = (row.species || '').toLowerCase();
              let icon = '🐔';
              let badgeStyle = 'bg-emerald-100 text-emerald-900 border-emerald-200';
              if (spLower.includes('turkey') || spLower.includes('poult')) {
                icon = '🦃';
                badgeStyle = 'bg-amber-100 text-amber-900 border-amber-200';
              } else if (spLower.includes('chick')) {
                icon = '🐥';
                badgeStyle = 'bg-yellow-100 text-yellow-900 border-yellow-200';
              } else if (spLower.includes('quail')) {
                icon = '🪶';
                badgeStyle = 'bg-blue-100 text-blue-900 border-blue-200';
              }
              return (
                <span key={idx} className={`px-1.5 py-0.5 rounded font-bold text-[10px] border ${badgeStyle}`}>
                  {icon} {row.quantity} {row.species}
                </span>
              );
            })}
          </div>
        </div>
      );
    }

    return (
      <span className="px-2.5 py-1 bg-emerald-50 text-emerald-800 font-black text-xs rounded-full border border-emerald-200/80">
        {item.quantity} {item.species === 'Turkey' ? 'Turkeys' : 'Fowls'}
      </span>
    );
  };

  // Live Cage Block Distribution filtering and sorting
  const filteredAndSortedAllocations = React.useMemo(() => {
    let list = [...liveAllocations];

    if (distBlockFilter !== 'ALL') {
      list = list.filter(a => a.blockName.toUpperCase() === distBlockFilter.toUpperCase());
    }

    if (distSearch.trim()) {
      const q = distSearch.toLowerCase();
      list = list.filter(a =>
        a.cageName.toLowerCase().includes(q) ||
        a.blockName.toLowerCase().includes(q) ||
        a.flockName.toLowerCase().includes(q) ||
        (a.notes || '').toLowerCase().includes(q) ||
        (a.species || '').toLowerCase().includes(q)
      );
    }

    if (distViewMode === 'shared') {
      list = list.filter(a => {
        const cKey = (a.cageName || '').toUpperCase().trim();
        const occ = cageOccupancyMap.get(cKey) || [];
        return occ.length >= 2;
      });
    }

    list.sort((a, b) => {
      if (distSortBy === 'qty_desc') return b.quantity - a.quantity;
      if (distSortBy === 'qty_asc') return a.quantity - b.quantity;
      if (distSortBy === 'block') return a.blockName.localeCompare(b.blockName);
      if (distSortBy === 'cage') return a.cageName.localeCompare(b.cageName);
      if (distSortBy === 'date') return new Date(b.dateTransferred).getTime() - new Date(a.dateTransferred).getTime();
      if (distSortBy === 'age') return b.ageWeeks - a.ageWeeks;
      return b.quantity - a.quantity;
    });

    return list;
  }, [liveAllocations, distBlockFilter, distSearch, distSortBy, distViewMode, cageOccupancyMap]);

  // Multi-Occupancy Cage Summary Grouping for cages housing multiple batches/species
  const groupedCageOccupancy = React.useMemo(() => {
    const summaryMap = new Map<string, {
      blockName: string;
      cageName: string;
      totalBirds: number;
      batches: CageAllocation[];
      speciesCounts: Record<string, number>;
    }>();

    filteredAndSortedAllocations.forEach(a => {
      const cKey = a.cageName.toUpperCase();
      const existing = summaryMap.get(cKey) || {
        blockName: a.blockName,
        cageName: a.cageName,
        totalBirds: 0,
        batches: [],
        speciesCounts: {}
      };

      existing.totalBirds += a.quantity;
      existing.batches.push(a);

      const sp = a.species || 'Chicken';
      existing.speciesCounts[sp] = (existing.speciesCounts[sp] || 0) + a.quantity;

      summaryMap.set(cKey, existing);
    });

    return Array.from(summaryMap.values());
  }, [filteredAndSortedAllocations]);

  // Transfer History filtering & sorting
  const [historySearch, setHistorySearch] = useState('');
  const [historySpeciesFilter, setHistorySpeciesFilter] = useState<'ALL' | 'Chicken' | 'Turkey'>('ALL');

  // Daily Egg Collection State & Handlers
  const [isEggCollFormOpen, setIsEggCollFormOpen] = useState(false);
  const [editingEggColl, setEditingEggColl] = useState<DailyEggCollection | null>(null);
  const [eggFormDate, setEggFormDate] = useState(getCameroonTodayISO());
  const [eggFormBrahma, setEggFormBrahma] = useState('');
  const [eggFormTurkey, setEggFormTurkey] = useState('');
  const [eggFormQuail, setEggFormQuail] = useState('');
  const [eggFormRecordedBy, setEggFormRecordedBy] = useState('');
  const [eggFormNotes, setEggFormNotes] = useState('');
  const [eggSearch, setEggSearch] = useState('');

  const handleSaveEggCollection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setLoading(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      const payload = {
        id: editingEggColl ? editingEggColl.id : undefined,
        date: eggFormDate || getCameroonTodayISO(),
        brahmaEggs: Math.max(0, Number(eggFormBrahma) || 0),
        turkeyEggs: Math.max(0, Number(eggFormTurkey) || 0),
        quailEggs: Math.max(0, Number(eggFormQuail) || 0),
        expected: editingEggColl ? { id: editingEggColl.id, brahmaEggs: editingEggColl.brahmaEggs || 0, turkeyEggs: editingEggColl.turkeyEggs || 0, quailEggs: editingEggColl.quailEggs || 0 } : null,
        recordedBy: eggFormRecordedBy || undefined,
        notes: eggFormNotes
      };

      const endpoint = editingEggColl
        ? `/api/daily_egg_collections/${editingEggColl.id}`
        : '/api/daily_egg_collections';
      const method = editingEggColl ? 'PUT' : 'POST';

      const res = await fetch(endpoint, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      const resData = await res.json();
      if (!res.ok) {
        throw new Error(resData.error || 'Failed to save egg collection log.');
      }

      setSuccessMsg(res.status === 202 ? `Egg collection for ${payload.date} saved on this phone. It will be shared when connected.` : `Egg collection for ${payload.date} shared with the family. Total: ${resData.record?.totalEggs ?? payload.brahmaEggs + payload.turkeyEggs + payload.quailEggs}.`);
      setEggFormBrahma('');
      setEggFormTurkey('');
      setEggFormQuail('');
      setEggFormNotes('');
      setEggFormRecordedBy('');
      setEditingEggColl(null);
      setIsEggCollFormOpen(false);
      triggerRefresh();
    } catch (err: any) {
      setErrorMsg(err.message || 'Error saving egg collection log.');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteEggCollection = (id: string) => {
    if (!token) return;
    confirmDelete(
      'Delete Egg Collection Record',
      'Are you sure you want to delete this daily egg collection log? This action cannot be undone.',
      async () => {
        try {
          const res = await fetch(`/api/daily_egg_collections/${id}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${token}` }
          });
          if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed to delete egg collection log.');
          setSuccessMsg('Egg collection log deleted successfully.');
          triggerRefresh();
        } catch (err: any) {
          setErrorMsg(err.message || 'Error deleting egg collection record');
        }
      }
    );
  };

  const startEditEggCollection = (rec: DailyEggCollection) => {
    setEditingEggColl(rec);
    setEggFormDate(rec.date);
    setEggFormBrahma(String(rec.brahmaEggs));
    setEggFormTurkey(String(rec.turkeyEggs));
    setEggFormQuail(String(rec.quailEggs || 0));
    setEggFormRecordedBy(rec.recordedBy || '');
    setEggFormNotes(rec.notes || '');
    setIsEggCollFormOpen(true);
  };

  // Filtered Daily Egg Collections
  const sortedEggCollections = React.useMemo(() => {
    let list = [...(data.daily_egg_collections || [])];
    if (eggSearch.trim()) {
      const q = eggSearch.toLowerCase();
      list = list.filter(e =>
        e.date.includes(q) ||
        (e.recordedBy || '').toLowerCase().includes(q) ||
        (e.notes || '').toLowerCase().includes(q)
      );
    }
    return list.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [data.daily_egg_collections, eggSearch]);

  const sortedTransferHistory = React.useMemo(() => {
    let list = [...(data.cage_transfers || [])];

    if (historySpeciesFilter !== 'ALL') {
      list = list.filter(t => t.species === historySpeciesFilter);
    }

    if (historySearch.trim()) {
      const q = historySearch.toLowerCase();
      list = list.filter(t =>
        (t.flockName || '').toLowerCase().includes(q) ||
        (t.fromCage || '').toLowerCase().includes(q) ||
        (t.toCage || '').toLowerCase().includes(q) ||
        (t.notes || '').toLowerCase().includes(q) ||
        (t.date || '').includes(q)
      );
    }

    // Sort chronologically descending (newest transfer first)
    list.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    return list;
  }, [data.cage_transfers, historySearch, historySpeciesFilter]);

  // Dynamic Cage Inventory Grouping
  const cageInventory = React.useMemo(() => {
    const map = new Map<string, {
      cageName: string;
      totalFowls: number;
      chickens: number;
      turkeys: number;
      gobblers: number;
      hens: number;
      flocksCount: number;
      flocks: Flock[];
    }>();

    (data.flocks || []).forEach(f => {
      if (f.quantity <= 0) return;
      const cage = (f.notes || '').trim() || 'Unassigned Cage';
      const isTurkey = f.species === 'Turkey';
      const existing = map.get(cage) || {
        cageName: cage,
        totalFowls: 0,
        chickens: 0,
        turkeys: 0,
        gobblers: 0,
        hens: 0,
        flocksCount: 0,
        flocks: []
      };

      existing.totalFowls += f.quantity;
      if (isTurkey) {
        existing.turkeys += f.quantity;
        if (f.breed === 'Hen') existing.hens += f.quantity;
        else existing.gobblers += f.quantity;
      } else {
        existing.chickens += f.quantity;
      }

      existing.flocksCount += 1;
      existing.flocks.push(f);
      map.set(cage, existing);
    });

    return Array.from(map.values()).map(c => {
      const totalAge = c.flocks.reduce((acc, f) => acc + (f.ageWeeks * f.quantity), 0);
      return {
        ...c,
        avgAgeWeeks: c.totalFowls > 0 ? (totalAge / c.totalFowls) : 0
      };
    });
  }, [data.flocks]);

  // Feed
  const [feedDate, setFeedDate] = useState(getCameroonTodayISO());
  const [feedType, setFeedType] = useState('Starter');
  const [feedSpecies, setFeedSpecies] = useState<'Poultry' | 'Rabbit' | 'Quail'>('Poultry');
  const [feedBags, setFeedBags] = useState('');
  const [feedWeight, setFeedWeight] = useState('50'); // standard kg bag
  const [feedCostBag, setFeedCostBag] = useState('');
  const [feedRemaining, setFeedRemaining] = useState('');

  // Sales
  const [saleDate, setSaleDate] = useState(getCameroonTodayISO());
  const [saleItem, setSaleItem] = useState<PoultrySale['itemType']>('Fowl');
  const [saleQty, setSaleQty] = useState('');
  const [salePrice, setSalePrice] = useState('');
  const [saleBuyer, setSaleBuyer] = useState('');
  const [saleFlockId, setSaleFlockId] = useState('');
  const [saleAgeWeeks, setSaleAgeWeeks] = useState('');
  const [saleNotes, setSaleNotes] = useState('');

  // Mortality
  const [mortDate, setMortDate] = useState(getCameroonTodayISO());
  const [mortFlockId, setMortFlockId] = useState('');
  const [mortQty, setMortQty] = useState('');
  const [mortCause, setMortCause] = useState('');

  // Expenses
  const [expDate, setExpDate] = useState(getCameroonTodayISO());
  const [expCat, setExpCategory] = useState<'Vaccine' | 'Transport' | 'Labor' | 'Electricity' | 'Repair' | 'Other'>('Vaccine');
  const [expDesc, setExpDesc] = useState('');
  const [expAmount, setExpAmount] = useState('');

  // Fowls Eaten at Home (House Consumption)
  const [eatenDate, setEatenDate] = useState(getCameroonTodayISO());
  const [eatenFlockId, setEatenFlockId] = useState('');
  const [eatenQty, setEatenQty] = useState('');
  const [eatenAgeWeeks, setEatenAgeWeeks] = useState('');
  const [eatenNotes, setEatenNotes] = useState('');
  const [eatenSearch, setEatenSearch] = useState('');

  // Auto-Save Drafts for Sales, Expenses, Feed, Mortality & Fowls Eaten forms
  const saleFormValues = React.useMemo(() => ({
    saleDate, saleItem, saleQty, salePrice, saleBuyer, saleFlockId, saleAgeWeeks, saleNotes
  }), [saleDate, saleItem, saleQty, salePrice, saleBuyer, saleFlockId, saleAgeWeeks, saleNotes]);

  const { hasRestoredDraft: hasSaleDraft, clearDraft: clearSaleDraft } = useFormAutoSave(
    'nvf_draft_sales',
    saleFormValues,
    (draft) => {
      if (draft.saleDate !== undefined) setSaleDate(draft.saleDate);
      if (draft.saleItem !== undefined) setSaleItem(draft.saleItem);
      if (draft.saleQty !== undefined) setSaleQty(draft.saleQty);
      if (draft.salePrice !== undefined) setSalePrice(draft.salePrice);
      if (draft.saleBuyer !== undefined) setSaleBuyer(draft.saleBuyer);
      if (draft.saleFlockId !== undefined) setSaleFlockId(draft.saleFlockId);
      if (draft.saleAgeWeeks !== undefined) setSaleAgeWeeks(draft.saleAgeWeeks);
      if (draft.saleNotes !== undefined) setSaleNotes(draft.saleNotes);
    }
  );

  const expFormValues = React.useMemo(() => ({
    expDate, expCat, expDesc, expAmount
  }), [expDate, expCat, expDesc, expAmount]);

  const { hasRestoredDraft: hasExpDraft, clearDraft: clearExpDraft } = useFormAutoSave(
    'nvf_draft_expenses',
    expFormValues,
    (draft) => {
      if (draft.expDate !== undefined) setExpDate(draft.expDate);
      if (draft.expCat !== undefined) setExpCategory(draft.expCat);
      if (draft.expDesc !== undefined) setExpDesc(draft.expDesc);
      if (draft.expAmount !== undefined) setExpAmount(draft.expAmount);
    }
  );

  const feedFormValues = React.useMemo(() => ({
    feedDate, feedType, feedSpecies, feedBags, feedWeight, feedCostBag, feedRemaining
  }), [feedDate, feedType, feedSpecies, feedBags, feedWeight, feedCostBag, feedRemaining]);

  const { hasRestoredDraft: hasFeedDraft, clearDraft: clearFeedDraft } = useFormAutoSave(
    'nvf_draft_feed',
    feedFormValues,
    (draft) => {
      if (draft.feedDate !== undefined) setFeedDate(draft.feedDate);
      if (draft.feedType !== undefined) setFeedType(draft.feedType);
      if (draft.feedSpecies !== undefined) setFeedSpecies(draft.feedSpecies);
      if (draft.feedBags !== undefined) setFeedBags(draft.feedBags);
      if (draft.feedWeight !== undefined) setFeedWeight(draft.feedWeight);
      if (draft.feedCostBag !== undefined) setFeedCostBag(draft.feedCostBag);
      if (draft.feedRemaining !== undefined) setFeedRemaining(draft.feedRemaining);
    }
  );

  const mortFormValues = React.useMemo(() => ({
    mortDate, mortFlockId, mortQty, mortCause
  }), [mortDate, mortFlockId, mortQty, mortCause]);

  const { hasRestoredDraft: hasMortDraft, clearDraft: clearMortDraft } = useFormAutoSave(
    'nvf_draft_mortality',
    mortFormValues,
    (draft) => {
      if (draft.mortDate !== undefined) setMortDate(draft.mortDate);
      if (draft.mortFlockId !== undefined) setMortFlockId(draft.mortFlockId);
      if (draft.mortQty !== undefined) setMortQty(draft.mortQty);
      if (draft.mortCause !== undefined) setMortCause(draft.mortCause);
    }
  );

  const eatenFormValues = React.useMemo(() => ({
    eatenDate, eatenFlockId, eatenQty, eatenAgeWeeks, eatenNotes
  }), [eatenDate, eatenFlockId, eatenQty, eatenAgeWeeks, eatenNotes]);

  const { hasRestoredDraft: hasEatenDraft, clearDraft: clearEatenDraft } = useFormAutoSave(
    'nvf_draft_fowls_eaten',
    eatenFormValues,
    (draft) => {
      if (draft.eatenDate !== undefined) setEatenDate(draft.eatenDate);
      if (draft.eatenFlockId !== undefined) setEatenFlockId(draft.eatenFlockId);
      if (draft.eatenQty !== undefined) setEatenQty(draft.eatenQty);
      if (draft.eatenAgeWeeks !== undefined) setEatenAgeWeeks(draft.eatenAgeWeeks);
      if (draft.eatenNotes !== undefined) setEatenNotes(draft.eatenNotes);
    }
  );

  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  useEffect(() => {
    if (!successMsg) return;
    const timer = setTimeout(() => setSuccessMsg(''), 6000);
    return () => clearTimeout(timer);
  }, [successMsg]);
  const [loading, setLoading] = useState(false);

  // Common submission utility
  const submitRecord = async (endpoint: string, payload: any): Promise<boolean> => {
    setErrorMsg('');
    setSuccessMsg('');
    setLoading(true);

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': token
        },
        body: JSON.stringify(payload)
      });
      const resData = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(resData.error || 'Failed to submit operation record.');
      }
      setSuccessMsg(res.status === 202 ? 'Saved on this phone. It will sync when connected.' : 'Record added successfully!');
      triggerRefresh();
      // Collapse table
      setActiveFormSection(null);
      return true;
    } catch (err: any) {
      setErrorMsg(err.message || 'Server error. Please review fields.');
      return false;
    } finally {
      setLoading(false);
    }
  };

  // Handlers
  const handleAddFlock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!flockName) {
      setErrorMsg('Please specify a flock batch name.');
      return;
    }

    let finalQty = Number(flockQty) || 0;
    let cocksCount: number | undefined = undefined;
    let hensCount: number | undefined = undefined;
    let speciesBreakdown: Array<{ species: string; quantity: number }> | undefined = undefined;

    if (flockCountMode === 'sex_breakdown') {
      cocksCount = Math.max(0, Number(flockCocksCount) || 0);
      hensCount = Math.max(0, Number(flockHensCount) || 0);
      finalQty = cocksCount + hensCount;
      if (finalQty <= 0) {
        setErrorMsg('Please enter valid count for Cocks and/or Hens.');
        return;
      }
    } else if (flockCountMode === 'multi_species') {
      speciesBreakdown = flockSpeciesBreakdown
        .map(sb => ({ species: sb.species.trim() || 'Fowl', quantity: Math.max(0, Number(sb.quantity) || 0) }))
        .filter(sb => sb.quantity > 0);
      finalQty = speciesBreakdown.reduce((acc, sb) => acc + sb.quantity, 0);
      if (finalQty <= 0) {
        setErrorMsg('Please enter valid quantities for at least one species.');
        return;
      }
    } else {
      if (finalQty <= 0 || isNaN(finalQty)) {
        setErrorMsg('Quantity must be a positive number.');
        return;
      }
    }

    if (Number(flockAge) < 0 || isNaN(Number(flockAge))) {
      setErrorMsg('Age in weeks cannot be negative.');
      return;
    }

    const finalBreed = flockSpecies === 'Turkey' ? turkeyType : (flockBreed || 'Brahma');
    if (!await submitRecord('/api/flocks', {
      name: flockName,
      breed: finalBreed,
      quantity: finalQty,
      ageWeeks: Number(flockAge) || 0,
      dateAdded: flockDate,
      species: flockSpecies,
      countMode: flockCountMode,
      cocksCount,
      hensCount,
      speciesBreakdown,
      notes: flockNotes
    })) return;

    // Reset Form
    setFlockName('');
    setFlockQty('');
    setFlockAge('');
    setFlockNotes('');
    setFlockBreed('Brahma');
    setFlockSpecies('Chicken');
    setTurkeyType('Gobbler');
    setFlockCountMode('single');
    setFlockCocksCount('0');
    setFlockHensCount('0');
    setFlockSpeciesBreakdown([
      { species: 'Turkey', quantity: '7' },
      { species: 'Chicks', quantity: '2' }
    ]);
  };

  const handleSaveFlockEdits = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingFlock) return;
    setErrorMsg('');
    setSuccessMsg('');

    let finalQty = Number(editFlockQty) || 0;
    let cocksCount: number | undefined = undefined;
    let hensCount: number | undefined = undefined;
    let speciesBreakdown: Array<{ species: string; quantity: number }> | undefined = undefined;

    if (editFlockCountMode === 'sex_breakdown') {
      cocksCount = Math.max(0, Number(editFlockCocksCount) || 0);
      hensCount = Math.max(0, Number(editFlockHensCount) || 0);
      finalQty = cocksCount + hensCount;
      if (finalQty <= 0) {
        setErrorMsg('Please enter valid count for Cocks and/or Hens.');
        return;
      }
    } else if (editFlockCountMode === 'multi_species') {
      speciesBreakdown = editFlockSpeciesBreakdown
        .map(sb => ({ species: sb.species.trim() || 'Fowl', quantity: Math.max(0, Number(sb.quantity) || 0) }))
        .filter(sb => sb.quantity > 0);
      finalQty = speciesBreakdown.reduce((acc, sb) => acc + sb.quantity, 0);
      if (finalQty <= 0) {
        setErrorMsg('Please enter valid quantities for at least one species.');
        return;
      }
    } else {
      if (finalQty <= 0 || isNaN(finalQty)) {
        setErrorMsg('Quantity must be a positive number.');
        return;
      }
    }

    if (Number(editFlockAge) < 0 || isNaN(Number(editFlockAge))) {
      setErrorMsg('Age in weeks cannot be negative.');
      return;
    }

    setLoading(true);
    try {
      const finalBreed = editFlockSpecies === 'Turkey' ? editTurkeyType : (editFlockBreed || 'Chicken');
      const res = await fetch(`/api/flocks/${editingFlock.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': token
        },
        body: JSON.stringify({
          name: editFlockName,
          breed: finalBreed,
          quantity: finalQty,
          ageWeeks: Number(editFlockAge) || 0,
          dateAdded: editFlockDate,
          species: editFlockSpecies,
          countMode: editFlockCountMode,
          cocksCount,
          hensCount,
          speciesBreakdown,
          notes: editFlockNotes
        })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to update flock.');
      }
      setSuccessMsg(`Flock '${editFlockName}' updated successfully!`);
      setEditingFlock(null);
      triggerRefresh();
    } catch (err: any) {
      setErrorMsg(err.message || 'Error occurred updating flock.');
    } finally {
      setLoading(false);
    }
  };

  const handleExecuteTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    if (!transferFromCage.trim()) {
      setErrorMsg('Please select or enter the FROM cage.');
      return;
    }
    if (!transferToCage.trim()) {
      setErrorMsg('Please select or enter the TO cage.');
      return;
    }
    if (transferFromCage.trim().toLowerCase() === transferToCage.trim().toLowerCase()) {
      setErrorMsg('Source cage and destination cage cannot be the same cage.');
      return;
    }
    if (!transferQty || Number(transferQty) <= 0 || isNaN(Number(transferQty))) {
      setErrorMsg('Please specify a valid positive quantity of fowls to transfer.');
      return;
    }

    const selFlock = transferSourceFlockId 
      ? (data.flocks || []).find(f => f.id === transferSourceFlockId)
      : undefined;

    const numericAgeWeeks = parseNumericAgeWeeks(
      transferAgeWeeks,
      selFlock?.dateAdded,
      selFlock?.initialAgeWeeks,
      transferDate
    );

    if (numericAgeWeeks < 0 || isNaN(numericAgeWeeks)) {
      setErrorMsg('Bird age cannot be negative.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/cage_transfers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': token
        },
        body: JSON.stringify({
          species: transferSpecies,
          flockName: transferFlockName || 'Flock Batch',
          fromCage: transferFromCage.trim(),
          toCage: transferToCage.trim(),
          quantity: Number(transferQty),
          date: transferDate,
          notes: transferNotes,
          ageWeeks: numericAgeWeeks,
          flockId: transferSourceFlockId || undefined
        })
      });

      const resData = await res.json();
      if (!res.ok) {
        throw new Error(resData.error || 'Failed to execute cage transfer.');
      }

      setSuccessMsg(`Transfer of ${transferQty} fowls from ${transferFromCage} to ${transferToCage} completed! Live cage distribution updated instantly.`);
      triggerRefresh();
      setActiveFormSection(null);
      setTransferFromCage('');
      setTransferToCage('');
      setTransferQty('');
      setTransferNotes('');
      setTransferFlockName('');
    } catch (err: any) {
      setErrorMsg(err.message || 'Error executing transfer.');
    } finally {
      setLoading(false);
    }
  };

  const handleAddCageSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBlockName.trim() || !newCageName.trim()) {
      setErrorMsg('Block location and Cage name are required.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/cages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': token
        },
        body: JSON.stringify({
          blockName: newBlockName.trim().toUpperCase(),
          cageName: newCageName.trim().toUpperCase()
        })
      });

      const resData = await res.json();
      if (!res.ok) {
        throw new Error(resData.error || 'Failed to add cage.');
      }

      setSuccessMsg(`Cage '${newCageName.trim().toUpperCase()}' added to ${newBlockName.trim().toUpperCase()} instantly!`);
      triggerRefresh();
      setNewCageName('');
      setIsAddCageOpen(false);
    } catch (err: any) {
      setErrorMsg(err.message || 'Error creating cage.');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteCage = (cageIdOrName: string, cageName: string) => {
    confirmDelete(
      'Delete Registered Cage',
      `Are you sure you want to delete registered cage '${cageName}'? This will remove it from the farm registry.`,
      async () => {
        setLoading(true);
        setErrorMsg('');
        setSuccessMsg('');
        try {
          const res = await fetch(`/api/cages/${encodeURIComponent(cageIdOrName)}`, {
            method: 'DELETE',
            headers: { 'Authorization': token }
          });
          const resData = await res.json().catch(() => ({}));
          if (res.ok) {
            setSuccessMsg(resData.archived ? `Cage '${cageName}' removed. Its past rabbit records are kept.` : `Cage '${cageName}' deleted successfully.`);
            triggerRefresh();
          } else {
            setErrorMsg(resData.error || 'Failed to delete registered cage.');
          }
        } catch (err: any) {
          setErrorMsg('Error deleting registered cage.');
        } finally {
          setLoading(false);
        }
      },
      'Delete Registered Cage'
    );
  };

  const handleBulkEditFlocksSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedFlockIds.length === 0) return;

    setLoading(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      const res = await fetch('/api/flocks-bulk', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': token
        },
        body: JSON.stringify({
          ids: selectedFlockIds,
          updates: {
            species: bulkEditForm.species || undefined,
            breed: bulkEditForm.breed || undefined,
            ageWeeks: bulkEditForm.ageWeeks !== '' ? bulkEditForm.ageWeeks : undefined,
            dateAdded: bulkEditForm.dateAdded || undefined,
            notes: bulkEditForm.notes !== '' ? bulkEditForm.notes : undefined,
            quantity: bulkEditForm.quantity !== '' ? bulkEditForm.quantity : undefined
          }
        })
      });

      const resData = await res.json();
      if (!res.ok) {
        throw new Error(resData.error || 'Failed to bulk edit flock batches.');
      }

      setSuccessMsg(`Successfully updated ${resData.updatedCount || selectedFlockIds.length} flock batch(es) in bulk!`);
      setIsBulkEditFlocksOpen(false);
      setSelectedFlockIds([]);
      setBulkEditForm({ species: '', breed: '', ageWeeks: '', dateAdded: '', notes: '', quantity: '' });
      triggerRefresh();
    } catch (err: any) {
      setErrorMsg(err.message || 'Error updating flock batches in bulk.');
    } finally {
      setLoading(false);
    }
  };

  const handleAddAllocSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addAllocForm.cageName || !addAllocForm.flockName || !addAllocForm.quantity) {
      setErrorMsg('Cage name, flock name, and quantity are required.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/cage_allocations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': token
        },
        body: JSON.stringify({
          ...addAllocForm,
          quantity: Number(addAllocForm.quantity),
          ageWeeks: Number(addAllocForm.ageWeeks) || 0
        })
      });

      const resData = await res.json();
      if (!res.ok) {
        throw new Error(resData.error || 'Failed to add allocation record.');
      }

      setSuccessMsg('Live cage block allocation row added!');
      triggerRefresh();
      setIsAddAllocOpen(false);
      setAddAllocForm({
        blockName: 'BLOCK 0',
        cageName: '',
        flockName: '',
        species: 'Chicken',
        quantity: '',
        ageWeeks: '0',
        dateAdded: getCameroonTodayISO(),
        dateTransferred: getCameroonTodayISO(),
        notes: ''
      });
    } catch (err: any) {
      setErrorMsg(err.message || 'Error adding allocation row.');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveAllocEdits = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingAlloc) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/cage_allocations/${editingAlloc.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': token
        },
        body: JSON.stringify(editAllocForm)
      });
      const resData = await res.json();
      if (!res.ok) {
        throw new Error(resData.error || 'Failed to update cage allocation.');
      }
      setSuccessMsg('Live cage distribution record updated successfully!');
      setEditingAlloc(null);
      triggerRefresh();
    } catch (err: any) {
      setErrorMsg(err.message || 'Error saving allocation changes.');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteAlloc = (id: string, name?: string) => {
    confirmDelete(
      'Delete Live Cage Allocation',
      `Are you sure you want to delete this live cage distribution row${name ? ` (${name})` : ''}?`,
      async () => {
        setLoading(true);
        try {
          const res = await fetch(`/api/cage_allocations/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': token }
          });
          if (res.ok) {
            setSuccessMsg('Cage distribution row deleted.');
            triggerRefresh();
          } else {
            const error = await res.json();
            setErrorMsg(error.error || 'Failed to delete allocation row.');
          }
        } catch (err: any) {
          setErrorMsg('Failed to delete allocation record.');
        } finally {
          setLoading(false);
        }
      },
      'Delete Allocation'
    );
  };

  const handleDeleteTransfer = (id: string) => {
    confirmDelete(
      'Delete Transfer Log Entry',
      'Are you sure you want to remove this transfer record?',
      async () => {
        setLoading(true);
        try {
          const res = await fetch(`/api/cage_transfers/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': token }
          });
          if (res.ok) {
            setSuccessMsg('Transfer log entry removed.');
            triggerRefresh();
          } else {
            const error = await res.json();
            setErrorMsg(error.error || 'Failed to delete transfer record.');
          }
        } catch (err: any) {
          setErrorMsg('Failed to delete transfer record.');
        } finally {
          setLoading(false);
        }
      },
      'Delete Transfer Log'
    );
  };

  const handleAddFeed = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!feedBags || !feedCostBag || !feedRemaining) {
      setErrorMsg('Please complete all required fields.');
      return;
    }
    if (Number(feedBags) < 0 || Number(feedWeight) < 0 || Number(feedCostBag) < 0 || Number(feedRemaining) < 0 || isNaN(Number(feedBags)) || isNaN(Number(feedCostBag))) {
      setErrorMsg('Feed amounts, weights, costs, and stock numbers cannot be negative or invalid.');
      return;
    }
    if (!await submitRecord('/api/feed', {
      date: feedDate,
      feedType: feedType,
      species: feedSpecies,
      bagsBought: Number(feedBags),
      weightPerBag: Number(feedWeight),
      costBag: Number(feedCostBag),
      stockRemaining: Number(feedRemaining)
    })) return;
    clearFeedDraft();
    setFeedBags('');
    setFeedCostBag('');
    setFeedRemaining('');
  };

  const handleAddSale = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!saleQty || !salePrice || !saleBuyer) {
      setErrorMsg('Please supply buyer details and numbers.');
      return;
    }
    if (Number(saleQty) <= 0 || isNaN(Number(saleQty))) {
      setErrorMsg('Sale quantity must be a positive number.');
      return;
    }
    if (Number(salePrice) < 0 || isNaN(Number(salePrice))) {
      setErrorMsg('Unit price cannot be negative.');
      return;
    }
    if (saleAgeWeeks && (Number(saleAgeWeeks) < 0 || isNaN(Number(saleAgeWeeks)))) {
      setErrorMsg('Age in weeks cannot be negative.');
      return;
    }
    if (saleItem === 'Rabbit' || saleItem.startsWith('Quail')) {
      try {
        const amount = Number(saleQty) * Number(salePrice);
        const kind = saleItem === 'Rabbit' ? 'rabbit_sale' : saleItem === 'Quail Egg' ? 'quail_egg_use' : 'quail_live_sale';
        const payload = saleItem === 'Rabbit'
          ? { date: saleDate, rabbitIds: selectedRabbitIds(rawData, saleFlockId, Number(saleQty)), buyerName: saleBuyer, totalAmount: amount }
          : { date: saleDate, flockId: saleFlockId, quantity: Number(saleQty), amount, buyerName: saleBuyer, isChick: saleItem === 'Quail Chick', useKind: 'sold', notes: saleNotes };
        if (!await farmAction.run(kind, payload)) return;
      } catch (error) { setErrorMsg(error instanceof Error ? error.message : 'Choose available stock.'); return; }
    } else if (!await submitRecord('/api/sales', {
      date: saleDate,
      itemType: saleItem,
      quantity: Number(saleQty),
      unitPrice: Number(salePrice),
      buyerName: saleBuyer,
      flockId: saleFlockId,
      ageWeeks: saleAgeWeeks,
      notes: saleNotes
    })) return;
    clearSaleDraft();
    setSaleQty('');
    setSalePrice('');
    setSaleBuyer('');
    setSaleFlockId('');
    setSaleAgeWeeks('');
    setSaleNotes('');
  };

  const handleAddMortality = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mortFlockId || !mortQty) {
      setErrorMsg('Select flock and count of casualties.');
      return;
    }
    if (Number(mortQty) <= 0 || isNaN(Number(mortQty))) {
      setErrorMsg('Mortality casualty count must be a positive number.');
      return;
    }
    if (mortFlockId.startsWith('rabbit:') || mortFlockId.startsWith('litter:') || isQuailFlock(mortFlockId)) {
      try {
        const rabbit = !isQuailFlock(mortFlockId);
        if (!await farmAction.run(rabbit ? 'rabbit_loss' : 'quail_loss', { date: mortDate, ...(rabbit ? { rabbitIds: selectedRabbitIds(rawData, mortFlockId, Number(mortQty)) } : { flockId: mortFlockId, quantity: Number(mortQty) }), cause: mortCause })) return;
      } catch (error) { setErrorMsg(error instanceof Error ? error.message : 'Choose available stock.'); return; }
    } else if (!await submitRecord('/api/mortality', {
      date: mortDate,
      flockId: mortFlockId,
      quantity: Number(mortQty),
      cause: mortCause
    })) return;
    clearMortDraft();
    setMortFlockId('');
    setMortQty('');
    setMortCause('');
  };

  const handleAddExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!expDesc || !expAmount) {
      setErrorMsg('Describe expense category and enter bill.');
      return;
    }
    if (Number(expAmount) < 0 || isNaN(Number(expAmount))) {
      setErrorMsg('Expense bill amount cannot be negative.');
      return;
    }
    if (!await submitRecord('/api/expenses', {
      date: expDate,
      category: expCat,
      description: expDesc,
      amount: Number(expAmount)
    })) return;
    clearExpDraft();
    setExpDesc('');
    setExpAmount('');
  };

  const handleAddFowlEaten = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!eatenFlockId || !eatenQty) {
      setErrorMsg('Please select a flock batch and enter quantity eaten.');
      return;
    }
    const qtyNum = Number(eatenQty);
    if (isNaN(qtyNum) || qtyNum <= 0) {
      setErrorMsg('Quantity eaten must be a valid positive number.');
      return;
    }

    if (eatenFlockId.startsWith('rabbit:') || eatenFlockId.startsWith('litter:') || isQuailFlock(eatenFlockId)) {
      try {
        const rabbit = !isQuailFlock(eatenFlockId);
        if (!await farmAction.run(rabbit ? 'rabbit_eaten' : 'quail_eaten', { date: eatenDate, ...(rabbit ? { rabbitIds: selectedRabbitIds(rawData, eatenFlockId, qtyNum) } : { flockId: eatenFlockId, quantity: qtyNum }), notes: eatenNotes })) return;
        clearEatenDraft(); setEatenFlockId(''); setEatenQty(''); setEatenNotes(''); setEatenAgeWeeks('');
        return;
      } catch (error) { setErrorMsg(error instanceof Error ? error.message : 'Choose available stock.'); return; }
    }

    const selectedFlock = (data.flocks || []).find(f => f.id === eatenFlockId);
    if (!selectedFlock) {
      setErrorMsg('Selected flock batch does not exist.');
      return;
    }

    if (qtyNum > selectedFlock.quantity) {
      setErrorMsg(`Cannot record ${qtyNum} eaten. Selected flock "${selectedFlock.name}" only has ${selectedFlock.quantity} birds remaining.`);
      return;
    }

    if (eatenAgeWeeks && (isNaN(Number(eatenAgeWeeks)) || Number(eatenAgeWeeks) < 0)) {
      setErrorMsg('Age in weeks cannot be negative.');
      return;
    }

    if (!await submitRecord('/api/fowls-eaten', {
      date: eatenDate,
      flockId: eatenFlockId,
      quantity: qtyNum,
      ageWeeks: eatenAgeWeeks ? Number(eatenAgeWeeks) : selectedFlock.ageWeeks,
      notes: eatenNotes
    })) return;

    clearEatenDraft();
    setEatenFlockId('');
    setEatenQty('');
    setEatenNotes('');
    setEatenAgeWeeks('');
  };

  // Deletion helper
  const handleDeleteRow = (endpoint: string, id: string, name?: string) => {
    const linked = endpoint === '/api/sales' ? data.poultry_sales.find(r => r.id === id)?.stockAction : endpoint === '/api/mortality' ? data.mortality.find(r => r.id === id)?.stockAction : endpoint === '/api/fowls-eaten' ? data.fowls_eaten.find(r => r.id === id)?.stockAction : undefined;
    confirmDelete(
      linked ? 'Reverse entry and restore stock' : 'Delete Record Permanently',
      linked ? 'Reverse this entry? The animals or eggs will return to available stock and the original entry will remain in history.' : `Are you sure you want to delete ${name ? `'${name}'` : 'this record'}? This action cannot be undone.`,
      async () => {
        setLoading(true);
        try {
          const reversed = await reverseFarmRecord(endpoint, id);
          if (reversed !== undefined) {
            if (reversed) setSuccessMsg('Record reversed and live stock restored.');
            return;
          }
          const res = await fetch(`${endpoint}/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': token }
          });
          if (res.ok) {
            setSuccessMsg('Record deleted successfully.');
            triggerRefresh();
          } else {
            const error = await res.json().catch(() => ({}));
            setErrorMsg(error.error || 'Failed to remove record.');
            if (res.status === 404) triggerRefresh(); // e.g. already deleted on another phone: refresh the list
          }
        } catch (e: any) {
          setErrorMsg('Error deleting record.');
        } finally {
          setLoading(false);
        }
      },
      linked ? 'Reverse record' : 'Delete Record'
    );
  };

  // State selection hooks for bulk modes
  const [selectedFlockIds, setSelectedFlockIds] = useState<string[]>([]);
  const [selectedFeedIds, setSelectedFeedIds] = useState<string[]>([]);
  const [selectedSaleIds, setSelectedSaleIds] = useState<string[]>([]);
  const [selectedMortalityIds, setSelectedMortalityIds] = useState<string[]>([]);
  const [selectedExpenseIds, setSelectedExpenseIds] = useState<string[]>([]);
  const [selectedEatenIds, setSelectedEatenIds] = useState<string[]>([]);

  // Bulk deletion utility for poultry
  const handleBulkDeletePoultry = (type: 'flocks' | 'feed' | 'sales' | 'mortality' | 'expenses' | 'fowls_eaten', ids: string[]) => {
    if (ids.length === 0) return;
    confirmDelete(
      `Bulk Delete Selected ${type.toUpperCase()}`,
      `Are you sure you want to permanently delete these ${ids.length} selected record(s)? This action is irreversible.`,
      async () => {
        setLoading(true);
        setErrorMsg('');
        setSuccessMsg('');
        try {
          const sharedEndpoint = type === 'sales' ? '/api/sales' : type === 'mortality' ? '/api/mortality' : type === 'fowls_eaten' ? '/api/fowls-eaten' : '';
          const ordinaryIds: string[] = [];
          for (const id of ids) {
            const reversed = sharedEndpoint ? await reverseFarmRecord(sharedEndpoint, id) : undefined;
            if (reversed === false) throw new Error('A selected stock record could not be reversed. Earlier successful reversals are saved; refresh and review.');
            if (reversed === undefined) ordinaryIds.push(id);
          }
          if (!ordinaryIds.length) {
            setSelectedSaleIds([]); setSelectedMortalityIds([]); setSelectedEatenIds([]);
            setSuccessMsg('Selected records reversed and stock restored.'); triggerRefresh(); return;
          }
          const res = await fetch('/api/bulk-delete', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': token
            },
            body: JSON.stringify({ type, ids: ordinaryIds })
          });
          const resData = await res.json();
          if (res.ok) {
            // Clear appropriate states
            if (type === 'flocks') setSelectedFlockIds([]);
            else if (type === 'feed') setSelectedFeedIds([]);
            else if (type === 'sales') setSelectedSaleIds([]);
            else if (type === 'mortality') setSelectedMortalityIds([]);
            else if (type === 'expenses') setSelectedExpenseIds([]);
            else if (type === 'fowls_eaten') setSelectedEatenIds([]);

            // Flocks: the server says how many it deleted and which were already gone.
            const missing = Array.isArray(resData.notFoundIds) ? resData.notFoundIds.length : 0;
            setSuccessMsg(missing
              ? `Deleted ${resData.deletedCount} flock${resData.deletedCount === 1 ? '' : 's'}. ${missing} ${missing === 1 ? 'was' : 'were'} not found (maybe already deleted).`
              : `Successfully deleted ${resData.count || ids.length} records.`);
            triggerRefresh();
          } else {
            if (res.status === 404) triggerRefresh(); // the list on screen is out of date
            throw new Error(resData.error || 'Failed to execute bulk delete.');
          }
        } catch (err: any) {
          setErrorMsg(err.message || 'Error occurred during bulk delete.');
        } finally {
          setLoading(false);
        }
      },
      `Delete ${ids.length} Selected Record(s)`
    );
  };

  const toggleSection = (section: string) => {
    setErrorMsg('');
    setSuccessMsg('');
    const next = activeFormSection === section ? null : section;
    setActiveFormSection(next);
    if (next === 'transfer') {
      setTimeout(() => {
        const el = document.getElementById('transfer-form-section');
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 100);
    }
  };

  const largeInputClass = "w-full h-12 px-4 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-medium text-slate-800 transition-colors bg-white";

  const renderFlocksTableContent = (flockList: Flock[], isFullScreen = false) => (
    <div className={`overflow-x-auto select-none rounded-xl border border-slate-100 bg-white ${isFullScreen ? 'h-full min-h-full max-h-none' : 'max-h-[500px]'} overflow-y-auto`}>
      <table className="w-full border-collapse text-left min-w-[850px]">
        <thead className={`bg-slate-50 sticky top-0 ${isFullScreen ? 'text-[10px]' : 'text-xs'} font-black text-slate-500 uppercase tracking-wider z-10`}>
          <tr>
            <th className={`${isFullScreen ? 'p-1.5 w-8' : 'p-3 w-10'} text-center bg-slate-50`}>
              <input
                type="checkbox"
                checked={flockList.length > 0 && selectedFlockIds.length === flockList.length}
                onChange={(e) => {
                  if (e.target.checked) setSelectedFlockIds(flockList.map(x => x.id));
                  else setSelectedFlockIds([]);
                }}
                className="rounded border-slate-300 text-emerald-650 focus:ring-emerald-500 cursor-pointer"
              />
            </th>
            <th className={isFullScreen ? 'p-2' : 'p-3'}>Flock Batch Name</th>
            <th className={isFullScreen ? 'p-2' : 'p-3'}>{isFullScreen ? 'Species' : 'Species / Breed'}</th>
            <th className={isFullScreen ? 'p-2' : 'p-3'}>{isFullScreen ? 'Qty' : 'Quantity'}</th>
            <th className={isFullScreen ? 'p-2' : 'p-3'}>{isFullScreen ? 'Age' : 'Age (Weeks, Days)'}</th>
            <th className={isFullScreen ? 'p-2' : 'p-3'}>{isFullScreen ? 'Date' : 'Date Added'}</th>
            <th className={isFullScreen ? 'p-2' : 'p-3'}>{isFullScreen ? 'Cage' : 'Cage Assignment (Dropdown)'}</th>
            <th className={`${isFullScreen ? 'p-2' : 'p-3'} text-center`}>Actions</th>
          </tr>
        </thead>
        <tbody className={`divide-y divide-slate-100 font-medium text-slate-700 ${isFullScreen ? 'text-[11px]' : 'text-sm'}`}>
          {flockList.length === 0 ? (
            <tr>
              <td colSpan={8} className="p-6 text-center text-slate-400 font-bold bg-slate-50/50">
                No active fowl batches found matching filters. Click "+ Add Batch" to register fowls.
              </td>
            </tr>
          ) : (
            flockList.map((f) => {
              const isS = selectedFlockIds.includes(f.id);
              const isTurkey = f.species === 'Turkey';
              const displayType = isTurkey
                ? (f.breed || 'Gobbler')
                : (f.breed && f.breed !== 'Chicken' ? f.breed : 'Chicken');
              const batchNameDisplay = f.name;
              return (
                <tr key={f.id} className={`hover:bg-slate-50/40 ${isS ? 'bg-emerald-50/10' : ''}`}>
                  <td className={`${isFullScreen ? 'p-1.5 w-8' : 'p-3 w-10'} text-center`}>
                    <input
                      type="checkbox"
                      checked={isS}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedFlockIds([...selectedFlockIds, f.id]);
                        } else {
                          setSelectedFlockIds(selectedFlockIds.filter(id => id !== f.id));
                        }
                      }}
                      className="rounded border-slate-300 text-emerald-650 focus:ring-emerald-500 cursor-pointer"
                    />
                  </td>
                  <td className={`${isFullScreen ? 'p-2' : 'p-3'} text-slate-900 font-bold flex items-center gap-1.5`}>
                    <span className="text-base select-none">{isTurkey ? '🦃' : '🐔'}</span>
                    <div>
                      <span className="block font-black">{batchNameDisplay}</span>
                      {f.notes && !isFullScreen && <span className="text-[10px] text-slate-400 block font-normal">{f.notes}</span>}
                    </div>
                  </td>
                  <td className={`${isFullScreen ? 'p-2' : 'p-3'} font-semibold text-slate-800`}>
                    <span className={`px-2 py-0.5 rounded-md text-[10px] font-extrabold ${isTurkey ? 'bg-amber-100 text-amber-900' : 'bg-emerald-100 text-emerald-900'}`}>
                      {displayType}
                    </span>
                  </td>
                  <td className={isFullScreen ? 'p-2' : 'p-3'}>{renderBreakdownBadge(f)}</td>
                  <td className={`${isFullScreen ? 'p-2' : 'p-3'} font-bold text-slate-800`}>
                    {formatFlockAge(f.dateAdded, f.initialAgeWeeks ?? 0)}
                  </td>
                  <td className={`${isFullScreen ? 'p-2 text-[10px]' : 'p-3 text-xs'} text-slate-500 font-mono`}>{formatDateDDMMYYYY(f.dateAdded)}</td>
                  <td className={isFullScreen ? 'p-2' : 'p-3'}>
                    <select
                      value={f.notes || ''}
                      onChange={(e) => handleQuickAssignFlockCage(f.id, e.target.value)}
                      className={`font-bold p-1 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 focus:ring-2 focus:ring-emerald-500 outline-none cursor-pointer w-full ${isFullScreen ? 'text-[10px] max-w-[140px]' : 'text-xs max-w-[200px]'}`}
                      title="Select or change cage for this batch"
                    >
                      <option value="">-- Select Cage --</option>
                      {Object.entries(groupedCages).map(([block, cages]) => (
                        <optgroup key={block} label={block}>
                          {(cages as CageLocation[]).map((c) => (
                            <option key={c.id || c.cageName} value={c.cageName}>
                              {getCageOptionLabel(c)}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  </td>
                  <td className="p-3 text-center">
                    <div className="flex items-center justify-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          setTransferSourceFlockId(f.id);
                          setTransferFlockName(f.name);
                          setTransferSpecies((f.species || 'Chicken') as 'Chicken' | 'Turkey');
                          const cleanCage = (f.notes || '').replace(/\s*\(.*\)/g, '').trim() || 'ST 1';
                          setTransferFromCage(cleanCage);
                          setTransferQty(String(f.quantity));
                          setTransferAgeWeeks(formatFlockAge(f.dateAdded, f.initialAgeWeeks ?? 0));
                          setTransferToCage('');
                          setActiveFormSection('transfer');
                          if (fullscreenTable) setFullscreenTable(null);
                          setTimeout(() => {
                            const el = document.getElementById('transfer-form-section');
                            if (el) {
                              el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            }
                          }, 100);
                        }}
                        className="p-1.5 text-amber-600 hover:bg-amber-50 rounded-lg cursor-pointer transition-colors"
                        title="Transfer fowls from this batch to another cage"
                      >
                        <ArrowRightLeft size={15} />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingFlock(f);
                          setEditFlockName(f.name);
                          const detectedMode = f.countMode || (f.speciesBreakdown && f.speciesBreakdown.length > 0 ? 'multi_species' : ((f.cocksCount || 0) > 0 || (f.hensCount || 0) > 0) ? 'sex_breakdown' : 'single');
                          setEditFlockCountMode(detectedMode === 'multi' ? 'multi_species' : detectedMode);
                          setEditFlockCocksCount(String(f.cocksCount || 0));
                          setEditFlockHensCount(String(f.hensCount || 0));
                          setEditFlockSpeciesBreakdown(
                            f.speciesBreakdown && f.speciesBreakdown.length > 0
                              ? f.speciesBreakdown.map(sb => ({ species: sb.species, quantity: String(sb.quantity) }))
                              : [{ species: 'Turkey', quantity: '7' }, { species: 'Chicks', quantity: '2' }]
                          );
                          setEditFlockQty(String(f.quantity));
                          setEditFlockAge(String(f.initialAgeWeeks ?? calculateCurrentAgeWeeks(f.dateAdded, f.initialAgeWeeks ?? 0)));
                          setEditFlockDate(f.dateAdded);
                          setEditFlockSpecies(f.species || 'Chicken');
                          setEditTurkeyType(f.breed === 'Hen' ? 'Hen' : 'Gobbler');
                          setEditFlockNotes(f.notes || '');
                          if (fullscreenTable) setFullscreenTable(null);
                        }}
                        className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg cursor-pointer transition-colors"
                        title="Edit Flock Details"
                      >
                        <Edit3 size={15} />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteRow('/api/flocks', f.id)}
                        className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg cursor-pointer transition-colors"
                        title="Delete Flock"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );

  return (
    <div id="poultry_tab" className="space-y-8 pb-32">

      {/* Common Alerts Display: fixed so a result is visible wherever the button was tapped */}
      {(errorMsg || successMsg || farmAction.error) && (
        <div role="status" aria-live="polite" className="fixed inset-x-3 bottom-20 z-[60] mx-auto max-w-md space-y-2">
          {(errorMsg || farmAction.error) && (
            <div role="alert" className="p-4 bg-rose-50 border border-rose-200 rounded-2xl text-rose-700 text-sm flex gap-2 shadow-lg">
              <AlertCircle size={20} className="shrink-0" />
              <p className="font-semibold flex-1">{errorMsg || farmAction.error}</p>
              <button type="button" aria-label="Dismiss message" onClick={() => { setErrorMsg(''); farmAction.clear(); }} className="shrink-0 text-rose-500"><X size={16} /></button>
            </div>
          )}
          {successMsg && !errorMsg && (
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl text-emerald-700 text-sm flex gap-2 shadow-lg">
              <Package size={20} className="shrink-0" />
              <p className="font-semibold flex-1">{successMsg}</p>
              <button type="button" aria-label="Dismiss message" onClick={() => setSuccessMsg('')} className="shrink-0 text-emerald-600"><X size={16} /></button>
            </div>
          )}
        </div>
      )}

      <div className="px-1"><h1 className="text-2xl font-bold tracking-tight text-emerald-950">Farm records</h1><p className="text-sm text-slate-600">Choose what you want to manage today.</p></div>
      {farmAction.message && <p role="status" className="rounded-xl bg-emerald-50 p-3 text-emerald-800">{farmAction.message}</p>}
      <label className="block sm:hidden text-sm font-semibold text-emerald-950">Farm section
        <select aria-label="Farm section" value={farmSubSection} onChange={event => setFarmSubSection(event.target.value as typeof farmSubSection)} className="mt-2 h-13 w-full rounded-2xl border border-emerald-200 bg-white px-4 text-base text-emerald-950">
          <option value="overview">Overview</option><option value="rabbits">Rabbits</option><option value="quail">Quail</option><option value="flocks">Flocks and cages</option><option value="eggs">Egg collection</option><option value="sales">Sales</option><option value="feed">Feed</option><option value="mortality">Animal loss</option><option value="eaten">Animals used at home</option><option value="expenses">Expenses</option><option value="all">View all records</option>
        </select>
      </label>
      <nav aria-label="Farm sections" className="hidden sm:flex items-center gap-2 p-1.5 bg-emerald-50 rounded-2xl border border-emerald-100 overflow-x-auto select-none touch-pan-x scrollbar-none">
        {[
          { id: 'overview', label: 'Overview', icon: <LayoutGrid size={16} className="shrink-0" /> },
          { id: 'all', label: 'View all', icon: <LayoutGrid size={14} className="shrink-0" /> },
          { id: 'flocks', label: 'Flocks & Cages', icon: <Layers size={14} className="shrink-0" />, count: totalChickens + totalTurkeys },
          { id: 'rabbits', label: 'Rabbits', icon: <span aria-hidden="true">🐇</span>, count: (data.rabbits || []).filter(item => item.status === 'active').length },
          { id: 'quail', label: 'Quail', icon: <span aria-hidden="true">🐦</span>, count: data.flocks.filter(item => item.species === 'Quail').reduce((sum, item) => sum + item.quantity, 0) },
          { id: 'eggs', label: 'Daily Egg Yield', icon: <Sparkles size={14} className="shrink-0" />, count: (data.daily_egg_collections || []).length },
          { id: 'sales', label: 'Sales & Revenue', icon: <DollarSign size={14} className="shrink-0" />, count: (data.poultry_sales || []).length },
          { id: 'feed', label: 'Feed Stock', icon: <Package size={14} className="shrink-0" />, count: (data.feed_records || []).length },
          { id: 'mortality', label: 'Mortality', icon: <TrendingDown size={14} className="shrink-0" />, count: (data.mortality || []).length },
          { id: 'eaten', label: 'Used at home', icon: <Utensils size={14} className="shrink-0" />, count: (data.fowls_eaten || []).length },
          { id: 'expenses', label: 'Expenses', icon: <Receipt size={14} className="shrink-0" />, count: (data.expenses || []).length },
        ].map((tab) => {
          const isActive = farmSubSection === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                setFarmSubSection(tab.id as any);
                if (tab.id !== 'all') {
                  setTimeout(() => {
                    const el = document.getElementById(
                      tab.id === 'flocks' ? 'section_flocks' :
                      tab.id === 'rabbits' ? 'section_rabbits' :
                      tab.id === 'quail' ? 'section_quail' :
                      tab.id === 'eggs' ? 'section_egg_collections' :
                      tab.id === 'sales' ? 'section_sales' :
                      tab.id === 'feed' ? 'section_feed' :
                      tab.id === 'mortality' ? 'section_mortality' :
                      tab.id === 'eaten' ? 'section_fowls_eaten' :
                      'section_expenses'
                    );
                    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  }, 50);
                }
              }}
              aria-current={isActive ? 'page' : undefined}
              className={`flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-semibold whitespace-nowrap transition-all cursor-pointer select-none active:scale-95 shrink-0 ${
                isActive
                  ? 'bg-white text-emerald-900 shadow-sm font-extrabold ring-1 ring-slate-900/5'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
              }`}
            >
              <span className={isActive ? 'text-emerald-600' : 'text-slate-400'}>{tab.icon}</span>
              <span>{tab.label}</span>
              {tab.count !== undefined && (
                <span className={`text-[10px] px-1.5 py-0.2 rounded-md font-bold ${
                  isActive ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200/80 text-slate-600'
                }`}>
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* FARM INVENTORY SUMMARY GRID */}
      <div id="farm_inventory_dashboard" hidden={farmSubSection !== 'overview' && farmSubSection !== 'all'} className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Chickens Card */}
        <div className="bg-white rounded-3xl p-5 shadow-sm border border-slate-100 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="text-xl">🐔</span>
              <div>
                <h3 className="text-xs font-black text-slate-800 uppercase tracking-wider">Chicken Age Groups</h3>
                <p className="text-[10px] font-bold text-slate-400">Inventory by flock age category</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="bg-emerald-50 text-emerald-700 font-black text-[10px] px-2.5 py-1 rounded-full uppercase">
                {totalChickens} Birds
              </span>
              <button
                type="button"
                onClick={() => {
                  setFlockSpecies('Chicken');
                  setActiveFormSection('flock');
                  setFarmSubSection('flocks');
                  setTimeout(() => {
                    const el = document.getElementById('section_flocks');
                    if (el) el.scrollIntoView({ behavior: 'smooth' });
                  }, 50);
                }}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-black text-[10px] px-3 py-1.5 rounded-xl uppercase flex items-center gap-1 shadow-xs cursor-pointer transition-colors"
                title="Add new Chicken batch"
              >
                <Plus size={14} />
                <span>+ Add Fowl</span>
              </button>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 mt-2">
            <div className="p-3 bg-slate-50/50 rounded-2xl text-center border border-slate-100/50">
              <span className="text-[9px] font-black text-slate-400 block uppercase tracking-wider">Day-Olds</span>
              <strong className="text-lg font-black text-slate-800 block mt-1">{chickenDayOlds}</strong>
              <span className="text-[9px] text-slate-400 font-semibold">0 wks</span>
            </div>
            <div className="p-3 bg-slate-50/50 rounded-2xl text-center border border-slate-100/50">
              <span className="text-[9px] font-black text-slate-400 block uppercase tracking-wider">Growing</span>
              <strong className="text-lg font-black text-slate-800 block mt-1">{chickenGrowers}</strong>
              <span className="text-[9px] text-slate-400 font-semibold font-mono">1-23 wks</span>
            </div>
            <div className="p-3 bg-slate-50/50 rounded-2xl text-center border border-slate-100/50">
              <span className="text-[9px] font-black text-slate-400 block uppercase tracking-wider">Layers</span>
              <strong className="text-lg font-black text-slate-800 block mt-1">{chickenLayers}</strong>
              <span className="text-[9px] text-slate-400 font-semibold font-mono">24+ wks</span>
            </div>
          </div>
        </div>

        {/* Turkeys Card */}
        <div className="bg-white rounded-3xl p-5 shadow-sm border border-slate-100 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="text-xl">🦃</span>
              <div>
                <h3 className="text-xs font-black text-slate-800 uppercase tracking-wider">Turkey Age Groups</h3>
                <p className="text-[10px] font-bold text-slate-400">Inventory by breed age category</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="bg-amber-50 text-amber-700 font-black text-[10px] px-2.5 py-1 rounded-full uppercase">
                {totalTurkeys} Turkeys
              </span>
              <button
                type="button"
                onClick={() => {
                  setFlockSpecies('Turkey');
                  setActiveFormSection('flock');
                  setFarmSubSection('flocks');
                  setTimeout(() => {
                    const el = document.getElementById('section_flocks');
                    if (el) el.scrollIntoView({ behavior: 'smooth' });
                  }, 50);
                }}
                className="bg-amber-600 hover:bg-amber-700 text-white font-black text-[10px] px-3 py-1.5 rounded-xl uppercase flex items-center gap-1 shadow-xs cursor-pointer transition-colors"
                title="Add new Turkey batch"
              >
                <Plus size={14} />
                <span>+ Add Turkey</span>
              </button>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 mt-2">
            <div className="p-3 bg-slate-50/50 rounded-2xl text-center border border-slate-100/50">
              <span className="text-[9px] font-black text-slate-400 block uppercase tracking-wider">Day-Olds</span>
              <strong className="text-lg font-black text-slate-800 block mt-1">{turkeyDayOlds}</strong>
              <span className="text-[9px] text-slate-400 font-semibold">0 wks</span>
            </div>
            <div className="p-3 bg-slate-50/50 rounded-2xl text-center border border-slate-100/50">
              <span className="text-[9px] font-black text-slate-400 block uppercase tracking-wider">Poults</span>
              <strong className="text-lg font-black text-slate-800 block mt-1">{turkeyGrowers}</strong>
              <span className="text-[9px] text-slate-400 font-semibold font-mono">1-23 wks</span>
            </div>
            <div className="p-3 bg-slate-50/50 rounded-2xl text-center border border-slate-100/50">
              <span className="text-[9px] font-black text-slate-400 block uppercase tracking-wider">Mature</span>
              <strong className="text-lg font-black text-slate-800 block mt-1">{turkeyLayers}</strong>
              <span className="text-[9px] text-slate-400 font-semibold font-mono">24+ wks</span>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-3xl p-5 shadow-sm border border-emerald-100 flex flex-col gap-4">
          <div className="flex items-start justify-between gap-3"><div><h3 className="text-base font-bold text-emerald-950">🐇 Rabbits</h3><p className="text-sm text-slate-600">Adults, litters and hutches</p></div><strong className="text-xl text-emerald-900">{(data.rabbits || []).filter(item => item.status === 'active').length}</strong></div>
          <div className="grid grid-cols-2 gap-2"><button type="button" className="min-h-12 rounded-xl bg-emerald-700 px-3 text-sm font-semibold text-white" onClick={() => { setActiveFormSection('rabbit_add'); setRabbitShortcutVersion(value => value + 1); setFarmSubSection('rabbits'); }}>+ Add rabbit</button><button type="button" className="min-h-12 rounded-xl border border-emerald-200 px-3 text-sm font-semibold text-emerald-900" onClick={() => setFarmSubSection('rabbits')}>Manage rabbits</button></div>
        </div>
        <div className="bg-white rounded-3xl p-5 shadow-sm border border-emerald-100 flex flex-col gap-4">
          <div className="flex items-start justify-between gap-3"><div><h3 className="text-base font-bold text-emerald-950">🐦 Quail</h3><p className="text-sm text-slate-600">Birds, eggs and farm hatches</p></div><strong className="text-xl text-emerald-900">{data.flocks.filter(item => item.species === 'Quail').reduce((sum, item) => sum + item.quantity, 0)}</strong></div>
          <div className="grid grid-cols-2 gap-2"><button type="button" className="min-h-12 rounded-xl bg-emerald-700 px-3 text-sm font-semibold text-white" onClick={() => { setActiveFormSection('quail_flock_add'); setQuailShortcutVersion(value => value + 1); setFarmSubSection('quail'); }}>+ Add quail</button><button type="button" className="min-h-12 rounded-xl border border-emerald-200 px-3 text-sm font-semibold text-emerald-900" onClick={() => setFarmSubSection('quail')}>Manage quail</button></div>
        </div>
      </div>

      <div hidden={farmSubSection !== 'all' && farmSubSection !== 'rabbits'}><RabbitSection key={rabbitShortcutVersion} data={rawData} token={token} refresh={triggerRefresh} initialTask={activeFormSection === 'rabbit_add' ? 'rabbit_add' : undefined} /></div>
      <div hidden={farmSubSection !== 'all' && farmSubSection !== 'quail'}><QuailSection key={quailShortcutVersion} data={rawData} token={token} refresh={triggerRefresh} initialTask={activeFormSection === 'quail_flock_add' ? 'quail_flock_add' : undefined} /></div>

      {/* SECTION 1: FLOCKS */}
      <div id="section_flocks" hidden={farmSubSection !== 'all' && farmSubSection !== 'flocks'} className="bg-white rounded-3xl p-5 shadow-sm border border-slate-100">
        <SharedAnimalHousing key={housingRequest.version} data={rawData} token={token} refresh={triggerRefresh} initialTask={housingRequest.task} initialAnimalType={housingRequest.animalType} />
        <button type="button" onClick={() => openCountCorrection()} className="mb-5 min-h-12 w-full rounded-xl border border-emerald-200 bg-emerald-50 px-4 text-left text-sm font-bold text-emerald-900">Correct chicks or birds in a cage →</button>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div>
            <h3 className="text-lg font-black text-slate-800 uppercase tracking-tight">Bird flocks & cages</h3>
            <p className="text-slate-400 text-xs font-semibold">Track chickens, turkeys and quail in their cages</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => toggleSection('transfer')}
              className={`cursor-pointer px-3.5 py-2 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 transition-colors ${
                activeFormSection === 'transfer' ? 'bg-amber-600 text-white shadow' : 'bg-amber-50 text-amber-700 hover:bg-amber-100'
              }`}
              title="Move birds between cages"
            >
              <ArrowRightLeft size={14} />
              <span>Move birds</span>
            </button>
            <button
              id="toggle_flocks_form"
              onClick={() => toggleSection('flock')}
              className={`cursor-pointer px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-1.5 transition-colors shadow-sm ${
                activeFormSection === 'flock'
                  ? 'bg-rose-600 hover:bg-rose-700 text-white'
                  : 'bg-emerald-600 hover:bg-emerald-700 text-white'
              }`}
              title="Add a bird flock"
            >
              {activeFormSection === 'flock' ? <Minus size={16} /> : <Plus size={16} />}
              <span>{activeFormSection === 'flock' ? 'Close Form' : '+ Add Fowl / Turkey Batch'}</span>
            </button>
          </div>
        </div>

        {/* Collapsible Form */}
        {activeFormSection === 'flock' && (
          <form id="form_section_flock" onSubmit={handleAddFlock} className="scroll-mt-20 bg-slate-50/50 p-4 rounded-2xl border border-slate-100 space-y-4 mb-6">
            <h4 className="text-sm font-bold text-slate-700 uppercase tracking-wider mb-2">Add a bird flock</h4>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 ml-1">Bird Species</label>
                <select
                  value={flockSpecies}
                  onChange={(e) => {
                    const sp = e.target.value;
                    setFlockSpecies(sp);
                    if (sp === 'Turkey') setFlockBreed('Gobbler');
                    else if (sp === 'Agric Fowls') setFlockBreed('Agric Mixed');
                    else if (sp === 'Quail') setFlockBreed('Quail');
                    else setFlockBreed('Brahma');
                  }}
                  className={largeInputClass}
                >
                  <option value="Chicken">Chicken (Domestic Brahma / Pure Breed)</option>
                  <option value="Turkey">Turkey (Fam Breed)</option>
                  <option value="Agric Fowls">Agric Fowls / Mixed Agric Fowls</option>
                  <option value="Quail">Quail</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 ml-1">Breed / Variety</label>
                <select
                  value={flockBreed}
                  onChange={(e) => setFlockBreed(e.target.value)}
                  className={largeInputClass}
                >
                  <option value="Pure Breed">Pure Breed (Pure Brahma)</option>
                  <option value="Brahma">Brahma (Standard)</option>
                  <option value="Agric Mixed">Agric Fowls / Mixed Agric</option>
                  <option value="Local Breed">Local Breed</option>
                  <option value="Gobbler">Turkey (Gobbler)</option>
                  <option value="Hen">Turkey (Hen)</option>
                  <option value="Quail">Quail</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 ml-1">Flock Label / Name</label>
                <input
                  type="text"
                  placeholder="e.g. Block A Brooders"
                  value={flockName}
                  onChange={(e) => setFlockName(e.target.value)}
                  className={largeInputClass}
                  required
                />
              </div>

              <div className="col-span-full bg-slate-100/80 p-3.5 rounded-2xl border border-slate-200/80 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <label className="block text-xs font-black text-slate-800 uppercase tracking-wider">
                      Batch Quantity & Species Mode
                    </label>
                    <p className="text-[11px] font-semibold text-slate-500">
                      Choose how quantity is counted for this flock batch
                    </p>
                  </div>
                  <div className="flex bg-white p-1 rounded-xl border border-slate-200 text-xs font-bold shadow-2xs">
                    <button
                      type="button"
                      onClick={() => setFlockCountMode('single')}
                      className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                        flockCountMode === 'single'
                          ? 'bg-emerald-600 text-white font-extrabold shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Single Total
                    </button>
                    <button
                      type="button"
                      onClick={() => setFlockCountMode('sex_breakdown')}
                      className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                        flockCountMode === 'sex_breakdown'
                          ? 'bg-emerald-600 text-white font-extrabold shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      🐓 Cocks & Hens
                    </button>
                    <button
                      type="button"
                      onClick={() => setFlockCountMode('multi_species')}
                      className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                        flockCountMode === 'multi_species'
                          ? 'bg-emerald-600 text-white font-extrabold shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      🐣 Multi-Species
                    </button>
                  </div>
                </div>

                {flockCountMode === 'single' && (
                  <div>
                    <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1 ml-1">
                      Count of Birds
                    </label>
                    <input
                      type="number"
                      placeholder="e.g. 50"
                      min="1"
                      value={flockQty}
                      onChange={(e) => setFlockQty(e.target.value)}
                      className={largeInputClass}
                      required={flockCountMode === 'single'}
                    />
                  </div>
                )}

                {flockCountMode === 'sex_breakdown' && (
                  <div className="space-y-2">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-bold text-blue-900 uppercase tracking-wider mb-1 ml-1 flex items-center gap-1">
                          <span>🐓 Cocks (Males)</span>
                        </label>
                        <input
                          type="number"
                          min="0"
                          placeholder="0"
                          value={flockCocksCount}
                          onChange={(e) => setFlockCocksCount(e.target.value)}
                          className="w-full text-xs font-black p-3 bg-white border border-blue-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-pink-900 uppercase tracking-wider mb-1 ml-1 flex items-center gap-1">
                          <span>🐔 Hens (Females)</span>
                        </label>
                        <input
                          type="number"
                          min="0"
                          placeholder="0"
                          value={flockHensCount}
                          onChange={(e) => setFlockHensCount(e.target.value)}
                          className="w-full text-xs font-black p-3 bg-white border border-pink-200 rounded-xl focus:ring-2 focus:ring-pink-500 outline-none"
                        />
                      </div>
                    </div>
                    <div className="p-2.5 bg-emerald-50 rounded-xl border border-emerald-200/80 text-xs font-bold text-emerald-900 flex justify-between items-center">
                      <span>Combined Fowl Total:</span>
                      <span className="text-sm font-black text-emerald-800">
                        {(Number(flockCocksCount) || 0) + (Number(flockHensCount) || 0)} Fowls ({flockCocksCount || 0} cocks + {flockHensCount || 0} hens)
                      </span>
                    </div>
                  </div>
                )}

                {flockCountMode === 'multi_species' && (
                  <div className="space-y-3">
                    <div className="space-y-2">
                      {flockSpeciesBreakdown.map((sb, index) => (
                        <div key={index} className="flex items-center gap-2 bg-white p-2.5 rounded-xl border border-slate-200">
                          <div className="flex-1">
                            <label className="block text-[10px] font-bold text-slate-400 uppercase mb-0.5">Species Name</label>
                            <input
                              type="text"
                              placeholder="e.g. Turkey, Chicks, Poults..."
                              value={sb.species}
                              onChange={(e) => {
                                const updated = [...flockSpeciesBreakdown];
                                updated[index].species = e.target.value;
                                setFlockSpeciesBreakdown(updated);
                              }}
                              className="w-full text-xs font-bold p-2 bg-slate-50 border border-slate-200 rounded-lg outline-none"
                            />
                          </div>
                          <div className="w-28">
                            <label className="block text-[10px] font-bold text-slate-400 uppercase mb-0.5">Quantity</label>
                            <input
                              type="number"
                              min="0"
                              placeholder="0"
                              value={sb.quantity}
                              onChange={(e) => {
                                const updated = [...flockSpeciesBreakdown];
                                updated[index].quantity = e.target.value;
                                setFlockSpeciesBreakdown(updated);
                              }}
                              className="w-full text-xs font-black p-2 bg-slate-50 border border-slate-200 rounded-lg outline-none"
                            />
                          </div>
                          {flockSpeciesBreakdown.length > 1 && (
                            <button
                              type="button"
                              onClick={() => {
                                setFlockSpeciesBreakdown(flockSpeciesBreakdown.filter((_, i) => i !== index));
                              }}
                              className="mt-4 p-2 text-rose-500 hover:bg-rose-50 rounded-lg cursor-pointer transition-colors"
                              title="Remove species row"
                            >
                              <X size={16} />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>

                    <div className="flex items-center justify-between">
                      <button
                        type="button"
                        onClick={() => {
                          setFlockSpeciesBreakdown([...flockSpeciesBreakdown, { species: 'Chicks', quantity: '0' }]);
                        }}
                        className="px-3 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-xl text-xs font-black uppercase flex items-center gap-1 cursor-pointer transition-colors"
                      >
                        <Plus size={14} />
                        <span>Add Species Row</span>
                      </button>

                      <div className="text-xs font-extrabold text-emerald-800 bg-emerald-50 px-3 py-1.5 rounded-xl border border-emerald-200">
                        Calculated Total: {flockSpeciesBreakdown.reduce((acc, sb) => acc + (Number(sb.quantity) || 0), 0)} Birds
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 ml-1">Age (Weeks)</label>
                <input
                  type="number"
                  placeholder="e.g. 12"
                  min="0"
                  value={flockAge}
                  onChange={(e) => setFlockAge(e.target.value)}
                  className={largeInputClass}
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 ml-1">Date Added to Farm</label>
                <input
                  type="date"
                  value={flockDate}
                  onChange={(e) => setFlockDate(e.target.value)}
                  className={largeInputClass}
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 ml-1">
                  Assign Cage Location (Dropdown)
                </label>
                <select
                  value={flockNotes}
                  onChange={(e) => setFlockNotes(e.target.value)}
                  className={largeInputClass}
                >
                  <option value="">-- Select Cage from Dropdown Menu --</option>
                  {Object.entries(groupedCages).map(([block, cages]) => (
                    <optgroup key={block} label={block}>
                      {(cages as CageLocation[]).map((c) => (
                        <option key={c.id || c.cageName} value={c.cageName}>
                          {getCageOptionLabel(c)}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
                <input
                  type="text"
                  placeholder="Or enter custom cage notes..."
                  value={flockNotes}
                  onChange={(e) => setFlockNotes(e.target.value)}
                  className="mt-1.5 w-full text-xs font-bold p-2.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || farmAction.busy}
              className="w-full h-12 bg-emerald-600 text-white rounded-xl font-bold uppercase tracking-wider text-sm shadow hover:bg-emerald-700 transition-colors active:scale-[0.98] cursor-pointer"
            >
              {loading ? 'Adding flock...' : 'Save Flock Record'}
            </button>
          </form>
        )}

        {/* Collapsible Cage Transfer Form */}
        {activeFormSection === 'transfer' && (
          <form id="transfer-form-section" onSubmit={handleExecuteTransfer} className="bg-amber-50/60 p-5 rounded-3xl border border-amber-200/80 space-y-4 mb-6 shadow-sm animate-in fade-in duration-200">
            {errorMsg && (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs font-bold flex items-center gap-2">
                <AlertCircle size={16} className="shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}
            {successMsg && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-bold flex items-center gap-2">
                <CheckCircle2 size={16} className="shrink-0" />
                <span>{successMsg}</span>
              </div>
            )}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-amber-500/10 text-amber-700 flex items-center justify-center font-bold">
                  <ArrowRightLeft size={16} />
                </div>
                <div>
                  <h4 className="text-sm font-black text-amber-950 uppercase tracking-wider">Move birds between cages</h4>
                  <p className="text-[11px] font-semibold text-amber-700">Move birds across farm blocks with real-time distribution updates</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setActiveFormSection(null)}
                className="p-1.5 text-amber-700 hover:bg-amber-100 rounded-lg cursor-pointer transition-colors"
              >
                <X size={18} />
              </button>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 pt-1">
              {/* Species */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1 ml-1">Species</label>
                <select
                  value={transferSpecies}
                  onChange={(e) => setTransferSpecies(e.target.value as 'Chicken' | 'Turkey')}
                  className={largeInputClass}
                >
                  <option value="Chicken">Brahma (Chicken)</option>
                  <option value="Turkey">Turkey</option>
                </select>
              </div>

              {/* Select Existing Flock or Type Name */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1 ml-1">Flock / Batch Name</label>
                <div className="space-y-1.5">
                  <select
                    value={transferSourceFlockId}
                    onChange={(e) => {
                      const selId = e.target.value;
                      setTransferSourceFlockId(selId);
                      const sel = (data.flocks || []).find(f => f.id === selId);
                      if (sel) {
                        setTransferFlockName(sel.name);
                        setTransferSpecies(sel.species || 'Chicken');
                        setTransferFromCage((sel.notes || '').trim() || 'ST 1');
                        setTransferQty(String(sel.quantity));
                        setTransferAgeWeeks(String(sel.ageWeeks));
                      }
                    }}
                    className={largeInputClass}
                  >
                    <option value="">-- Select Existing Flock (Optional) --</option>
                    {(data.flocks || []).map(f => (
                      <option key={f.id} value={f.id}>
                        {f.species === 'Turkey' ? '🦃' : '🐔'} {f.name} ({f.quantity} birds in {f.notes || 'Unassigned'})
                      </option>
                    ))}
                  </select>
                  {!transferSourceFlockId && (
                    <input
                      type="text"
                      placeholder="Or type custom flock name..."
                      value={transferFlockName}
                      onChange={(e) => setTransferFlockName(e.target.value)}
                      className="w-full text-xs font-bold p-2.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none"
                    />
                  )}
                </div>
              </div>

              {/* Quantity */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1 ml-1">Quantity to Transfer</label>
                <input
                  type="number"
                  min="1"
                  placeholder="e.g. 25"
                  value={transferQty}
                  onChange={(e) => setTransferQty(e.target.value)}
                  className={largeInputClass}
                  required
                />
              </div>

              {/* FROM Cage (Typeable Search Dropdown) */}
              <SearchableCageSelect
                label="FROM (Source Cage)"
                value={transferFromCage}
                onChange={(val) => setTransferFromCage(val)}
                cages={allFarmCages}
                occupancyMap={cageOccupancyMap}
                placeholder="Type cage name (e.g. ST 1, CAGE B)..."
                required
              />

              {/* TO Cage (Typeable Search Dropdown) */}
              <SearchableCageSelect
                label="TO (Destination Cage)"
                value={transferToCage}
                onChange={(val) => setTransferToCage(val)}
                cages={allFarmCages}
                occupancyMap={cageOccupancyMap}
                placeholder="Type cage name (e.g. CAGE C, GR 1)..."
                required
              />

              {/* Transfer Date */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1 ml-1">Transfer Date</label>
                <input
                  type="date"
                  value={transferDate}
                  onChange={(e) => setTransferDate(e.target.value)}
                  className={largeInputClass}
                  required
                />
              </div>

              {/* Notes */}
              <div className="sm:col-span-2 lg:col-span-3">
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1 ml-1">Notes</label>
                <input
                  type="text"
                  placeholder="e.g. Transferred grower birds to larger pen as fowls matured"
                  value={transferNotes}
                  onChange={(e) => setTransferNotes(e.target.value)}
                  className={largeInputClass}
                />
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="submit"
                disabled={loading || farmAction.busy}
                className="flex-1 h-12 bg-amber-600 text-white rounded-xl font-black uppercase tracking-wider text-xs shadow-md hover:bg-amber-700 transition-colors active:scale-[0.98] cursor-pointer flex items-center justify-center gap-2"
              >
                <ArrowRightLeft size={16} />
                {loading ? 'Executing Transfer...' : 'Execute Transfer'}
              </button>
              <button
                type="button"
                onClick={() => setActiveFormSection(null)}
                className="px-5 h-12 bg-slate-200 text-slate-700 rounded-xl font-extrabold uppercase tracking-wider text-xs hover:bg-slate-300 transition-colors cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        {/* MANAGE CAGES & LOCATION REGISTRY SECTION */}
        <div className="mb-6 bg-slate-50/90 p-5 rounded-3xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between cursor-pointer" onClick={() => setIsAddCageOpen(!isAddCageOpen)}>
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-2xl bg-emerald-600 text-white flex items-center justify-center font-bold shadow-xs">
                <Building size={18} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h4 className="text-sm font-black text-slate-900 uppercase tracking-wider">Manage Cages & Location Registry</h4>
                  <span className="bg-emerald-100 text-emerald-800 text-[10px] font-extrabold px-2.5 py-0.5 rounded-full uppercase">
                    {allFarmCages.length} Registered Cages
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 font-semibold">Quickly register new Block Locations & Cage Names into the farm database for the transfer tool</p>
              </div>
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setIsAddCageOpen(!isAddCageOpen);
              }}
              className="px-3.5 py-1.5 bg-emerald-600 text-white rounded-xl text-xs font-black uppercase flex items-center gap-1.5 hover:bg-emerald-700 transition-colors shadow-xs cursor-pointer"
            >
              {isAddCageOpen ? <Minus size={14} /> : <Plus size={14} />}
              <span>{isAddCageOpen ? 'Hide Form' : 'Add New Cage'}</span>
            </button>
          </div>

          {isAddCageOpen && (
            <form onSubmit={handleAddCageSubmit} className="mt-4 pt-4 border-t border-slate-200/60 grid grid-cols-1 sm:grid-cols-3 gap-3 animate-in fade-in duration-150">
              <div>
                <label className="block text-[11px] font-extrabold text-slate-700 uppercase tracking-wider mb-1">Block Location</label>
                <input
                  type="text"
                  placeholder="e.g. BLOCK 0, BLOCK 1, BLOCK 4"
                  value={newBlockName}
                  onChange={(e) => setNewBlockName(e.target.value)}
                  className="w-full text-xs font-bold p-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none shadow-2xs"
                  required
                />
              </div>
              <div>
                <label className="block text-[11px] font-extrabold text-slate-700 uppercase tracking-wider mb-1">Cage Name</label>
                <input
                  type="text"
                  placeholder="e.g. ST 5, CAGE V, PEN 10"
                  value={newCageName}
                  onChange={(e) => setNewCageName(e.target.value)}
                  className="w-full text-xs font-bold p-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none shadow-2xs"
                  required
                />
              </div>
              <div className="flex items-end">
                <button
                  type="submit"
                  disabled={loading || farmAction.busy}
                  className="w-full h-11 bg-emerald-600 text-white rounded-xl text-xs font-black uppercase tracking-wider hover:bg-emerald-700 transition-colors cursor-pointer flex items-center justify-center gap-1.5 shadow"
                >
                  <Plus size={15} />
                  <span>{loading ? 'Registering...' : 'Register Cage'}</span>
                </button>
              </div>
            </form>
          )}

          {/* Registered Farm Cages List with Delete Option */}
          <div className="mt-4 pt-4 border-t border-slate-200/80">
            <div className="flex items-center justify-between mb-2.5">
              <h5 className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                <Building size={14} className="text-emerald-600" />
                <span>Registered Farm Cages & Locations ({allFarmCages.length})</span>
              </h5>
              <span className="text-[10px] font-semibold text-slate-400">Click <Trash2 size={10} className="inline text-rose-500" /> to remove registered cage</span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2 max-h-64 overflow-y-auto p-1">
              {allFarmCages.map((cage) => {
                const matchingInv = cageInventory.find(c => c.cageName.toLowerCase() === cage.cageName.toLowerCase());
                const occupiedQty = matchingInv ? matchingInv.totalFowls : 0;

                return (
                  <div
                    key={cage.id || `${cage.blockName}-${cage.cageName}`}
                    className="bg-white p-2 rounded-xl border border-slate-200 hover:border-emerald-300 transition-all flex items-center justify-between gap-1 shadow-2xs"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1 flex-wrap">
                        <span className="px-1 py-0.2 bg-slate-100 text-slate-700 rounded text-[9px] font-black uppercase">
                          {cage.blockName || 'BLOCK'}
                        </span>
                        <span className="font-extrabold text-slate-900 text-xs truncate" title={cage.cageName}>
                          {cage.cageName}
                        </span>
                      </div>
                      {occupiedQty > 0 ? (
                        <span className="text-[9px] font-bold text-emerald-700 block mt-0.5">
                          {occupiedQty} birds
                        </span>
                      ) : (
                        <span className="text-[9px] text-slate-400 block mt-0.5">
                          Empty
                        </span>
                      )}
                    </div>

                    <button
                      type="button"
                      // Send the cage's unique ID: two blocks may each have a cage with this name.
                      // (The name is only a fallback for an old cage with no ID; the server refuses it if it is not unique.)
                      onClick={() => handleDeleteCage(cage.id || cage.cageName, cage.cageName)}
                      className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer shrink-0"
                      title={`Delete registered cage '${cage.cageName}'`}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* GROW NEW FOWL BATCHES & REGISTERED FLOCKS TABLE CARD */}
        <div id="table_grow_fowl_batches" className="mb-6 bg-white rounded-2xl p-4 border border-slate-200 shadow-xs">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-4">
            <div>
              <div className="flex items-center gap-2">
                <Sprout size={20} className="text-emerald-600" />
                <h4 className="text-sm font-black text-slate-800 uppercase tracking-wider">
                  FOWL BATCHES
                </h4>
                <span className="bg-emerald-100 text-emerald-800 text-[10px] font-extrabold px-2.5 py-0.5 rounded-full uppercase">
                  {filteredFlocks.length} Active Batches ({filteredFlocks.reduce((acc, f) => acc + (f.quantity || 0), 0)} Birds)
                </span>
              </div>
              <p className="text-slate-400 text-xs font-semibold mt-0.5">
                Live registry of all active Brahma chicken & Turkey batches on the farm
              </p>
            </div>

            {/* Controls */}
            <div className="flex flex-wrap items-center gap-2">
              {/* Search */}
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search batch, breed, cage..."
                  value={flocksSearch}
                  onChange={(e) => setFlocksSearch(e.target.value)}
                  className="pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:ring-2 focus:ring-emerald-500 outline-none w-44"
                />
              </div>

              {/* Species Filter */}
              <select
                value={flocksSpeciesFilter}
                onChange={(e) => setFlocksSpeciesFilter(e.target.value as any)}
                className="py-1.5 px-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:ring-2 focus:ring-emerald-500 outline-none cursor-pointer"
              >
                <option value="ALL">All Species</option>
                <option value="Chicken">Chickens Only 🐔</option>
                <option value="Turkey">Turkeys Only 🦃</option>
              </select>

              {/* Add New Batch Button */}
              <button
                type="button"
                onClick={() => {
                  setActiveFormSection('flock');
                  setTimeout(() => {
                    const el = document.getElementById('toggle_flocks_form');
                    if (el) el.scrollIntoView({ behavior: 'smooth' });
                  }, 50);
                }}
                className="px-3 py-1.5 bg-emerald-600 text-white rounded-xl text-xs font-extrabold uppercase flex items-center gap-1 hover:bg-emerald-700 transition-colors shadow cursor-pointer"
              >
                <Plus size={14} />
                <span>+ Add Batch</span>
              </button>
            </div>
          </div>

          {selectedFlockIds.length > 0 && (
            <div className="mb-3 p-3 bg-slate-900 text-white rounded-xl flex items-center justify-between text-xs font-bold animate-in fade-in duration-200">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                <span>Selected {selectedFlockIds.length} flock batch(es)</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsBulkEditFlocksOpen(true)}
                  className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-black text-[10px] uppercase cursor-pointer flex items-center gap-1 shadow-xs transition-colors"
                >
                  <Edit3 size={13} />
                  <span>Bulk Edit ({selectedFlockIds.length})</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleBulkDeletePoultry('flocks', selectedFlockIds)}
                  className="px-2.5 py-1 bg-rose-600 hover:bg-rose-700 rounded-lg font-extrabold text-[10px] uppercase cursor-pointer text-white transition-colors"
                >
                  Delete Selected
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedFlockIds([])}
                  className="px-2 py-1 bg-white/10 hover:bg-white/20 rounded-lg font-extrabold text-[10px] uppercase cursor-pointer text-slate-350"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Direct Table Header with Fullscreen Button */}
          <div className="flex items-center justify-between mb-2 mt-3 px-1">
            <div className="flex items-center gap-2">
              <span className="text-xs font-black text-slate-700 uppercase tracking-wider">
                Bird flocks ({filteredFlocks.length})
              </span>
            </div>
            <button
              type="button"
              onClick={() =>
                setFullscreenTable({
                  title: "FOWL BATCHES",
                  subtitle: "Widescreen view of all active Brahma chicken, Turkey & growing fowl batches",
                  badge: `${filteredFlocks.length} Active Batches`,
                  icon: <Sprout size={20} />,
                  content: renderFlocksTableContent(filteredFlocks, true)
                })
              }
              className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer border border-slate-200"
              title="View Table Fullscreen"
            >
              <Maximize2 size={15} />
              <span className="hidden sm:inline">Fullscreen</span>
            </button>
          </div>

          {/* Table Render */}
          {renderFlocksTableContent(filteredFlocks)}
        </div>

        {/* LIVE CAGE BLOCK DISTRIBUTION TABLE */}
        <div className="mb-6 bg-white rounded-2xl p-4 border border-slate-200 shadow-xs">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-4">
            <div>
              <div className="flex items-center gap-2">
                <Home size={20} className="text-emerald-600" />
                <h4 className="text-sm font-black text-slate-800 uppercase tracking-wider">
                  LIVE CAGE BLOCK DISTRIBUTION
                </h4>
                <span className="bg-emerald-100 text-emerald-800 text-[10px] font-extrabold px-2.5 py-0.5 rounded-full uppercase">
                  {liveAllocations.reduce((acc, a) => acc + a.quantity, 0)} Animals in cages
                </span>
              </div>
              <p className="text-slate-400 text-xs font-semibold mt-0.5">
                Real-time bird population distribution across all building blocks & cages
              </p>
            </div>

            {/* Controls: Search, Filter, Sort, Add Row */}
            <div className="flex flex-wrap items-center gap-2">
              {/* Search */}
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search cage/block/flock..."
                  value={distSearch}
                  onChange={(e) => setDistSearch(e.target.value)}
                  className="pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:ring-2 focus:ring-emerald-500 outline-none w-44"
                />
              </div>

              {/* Block Filter */}
              <select
                value={distBlockFilter}
                onChange={(e) => setDistBlockFilter(e.target.value)}
                className="py-1.5 px-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:ring-2 focus:ring-emerald-500 outline-none cursor-pointer"
              >
                <option value="ALL">All Blocks</option>
                <option value="BLOCK 0">BLOCK 0</option>
                <option value="BLOCK 1">BLOCK 1</option>
                <option value="BLOCK 2">BLOCK 2</option>
                <option value="BLOCK 3">BLOCK 3</option>
              </select>

              {/* View Mode Toggle: All Batch Rows vs By Cage Location */}
              <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200">
                <button
                  type="button"
                  onClick={() => setDistViewMode('batch')}
                  className={`px-3 py-1 text-xs font-black rounded-lg transition-all cursor-pointer ${
                    distViewMode === 'batch'
                      ? 'bg-white text-emerald-800 shadow-xs'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  All Batch Rows
                </button>
                <button
                  type="button"
                  onClick={() => setDistViewMode('summary')}
                  className={`px-3 py-1 text-xs font-black rounded-lg transition-all cursor-pointer ${
                    distViewMode === 'summary'
                      ? 'bg-white text-emerald-800 shadow-xs'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  By Cage Location
                </button>
              </div>

              {/* Sort By Quantity / Fields */}
              <div className="flex items-center gap-1 bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5">
                <ArrowUpDown size={13} className="text-emerald-600" />
                <select
                  value={distSortBy}
                  onChange={(e) => setDistSortBy(e.target.value as any)}
                  className="bg-transparent text-xs font-extrabold text-slate-700 outline-none cursor-pointer"
                >
                  <option value="qty_desc">Sort: Quantity (High → Low)</option>
                  <option value="qty_asc">Sort: Quantity (Low → High)</option>
                  <option value="block">Sort: Block Name</option>
                  <option value="cage">Sort: Cage Name</option>
                  <option value="date">Sort: Latest Transferred</option>
                  <option value="age">Sort: Fowl Age</option>
                </select>
              </div>

              <button
                type="button"
                onClick={() => setIsAddAllocOpen(true)}
                className="px-3 py-1.5 bg-emerald-600 text-white rounded-xl text-xs font-extrabold uppercase flex items-center gap-1 hover:bg-emerald-700 transition-colors shadow cursor-pointer"
              >
                <Plus size={14} />
                <span>Add Row</span>
              </button>
            </div>
          </div>

          {/* Direct Table Header with Fullscreen Button */}
          <div className="flex items-center justify-between mb-2 mt-3 px-1">
            <div className="flex items-center gap-2">
              <span className="text-xs font-black text-slate-700 uppercase tracking-wider">
                {distViewMode === 'summary' ? 'Cage Location Summary Table' : 'Cage Block Distribution Records'} ({(filteredAndSortedAllocations || []).length})
              </span>
            </div>
            <button
              type="button"
              onClick={() => setFullscreenTable({
                title: "LIVE CAGE BLOCK DISTRIBUTION TABLE",
                subtitle: "Real-time bird population distribution across all building blocks & cages",
                badge: `${(filteredAndSortedAllocations || []).reduce((acc, a) => acc + a.quantity, 0)} Fowls`,
                icon: <Home size={20} />,
                content: (
                  <div className="overflow-x-auto select-none rounded-xl border border-slate-100 h-full min-h-full overflow-y-auto bg-white">
                    <table className="w-full border-collapse text-left min-w-[950px]">
                      <thead className="bg-slate-100 sticky top-0 text-[10px] font-black text-slate-600 uppercase tracking-wider z-10">
                        <tr>
                          <th className="p-2.5">BLOCK</th>
                          <th className="p-2.5">CAGE</th>
                          <th className="p-2.5">FLOCK BATCH</th>
                          <th className="p-2.5">SPECIES</th>
                          <th className="p-2.5">QTY</th>
                          <th className="p-2.5">AGE</th>
                          <th className="p-2.5">DATE ADDED</th>
                          <th className="p-2.5">NOTES</th>
                          <th className="p-2.5 text-center">ACTIONS</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-[11px] font-semibold text-slate-800">
                        {(filteredAndSortedAllocations || []).map((a) => {
                          return (
                            <tr key={a.id} className="hover:bg-emerald-50/20 transition-colors">
                              <td className="p-2.5 font-black text-slate-900">{a.blockName}</td>
                              <td className="p-2.5 font-black text-emerald-800">{a.cageName}</td>
                              <td className="p-2.5 font-extrabold text-slate-900">{formatShortBatch(a.flockName)}</td>
                              <td className="p-2.5">{a.species || 'Chicken'}</td>
                              <td className="p-2.5 font-black text-emerald-700">{renderBreakdownBadge(a)}</td>
                              <td className="p-2.5 font-mono font-bold">
                                {formatFlockAge(a.dateAdded, a.initialAgeWeeks ?? 0)}
                              </td>
                              <td className="p-2.5 font-mono text-slate-500 text-[10px]">{formatDateDDMMYYYY(a.dateAdded)}</td>
                              <td className="p-2.5 text-slate-500 text-[10px]">{a.notes || '-'}</td>
                              <td className="p-2.5 text-center">
                                <div className="flex items-center justify-center gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => { openCountCorrection(a); setFullscreenTable(null); }}
                                    className="min-h-11 rounded-lg bg-emerald-50 px-2 text-xs font-bold text-emerald-900"
                                    aria-label={`Correct count for ${a.flockName} in ${a.cageName}`}
                                  >Count</button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEditingAlloc(a);
                                      setEditAllocForm({ ...a });
                                      setFullscreenTable(null);
                                    }}
                                    className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg cursor-pointer transition-colors"
                                    title="Edit Row"
                                  >
                                    <Edit3 size={14} />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      handleDeleteAlloc(a.id);
                                      setFullscreenTable(null);
                                    }}
                                    className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg cursor-pointer transition-colors"
                                    title="Delete Row"
                                  >
                                    <Trash2 size={14} />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )
              })}
              className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer border border-slate-200"
              title="View Fullscreen Table"
            >
              <Maximize2 size={15} />
              <span className="hidden sm:inline">Fullscreen</span>
            </button>
          </div>

          {/* Allocation Table or Cage Location Summary Table */}
          {distViewMode === 'summary' ? (
            <div className="overflow-x-auto rounded-xl border border-slate-100 max-h-96 overflow-y-auto">
              <table className="w-full border-collapse text-left min-w-[700px]">
                <thead className="bg-slate-50 sticky top-0 text-[11px] font-black text-slate-500 uppercase tracking-wider z-10">
                  <tr>
                    <th className="p-3">BLOCK NAME</th>
                    <th className="p-3">CAGE NAME</th>
                    <th className="p-3">TOTAL BIRDS</th>
                    <th className="p-3">SPECIES BREAKDOWN</th>
                    <th className="p-3">OCCUPYING BATCHES</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs font-semibold text-slate-700">
                  {groupedCageOccupancy.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="p-6 text-center text-slate-400 font-bold bg-slate-50/40">
                        No cage summary records found matching filters.
                      </td>
                    </tr>
                  ) : (
                    groupedCageOccupancy.map((c) => {
                      return (
                        <tr key={c.cageName} className="hover:bg-emerald-50/20 transition-colors">
                          <td className="p-3 font-extrabold text-slate-900">
                            <span className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded-md font-black text-[10px] uppercase">
                              {c.blockName}
                            </span>
                          </td>
                          <td className="p-3 font-black text-slate-900 text-sm">
                            <span className="text-slate-900 font-black">{c.cageName}</span>
                          </td>
                          <td className="p-3">
                            <span className="px-3 py-1 bg-emerald-100 text-emerald-900 font-black text-xs rounded-full border border-emerald-300 shadow-xs">
                              {c.totalBirds} Birds
                            </span>
                          </td>
                          <td className="p-3">
                            <div className="flex flex-wrap gap-1.5">
                              {Object.entries(c.speciesCounts).map(([sp, qty]) => {
                                let icon = '🐔';
                                let badgeColor = 'bg-emerald-50 text-emerald-800 border-emerald-200';
                                if (sp.toLowerCase().includes('turkey')) {
                                  icon = '🦃';
                                  badgeColor = 'bg-amber-50 text-amber-800 border-amber-200';
                                } else if (sp.toLowerCase().includes('agric')) {
                                  icon = '🌾';
                                  badgeColor = 'bg-purple-50 text-purple-800 border-purple-200';
                                } else if (sp.toLowerCase().includes('quail')) {
                                  icon = '🪶';
                                  badgeColor = 'bg-blue-50 text-blue-800 border-blue-200';
                                }
                                return (
                                  <span key={sp} className={`px-2 py-0.5 rounded-md font-extrabold text-[11px] border ${badgeColor}`}>
                                    {icon} {qty} {sp}
                                  </span>
                                );
                              })}
                            </div>
                          </td>
                          <td className="p-3">
                            <div className="space-y-1">
                              {c.batches.map(b => (
                                <div key={b.id} className="text-[11px] font-bold text-slate-700 flex items-center justify-between gap-2 bg-white p-2 rounded-xl border border-slate-200/80 shadow-2xs">
                                  <span className="font-extrabold text-slate-900">{b.flockName}</span>
                                  <span className="text-emerald-700 font-mono text-[10px] font-bold">
                                    {b.quantity} birds • {formatFlockAge(b.dateAdded, b.initialAgeWeeks ?? 0)}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-100 max-h-96 overflow-y-auto">
              <table className="w-full border-collapse text-left min-w-[750px]">
                <thead className="bg-slate-50 sticky top-0 text-[11px] font-black text-slate-500 uppercase tracking-wider z-10">
                  <tr>
                    <th className="p-3">BLOCK NAME</th>
                    <th className="p-3">CAGE NAME</th>
                    <th className="p-3">FLOCK NAME</th>
                    <th className="p-3">SPECIES</th>
                    <th className="p-3 cursor-pointer hover:bg-slate-100 transition-colors" onClick={() => setDistSortBy(distSortBy === 'qty_desc' ? 'qty_asc' : 'qty_desc')}>
                      <div className="flex items-center gap-1">
                        <span>QUANTITY</span>
                        <ArrowUpDown size={12} className="text-emerald-600" />
                      </div>
                    </th>
                    <th className="p-3">AGE</th>
                    <th className="p-3">DATE ADDED</th>
                    <th className="p-3">NOTES / BREED</th>
                    <th className="p-3 text-center">ACTIONS</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs font-semibold text-slate-700">
                  {filteredAndSortedAllocations.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="p-6 text-center text-slate-400 font-bold bg-slate-50/40">
                        No cage allocation rows found matching criteria.
                      </td>
                    </tr>
                  ) : (
                    filteredAndSortedAllocations.map((a) => {
                      const sp = (a.species || 'Chicken').toLowerCase();
                      let icon = '🐔';
                      let badge = <span className="px-2 py-0.5 bg-emerald-100 text-emerald-900 rounded-md font-bold text-[10px]">🐔 Chicken</span>;
                      if (sp.includes('turkey')) {
                        icon = '🦃';
                        badge = <span className="px-2 py-0.5 bg-amber-100 text-amber-900 rounded-md font-bold text-[10px]">🦃 Turkey</span>;
                      } else if (sp.includes('agric')) {
                        icon = '🌾';
                        badge = <span className="px-2 py-0.5 bg-purple-100 text-purple-900 rounded-md font-bold text-[10px]">🌾 Agric Fowl</span>;
                      } else if (sp.includes('quail')) {
                        icon = '🪶';
                        badge = <span className="px-2 py-0.5 bg-blue-100 text-blue-900 rounded-md font-bold text-[10px]">🪶 Quail</span>;
                      }

                      return (
                        <tr key={a.id} className="hover:bg-emerald-50/20 transition-colors">
                          <td className="p-3 font-extrabold text-slate-900">
                            <span className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded-md font-black text-[10px] uppercase">
                              {a.blockName}
                            </span>
                          </td>
                          <td className="p-3 font-black text-slate-900 text-xs">
                            <span className="text-slate-900 font-extrabold text-xs">{a.cageName}</span>
                          </td>
                          <td className="p-3 font-bold text-slate-800 flex items-center gap-1.5">
                            <span>{icon}</span>
                            <span className="font-black">{a.flockName}</span>
                          </td>
                          <td className="p-3">{badge}</td>
                          <td className="p-3">{renderBreakdownBadge(a)}</td>
                          <td className="p-3 text-slate-600 font-mono font-bold">
                            {formatFlockAge(a.dateAdded, a.initialAgeWeeks ?? 0)}
                          </td>
                          <td className="p-3 text-slate-500 font-mono text-[11px]">{formatDateDDMMYYYY(a.dateAdded)}</td>
                          <td className="p-3 text-slate-500 max-w-[180px] truncate" title={a.notes || ''}>
                            {a.notes || '-'}
                          </td>
                          <td className="p-3 text-center">
                            <div className="flex items-center justify-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => openCountCorrection(a)}
                                className="min-h-11 rounded-lg bg-emerald-50 px-2 text-xs font-bold text-emerald-900"
                                aria-label={`Correct count for ${a.flockName} in ${a.cageName}`}
                              >Count</button>
                              <button
                                type="button"
                                onClick={() => {
                                  if (a.species === 'Rabbit' || a.species === 'Quail') { openAnimalHousing(a.species); return; }
                                  const matchedFlock = (data.flocks || []).find(fl => fl.id === a.id.replace('flock-', '')) || (data.flocks || []).find(fl => fl.name.toLowerCase() === a.flockName.toLowerCase());
                                  if (matchedFlock) {
                                    setTransferSourceFlockId(matchedFlock.id);
                                  }
                                  setTransferFlockName(a.flockName);
                                  setTransferSpecies(a.species || 'Chicken');
                                  setTransferFromCage(a.cageName);
                                  setTransferQty(String(a.quantity));
                                  setTransferAgeWeeks(formatFlockAge(a.dateAdded, a.initialAgeWeeks ?? 0));
                                  setTransferToCage('');
                                  setActiveFormSection('transfer');
                                  setTimeout(() => {
                                    const el = document.getElementById('transfer-form-section');
                                    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                  }, 100);
                                }}
                                className="p-1.5 text-amber-600 hover:bg-amber-50 rounded-lg transition-colors cursor-pointer"
                                title="Transfer fowls from this cage"
                              >
                                <ArrowRightLeft size={15} />
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  if (a.species === 'Rabbit' || a.species === 'Quail') { openAnimalHousing(a.species); return; }
                                  setEditingAlloc(a);
                                  setEditAllocForm({ ...a });
                                }}
                                className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
                                title="Edit Row Details"
                              >
                                <Edit3 size={15} />
                              </button>
                              <button
                                type="button"
                                onClick={() => { if (a.species === 'Rabbit' || a.species === 'Quail') openAnimalHousing(a.species); else handleDeleteAlloc(a.id); }}
                                className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                                title="Delete Allocation Row"
                              >
                                <Trash2 size={15} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* TRANSFER HISTORY & CAGE AUDIT TRAIL VIEW */}
        <div className="mb-6 bg-white rounded-2xl p-5 border border-slate-200 shadow-xs">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-2xl bg-amber-500/10 text-amber-700 flex items-center justify-center font-bold shadow-xs">
                <History size={19} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h4 className="text-sm font-black text-slate-900 uppercase tracking-wider">
                    TRANSFER HISTORY & CAGE AUDIT TRAIL
                  </h4>
                  <span className="bg-amber-100 text-amber-900 text-[10px] font-extrabold px-2.5 py-0.5 rounded-full uppercase">
                    {(data.cage_transfers || []).length} Recorded Transfers
                  </span>
                </div>
                <p className="text-slate-400 text-xs font-semibold mt-0.5">
                  Chronological log of all completed fowl movements between cages
                </p>
              </div>
            </div>

            {/* Search and Species Filters */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search flock, cage, date..."
                  value={historySearch}
                  onChange={(e) => setHistorySearch(e.target.value)}
                  className="pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:ring-2 focus:ring-amber-500 outline-none w-48"
                />
              </div>

              <select
                value={historySpeciesFilter}
                onChange={(e) => setHistorySpeciesFilter(e.target.value as any)}
                className="py-1.5 px-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:ring-2 focus:ring-amber-500 outline-none cursor-pointer"
              >
                <option value="ALL">All Species</option>
                <option value="Chicken">🐔 Chickens</option>
                <option value="Turkey">🦃 Turkeys</option>
              </select>

              <button
                type="button"
                onClick={() => setFullscreenTable({
                  title: "TRANSFER HISTORY & CAGE AUDIT TRAIL",
                  subtitle: "Chronological log of all completed fowl movements between cages & blocks",
                  badge: `${(data.cage_transfers || []).length} Recorded Movements`,
                  icon: <History size={20} />,
                  content: (
                    <div className="overflow-x-auto select-none rounded-xl border border-slate-100 h-full min-h-full overflow-y-auto bg-white">
                      <table className="w-full border-collapse text-left min-w-[800px]">
                        <thead className="bg-slate-100 sticky top-0 text-[10px] font-black text-slate-600 uppercase tracking-wider z-10">
                          <tr>
                            <th className="p-2">DATE</th>
                            <th className="p-2">BATCH</th>
                            <th className="p-2">MOVEMENT (FROM → TO)</th>
                            <th className="p-2">QTY</th>
                            <th className="p-2">AGE</th>
                            <th className="p-2">PURPOSE</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 text-[11px] font-semibold text-slate-800">
                          {(sortedTransferHistory || []).map((t) => (
                            <tr key={t.id} className="hover:bg-amber-50/20 transition-colors">
                              <td className="p-2 font-mono font-bold text-slate-700 text-[10px]">{formatDateDDMMYYYY(t.date)}</td>
                              <td className="p-2 font-extrabold text-slate-900">{formatShortBatch(t.flockName)}</td>
                              <td className="p-2 font-mono font-black text-emerald-800">{t.fromCage} → {t.toCage}</td>
                              <td className="p-2 font-black text-slate-900">{t.quantity}</td>
                              <td className="p-2 font-mono font-bold">{formatAgeDisplay(t.ageWeeks)}</td>
                              <td className="p-2 text-slate-500 text-[10px]">{t.notes || '-'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )
                })}
                className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer border border-slate-200"
                title="View Fullscreen Table"
              >
                <Maximize2 size={15} />
                <span className="hidden sm:inline">Fullscreen</span>
              </button>
            </div>
          </div>

          {/* Chronological Table */}
          <div className="overflow-x-auto rounded-xl border border-slate-100 max-h-96 overflow-y-auto">
            <table className="w-full border-collapse text-left min-w-[700px]">
              <thead className="bg-slate-50 sticky top-0 text-[11px] font-black text-slate-500 uppercase tracking-wider z-10">
                <tr>
                  <th className="p-3">TRANSFER DATE</th>
                  <th className="p-3">FLOCK BATCH</th>
                  <th className="p-3">CAGE MOVEMENT (FROM → TO)</th>
                  <th className="p-3">QTY TRANSFERRED</th>
                  <th className="p-3">AGE AT MOVE</th>
                  <th className="p-3">NOTES / PURPOSE</th>
                  <th className="p-3 text-center">ACTIONS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs font-semibold text-slate-700">
                {sortedTransferHistory.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-slate-400 font-bold bg-slate-50/40">
                      <div className="flex flex-col items-center justify-center gap-1">
                        <History size={24} className="text-slate-300 mb-1" />
                        <span>No transfer history logs found matching search criteria.</span>
                      </div>
                    </td>
                  </tr>
                ) : (
                  sortedTransferHistory.map((t) => {
                    const isTurkey = t.species === 'Turkey';
                    return (
                      <tr key={t.id} className="hover:bg-amber-50/20 transition-colors">
                        <td className="p-3 font-mono text-[11px] font-bold text-slate-600">
                          <div className="flex items-center gap-1.5">
                            <Calendar size={13} className="text-amber-600 shrink-0" />
                            <span>{formatDateDDMMYYYY(t.date)}</span>
                          </div>
                        </td>
                        <td className="p-3 font-bold text-slate-900">
                          <div className="flex items-center gap-1.5">
                            <span>{isTurkey ? '🦃' : '🐔'}</span>
                            <span>{t.flockName}</span>
                          </div>
                        </td>
                        <td className="p-3">
                          <div className="flex items-center gap-2">
                            <span className="px-2.5 py-1 bg-slate-100 text-slate-800 rounded-lg font-black text-xs border border-slate-200 font-mono">
                              {t.fromCage}
                            </span>
                            <MoveRight size={14} className="text-emerald-600 shrink-0" />
                            <span className="px-2.5 py-1 bg-emerald-100 text-emerald-900 rounded-lg font-black text-xs border border-emerald-200/80 font-mono">
                              {t.toCage}
                            </span>
                          </div>
                        </td>
                        <td className="p-3">
                          <span className="px-2.5 py-1 bg-amber-50 text-amber-900 font-black text-xs rounded-full border border-amber-200">
                            {t.quantity} birds
                          </span>
                        </td>
                        <td className="p-3 text-slate-600 font-mono">
                          {formatAgeDisplay(t.ageWeeks)}
                        </td>
                        <td className="p-3 text-slate-500 max-w-[200px] truncate" title={t.notes || ''}>
                          {t.notes || '-'}
                        </td>
                        <td className="p-3 text-center">
                          <button
                            type="button"
                            onClick={() => handleDeleteTransfer(t.id)}
                            className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                            title="Delete Transfer Audit Record"
                          >
                            <Trash2 size={15} />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {selectedFlockIds.length > 0 && (
          <div className="mb-3 p-3 bg-slate-900 text-white rounded-xl flex items-center justify-between text-xs font-bold animate-in fade-in duration-200">
            <span>Selected {selectedFlockIds.length} flock(s)</span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => handleBulkDeletePoultry('flocks', selectedFlockIds)}
                className="px-2.5 py-1 bg-red-650 rounded-lg hover:bg-red-700 font-extrabold text-[10px] uppercase cursor-pointer text-white"
              >
                Delete Selected
              </button>
              <button
                type="button"
                onClick={() => setSelectedFlockIds([])}
                className="px-2 py-1 bg-white/10 rounded-lg hover:bg-white/20 font-extrabold text-[10px] uppercase cursor-pointer text-slate-350"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* CAGE TRANSFER AUDIT HISTORY */}
        {(data.cage_transfers && data.cage_transfers.length > 0) && (
          <div className="mt-6 pt-4 border-t border-slate-100">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Layers size={16} className="text-emerald-600" />
                <h4 className="text-xs font-black text-slate-700 uppercase tracking-wider">
                  Cage Transfer History Log ({data.cage_transfers.length} Transfers Recorded)
                </h4>
              </div>
              <button
                type="button"
                onClick={() => setFullscreenTable({
                  title: "CAGE TRANSFER AUDIT HISTORY",
                  subtitle: "Detailed log of all bird movements between blocks and cages",
                  badge: `${data.cage_transfers.length} Transfers`,
                  icon: <Layers size={20} />,
                  content: (
                    <div className="overflow-x-auto select-none rounded-xl border border-slate-100 h-full min-h-full overflow-y-auto bg-white">
                      <table className="w-full border-collapse text-left min-w-[700px]">
                        <thead className="bg-slate-100 sticky top-0 text-[10px] font-black text-slate-600 uppercase tracking-wider z-10">
                          <tr>
                            <th className="p-2.5">Date</th>
                            <th className="p-2.5">Flock / Batch</th>
                            <th className="p-2.5">Moved From</th>
                            <th className="p-2.5">Moved To</th>
                            <th className="p-2.5">Qty Transferred</th>
                            <th className="p-2.5">Age</th>
                            <th className="p-2.5">Notes</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 text-[11px] font-semibold text-slate-800">
                          {data.cage_transfers.map((t) => (
                            <tr key={t.id} className="hover:bg-slate-50/50">
                              <td className="p-2.5 font-mono text-slate-500">{formatDateDDMMYYYY(t.date)}</td>
                              <td className="p-2.5 font-bold text-slate-800">
                                {t.species === 'Turkey' ? '🦃' : '🐔'} {t.flockName} ({t.breed})
                              </td>
                              <td className="p-2.5 text-rose-700 font-semibold">{t.fromCage}</td>
                              <td className="p-2.5 text-emerald-700 font-extrabold flex items-center gap-1">
                                <MoveRight size={12} className="text-emerald-500" />
                                {t.toCage}
                              </td>
                              <td className="p-2.5 font-extrabold text-slate-900">{t.quantity} birds</td>
                              <td className="p-2.5">{formatAgeDisplay(t.ageWeeks)}</td>
                              <td className="p-2.5 text-slate-500">{t.notes || '-'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )
                })}
                className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer border border-slate-200"
                title="View Table Fullscreen"
              >
                <Maximize2 size={15} />
                <span className="hidden sm:inline">Fullscreen</span>
              </button>
            </div>

            <div className="overflow-x-auto rounded-xl border border-slate-100 max-h-48 overflow-y-auto">
              <table className="w-full border-collapse text-left min-w-[500px]">
                <thead className="bg-slate-50 sticky top-0 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  <tr>
                    <th className="p-2.5">Date</th>
                    <th className="p-2.5">Flock / Batch</th>
                    <th className="p-2.5">Moved From</th>
                    <th className="p-2.5">Moved To</th>
                    <th className="p-2.5">Qty Transferred</th>
                    <th className="p-2.5">Age</th>
                    <th className="p-2.5">Notes</th>
                    <th className="p-2.5 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium text-slate-700 text-xs">
                  {data.cage_transfers.map((t) => (
                    <tr key={t.id} className="hover:bg-slate-50/50">
                      <td className="p-2.5 font-mono text-slate-500">{formatDateDDMMYYYY(t.date)}</td>
                      <td className="p-2.5 font-bold text-slate-800">
                        {t.species === 'Turkey' ? '🦃' : '🐔'} {t.flockName} ({t.breed})
                      </td>
                      <td className="p-2.5 text-rose-700 font-semibold">{t.fromCage}</td>
                      <td className="p-2.5 text-emerald-700 font-extrabold flex items-center gap-1">
                        <MoveRight size={12} className="text-emerald-500" />
                        {t.toCage}
                      </td>
                      <td className="p-2.5 font-extrabold text-slate-900">{t.quantity} birds</td>
                      <td className="p-2.5">{formatAgeDisplay(t.ageWeeks)}</td>
                      <td className="p-2.5 text-slate-500">{t.notes || '-'}</td>
                      <td className="p-2.5 text-center">
                        <button
                          type="button"
                          onClick={() => handleDeleteTransfer(t.id)}
                          className="p-1 text-slate-400 hover:text-red-600 rounded cursor-pointer transition-colors"
                          title="Delete transfer log"
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* DAILY FARM EGG COLLECTION LOG SECTION */}
      <div id="section_egg_collections" hidden={farmSubSection !== 'all' && farmSubSection !== 'eggs'} className="bg-white rounded-3xl p-5 shadow-sm border border-slate-100">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/10 text-amber-600 flex items-center justify-center font-bold shadow-xs">
              <Egg size={22} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-black text-slate-900 uppercase tracking-tight">Daily Farm Egg Collection Log</h3>
                <span className="bg-amber-100 text-amber-900 text-[10px] font-extrabold px-2.5 py-0.5 rounded-full uppercase">
                  {(data.daily_egg_collections || []).length} Days Logged
                </span>
              </div>
              <p className="text-slate-400 text-xs font-semibold mt-0.5">
                Record chicken, turkey and quail eggs in one daily log.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              const todayEggs = rawData.daily_egg_collections?.find(row => row.date === getCameroonTodayISO());
              setEditingEggColl(todayEggs || null);
              setEggFormDate(getCameroonTodayISO());
              setEggFormBrahma(todayEggs ? String(todayEggs.brahmaEggs || 0) : '');
              setEggFormTurkey(todayEggs ? String(todayEggs.turkeyEggs || 0) : '');
              setEggFormQuail(todayEggs ? String(todayEggs.quailEggs || 0) : '');
              setEggFormNotes(todayEggs?.notes || '');
              setEggFormRecordedBy(todayEggs?.recordedBy || '');
              setIsEggCollFormOpen(!isEggCollFormOpen);
            }}
            className="px-4 py-2 bg-amber-600 text-white rounded-xl text-xs font-black uppercase flex items-center gap-2 hover:bg-amber-700 transition-colors shadow cursor-pointer self-start sm:self-auto"
          >
            {isEggCollFormOpen ? <Minus size={16} /> : <Plus size={16} />}
            <span>{isEggCollFormOpen ? 'Close Form' : 'Log Daily Eggs'}</span>
          </button>
        </div>

        {/* Daily yield by species */}
        {!isEggCollFormOpen && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3 mb-5">
          {/* Brahma Section */}
          <div className="p-4 bg-amber-50/50 rounded-2xl border border-amber-200/60 flex items-center justify-between">
            <div>
              <div className="flex items-center gap-1.5 text-xs font-extrabold text-amber-900 uppercase tracking-wider">
                <span>🐔</span>
                <span>Brahma Eggs (Chicken)</span>
              </div>
              <div className="text-2xl font-black text-slate-900 mt-1 font-mono">
                {(data.daily_egg_collections || []).reduce((acc, r) => acc + (r.brahmaEggs || 0), 0).toLocaleString()}
                <span className="text-xs font-bold text-slate-500 ml-1">eggs total</span>
              </div>
            </div>
            <div className="text-right">
              <span className="text-[10px] font-bold text-slate-400 block uppercase">Today's Brahma</span>
              <span className="text-sm font-black text-amber-700">
                {((data.daily_egg_collections || []).find(r => r.date === getCameroonTodayISO())?.brahmaEggs || 0)} eggs
              </span>
            </div>
          </div>

          {/* Turkey Section */}
          <div className="p-4 bg-orange-50/50 rounded-2xl border border-orange-200/60 flex items-center justify-between">
            <div>
              <div className="flex items-center gap-1.5 text-xs font-extrabold text-orange-900 uppercase tracking-wider">
                <span>🦃</span>
                <span>Turkey Eggs</span>
              </div>
              <div className="text-2xl font-black text-slate-900 mt-1 font-mono">
                {(data.daily_egg_collections || []).reduce((acc, r) => acc + (r.turkeyEggs || 0), 0).toLocaleString()}
                <span className="text-xs font-bold text-slate-500 ml-1">eggs total</span>
              </div>
            </div>
            <div className="text-right">
              <span className="text-[10px] font-bold text-slate-400 block uppercase">Today's Turkey</span>
              <span className="text-sm font-black text-orange-700">
                {((data.daily_egg_collections || []).find(r => r.date === getCameroonTodayISO())?.turkeyEggs || 0)} eggs
              </span>
            </div>
          </div>

          {/* Combined Total */}
          <div className="p-4 bg-sky-50/50 rounded-2xl border border-sky-200/60 flex items-center justify-between">
            <div><div className="text-xs font-extrabold text-sky-900 uppercase">🐦 Quail Eggs</div><div className="text-2xl font-black text-slate-900 mt-1 font-mono">{(data.daily_egg_collections || []).reduce((sum, row) => sum + (row.quailEggs || 0), 0).toLocaleString()} <span className="text-xs text-slate-500">eggs total</span></div></div>
            <div className="text-right"><span className="text-[10px] font-bold text-slate-400 block uppercase">Today’s Quail</span><span className="text-sm font-black text-sky-800">{(data.daily_egg_collections || []).find(row => row.date === getCameroonTodayISO())?.quailEggs || 0} eggs</span></div>
          </div>
          <div className="p-4 bg-emerald-50/50 rounded-2xl border border-emerald-200/60 flex items-center justify-between">
            <div>
              <div className="flex items-center gap-1.5 text-xs font-extrabold text-emerald-900 uppercase tracking-wider">
                <span>🥚</span>
                <span>Total Combined Yield</span>
              </div>
              <div className="text-2xl font-black text-slate-900 mt-1 font-mono">
                {(data.daily_egg_collections || []).reduce((acc, r) => acc + (r.totalEggs || 0), 0).toLocaleString()}
                <span className="text-xs font-bold text-slate-500 ml-1">eggs total</span>
              </div>
            </div>
            <div className="text-right">
              <span className="text-[10px] font-bold text-slate-400 block uppercase">Today Total</span>
              <span className="text-sm font-black text-emerald-700">
                {((data.daily_egg_collections || []).find(r => r.date === getCameroonTodayISO())?.totalEggs || 0)} eggs
              </span>
            </div>
          </div>
        </div>
        )}

        {/* Collapsible Input Form */}
        {isEggCollFormOpen && (
          <form id="form_section_egg_collection" onSubmit={handleSaveEggCollection} className="scroll-mt-20 bg-slate-50 p-5 rounded-2xl border border-slate-200 space-y-4 mb-6 animate-in fade-in duration-200">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h4 className="text-sm font-black text-slate-900 uppercase tracking-wider flex items-center gap-2">
                <span>{editingEggColl ? '✏️ Edit Daily Egg Collection Log' : '🥚 Record Today\'s Egg Collection'}</span>
              </h4>
              <span className="text-xs font-extrabold text-amber-700 bg-amber-100 px-2.5 py-0.5 rounded-full">
                One daily log
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1 ml-1">Collection Date</label>
                <input
                  type="date"
                  value={eggFormDate}
                  onChange={(e) => setEggFormDate(e.target.value)}
                  className="w-full text-xs font-bold p-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-amber-500 outline-none"
                  required
                />
              </div>

              {/* Section 1: Brahma Eggs */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1 ml-1 flex items-center justify-between">
                  <span>🐔 Brahma Eggs</span>
                </label>
                <input
                  type="number"
                  min="0"
                  placeholder="e.g. 150"
                  value={eggFormBrahma}
                  onChange={(e) => setEggFormBrahma(e.target.value)}
                  className="w-full text-xs font-bold p-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-amber-500 outline-none"
                />
              </div>

              {/* Section 2: Turkey Eggs */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1 ml-1 flex items-center justify-between">
                  <span>🦃 Turkey Eggs</span>
                </label>
                <input
                  type="number"
                  min="0"
                  placeholder="e.g. 45"
                  value={eggFormTurkey}
                  onChange={(e) => setEggFormTurkey(e.target.value)}
                  className="w-full text-xs font-bold p-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-orange-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1 ml-1">🐦 Quail Eggs</label>
                <input type="number" inputMode="numeric" min="0" step="1" placeholder="e.g. 24" value={eggFormQuail} onChange={event => setEggFormQuail(event.target.value)} className="w-full text-base font-bold p-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none" />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1 ml-1">Recorded By</label>
                <input
                  type="text"
                  placeholder="Uses your account name if blank"
                  value={eggFormRecordedBy}
                  onChange={(e) => setEggFormRecordedBy(e.target.value)}
                  className="w-full text-xs font-bold p-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-amber-500 outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1 ml-1">Notes / Remarks</label>
              <input
                type="text"
                placeholder="Optional notes e.g., clean nests, broken eggs, feed change..."
                value={eggFormNotes}
                onChange={(e) => setEggFormNotes(e.target.value)}
                className="w-full text-xs font-bold p-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-amber-500 outline-none"
              />
            </div>

            <div className="flex items-center justify-between pt-2">
              <div className="text-xs font-extrabold text-slate-600 font-mono">
                Calculated Total Eggs: <span className="text-amber-600 text-sm">{ (Number(eggFormBrahma) || 0) + (Number(eggFormTurkey) || 0) + (Number(eggFormQuail) || 0) }</span>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setEditingEggColl(null);
                    setIsEggCollFormOpen(false);
                  }}
                  className="px-4 py-2 bg-slate-200 text-slate-700 rounded-xl font-bold uppercase text-xs hover:bg-slate-300 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading || farmAction.busy}
                  className="px-5 py-2 bg-amber-600 text-white rounded-xl font-black uppercase tracking-wider text-xs shadow hover:bg-amber-700 transition-colors cursor-pointer flex items-center gap-1.5"
                >
                  <Check size={14} />
                  <span>{loading ? 'Saving Log...' : editingEggColl ? 'Update Daily Log' : 'Save Daily Collection'}</span>
                </button>
              </div>
            </div>
          </form>
        )}

        {/* Daily Egg Collection Log Table Header & Controls */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-3">
          <h4 className="text-xs font-black text-slate-700 uppercase tracking-wider">
            Egg Collection History Log ({sortedEggCollections.length} Records)
          </h4>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search date, notes, operator..."
                value={eggSearch}
                onChange={(e) => setEggSearch(e.target.value)}
                className="pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:ring-2 focus:ring-amber-500 outline-none w-56"
              />
            </div>

            <button
              type="button"
              onClick={() => setFullscreenTable({
                title: "DAILY FARM EGG COLLECTION LOG TABLE",
                subtitle: "Daily collection tracking for Brahma, Turkey and Quail",
                badge: `${sortedEggCollections.length} Days Logged`,
                icon: <Egg size={20} />,
                content: (
                  <div className="overflow-x-auto select-none rounded-xl border border-slate-100 h-full min-h-full overflow-y-auto bg-white">
                    <table className="w-full border-collapse text-left min-w-[800px]">
                      <thead className="bg-slate-100 sticky top-0 text-[10px] font-black text-slate-600 uppercase tracking-wider z-10">
                        <tr>
                          <th className="p-2">DATE</th>
                          <th className="p-2">🐔 BRAHMA</th>
                          <th className="p-2">🦃 TURKEY</th>
                          <th className="p-2">🐦 QUAIL</th>
                          <th className="p-2">🥚 TOTAL</th>
                          <th className="p-2">RECORDED BY</th>
                          <th className="p-2">NOTES</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-[11px] font-semibold text-slate-800">
                        {(sortedEggCollections || []).map((rec) => (
                          <tr key={rec.id} className="hover:bg-amber-50/20 transition-colors">
                            <td className="p-2 font-mono font-bold text-slate-900 text-[10px]">{formatDateDDMMYYYY(rec.date)}</td>
                            <td className="p-2 font-black text-amber-900">{rec.brahmaEggs || 0}</td>
                            <td className="p-2 font-black text-orange-900">{rec.turkeyEggs || 0}</td>
                            <td className="p-2 font-black text-sky-900">{rec.quailEggs || 0}</td>
                            <td className="p-2 font-black text-emerald-800">{rec.totalEggs || 0}</td>
                            <td className="p-2 text-slate-700">{rec.recordedBy || '-'}</td>
                            <td className="p-2 text-slate-500 text-[10px]">{rec.notes || '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )
              })}
              className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer border border-slate-200"
              title="View Fullscreen Table"
            >
              <Maximize2 size={15} />
              <span className="hidden sm:inline">Fullscreen</span>
            </button>
          </div>
        </div>

        {/* Daily Egg Collection Log Table */}
        <div className="overflow-x-auto select-none rounded-xl border border-slate-100 max-h-80 overflow-y-auto">
          <table className="w-full border-collapse text-left min-w-[650px]">
            <thead className="bg-slate-50 sticky top-0 text-xs font-bold text-slate-500 uppercase tracking-wider">
              <tr>
                <th className="p-3">Collection Date</th>
                <th className="p-3">🐔 Brahma Eggs</th>
                <th className="p-3">🦃 Turkey Eggs</th>
                <th className="p-3">🐦 Quail Eggs</th>
                <th className="p-3">🥚 Total Daily Eggs</th>
                <th className="p-3">Recorded By</th>
                <th className="p-3">Notes / Remarks</th>
                <th className="p-3 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium text-slate-700 text-sm">
              {sortedEggCollections.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-6 text-center text-slate-400 font-bold bg-slate-50/40">
                    No daily egg collection records found. Click "Log Daily Eggs" to record today's yield.
                  </td>
                </tr>
              ) : (
                sortedEggCollections.map((rec) => {
                  const isToday = rec.date === getCameroonTodayISO();
                  return (
                    <tr key={rec.id} className={`hover:bg-amber-50/20 transition-colors ${isToday ? 'bg-amber-50/40' : ''}`}>
                      <td className="p-3 font-mono font-bold text-slate-900 flex items-center gap-2">
                        <span>{formatDateDDMMYYYY(rec.date)}</span>
                        {isToday && (
                          <span className="px-2 py-0.5 bg-amber-500 text-white font-black text-[9px] rounded-md uppercase">
                            Today
                          </span>
                        )}
                      </td>
                      <td className="p-3">
                        <span className="px-2.5 py-1 bg-amber-50 text-amber-900 font-black text-xs rounded-full border border-amber-200">
                          {rec.brahmaEggs} eggs
                        </span>
                      </td>
                      <td className="p-3">
                        <span className="px-2.5 py-1 bg-orange-50 text-orange-900 font-black text-xs rounded-full border border-orange-200">
                          {rec.turkeyEggs} eggs
                        </span>
                      </td>
                      <td className="p-3"><span className="px-2.5 py-1 bg-sky-50 text-sky-900 font-bold text-xs rounded-full border border-sky-200">{rec.quailEggs || 0} eggs</span></td>
                      <td className="p-3">
                        <span className="px-2.5 py-1 bg-emerald-100 text-emerald-900 font-black text-xs rounded-full border border-emerald-200 font-mono">
                          {rec.totalEggs} eggs
                        </span>
                      </td>
                      <td className="p-3 text-xs font-bold text-slate-600">
                        {rec.recordedBy || 'Operator'}
                      </td>
                      <td className="p-3 text-xs text-slate-500 max-w-[200px] truncate" title={rec.notes || ''}>
                        {rec.notes || '-'}
                      </td>
                      <td className="p-3 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => startEditEggCollection(rec)}
                            className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg cursor-pointer transition-colors"
                            title="Edit Record"
                          >
                            <Edit3 size={15} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteEggCollection(rec.id)}
                            className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg cursor-pointer transition-colors"
                            title="Delete Record"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* SECTION 2: FEED RECORDS */}
      <div id="section_feed" hidden={farmSubSection !== 'all' && farmSubSection !== 'feed'} className="bg-white rounded-3xl p-5 shadow-sm border border-slate-100">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-bold text-slate-900">Feed purchases</h3>
            <p className="text-slate-400 text-xs font-semibold">Track stock quantities & expenses for feed bags</p>
          </div>
          <button
            id="toggle_feed_form"
            onClick={() => toggleSection('feed')}
            className={`cursor-pointer min-h-11 px-3 rounded-xl text-sm font-semibold flex items-center justify-center gap-1 transition-colors ${
              activeFormSection === 'feed' ? 'bg-rose-50 text-rose-600' : 'bg-emerald-50 text-emerald-600'
            }`}
          >
            {activeFormSection === 'feed' ? <><Minus size={18} /> Close</> : <><Plus size={18} /> Add feed</>}
          </button>
        </div>

        {activeFormSection === 'feed' && (
          <form id="form_section_feed" onSubmit={handleAddFeed} className="scroll-mt-20 bg-slate-50/50 p-4 rounded-2xl border border-slate-100 space-y-4 mb-6">
            <DraftSavedBadge
              hasRestoredDraft={hasFeedDraft}
              onDiscard={() => {
                clearFeedDraft();
                setFeedBags('');
                setFeedCostBag('');
                setFeedRemaining('');
              }}
            />
            <h4 className="text-sm font-bold text-slate-700 uppercase tracking-wider mb-2">Log Feed Bags Purchase</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 ml-1">Date Purchased</label>
                <input
                  type="date"
                  value={feedDate}
                  onChange={(e) => setFeedDate(e.target.value)}
                  className={largeInputClass}
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 ml-1">Feed Formulation</label>
                <select
                  value={feedType}
                  onChange={(e) => setFeedType(e.target.value)}
                  className={largeInputClass}
                >
                  <option value="Starter">Starter</option>
                  <option value="Grower">Grower</option>
                  <option value="Layers">Layers</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 ml-1">For animals</label>
                <select value={feedSpecies} onChange={(e) => setFeedSpecies(e.target.value as 'Poultry' | 'Rabbit' | 'Quail')} className={largeInputClass}>
                  <option value="Poultry">Chickens or turkeys</option>
                  <option value="Rabbit">Rabbits</option>
                  <option value="Quail">Quail</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 ml-1">Number of Bags Bought</label>
                <input
                  type="number"
                  placeholder="e.g. 10"
                  min="1"
                  value={feedBags}
                  onChange={(e) => setFeedBags(e.target.value)}
                  className={largeInputClass}
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 ml-1">Weight Per Bag (kg)</label>
                <input
                  type="number"
                  placeholder="e.g. 50"
                  min="1"
                  value={feedWeight}
                  onChange={(e) => setFeedWeight(e.target.value)}
                  className={largeInputClass}
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 ml-1">Cost Per Bag (FCFA)</label>
                <input
                  type="number"
                  placeholder="e.g. 21000"
                  min="0"
                  value={feedCostBag}
                  onChange={(e) => setFeedCostBag(e.target.value)}
                  className={largeInputClass}
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 ml-1">Total Remaining Bags Stock</label>
                <input
                  type="number"
                  placeholder="Remaining bags physically in warehouse"
                  min="0"
                  value={feedRemaining}
                  onChange={(e) => setFeedRemaining(e.target.value)}
                  className={largeInputClass}
                  required
                />
              </div>
            </div>

            <div className="bg-emerald-50 p-3 rounded-xl border border-emerald-100 flex justify-between items-center">
              <span className="text-xs font-bold text-emerald-800 uppercase tracking-wider">Auto Real-Time Bill:</span>
              <strong className="text-lg text-emerald-700">
                {((Number(feedBags) || 0) * (Number(feedCostBag) || 0)).toLocaleString()} FCFA
              </strong>
            </div>

            <button
              type="submit"
              disabled={loading || farmAction.busy}
              className="w-full h-12 bg-emerald-600 text-white rounded-xl font-bold uppercase tracking-wider text-sm shadow hover:bg-emerald-700 transition-colors active:scale-[0.98] cursor-pointer"
            >
              {loading ? 'Saving...' : 'Save Feed Record'}
            </button>
          </form>
        )}

        {selectedFeedIds.length > 0 && (
          <div className="mb-3 p-3 bg-slate-900 text-white rounded-xl flex items-center justify-between text-xs font-bold animate-in fade-in duration-200">
            <span>Selected {selectedFeedIds.length} feed record(s)</span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => handleBulkDeletePoultry('feed', selectedFeedIds)}
                className="px-2.5 py-1 bg-red-650 rounded hover:bg-red-700 font-extrabold text-[10px] uppercase cursor-pointer text-white"
              >
                Delete Selected
              </button>
              <button
                type="button"
                onClick={() => setSelectedFeedIds([])}
                className="px-2 py-1 bg-white/10 rounded hover:bg-white/20 font-extrabold text-[10px] uppercase cursor-pointer text-slate-350"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Direct Table Header with Fullscreen Button */}
        <div className="flex items-center justify-between mb-2 mt-4 px-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-black text-slate-700 uppercase tracking-wider">
              Feed Inventory & Purchases Log ({data.feed_records.length} Records)
            </span>
          </div>
          <button
            type="button"
            onClick={() => setFullscreenTable({
              title: "FEED PURCHASE INVENTORY LOG",
              subtitle: "All commercial feed purchases, bag quantities, unit costs, and warehouse stock levels",
              badge: `${data.feed_records.length} Purchases`,
              icon: <Package size={20} />,
              content: (
                <div className="overflow-x-auto select-none rounded-xl border border-slate-100 h-full min-h-full overflow-y-auto bg-white">
                  <table className="w-full border-collapse text-left min-w-[750px]">
                    <thead className="bg-slate-100 sticky top-0 text-[10px] font-black text-slate-600 uppercase tracking-wider z-10">
                      <tr>
                        <th className="p-2.5">Purchase Date</th>
                        <th className="p-2.5">Feed Type</th>
                        <th className="p-2.5">Bags Bought</th>
                        <th className="p-2.5">Price Per Bag</th>
                        <th className="p-2.5">Total Amount</th>
                        <th className="p-2.5">Stock Remaining</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-[11px] font-semibold text-slate-800">
                      {data.feed_records.map((feed) => (
                        <tr key={feed.id} className="hover:bg-amber-50/20 transition-colors">
                          <td className="p-2.5 font-mono text-slate-600">{formatDateDDMMYYYY(feed.date)}</td>
                          <td className="p-2.5 font-bold text-slate-900">{feed.feedType} <span className="text-slate-500">· {feed.species || 'Poultry'}</span></td>
                          <td className="p-2.5 font-black text-slate-900">{feed.bagsBought} bags ({feed.weightPerBag}kg)</td>
                          <td className="p-2.5 font-mono text-slate-700">{(feed.costBag || 0).toLocaleString()} FCFA</td>
                          <td className="p-2.5 font-mono font-bold text-emerald-800">{(feed.totalCost || 0).toLocaleString()} FCFA</td>
                          <td className="p-2.5 font-mono font-black text-amber-900">{feed.stockRemaining} bags</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            })}
            className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer border border-slate-200"
            title="View Table Fullscreen"
          >
            <Maximize2 size={15} />
            <span className="hidden sm:inline">Fullscreen</span>
          </button>
        </div>

        <div className="overflow-x-auto select-none rounded-xl border border-slate-100 max-h-80 overflow-y-auto">
          <table className="w-full border-collapse text-left min-w-[500px]">
            <thead className="bg-slate-50 sticky top-0 text-xs font-bold text-slate-500 uppercase tracking-wider">
              <tr>
                <th className="p-3 w-10 text-center">
                  <input
                    type="checkbox"
                    checked={data.feed_records.length > 0 && selectedFeedIds.length === data.feed_records.length}
                    onChange={(e) => {
                      if (e.target.checked) setSelectedFeedIds(data.feed_records.map(x => x.id));
                      else setSelectedFeedIds([]);
                    }}
                    className="rounded border-slate-300 text-emerald-650 focus:ring-emerald-500 cursor-pointer"
                  />
                </th>
                <th className="p-3">Purchase Date</th>
                <th className="p-3">Feed Type</th>
                <th className="p-3">Bags Bought</th>
                <th className="p-3">Price Per Bag</th>
                <th className="p-3">Total Amount</th>
                <th className="p-3">Stock Remaining</th>
                <th className="p-3 text-center">Delete</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium text-slate-700 text-sm">
              {data.feed_records.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-4 text-center text-slate-400 font-semibold bg-slate-50/50">
                    No feed purchases mapped. Click "+" to register bags.
                  </td>
                </tr>
              ) : (
                data.feed_records.map((fed) => {
                  const isS = selectedFeedIds.includes(fed.id);
                  return (
                    <tr key={fed.id} className={`hover:bg-slate-50/40 ${isS ? 'bg-emerald-50/10' : ''}`}>
                      <td className="p-3 w-10 text-center">
                        <input
                          type="checkbox"
                          checked={isS}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedFeedIds([...selectedFeedIds, fed.id]);
                            } else {
                              setSelectedFeedIds(selectedFeedIds.filter(id => id !== fed.id));
                            }
                          }}
                          className="rounded border-slate-300 text-emerald-650 focus:ring-emerald-500 cursor-pointer"
                        />
                      </td>
                      <td className="p-3 text-xs text-slate-500 font-mono">{formatDateDDMMYYYY(fed.date)}</td>
                      <td className="p-3 font-bold text-slate-900">{fed.feedType} <span className="text-slate-500">· {fed.species || 'Poultry'}</span></td>
                      <td className="p-3">{fed.bagsBought} bags ({fed.weightPerBag}kg)</td>
                      <td className="p-3 text-xs">{fed.costBag.toLocaleString()} FCFA</td>
                      <td className="p-3 text-emerald-700 font-extrabold">{fed.totalCost.toLocaleString()} FCFA</td>
                      <td className="p-3 font-bold text-indigo-700">{fed.stockRemaining} bags</td>
                      <td className="p-3 text-center">
                        <button
                          onClick={() => handleDeleteRow('/api/feed', fed.id)}
                          className="p-2 text-rose-500 hover:bg-rose-50 rounded-lg cursor-pointer"
                        >
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* SECTION 3: SALES */}
      <div id="section_sales" hidden={farmSubSection !== 'all' && farmSubSection !== 'sales'} className="bg-white rounded-3xl p-5 shadow-sm border border-slate-100">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-bold text-slate-900">Sales</h3>
            <p className="text-slate-500 text-xs font-semibold">Sell rabbits, quail, poultry and eggs. Live stock and cage counts update automatically.</p>
          </div>
          <button
            id="toggle_sales_form"
            onClick={() => toggleSection('sales')}
            className={`cursor-pointer min-h-11 px-3 rounded-xl text-sm font-semibold flex items-center justify-center gap-1 transition-colors ${
              activeFormSection === 'sales' ? 'bg-rose-50 text-rose-600' : 'bg-emerald-50 text-emerald-600'
            }`}
          >
            {activeFormSection === 'sales' ? <><Minus size={18} /> Close</> : <><Plus size={18} /> Add sale</>}
          </button>
        </div>

        {activeFormSection === 'sales' && (
          <form id="form_section_sales" onSubmit={handleAddSale} className="scroll-mt-20 bg-slate-50/50 p-4 rounded-2xl border border-slate-100 space-y-4 mb-6">
            <DraftSavedBadge
              hasRestoredDraft={hasSaleDraft}
              onDiscard={() => {
                clearSaleDraft();
                setSaleQty('');
                setSalePrice('');
                setSaleBuyer('');
                setSaleFlockId('');
                setSaleAgeWeeks('');
                setSaleNotes('');
              }}
            />
            <h4 className="text-sm font-bold text-slate-700 uppercase tracking-wider mb-2">Record Customer Sale</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 ml-1">Sale Date</label>
                <input
                  type="date"
                  value={saleDate}
                  onChange={(e) => setSaleDate(e.target.value)}
                  className={largeInputClass}
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 ml-1">Animal or product sold</label>
                <select
                  value={saleItem}
                  onChange={(e) => {
                    const selected = e.target.value as any;
                    setSaleItem(selected);
                    // Reset selected flock if category changes
                    setSaleFlockId('');
                    setSaleAgeWeeks('');
                  }}
                  className={largeInputClass}
                >
                  <option value="Fowl">Brahma Fowl (Live)</option>
                  <option value="Egg">Brahma Eggs (Table)</option>
                  <option value="Fertilized Egg">Fertilized Eggs (Hatching)</option>
                  <option value="Chick">Brahma Chicks (Day Old+)</option>
                  <option value="Turkey">Turkey (Poult / Mature)</option>
                  <option value="Feed">Feed Resale Bags</option>
                  <option value="Rabbit">Rabbit (Live)</option>
                  <option value="Quail">Quail (Live)</option>
                  <option value="Quail Chick">Quail Chicks</option>
                  <option value="Quail Egg">Quail Eggs</option>
                </select>
              </div>

              {saleItem === 'Rabbit' && <label className="block text-sm font-semibold text-slate-700">Rabbit or litter<select value={saleFlockId} onChange={e => { setSaleFlockId(e.target.value); setSaleQty('1'); }} required className={largeInputClass}><option value="">Choose live rabbits</option>{sharedRabbitChoices.map(choice => <option key={choice.id} value={choice.id}>{choice.label}</option>)}</select></label>}
              {(saleItem === 'Quail' || saleItem === 'Quail Chick') && <label className="block text-sm font-semibold text-slate-700">Quail flock<select value={saleFlockId} onChange={e => setSaleFlockId(e.target.value)} required className={largeInputClass}><option value="">Choose live quail</option>{rawData.flocks.filter(f => isQuailFlock(f.id) && f.quantity > 0).map(f => <option key={f.id} value={f.id}>{f.name} · {f.quantity} alive</option>)}</select></label>}

              {/* Conditional Flock Selection and Age in Weeks for Live Birds */}
              {(saleItem === 'Fowl' || saleItem === 'Chick' || saleItem === 'Turkey') && (
                <>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 ml-1 text-slate-700">
                      Deduct from Farm Batch / Flock
                    </label>
                    <select
                      value={saleFlockId}
                      onChange={(e) => {
                        const fid = e.target.value;
                        setSaleFlockId(fid);
                        const targetF = (data?.flocks || []).find(x => x.id === fid);
                        if (targetF) {
                          const ageNum = calculateCurrentAgeWeeks(targetF.dateAdded, targetF.initialAgeWeeks ?? 0);
                          setSaleAgeWeeks(String(ageNum));
                        }
                      }}
                      className="w-full h-12 px-4 rounded-xl border border-blue-200 focus:outline-none focus:ring-2 focus:ring-blue-500 font-semibold text-blue-900 transition-colors bg-blue-50/50"
                      required
                    >
                      <option value="">-- Choose active farm flock --</option>
                      {(data?.flocks || [])
                        .filter(f => {
                          if (saleItem === 'Turkey') return f.species === 'Turkey';
                          return (f.species || 'Chicken') === 'Chicken';
                        })
                        .map(f => (
                          <option key={f.id} value={f.id}>
                            {f.name} ({f.quantity} left | {formatFlockAge(f.dateAdded, f.initialAgeWeeks ?? 0)} old)
                          </option>
                        ))
                      }
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 ml-1">
                      Age Sold (Weeks)
                    </label>
                    <input
                      type="number"
                      placeholder="e.g. 12"
                      min="0"
                      value={saleAgeWeeks}
                      onChange={(e) => setSaleAgeWeeks(e.target.value)}
                      className={largeInputClass}
                      required
                    />
                  </div>
                </>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 ml-1">Quantity Sold</label>
                <input
                  type="number"
                  placeholder="e.g. 5"
                  min="1"
                  value={saleQty}
                  onChange={(e) => setSaleQty(e.target.value)}
                  className={largeInputClass}
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 ml-1">Unit Price (FCFA)</label>
                <input
                  type="number"
                  placeholder="e.g. 4500"
                  min="0"
                  value={salePrice}
                  onChange={(e) => setSalePrice(e.target.value)}
                  className={largeInputClass}
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 ml-1">Buyer Full Name</label>
                <input
                  type="text"
                  placeholder="e.g. Alhaji Ibrahim Bafoussam"
                  value={saleBuyer}
                  onChange={(e) => setSaleBuyer(e.target.value)}
                  className={largeInputClass}
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 ml-1">Sale Notes</label>
                <input
                  type="text"
                  placeholder="Add payment status or vehicle detail"
                  value={saleNotes}
                  onChange={(e) => setSaleNotes(e.target.value)}
                  className={largeInputClass}
                />
              </div>
            </div>

            <div className="bg-emerald-50 p-3 rounded-xl border border-emerald-100 flex justify-between items-center">
              <span className="text-xs font-bold text-emerald-800 uppercase tracking-wider">Expected Earnings:</span>
              <strong className="text-lg text-emerald-700">
                {((Number(saleQty) || 0) * (Number(salePrice) || 0)).toLocaleString()} FCFA
              </strong>
            </div>

            <button
              type="submit"
              disabled={loading || farmAction.busy}
              className="w-full h-12 bg-emerald-600 text-white rounded-xl font-bold uppercase tracking-wider text-sm shadow hover:bg-emerald-700 transition-colors active:scale-[0.98] cursor-pointer"
            >
              {loading ? 'Registering...' : 'Log Safe Sale'}
            </button>
          </form>
        )}

        {selectedSaleIds.length > 0 && (
          <div className="mb-3 p-3 bg-slate-900 text-white rounded-xl flex items-center justify-between text-xs font-bold animate-in fade-in duration-200">
            <span>Selected {selectedSaleIds.length} sale(s)</span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => handleBulkDeletePoultry('sales', selectedSaleIds)}
                className="px-2.5 py-1 bg-red-650 rounded hover:bg-red-700 font-extrabold text-[10px] uppercase cursor-pointer text-white"
              >
                Delete Selected
              </button>
              <button
                type="button"
                onClick={() => setSelectedSaleIds([])}
                className="px-2 py-1 bg-white/10 rounded hover:bg-white/20 font-extrabold text-[10px] uppercase cursor-pointer text-slate-350"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Direct Table Header with Fullscreen Button */}
        <div className="flex items-center justify-between mb-2 mt-4 px-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-black text-slate-700 uppercase tracking-wider">
              Poultry & Livestock Sales Ledger ({data.poultry_sales.length} Sales)
            </span>
          </div>
          <button
            type="button"
            onClick={() => setFullscreenTable({
              title: "POULTRY SALES LEDGER",
              subtitle: "All live bird and turkey sales transactions, quantities, unit prices, and revenue",
              badge: `${data.poultry_sales.length} Sales`,
              icon: <DollarSign size={20} />,
              content: (
                <div className="overflow-x-auto select-none rounded-xl border border-slate-100 h-full min-h-full overflow-y-auto bg-white">
                  <table className="w-full border-collapse text-left min-w-[750px]">
                    <thead className="bg-slate-100 sticky top-0 text-[10px] font-black text-slate-600 uppercase tracking-wider z-10">
                      <tr>
                        <th className="p-2.5">Sale Date</th>
                        <th className="p-2.5">Buyer Name</th>
                        <th className="p-2.5">Item Type</th>
                        <th className="p-2.5">Qty Sold</th>
                        <th className="p-2.5">Unit Price</th>
                        <th className="p-2.5">Total Revenue</th>
                        <th className="p-2.5">Notes</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-[11px] font-semibold text-slate-800">
                      {data.poultry_sales.map((sale) => (
                        <tr key={sale.id} className="hover:bg-emerald-50/20 transition-colors">
                          <td className="p-2.5 font-mono text-slate-600">{formatDateDDMMYYYY(sale.date)}</td>
                          <td className="p-2.5 font-bold text-slate-900">{sale.buyerName || 'Walk-in Buyer'}</td>
                          <td className="p-2.5 font-extrabold text-emerald-800">{sale.itemType}</td>
                          <td className="p-2.5 font-black text-slate-900">{sale.quantity}</td>
                          <td className="p-2.5 font-mono text-slate-700">{(sale.unitPrice || 0).toLocaleString()} FCFA</td>
                          <td className="p-2.5 font-mono font-bold text-emerald-800">{(sale.totalAmount || 0).toLocaleString()} FCFA</td>
                          <td className="p-2.5 text-slate-500">{sale.notes || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            })}
            className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer border border-slate-200"
            title="View Table Fullscreen"
          >
            <Maximize2 size={15} />
            <span className="hidden sm:inline">Fullscreen</span>
          </button>
        </div>

        <div className="overflow-x-auto select-none rounded-xl border border-slate-100 max-h-80 overflow-y-auto">
          <table className="w-full border-collapse text-left min-w-[500px]">
            <thead className="bg-slate-50 sticky top-0 text-xs font-bold text-slate-500 uppercase tracking-wider">
              <tr>
                <th className="p-3 w-10 text-center">
                  <input
                    type="checkbox"
                    checked={data.poultry_sales.length > 0 && selectedSaleIds.length === data.poultry_sales.length}
                    onChange={(e) => {
                      if (e.target.checked) setSelectedSaleIds(data.poultry_sales.map(x => x.id));
                      else setSelectedSaleIds([]);
                    }}
                    className="rounded border-slate-300 text-emerald-650 focus:ring-emerald-500 cursor-pointer"
                  />
                </th>
                <th className="p-3">Sale Date</th>
                <th className="p-3">Buyer Name</th>
                <th className="p-3">Item Type</th>
                <th className="p-3">Quantity</th>
                <th className="p-3">Unit Price</th>
                <th className="p-3">Revenue Total</th>
                <th className="p-3 text-center">Delete</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium text-slate-700 text-sm">
              {data.poultry_sales.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-4 text-center text-slate-400 font-semibold bg-slate-50/50">
                    No sales recorded yet. Click "+" to start selling.
                  </td>
                </tr>
              ) : (
                data.poultry_sales.map((sal) => {
                  const isS = selectedSaleIds.includes(sal.id);
                  return (
                    <tr key={sal.id} className={`hover:bg-slate-50/40 ${isS ? 'bg-emerald-50/10' : ''}`}>
                      <td className="p-3 w-10 text-center">
                        <input
                          type="checkbox"
                          checked={isS}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedSaleIds([...selectedSaleIds, sal.id]);
                            } else {
                              setSelectedSaleIds(selectedSaleIds.filter(id => id !== sal.id));
                            }
                          }}
                          className="rounded border-slate-300 text-emerald-650 focus:ring-emerald-500 cursor-pointer"
                        />
                      </td>
                      <td className="p-3 text-xs text-slate-500 font-mono">{formatDateDDMMYYYY(sal.date)}</td>
                      <td className="p-3 text-slate-900 font-bold">{sal.buyerName}</td>
                      <td className="p-3">
                        <div className="flex flex-col items-start gap-0.5">
                          <span className="p-1 px-2 py-0.5 rounded-lg text-[10px] font-extrabold uppercase bg-teal-50 text-emerald-800 border border-emerald-100">
                            {sal.itemType}
                          </span>
                          {sal.ageWeeks !== undefined && sal.ageWeeks !== null && (
                            <span className="text-[10px] font-bold text-slate-400 font-mono">
                              {formatAgeDisplay(sal.ageWeeks)}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="p-3 font-bold">{sal.quantity}</td>
                      <td className="p-3 text-xs">{sal.unitPrice.toLocaleString()} FCFA</td>
                      <td className="p-3 text-emerald-700 font-black">{sal.totalAmount.toLocaleString()} FCFA</td>
                      <td className="p-3 text-center">
                        <button
                          onClick={() => handleDeleteRow('/api/sales', sal.id)}
                          title={sal.stockAction ? 'Reverse sale and restore stock' : 'Delete sale'}
                          className="p-2 text-rose-500 hover:bg-rose-50 rounded-lg cursor-pointer"
                        >
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* SECTION 4: MORTALITY */}
      <div id="section_mortality" hidden={farmSubSection !== 'all' && farmSubSection !== 'mortality'} className="bg-white rounded-3xl p-5 shadow-sm border border-slate-100">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-black text-slate-800 uppercase tracking-tight">4. Mortality Tracker</h3>
            <p className="text-slate-400 text-xs font-semibold">Monitor bird health drop offs</p>
          </div>
          <button
            id="toggle_mort_form"
            onClick={() => toggleSection('mortality')}
            className={`cursor-pointer min-h-11 px-3 rounded-xl text-sm font-semibold flex items-center justify-center gap-1 transition-colors ${
              activeFormSection === 'mortality' ? 'bg-rose-50 text-rose-600' : 'bg-emerald-50 text-emerald-600'
            }`}
          >
            {activeFormSection === 'mortality' ? <><Minus size={18} /> Close</> : <><Plus size={18} /> Add loss</>}
          </button>
        </div>

        {activeFormSection === 'mortality' && (
          <form id="form_section_mortality" onSubmit={handleAddMortality} className="scroll-mt-20 bg-slate-50/50 p-4 rounded-2xl border border-slate-100 space-y-4 mb-6">
            <DraftSavedBadge
              hasRestoredDraft={hasMortDraft}
              onDiscard={() => {
                clearMortDraft();
                setMortFlockId('');
                setMortQty('');
                setMortCause('');
              }}
            />
            <h4 className="text-sm font-bold text-slate-700 uppercase tracking-wider mb-2">Record Animal Death</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 ml-1">Date</label>
                <input
                  type="date"
                  value={mortDate}
                  onChange={(e) => setMortDate(e.target.value)}
                  className={largeInputClass}
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 ml-1">Animal or flock affected</label>
                <select
                  value={mortFlockId}
                  onChange={(e) => setMortFlockId(e.target.value)}
                  className={largeInputClass}
                  required
                >
                  <option value="">-- Choose Affected Flock --</option>
                  <optgroup label="Rabbits">{sharedRabbitChoices.map(choice => <option key={choice.id} value={choice.id}>{choice.label}</option>)}</optgroup>
                  {data.flocks.map(f => (
                    <option key={f.id} value={f.id}>{f.name} ({f.quantity} alive)</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 ml-1">Number of Casualties</label>
                <input
                  type="number"
                  placeholder="e.g. 2"
                  min="1"
                  value={mortQty}
                  onChange={(e) => setMortQty(e.target.value)}
                  className={largeInputClass}
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 ml-1">Suspected Cause (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. Extreme heat stress / Coccidiosis"
                  value={mortCause}
                  onChange={(e) => setMortCause(e.target.value)}
                  className={largeInputClass}
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || farmAction.busy}
              className="w-full h-12 bg-rose-600 text-white rounded-xl font-bold uppercase tracking-wider text-sm shadow hover:bg-rose-700 transition-colors active:scale-[0.98] cursor-pointer"
            >
              {loading ? 'Saving…' : 'Save animal loss'}
            </button>
          </form>
        )}

        {selectedMortalityIds.length > 0 && (
          <div className="mb-3 p-3 bg-slate-900 text-white rounded-xl flex items-center justify-between text-xs font-bold animate-in fade-in duration-200">
            <span>Selected {selectedMortalityIds.length} mortality record(s)</span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => handleBulkDeletePoultry('mortality', selectedMortalityIds)}
                className="px-2.5 py-1 bg-red-650 rounded hover:bg-red-700 font-extrabold text-[10px] uppercase cursor-pointer text-white"
              >
                Delete Selected
              </button>
              <button
                type="button"
                onClick={() => setSelectedMortalityIds([])}
                className="px-2 py-1 bg-white/10 rounded hover:bg-white/20 font-extrabold text-[10px] uppercase cursor-pointer text-slate-350"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Direct Table Header with Fullscreen Button */}
        <div className="flex items-center justify-between mb-2 mt-4 px-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-black text-slate-700 uppercase tracking-wider">
              Mortality & Flock Casualties Log ({data.mortality.length} Records)
            </span>
          </div>
          <button
            type="button"
            onClick={() => setFullscreenTable({
              title: "MORTALITY & CASUALTIES LOG",
              subtitle: "Flock mortality tracking, health audits, suspected loss causes, and count adjustments",
              badge: `${data.mortality.length} Records`,
              icon: <Skull size={20} />,
              content: (
                <div className="overflow-x-auto select-none rounded-xl border border-slate-100 h-full min-h-full overflow-y-auto bg-white">
                  <table className="w-full border-collapse text-left min-w-[750px]">
                    <thead className="bg-slate-100 sticky top-0 text-[10px] font-black text-slate-600 uppercase tracking-wider z-10">
                      <tr>
                        <th className="p-2.5">Date Recorded</th>
                        <th className="p-2.5">Flock Affected</th>
                        <th className="p-2.5">Qty Lost</th>
                        <th className="p-2.5">Suspected Cause</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-[11px] font-semibold text-slate-800">
                      {data.mortality.map((m) => (
                        <tr key={m.id} className="hover:bg-rose-50/20 transition-colors">
                          <td className="p-2.5 font-mono text-slate-600">{formatDateDDMMYYYY(m.date)}</td>
                          <td className="p-2.5 font-bold text-slate-900">{m.flockName || 'Unknown Batch'}</td>
                          <td className="p-2.5 font-black text-rose-700">-{m.quantity} birds</td>
                          <td className="p-2.5 text-slate-600">{m.cause || 'Unspecified'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            })}
            className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer border border-slate-200"
            title="View Table Fullscreen"
          >
            <Maximize2 size={15} />
            <span className="hidden sm:inline">Fullscreen</span>
          </button>
        </div>

        <div className="overflow-x-auto select-none rounded-xl border border-slate-100 max-h-85 overflow-y-auto">
          <table className="w-full border-collapse text-left min-w-[500px]">
            <thead className="bg-slate-50 sticky top-0 text-xs font-bold text-slate-500 uppercase tracking-wider">
              <tr>
                <th className="p-3 w-10 text-center">
                  <input
                    type="checkbox"
                    checked={data.mortality.length > 0 && selectedMortalityIds.length === data.mortality.length}
                    onChange={(e) => {
                      if (e.target.checked) setSelectedMortalityIds(data.mortality.map(x => x.id));
                      else setSelectedMortalityIds([]);
                    }}
                    className="rounded border-slate-300 text-emerald-650 focus:ring-emerald-500 cursor-pointer"
                  />
                </th>
                <th className="p-3">Date Recorded</th>
                <th className="p-3">Flock Affected</th>
                <th className="p-3">Qty Lost</th>
                <th className="p-3">Suspected Cause</th>
                <th className="p-3 text-center">Delete</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium text-slate-700 text-sm">
              {data.mortality.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-4 text-center text-slate-400 font-semibold bg-slate-50/50">
                    No poultry deaths logged. Healthy fowls!
                  </td>
                </tr>
              ) : (
                data.mortality.map((mor) => {
                  const isS = selectedMortalityIds.includes(mor.id);
                  return (
                    <tr key={mor.id} className={`hover:bg-slate-50/40 ${isS ? 'bg-emerald-50/10' : ''}`}>
                      <td className="p-3 w-10 text-center">
                        <input
                          type="checkbox"
                          checked={isS}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedMortalityIds([...selectedMortalityIds, mor.id]);
                            } else {
                              setSelectedMortalityIds(selectedMortalityIds.filter(id => id !== mor.id));
                            }
                          }}
                          className="rounded border-slate-300 text-emerald-650 focus:ring-emerald-500 cursor-pointer"
                        />
                      </td>
                      <td className="p-3 text-xs text-slate-500 font-mono">{formatDateDDMMYYYY(mor.date)}</td>
                      <td className="p-3 text-slate-900 font-bold">{mor.flockName}</td>
                      <td className="p-3 text-rose-700 font-black">{mor.quantity} birds</td>
                      <td className="p-3 text-xs italic text-slate-500">{mor.cause || 'Unspecified'}</td>
                      <td className="p-3 text-center">
                        <button
                          onClick={() => handleDeleteRow('/api/mortality', mor.id)}
                          title={mor.stockAction ? 'Reverse loss and restore stock' : 'Delete loss'}
                          className="p-2 text-rose-500 hover:bg-rose-50 rounded-lg cursor-pointer"
                        >
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* SECTION 5: FOWLS EATEN AT HOME */}
      <div id="section_fowls_eaten" hidden={farmSubSection !== 'all' && farmSubSection !== 'eaten'} className="bg-white rounded-3xl p-5 shadow-sm border border-slate-100">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-black text-slate-800 uppercase tracking-tight flex items-center gap-2">
              <span>Animals used at home</span>
              <span className="px-2 py-0.5 text-[10px] bg-amber-50 text-amber-800 border border-amber-200 rounded-full font-bold uppercase">
                House Consumption
              </span>
            </h3>
            <p className="text-slate-500 text-xs font-semibold">Record rabbits, quail or poultry used for food. Live stock updates automatically.</p>
          </div>
          <button
            id="toggle_eaten_form"
            onClick={() => toggleSection('fowls_eaten')}
            className={`cursor-pointer min-h-11 px-3 rounded-xl text-sm font-semibold flex items-center justify-center gap-1 transition-colors ${
              activeFormSection === 'fowls_eaten' ? 'bg-rose-50 text-rose-600' : 'bg-emerald-50 text-emerald-600'
            }`}
          >
            {activeFormSection === 'fowls_eaten' ? <><Minus size={18} /> Close</> : <><Plus size={18} /> Add record</>}
          </button>
        </div>

        {activeFormSection === 'fowls_eaten' && (
          <form id="form_section_fowls_eaten" onSubmit={handleAddFowlEaten} className="scroll-mt-20 bg-amber-50/30 p-4 rounded-2xl border border-amber-100 space-y-4 mb-6">
            <DraftSavedBadge
              hasRestoredDraft={hasEatenDraft}
              onDiscard={() => {
                clearEatenDraft();
                setEatenFlockId('');
                setEatenQty('');
                setEatenAgeWeeks('');
                setEatenNotes('');
              }}
            />
            <h4 className="text-sm font-bold text-amber-900 uppercase tracking-wider mb-2">Record House Consumption</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 ml-1">Date</label>
                <input
                  type="date"
                  value={eatenDate}
                  onChange={(e) => setEatenDate(e.target.value)}
                  className={largeInputClass}
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 ml-1">Animal or flock used at home</label>
                <select
                  value={eatenFlockId}
                  onChange={(e) => setEatenFlockId(e.target.value)}
                  className={largeInputClass}
                  required
                >
                  <option value="">-- Choose Source Flock --</option>
                  <optgroup label="Rabbits">{sharedRabbitChoices.map(choice => <option key={choice.id} value={choice.id}>{choice.label}</option>)}</optgroup>
                  {(data.flocks || []).map(f => (
                    <option key={f.id} value={f.id} disabled={f.quantity <= 0}>
                      {f.name} ({f.species || 'Chicken'} - {f.quantity} alive)
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 ml-1">Quantity Eaten</label>
                <input
                  type="number"
                  placeholder="e.g. 1"
                  min="1"
                  value={eatenQty}
                  onChange={(e) => setEatenQty(e.target.value)}
                  className={largeInputClass}
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 ml-1">Age (Weeks)</label>
                <input
                  type="number"
                  step="0.1"
                  placeholder="e.g. 12"
                  min="0"
                  value={eatenAgeWeeks}
                  onChange={(e) => setEatenAgeWeeks(e.target.value)}
                  className={largeInputClass}
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 ml-1">Notes / Occasion (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. Sunday family meal / Guest dinner"
                  value={eatenNotes}
                  onChange={(e) => setEatenNotes(e.target.value)}
                  className={largeInputClass}
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || farmAction.busy}
              className="w-full h-12 bg-amber-600 text-white rounded-xl font-bold uppercase tracking-wider text-sm shadow hover:bg-amber-700 transition-colors active:scale-[0.98] cursor-pointer"
            >
              {loading ? 'Recording...' : 'Register Fowl Eaten'}
            </button>
          </form>
        )}

        {/* Search & Bulk Bar */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-3">
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input
              type="text"
              placeholder="Search eaten records..."
              value={eatenSearch}
              onChange={(e) => setEatenSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
          </div>

          {(selectedEatenIds || []).length > 0 && (
            <div className="w-full sm:w-auto p-2 bg-slate-900 text-white rounded-xl flex items-center justify-between gap-3 text-xs font-bold">
              <span>Selected {selectedEatenIds.length} record(s)</span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => handleBulkDeletePoultry('fowls_eaten', selectedEatenIds)}
                  className="px-2.5 py-1 bg-red-650 rounded hover:bg-red-700 font-extrabold text-[10px] uppercase cursor-pointer text-white"
                >
                  Delete Selected
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedEatenIds([])}
                  className="px-2 py-1 bg-white/10 rounded hover:bg-white/20 font-extrabold text-[10px] uppercase cursor-pointer text-slate-350"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Direct Table Header with Fullscreen Button */}
        <div className="flex items-center justify-between mb-2 mt-4 px-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-black text-slate-700 uppercase tracking-wider">
              Home Consumption & Farm Table Usage ({(data.fowls_eaten || []).length} Records)
            </span>
          </div>
          <button
            type="button"
            onClick={() => setFullscreenTable({
              title: "HOME CONSUMPTION / FOWLS EATEN LOG",
              subtitle: "Birds consumed for home use, hospitality, and internal farm dining",
              badge: `${(data.fowls_eaten || []).length} Records`,
              icon: <UtensilsCrossed size={20} />,
              content: (
                <div className="overflow-x-auto select-none rounded-xl border border-slate-100 h-full min-h-full overflow-y-auto bg-white">
                  <table className="w-full border-collapse text-left min-w-[750px]">
                    <thead className="bg-slate-100 sticky top-0 text-[10px] font-black text-slate-600 uppercase tracking-wider z-10">
                      <tr>
                        <th className="p-2.5">Date</th>
                        <th className="p-2.5">Flock Name</th>
                        <th className="p-2.5">Species / Breed</th>
                        <th className="p-2.5">Qty Eaten</th>
                        <th className="p-2.5">Age (Weeks)</th>
                        <th className="p-2.5">Notes</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-[11px] font-semibold text-slate-800">
                      {(data.fowls_eaten || []).map((eaten) => (
                        <tr key={eaten.id} className="hover:bg-amber-50/20 transition-colors">
                          <td className="p-2.5 font-mono text-slate-600">{formatDateDDMMYYYY(eaten.date)}</td>
                          <td className="p-2.5 font-bold text-slate-900">{eaten.flockName || 'General Flock'}</td>
                          <td className="p-2.5 font-medium text-slate-700">{eaten.species} {eaten.breed ? `(${eaten.breed})` : ''}</td>
                          <td className="p-2.5 font-black text-amber-900">{eaten.quantity} birds</td>
                          <td className="p-2.5 font-mono text-slate-600">{eaten.ageWeeks ? `${eaten.ageWeeks} wks` : '-'}</td>
                          <td className="p-2.5 text-slate-500">{eaten.notes || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            })}
            className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer border border-slate-200"
            title="View Table Fullscreen"
          >
            <Maximize2 size={15} />
            <span className="hidden sm:inline">Fullscreen</span>
          </button>
        </div>

        <div className="overflow-x-auto select-none rounded-xl border border-slate-100 max-h-85 overflow-y-auto">
          <table className="w-full border-collapse text-left min-w-[550px]">
            <thead className="bg-slate-50 sticky top-0 text-xs font-bold text-slate-500 uppercase tracking-wider">
              <tr>
                <th className="p-3 w-10 text-center">
                  <input
                    type="checkbox"
                    checked={(data.fowls_eaten || []).length > 0 && selectedEatenIds.length === (data.fowls_eaten || []).length}
                    onChange={(e) => {
                      if (e.target.checked) setSelectedEatenIds((data.fowls_eaten || []).map(x => x.id));
                      else setSelectedEatenIds([]);
                    }}
                    className="rounded border-slate-300 text-amber-600 focus:ring-amber-500 cursor-pointer"
                  />
                </th>
                <th className="p-3">Date</th>
                <th className="p-3">Flock Name</th>
                <th className="p-3">Species / Breed</th>
                <th className="p-3">Qty Eaten</th>
                <th className="p-3">Age (Weeks)</th>
                <th className="p-3">Notes</th>
                <th className="p-3 text-center">Delete</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium text-slate-700 text-sm">
              {!(data.fowls_eaten) || data.fowls_eaten.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-4 text-center text-slate-400 font-semibold bg-slate-50/50">
                    No fowls recorded as eaten in the house yet.
                  </td>
                </tr>
              ) : (
                (data.fowls_eaten || [])
                  .filter(fe => {
                    if (!eatenSearch.trim()) return true;
                    const q = eatenSearch.toLowerCase();
                    return fe.date.includes(q) ||
                      (fe.flockName || '').toLowerCase().includes(q) ||
                      (fe.species || '').toLowerCase().includes(q) ||
                      (fe.breed || '').toLowerCase().includes(q) ||
                      (fe.notes || '').toLowerCase().includes(q);
                  })
                  .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                  .map((fe) => {
                    const isS = selectedEatenIds.includes(fe.id);
                    return (
                      <tr key={fe.id} className={`hover:bg-amber-50/20 ${isS ? 'bg-amber-50/30' : ''}`}>
                        <td className="p-3 w-10 text-center">
                          <input
                            type="checkbox"
                            checked={isS}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedEatenIds([...selectedEatenIds, fe.id]);
                              } else {
                                setSelectedEatenIds(selectedEatenIds.filter(id => id !== fe.id));
                              }
                            }}
                            className="rounded border-slate-300 text-amber-600 focus:ring-amber-500 cursor-pointer"
                          />
                        </td>
                        <td className="p-3 text-xs text-slate-500 font-mono">{formatDateDDMMYYYY(fe.date)}</td>
                        <td className="p-3 text-slate-900 font-bold">{fe.flockName}</td>
                        <td className="p-3 text-xs">
                          <span className="px-2 py-0.5 rounded-md text-[10px] font-extrabold uppercase bg-amber-50 text-amber-800 border border-amber-200">
                            {fe.species || 'Chicken'} {fe.breed ? `(${fe.breed})` : ''}
                          </span>
                        </td>
                        <td className="p-3 font-black text-amber-800">{fe.quantity} bird(s)</td>
                        <td className="p-3 text-xs font-mono font-bold text-slate-600">
                          {formatAgeDisplay(fe.ageWeeks)}
                        </td>
                        <td className="p-3 text-xs italic text-slate-500">{fe.notes || '-'}</td>
                        <td className="p-3 text-center">
                          <button
                            onClick={() => handleDeleteRow('/api/fowls-eaten', fe.id)}
                            title={fe.stockAction ? 'Reverse household use and restore stock' : 'Delete household use'}
                            className="p-2 text-rose-500 hover:bg-rose-50 rounded-lg cursor-pointer"
                          >
                            <Trash2 size={16} />
                          </button>
                        </td>
                      </tr>
                    );
                  })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* SECTION 6: EXPENSES */}
      <div id="section_expenses" hidden={farmSubSection !== 'all' && farmSubSection !== 'expenses'} className="bg-white rounded-3xl p-5 shadow-sm border border-slate-100">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-black text-slate-800 uppercase tracking-tight">6. Operations Expenses</h3>
            <p className="text-slate-400 text-xs font-semibold">Track electricity, vaccines, transport & wages</p>
          </div>
          <button
            id="toggle_exp_form"
            onClick={() => toggleSection('expense')}
            className={`cursor-pointer min-h-11 px-3 rounded-xl text-sm font-semibold flex items-center justify-center gap-1 transition-colors ${
              activeFormSection === 'expense' ? 'bg-rose-50 text-rose-600' : 'bg-emerald-50 text-emerald-600'
            }`}
          >
            {activeFormSection === 'expense' ? <><Minus size={18} /> Close</> : <><Plus size={18} /> Add expense</>}
          </button>
        </div>

        {activeFormSection === 'expense' && (
          <form id="form_section_expense" onSubmit={handleAddExpense} className="scroll-mt-20 bg-slate-50/50 p-4 rounded-2xl border border-slate-100 space-y-4 mb-6">
            <DraftSavedBadge
              hasRestoredDraft={hasExpDraft}
              onDiscard={() => {
                clearExpDraft();
                setExpDesc('');
                setExpAmount('');
              }}
            />
            <h4 className="text-sm font-bold text-slate-700 uppercase tracking-wider mb-2">Record Farm Expense Outlay</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 ml-1">Expense Date</label>
                <input
                  type="date"
                  value={expDate}
                  onChange={(e) => setExpDate(e.target.value)}
                  className={largeInputClass}
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 ml-1">Cost Category</label>
                <select
                  value={expCat}
                  onChange={(e) => setExpCategory(e.target.value as any)}
                  className={largeInputClass}
                >
                  <option value="Vaccine">Vaccine (Gumboro & Newcastle)</option>
                  <option value="Transport">Transport (Bafoussam Shuttle)</option>
                  <option value="Labor">Labor & Wages</option>
                  <option value="Electricity">Electricity & Heating Brooders</option>
                  <option value="Repair">Cages Repair / Maintenance</option>
                  <option value="Other">Other Miscellaneous Cost</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 ml-1">Sum Paid (FCFA)</label>
                <input
                  type="number"
                  placeholder="e.g. 15000"
                  min="1"
                  value={expAmount}
                  onChange={(e) => setExpAmount(e.target.value)}
                  className={largeInputClass}
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 ml-1">Expense Description</label>
                <input
                  type="text"
                  placeholder="e.g. Buy transport wood shavings for nests"
                  value={expDesc}
                  onChange={(e) => setExpDesc(e.target.value)}
                  className={largeInputClass}
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || farmAction.busy}
              className="w-full h-12 bg-emerald-600 text-white rounded-xl font-bold uppercase tracking-wider text-sm shadow hover:bg-emerald-700 transition-colors active:scale-[0.98] cursor-pointer"
            >
              {loading ? 'Submitting...' : 'Register Expense Log'}
            </button>
          </form>
        )}

        {selectedExpenseIds.length > 0 && (
          <div className="mb-3 p-3 bg-slate-900 text-white rounded-xl flex items-center justify-between text-xs font-bold animate-in fade-in duration-200">
            <span>Selected {selectedExpenseIds.length} expense(s)</span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => handleBulkDeletePoultry('expenses', selectedExpenseIds)}
                className="px-2.5 py-1 bg-red-650 rounded hover:bg-red-700 font-extrabold text-[10px] uppercase cursor-pointer text-white"
              >
                Delete Selected
              </button>
              <button
                type="button"
                onClick={() => setSelectedExpenseIds([])}
                className="px-2 py-1 bg-white/10 rounded hover:bg-white/20 font-extrabold text-[10px] uppercase cursor-pointer text-slate-350"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Direct Table Header with Fullscreen Button */}
        <div className="flex items-center justify-between mb-2 mt-4 px-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-black text-slate-700 uppercase tracking-wider">
              Operating Expenses & Supplies Ledger ({data.expenses.length} Records)
            </span>
          </div>
          <button
            type="button"
            onClick={() => setFullscreenTable({
              title: "OPERATING EXPENSES & SUPPLIES LEDGER",
              subtitle: "All farm overhead, bedding, medications, transport, and equipment expenses",
              badge: `${data.expenses.length} Records`,
              icon: <Receipt size={20} />,
              content: (
                <div className="overflow-x-auto select-none rounded-xl border border-slate-100 h-full min-h-full overflow-y-auto bg-white">
                  <table className="w-full border-collapse text-left min-w-[750px]">
                    <thead className="bg-slate-100 sticky top-0 text-[10px] font-black text-slate-600 uppercase tracking-wider z-10">
                      <tr>
                        <th className="p-2.5">Expense Date</th>
                        <th className="p-2.5">Category</th>
                        <th className="p-2.5">Description</th>
                        <th className="p-2.5">Outlay Price</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-[11px] font-semibold text-slate-800">
                      {data.expenses.map((exp) => (
                        <tr key={exp.id} className="hover:bg-slate-50/50 transition-colors">
                          <td className="p-2.5 font-mono text-slate-600">{formatDateDDMMYYYY(exp.date)}</td>
                          <td className="p-2.5 font-bold text-slate-900">{exp.category}</td>
                          <td className="p-2.5 text-slate-700">{exp.description}</td>
                          <td className="p-2.5 font-mono font-bold text-rose-700">{(exp.amount || 0).toLocaleString()} FCFA</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            })}
            className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer border border-slate-200"
            title="View Table Fullscreen"
          >
            <Maximize2 size={15} />
            <span className="hidden sm:inline">Fullscreen</span>
          </button>
        </div>

        <div className="overflow-x-auto select-none rounded-xl border border-slate-100 max-h-80 overflow-y-auto">
          <table className="w-full border-collapse text-left min-w-[500px]">
            <thead className="bg-slate-50 sticky top-0 text-xs font-bold text-slate-500 uppercase tracking-wider">
              <tr>
                <th className="p-3 w-10 text-center">
                  <input
                    type="checkbox"
                    checked={data.expenses.length > 0 && selectedExpenseIds.length === data.expenses.length}
                    onChange={(e) => {
                      if (e.target.checked) setSelectedExpenseIds(data.expenses.map(x => x.id));
                      else setSelectedExpenseIds([]);
                    }}
                    className="rounded border-slate-300 text-emerald-650 focus:ring-emerald-500 cursor-pointer"
                  />
                </th>
                <th className="p-3">Expense Date</th>
                <th className="p-3">Category</th>
                <th className="p-3">Description</th>
                <th className="p-3">Outlay Price</th>
                <th className="p-3 text-center">Delete</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium text-slate-700 text-sm">
              {data.expenses.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-4 text-center text-slate-400 font-semibold bg-slate-50/50">
                    No operating expenses filed yet.
                  </td>
                </tr>
              ) : (
                data.expenses.map((exp) => {
                  const isS = selectedExpenseIds.includes(exp.id);
                  return (
                    <tr key={exp.id} className={`hover:bg-slate-50/40 ${isS ? 'bg-emerald-50/10' : ''}`}>
                      <td className="p-3 w-10 text-center">
                        <input
                          type="checkbox"
                          checked={isS}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedExpenseIds([...selectedExpenseIds, exp.id]);
                            } else {
                              setSelectedExpenseIds(selectedExpenseIds.filter(id => id !== exp.id));
                            }
                          }}
                          className="rounded border-slate-300 text-emerald-650 focus:ring-emerald-500 cursor-pointer"
                        />
                      </td>
                      <td className="p-3 text-xs text-slate-500 font-mono">{formatDateDDMMYYYY(exp.date)}</td>
                      <td className="p-3 text-slate-900 font-bold">
                        <span className="p-1 px-2 py-1 rounded-md text-xs font-bold uppercase tracking-wide bg-rose-50 text-rose-700 border border-rose-100">
                          {exp.category}
                        </span>
                      </td>
                      <td className="p-3 text-slate-800 font-medium">{exp.description}</td>
                      <td className="p-3 text-rose-700 font-black">{exp.amount.toLocaleString()} FCFA</td>
                      <td className="p-3 text-center">
                        <button
                          onClick={() => handleDeleteRow('/api/expenses', exp.id)}
                          className="p-2 text-rose-500 hover:bg-rose-50 rounded-lg cursor-pointer"
                        >
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* FLOCK EDIT MODAL */}
      {editingFlock && (
        <div id="flock_edit_modal_backdrop" className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div id="flock_edit_modal" className="w-full max-w-lg bg-white rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150 flex flex-col max-h-[85vh] my-auto border border-slate-100">
            <div className="bg-slate-900 p-5 sm:p-6 text-white flex justify-between items-center shrink-0">
              <div>
                <h3 className="text-lg font-black uppercase tracking-tight">Edit Flock Record</h3>
                <p className="text-emerald-400 text-xs font-semibold">Update your bird counts & age parameters</p>
              </div>
              <button 
                type="button"
                onClick={() => setEditingFlock(null)}
                className="text-white/80 hover:text-white bg-white/10 hover:bg-white/20 p-2 rounded-full cursor-pointer h-8 w-8 flex items-center justify-center font-bold text-sm transition-colors"
              >
                ✕
              </button>
            </div>
            
            <form onSubmit={handleSaveFlockEdits} className="flex flex-col flex-1 overflow-hidden min-h-0">
              <div className="p-5 sm:p-6 space-y-4 overflow-y-auto flex-1">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 ml-1">Bird Species</label>
                    <select
                      value={editFlockSpecies}
                      onChange={(e) => setEditFlockSpecies(e.target.value)}
                      className={largeInputClass}
                    >
                      <option value="Chicken">Chicken (Domestic Brahma / Pure Breed)</option>
                      <option value="Turkey">Turkey (Fam Breed)</option>
                      <option value="Agric Fowls">Agric Fowls / Mixed Agric Fowls</option>
                      <option value="Quail">Quail</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 ml-1">Breed / Variety</label>
                    <select
                      value={editFlockBreed}
                      onChange={(e) => setEditFlockBreed(e.target.value)}
                      className={largeInputClass}
                    >
                      <option value="Pure Breed">Pure Breed (Pure Brahma)</option>
                      <option value="Brahma">Brahma (Standard)</option>
                      <option value="Agric Mixed">Agric Fowls / Mixed Agric</option>
                      <option value="Local Breed">Local Breed</option>
                      <option value="Gobbler">Turkey (Gobbler)</option>
                      <option value="Hen">Turkey (Hen)</option>
                      <option value="Quail">Quail</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 ml-1">Flock Label / Name</label>
                    <input
                      type="text"
                      value={editFlockName}
                      onChange={(e) => setEditFlockName(e.target.value)}
                      className={largeInputClass}
                      required
                    />
                  </div>

                  <div className="col-span-full bg-slate-100/80 p-3.5 rounded-2xl border border-slate-200/80 space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div>
                        <label className="block text-xs font-black text-slate-800 uppercase tracking-wider">
                          Batch Quantity & Species Mode
                        </label>
                        <p className="text-[11px] font-semibold text-slate-500">
                          Choose how quantity is counted for this flock batch
                        </p>
                      </div>
                      <div className="flex bg-white p-1 rounded-xl border border-slate-200 text-xs font-bold shadow-2xs">
                        <button
                          type="button"
                          onClick={() => setEditFlockCountMode('single')}
                          className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                            editFlockCountMode === 'single'
                              ? 'bg-emerald-600 text-white font-extrabold shadow-xs'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          Single Total
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditFlockCountMode('sex_breakdown')}
                          className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                            editFlockCountMode === 'sex_breakdown'
                              ? 'bg-emerald-600 text-white font-extrabold shadow-xs'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          🐓 Cocks & Hens
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditFlockCountMode('multi_species')}
                          className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                            editFlockCountMode === 'multi_species'
                              ? 'bg-emerald-600 text-white font-extrabold shadow-xs'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          🐣 Multi-Species
                        </button>
                      </div>
                    </div>

                    {editFlockCountMode === 'single' && (
                      <div>
                        <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1 ml-1">
                          Count of Birds
                        </label>
                        <input
                          type="number"
                          placeholder="e.g. 50"
                          min="1"
                          value={editFlockQty}
                          onChange={(e) => setEditFlockQty(e.target.value)}
                          className={largeInputClass}
                          required={editFlockCountMode === 'single'}
                        />
                      </div>
                    )}

                    {editFlockCountMode === 'sex_breakdown' && (
                      <div className="space-y-2">
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs font-bold text-blue-900 uppercase tracking-wider mb-1 ml-1 flex items-center gap-1">
                              <span>🐓 Cocks (Males)</span>
                            </label>
                            <input
                              type="number"
                              min="0"
                              placeholder="0"
                              value={editFlockCocksCount}
                              onChange={(e) => setEditFlockCocksCount(e.target.value)}
                              className="w-full text-xs font-black p-3 bg-white border border-blue-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-bold text-pink-900 uppercase tracking-wider mb-1 ml-1 flex items-center gap-1">
                              <span>🐔 Hens (Females)</span>
                            </label>
                            <input
                              type="number"
                              min="0"
                              placeholder="0"
                              value={editFlockHensCount}
                              onChange={(e) => setEditFlockHensCount(e.target.value)}
                              className="w-full text-xs font-black p-3 bg-white border border-pink-200 rounded-xl focus:ring-2 focus:ring-pink-500 outline-none"
                            />
                          </div>
                        </div>
                        <div className="p-2.5 bg-emerald-50 rounded-xl border border-emerald-200/80 text-xs font-bold text-emerald-900 flex justify-between items-center">
                          <span>Combined Fowl Total:</span>
                          <span className="text-sm font-black text-emerald-800">
                            {(Number(editFlockCocksCount) || 0) + (Number(editFlockHensCount) || 0)} Fowls ({editFlockCocksCount || 0} cocks + {editFlockHensCount || 0} hens)
                          </span>
                        </div>
                      </div>
                    )}

                    {editFlockCountMode === 'multi_species' && (
                      <div className="space-y-3">
                        <div className="space-y-2">
                          {editFlockSpeciesBreakdown.map((sb, index) => (
                            <div key={index} className="flex items-center gap-2 bg-white p-2.5 rounded-xl border border-slate-200">
                              <div className="flex-1">
                                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-0.5">Species Name</label>
                                <input
                                  type="text"
                                  placeholder="e.g. Turkey, Chicks, Poults..."
                                  value={sb.species}
                                  onChange={(e) => {
                                    const updated = [...editFlockSpeciesBreakdown];
                                    updated[index].species = e.target.value;
                                    setEditFlockSpeciesBreakdown(updated);
                                  }}
                                  className="w-full text-xs font-bold p-2 bg-slate-50 border border-slate-200 rounded-lg outline-none"
                                />
                              </div>
                              <div className="w-28">
                                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-0.5">Quantity</label>
                                <input
                                  type="number"
                                  min="0"
                                  placeholder="0"
                                  value={sb.quantity}
                                  onChange={(e) => {
                                    const updated = [...editFlockSpeciesBreakdown];
                                    updated[index].quantity = e.target.value;
                                    setEditFlockSpeciesBreakdown(updated);
                                  }}
                                  className="w-full text-xs font-black p-2 bg-slate-50 border border-slate-200 rounded-lg outline-none"
                                />
                              </div>
                              {editFlockSpeciesBreakdown.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditFlockSpeciesBreakdown(editFlockSpeciesBreakdown.filter((_, i) => i !== index));
                                  }}
                                  className="mt-4 p-2 text-rose-500 hover:bg-rose-50 rounded-lg cursor-pointer transition-colors"
                                  title="Remove species row"
                                >
                                  <X size={16} />
                                </button>
                              )}
                            </div>
                          ))}
                        </div>

                        <div className="flex items-center justify-between">
                          <button
                            type="button"
                            onClick={() => {
                              setEditFlockSpeciesBreakdown([...editFlockSpeciesBreakdown, { species: 'Chicks', quantity: '0' }]);
                            }}
                            className="px-3 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-xl text-xs font-black uppercase flex items-center gap-1 cursor-pointer transition-colors"
                          >
                            <Plus size={14} />
                            <span>Add Species Row</span>
                          </button>

                          <div className="text-xs font-extrabold text-emerald-800 bg-emerald-50 px-3 py-1.5 rounded-xl border border-emerald-200">
                            Calculated Total: {editFlockSpeciesBreakdown.reduce((acc, sb) => acc + (Number(sb.quantity) || 0), 0)} Birds
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 ml-1">Age (Weeks)</label>
                    <input
                      type="number"
                      min="0"
                      value={editFlockAge}
                      onChange={(e) => setEditFlockAge(e.target.value)}
                      className={largeInputClass}
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 ml-1">Date Added</label>
                    <input
                      type="date"
                      value={editFlockDate}
                      onChange={(e) => setEditFlockDate(e.target.value)}
                      className={largeInputClass}
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 ml-1">
                    Assign Cage Location (Dropdown)
                  </label>
                  <select
                    value={editFlockNotes}
                    onChange={(e) => setEditFlockNotes(e.target.value)}
                    className={largeInputClass}
                  >
                    <option value="">-- Select Cage from Dropdown Menu --</option>
                    {Object.entries(groupedCages).map(([block, cages]) => (
                      <optgroup key={block} label={block}>
                        {(cages as CageLocation[]).map((c) => (
                          <option key={c.id || c.cageName} value={c.cageName}>
                            {getCageOptionLabel(c)}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                  <input
                    type="text"
                    placeholder="Or enter custom cage notes..."
                    value={editFlockNotes}
                    onChange={(e) => setEditFlockNotes(e.target.value)}
                    className="mt-1.5 w-full text-xs font-bold p-2.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none"
                  />
                </div>
              </div>

              {/* Sticky Footer Button Bar */}
              <div className="p-4 sm:px-6 bg-slate-50/90 backdrop-blur-sm border-t border-slate-200 shadow-lg flex gap-3 shrink-0 z-20">
                <button
                  type="button"
                  onClick={() => setEditingFlock(null)}
                  className="flex-1 h-12 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl font-bold uppercase text-xs tracking-wider transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading || farmAction.busy}
                  className="flex-1 h-12 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold uppercase text-xs tracking-wider transition-colors active:scale-[0.98] cursor-pointer shadow-md flex items-center justify-center gap-2"
                >
                  {loading ? 'Saving...' : 'Save Updates'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {correctionModalOpen && <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 p-4 flex items-center justify-center">
        <form onSubmit={saveCountCorrection} className="w-full max-w-md space-y-4 rounded-3xl bg-white p-5 shadow-xl">
          <div><h3 className="text-xl font-bold text-emerald-950">Correct a cage count</h3><p className="text-sm text-slate-600">Count the live chicks or birds in this cage. Your reason will appear in family activity.</p></div>
          <label className="block text-sm font-semibold text-slate-800">Cage and flock<select required value={correctionAllocationId} onChange={event => { const row = liveAllocations.find(item => item.id === event.target.value); setCorrectionAllocationId(event.target.value); setCorrectionQuantity(row ? String(row.quantity) : ''); }} className="mt-1 min-h-12 w-full rounded-xl border border-emerald-200 bg-white px-3 text-base"><option value="">Choose a cage…</option>{liveAllocations.filter(item => item.species !== 'Rabbit').map(item => <option key={item.id} value={item.id}>{item.cageName} · {item.flockName} · {item.quantity} live</option>)}</select></label>
          {correctionAllocation && <p className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900">Current count: <strong>{correctionAllocation.quantity}</strong></p>}
          <label className="block text-sm font-semibold text-slate-800">Correct number alive<input required type="number" inputMode="numeric" min="0" step="1" value={correctionQuantity} onChange={event => setCorrectionQuantity(event.target.value)} className="mt-1 min-h-12 w-full rounded-xl border border-emerald-200 px-3 text-base" /></label>
          <label className="block text-sm font-semibold text-slate-800">Why did the count change?<textarea required minLength={5} maxLength={160} value={correctionReason} onChange={event => setCorrectionReason(event.target.value)} placeholder="For example: counted 2 fewer chicks during cage check" className="mt-1 min-h-24 w-full rounded-xl border border-emerald-200 p-3 text-base" /></label>
          {farmAction.error && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{farmAction.error}</p>}
          <div className="flex gap-2"><button type="button" onClick={() => setCorrectionModalOpen(false)} className="min-h-12 flex-1 rounded-xl border border-slate-200 px-3 font-semibold">Cancel</button><button type="submit" disabled={farmAction.busy} className="min-h-12 flex-1 rounded-xl bg-emerald-700 px-3 font-semibold text-white disabled:opacity-50">{farmAction.busy ? 'Saving…' : 'Save correction'}</button></div>
        </form>
      </div>}

      {/* EDIT CAGE ALLOCATION MODAL */}
      {editingAlloc && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-white rounded-3xl shadow-xl overflow-hidden animate-in zoom-in-95 duration-150">
            <div className="bg-slate-900 p-5 text-white flex justify-between items-center">
              <div>
                <h3 className="text-sm font-black uppercase tracking-tight">Edit Cage Allocation Row</h3>
                <p className="text-slate-400 text-xs font-semibold">Update live bird block distribution record</p>
              </div>
              <button
                type="button"
                onClick={() => setEditingAlloc(null)}
                className="text-slate-400 hover:text-white p-2 rounded-full cursor-pointer text-sm"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveAllocEdits} className="p-5 space-y-4">
              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">Select Registered Cage Location</label>
                <select
                  value={editAllocForm.cageName || ''}
                  onChange={(e) => {
                    const selectedCageName = e.target.value;
                    const matchedCage = allFarmCages.find(c => c.cageName.toUpperCase() === selectedCageName.toUpperCase());
                    setEditAllocForm({
                      ...editAllocForm,
                      cageName: selectedCageName,
                      blockName: matchedCage ? matchedCage.blockName : editAllocForm.blockName
                    });
                  }}
                  className="w-full text-xs font-bold p-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="">-- Select Cage from List --</option>
                  {Object.entries(groupedCages).map(([block, cages]) => (
                    <optgroup key={block} label={block}>
                      {(cages as CageLocation[]).map((c) => (
                        <option key={c.id || c.cageName} value={c.cageName}>
                          {c.blockName} — {c.cageName}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">Block Name</label>
                  <input
                    type="text"
                    value={editAllocForm.blockName || ''}
                    onChange={(e) => setEditAllocForm({ ...editAllocForm, blockName: e.target.value.toUpperCase() })}
                    className="w-full text-xs font-bold p-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">Cage Name</label>
                  <input
                    type="text"
                    value={editAllocForm.cageName || ''}
                    onChange={(e) => setEditAllocForm({ ...editAllocForm, cageName: e.target.value.toUpperCase() })}
                    className="w-full text-xs font-bold p-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">Flock / Batch Name</label>
                  <input
                    type="text"
                    value={editAllocForm.flockName || ''}
                    onChange={(e) => setEditAllocForm({ ...editAllocForm, flockName: e.target.value })}
                    className="w-full text-xs font-bold p-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">Species</label>
                  <select
                    value={editAllocForm.species || 'Chicken'}
                    onChange={(e) => setEditAllocForm({ ...editAllocForm, species: e.target.value as any })}
                    className="w-full text-xs font-bold p-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="Chicken">🐔 Chicken</option>
                    <option value="Turkey">🦃 Turkey</option>
                    <option value="Agric Fowl">🌾 Agric Fowl</option>
                    <option value="Quail">🪶 Quail</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">Fowl Quantity (use Correct count)</label>
                  <input
                    type="number"
                    min="1"
                    value={editAllocForm.quantity || ''}
                    readOnly
                    className="w-full text-xs font-bold p-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">Age (Weeks)</label>
                  <input
                    type="number"
                    min="0"
                    value={editAllocForm.ageWeeks || 0}
                    onChange={(e) => setEditAllocForm({ ...editAllocForm, ageWeeks: Number(e.target.value) })}
                    className="w-full text-xs font-bold p-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">Date Transferred / Added</label>
                  <input
                    type="date"
                    value={editAllocForm.dateTransferred || editAllocForm.dateAdded || ''}
                    onChange={(e) => setEditAllocForm({ ...editAllocForm, dateTransferred: e.target.value })}
                    className="w-full text-xs font-bold p-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">Notes / Breed</label>
                <input
                  type="text"
                  value={editAllocForm.notes || ''}
                  onChange={(e) => setEditAllocForm({ ...editAllocForm, notes: e.target.value })}
                  className="w-full text-xs font-bold p-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="flex gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingAlloc(null)}
                  className="flex-1 h-11 bg-slate-100 text-slate-700 rounded-xl text-xs font-bold uppercase cursor-pointer hover:bg-slate-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading || farmAction.busy}
                  className="flex-1 h-11 bg-emerald-600 text-white rounded-xl text-xs font-extrabold uppercase shadow cursor-pointer hover:bg-emerald-700"
                >
                  {loading ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DIRECT ADD ALLOCATION MODAL */}
      {isAddAllocOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-white rounded-3xl shadow-xl overflow-hidden animate-in zoom-in-95 duration-150">
            <div className="bg-emerald-700 p-5 text-white flex justify-between items-center">
              <div>
                <h3 className="text-sm font-black uppercase tracking-tight">Add Live Cage Allocation Row</h3>
                <p className="text-emerald-100 text-xs font-semibold">Manually place a flock record in a specific cage block</p>
              </div>
              <button
                type="button"
                onClick={() => setIsAddAllocOpen(false)}
                className="text-white/80 hover:text-white p-2 rounded-full cursor-pointer text-sm"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleAddAllocSubmit} className="p-5 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">Block Location</label>
                  <input
                    type="text"
                    placeholder="e.g. BLOCK 0, BLOCK 2"
                    value={addAllocForm.blockName}
                    onChange={(e) => setAddAllocForm({ ...addAllocForm, blockName: e.target.value })}
                    className="w-full text-xs font-bold p-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">Cage Name</label>
                  <input
                    type="text"
                    placeholder="e.g. ST 1, CAGE A"
                    value={addAllocForm.cageName}
                    onChange={(e) => setAddAllocForm({ ...addAllocForm, cageName: e.target.value })}
                    className="w-full text-xs font-bold p-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">Flock Name</label>
                  <input
                    type="text"
                    placeholder="e.g. Brahma Batch 1"
                    value={addAllocForm.flockName}
                    onChange={(e) => setAddAllocForm({ ...addAllocForm, flockName: e.target.value })}
                    className="w-full text-xs font-bold p-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">Species</label>
                  <select
                    value={addAllocForm.species}
                    onChange={(e) => setAddAllocForm({ ...addAllocForm, species: e.target.value as any })}
                    className="w-full text-xs font-bold p-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none"
                  >
                    <option value="Chicken">Chicken (Brahma)</option>
                    <option value="Turkey">Turkey</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">Quantity</label>
                  <input
                    type="number"
                    min="1"
                    placeholder="e.g. 50"
                    value={addAllocForm.quantity}
                    onChange={(e) => setAddAllocForm({ ...addAllocForm, quantity: e.target.value })}
                    className="w-full text-xs font-bold p-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">Age (Weeks)</label>
                  <input
                    type="number"
                    min="0"
                    placeholder="e.g. 10"
                    value={addAllocForm.ageWeeks}
                    onChange={(e) => setAddAllocForm({ ...addAllocForm, ageWeeks: e.target.value })}
                    className="w-full text-xs font-bold p-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">Date Added</label>
                  <input
                    type="date"
                    value={addAllocForm.dateAdded}
                    onChange={(e) => setAddAllocForm({ ...addAllocForm, dateAdded: e.target.value })}
                    className="w-full text-xs font-bold p-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">Date Transferred</label>
                  <input
                    type="date"
                    value={addAllocForm.dateTransferred}
                    onChange={(e) => setAddAllocForm({ ...addAllocForm, dateTransferred: e.target.value })}
                    className="w-full text-xs font-bold p-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">Notes</label>
                <input
                  type="text"
                  placeholder="e.g. Direct placement into ST 1"
                  value={addAllocForm.notes}
                  onChange={(e) => setAddAllocForm({ ...addAllocForm, notes: e.target.value })}
                  className="w-full text-xs font-bold p-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none"
                />
              </div>

              <div className="flex gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsAddAllocOpen(false)}
                  className="flex-1 h-11 bg-slate-100 text-slate-700 rounded-xl text-xs font-bold uppercase cursor-pointer hover:bg-slate-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading || farmAction.busy}
                  className="flex-1 h-11 bg-emerald-600 text-white rounded-xl text-xs font-extrabold uppercase shadow cursor-pointer hover:bg-emerald-700"
                >
                  {loading ? 'Adding...' : 'Save Allocation'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* BULK EDIT FLOCK BATCHES MODAL */}
      {isBulkEditFlocksOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl p-6 max-w-xl w-full border border-slate-200 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-2xl bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold">
                  <Edit3 size={18} />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900 uppercase tracking-tight">Bulk Edit Selected Flock Batches</h3>
                  <p className="text-xs font-semibold text-slate-500">Updating {selectedFlockIds.length} flock batch records simultaneously</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsBulkEditFlocksOpen(false)}
                className="p-1.5 text-slate-400 hover:bg-slate-100 rounded-xl cursor-pointer transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* List of selected batch badges */}
            <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200/80">
              <label className="block text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1.5">
                Selected Batches ({selectedFlockIds.length})
              </label>
              <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                {selectedFlockIds.map(id => {
                  const batch = (data.flocks || []).find(f => f.id === id);
                  if (!batch) return null;
                  return (
                    <span key={id} className="px-2.5 py-1 bg-emerald-100 text-emerald-900 font-extrabold text-[11px] rounded-lg border border-emerald-200/80 flex items-center gap-1">
                      <span>{batch.species === 'Turkey' ? '🦃' : '🐔'}</span>
                      <span>{batch.name}</span>
                      <span className="text-[9px] opacity-75 font-mono">({batch.quantity} birds)</span>
                    </span>
                  );
                })}
              </div>
            </div>

            <form onSubmit={handleBulkEditFlocksSubmit} className="space-y-3 pt-1">
              <p className="text-[11px] font-bold text-amber-700 bg-amber-50 p-2.5 rounded-xl border border-amber-200/80">
                💡 Leave any field blank to keep its original value unchanged across all selected batches.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Species */}
                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">Update Species</label>
                  <select
                    value={bulkEditForm.species}
                    onChange={(e) => setBulkEditForm({ ...bulkEditForm, species: e.target.value })}
                    className="w-full h-11 px-3 bg-white border border-slate-200 rounded-xl font-bold text-xs text-slate-800 outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="">-- Keep Unchanged --</option>
                    <option value="Chicken">🐔 Chicken (Brahma / Pure Breed)</option>
                    <option value="Turkey">🦃 Turkey</option>
                    <option value="Agric Fowls">🌾 Agric Fowls</option>
                    <option value="Quail">🪶 Quail</option>
                  </select>
                </div>

                {/* Breed / Variety */}
                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">Update Breed / Variety</label>
                  <select
                    value={bulkEditForm.breed}
                    onChange={(e) => setBulkEditForm({ ...bulkEditForm, breed: e.target.value })}
                    className="w-full h-11 px-3 bg-white border border-slate-200 rounded-xl font-bold text-xs text-slate-800 outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="">-- Keep Unchanged --</option>
                    <option value="Pure Breed">Pure Breed</option>
                    <option value="Brahma">Brahma</option>
                    <option value="Agric Mixed">Agric Mixed</option>
                    <option value="Local Breed">Local Breed</option>
                    <option value="Gobbler">Turkey (Gobbler)</option>
                    <option value="Hen">Turkey (Hen)</option>
                    <option value="Quail">Quail</option>
                  </select>
                </div>

                {/* Age in Weeks */}
                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">Update Age (Weeks)</label>
                  <input
                    type="number"
                    min="0"
                    placeholder="Leave blank to keep unchanged"
                    value={bulkEditForm.ageWeeks}
                    onChange={(e) => setBulkEditForm({ ...bulkEditForm, ageWeeks: e.target.value })}
                    className="w-full h-11 px-3 bg-white border border-slate-200 rounded-xl font-bold text-xs text-slate-800 outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                {/* Date Added */}
                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">Update Date Added</label>
                  <input
                    type="date"
                    value={bulkEditForm.dateAdded}
                    onChange={(e) => setBulkEditForm({ ...bulkEditForm, dateAdded: e.target.value })}
                    className="w-full h-11 px-3 bg-white border border-slate-200 rounded-xl font-bold text-xs text-slate-800 outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                {/* Assign Cage / Notes */}
                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">Assign Cage Location</label>
                  <select
                    value={bulkEditForm.notes}
                    onChange={(e) => setBulkEditForm({ ...bulkEditForm, notes: e.target.value })}
                    className="w-full h-11 px-3 bg-white border border-slate-200 rounded-xl font-bold text-xs text-slate-800 outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="">-- Keep Unchanged --</option>
                    {Object.entries(groupedCages).map(([block, cages]) => (
                      <optgroup key={block} label={block}>
                        {(cages as CageLocation[]).map((c) => (
                          <option key={c.id || c.cageName} value={c.cageName}>
                            {getCageOptionLabel(c)}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </div>

                {/* Quantity */}
                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">Update Bird Count (Quantity)</label>
                  <input
                    type="number"
                    min="0"
                    placeholder="Leave blank to keep unchanged"
                    value={bulkEditForm.quantity}
                    onChange={(e) => setBulkEditForm({ ...bulkEditForm, quantity: e.target.value })}
                    className="w-full h-11 px-3 bg-white border border-slate-200 rounded-xl font-bold text-xs text-slate-800 outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div className="flex gap-2 pt-3">
                <button
                  type="submit"
                  disabled={loading || farmAction.busy}
                  className="flex-1 h-12 bg-emerald-600 text-white rounded-xl font-black uppercase tracking-wider text-xs shadow hover:bg-emerald-700 transition-colors cursor-pointer flex items-center justify-center gap-2"
                >
                  <Edit3 size={15} />
                  <span>{loading ? 'Applying Bulk Edits...' : `Apply Edits to ${selectedFlockIds.length} Batches`}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsBulkEditFlocksOpen(false)}
                  className="px-5 h-12 bg-slate-200 text-slate-700 rounded-xl font-extrabold uppercase tracking-wider text-xs hover:bg-slate-300 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* FULLSCREEN TABLE OVERLAY MODAL */}
      {fullscreenTable && (
        <div className="fixed inset-0 z-[99999] bg-white flex flex-col h-screen w-screen overflow-hidden select-none animate-in fade-in duration-150">
          {/* Minimal Floating Top Control Bar */}
          <div className="bg-slate-900 text-white px-3 py-1.5 flex items-center justify-between shrink-0 border-b border-slate-800 z-50">
            <div className="flex items-center gap-2 text-slate-300 text-xs font-bold">
              <span className="truncate max-w-[200px] sm:max-w-[400px] text-slate-200 uppercase tracking-wide">
                {fullscreenTable.title}
              </span>
              {fullscreenTable.badge && (
                <span className="hidden md:inline bg-emerald-500/20 text-emerald-300 text-[10px] font-extrabold px-2 py-0.5 rounded-full uppercase border border-emerald-500/30">
                  {fullscreenTable.badge}
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              {/* Interactive Zoom Controls Toolbar */}
              <div className="flex items-center gap-1 bg-slate-800 border border-slate-700/80 rounded-xl p-1 text-white shadow-inner">
                <button
                  type="button"
                  onClick={() => setFullscreenZoom(prev => Math.max(35, prev - 15))}
                  className="p-1 hover:bg-slate-700 rounded-lg transition-colors cursor-pointer text-slate-300 hover:text-white"
                  title="Zoom Out (-)"
                >
                  <ZoomOut size={16} />
                </button>

                <div className="flex items-center gap-1 px-1">
                  <span className="font-mono font-bold text-xs text-emerald-400 min-w-[36px] text-center">
                    {fullscreenZoom}%
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => setFullscreenZoom(prev => Math.min(200, prev + 15))}
                  className="p-1 hover:bg-slate-700 rounded-lg transition-colors cursor-pointer text-slate-300 hover:text-white"
                  title="Zoom In (+)"
                >
                  <ZoomIn size={16} />
                </button>

                {/* Preset Scale Buttons */}
                <div className="hidden lg:flex items-center gap-1 border-l border-slate-700 pl-1.5 ml-1">
                  {[
                    { label: '50%', val: 50 },
                    { label: '75%', val: 75 },
                    { label: '100%', val: 100 },
                    { label: '125%', val: 125 }
                  ].map(p => (
                    <button
                      key={p.val}
                      type="button"
                      onClick={() => setFullscreenZoom(p.val)}
                      className={`px-1.5 py-0.5 rounded-md text-[10px] font-bold cursor-pointer transition-colors ${
                        fullscreenZoom === p.val 
                          ? 'bg-emerald-500 text-slate-950 font-black' 
                          : 'bg-slate-700/60 hover:bg-slate-700 text-slate-300'
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() => setFullscreenZoom(100)}
                  className="p-1 hover:bg-slate-700 rounded-lg transition-colors cursor-pointer text-slate-400 hover:text-white ml-0.5"
                  title="Reset Zoom (100%)"
                >
                  <RotateCcw size={14} />
                </button>
              </div>

              {/* Close Button */}
              <button
                type="button"
                onClick={() => setFullscreenTable(null)}
                className="p-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl transition-colors cursor-pointer flex items-center gap-1.5 text-xs font-bold px-3 shadow-xs"
                title="Close Fullscreen View (Esc)"
              >
                <X size={16} />
                <span className="hidden sm:inline">Close</span>
              </button>
            </div>
          </div>

          {/* Modal Content - Touch Pinch Zoomable Container taking 100% space */}
          <div 
            className="flex-1 w-full h-full overflow-auto p-0 bg-white touch-pan-x touch-pan-y relative"
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
          >
            <div 
              style={{ 
                zoom: fullscreenZoom / 100,
                transition: touchStartDistRef.current ? 'none' : 'all 0.15s ease-out'
              }}
              className="w-full h-full min-w-full"
            >
              {fullscreenTable.content}
            </div>
          </div>
        </div>
      )}

      {/* CUSTOM CONFIRMATION MODAL FOR DELETION */}
      {deleteConfirmModal && deleteConfirmModal.isOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full border border-slate-200 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center font-bold shrink-0">
                <Trash2 size={20} />
              </div>
              <div>
                <h3 className="text-base font-black text-slate-900 uppercase tracking-tight">{deleteConfirmModal.title}</h3>
                <p className="text-xs font-semibold text-slate-500 mt-0.5">{deleteConfirmModal.message}</p>
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={async () => {
                  const act = deleteConfirmModal.action;
                  setDeleteConfirmModal(null);
                  await act();
                }}
                disabled={loading || farmAction.busy}
                className="flex-1 h-11 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-black uppercase tracking-wider text-xs shadow-xs transition-colors cursor-pointer flex items-center justify-center gap-1.5"
              >
                <Trash2 size={14} />
                <span>{deleteConfirmModal.confirmText || 'Yes, Delete'}</span>
              </button>
              <button
                type="button"
                onClick={() => setDeleteConfirmModal(null)}
                className="px-5 h-11 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-extrabold uppercase tracking-wider text-xs transition-colors cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
