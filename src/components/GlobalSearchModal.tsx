import React, { useState, useEffect, useRef } from 'react';
import {
  Search,
  X,
  Egg,
  Users,
  DollarSign,
  TrendingUp,
  Receipt,
  Heart,
  Calendar,
  ChevronRight,
  Sparkles,
  Command
} from 'lucide-react';
import { ActiveTab, Client, IncubatorRecord, PoultrySale, Expense, Flock, FeedRecord, RabbitAnimal, RabbitSale } from '../types';
import { formatDateDDMMYYYY, formatFlockAge } from '../utils/dateUtils';

interface GlobalSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  db: {
    clients: Client[];
    incubator?: IncubatorRecord[];
    incubator_records?: IncubatorRecord[];
    sales?: PoultrySale[];
    poultry_sales?: PoultrySale[];
    expenses?: Expense[];
    flocks?: Flock[];
    feedRecords?: FeedRecord[];
    feed_records?: FeedRecord[];
    rabbits?: RabbitAnimal[];
    rabbit_sales?: RabbitSale[];
  };
  setActiveTab: (tab: ActiveTab) => void;
  onOpenFarmSection?: (section: 'rabbits' | 'quail') => void;
  onOpenEditRecord?: (record: IncubatorRecord) => void;
  onOpenClient?: (client: Client) => void;
}

type CategoryType = 'all' | 'batches' | 'clients' | 'sales' | 'expenses' | 'flocks' | 'rabbits' | 'quail';

interface SearchResultItem {
  id: string;
  category: 'batch' | 'client' | 'sale' | 'expense' | 'flock' | 'rabbit';
  title: string;
  subtitle: string;
  badge: string;
  badgeColor: string;
  date?: string;
  amount?: string;
  score?: number;
  onClick: () => void;
}

export default function GlobalSearchModal({
  isOpen,
  onClose,
  db,
  setActiveTab,
  onOpenEditRecord,
  onOpenClient,
  onOpenFarmSection
}: GlobalSearchModalProps) {
  const [query, setQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<CategoryType>('all');
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto focus on open
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
    } else {
      setQuery('');
    }
  }, [isOpen]);

  // Keyboard shortcut listener (ESC to close)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const q = query.trim().toLowerCase();
  const qUpper = query.trim().toUpperCase();

  // Search indexing logic
  const results: SearchResultItem[] = [];

  if (q.length > 0) {
    const incubatorList = db.incubator || db.incubator_records || [];
    const salesList = db.sales || db.poultry_sales || [];

    // 1. Client Accounts (highest priority relevance for mark matches)
    if (selectedCategory === 'all' || selectedCategory === 'clients') {
      (db.clients || []).forEach((c) => {
        const cMarkNorm = (c.mark || '').trim().toLowerCase();
        const cMarkUpper = (c.mark || '').trim().toUpperCase();
        const cNameNorm = (c.name || '').trim().toLowerCase();
        const cPhoneNorm = (c.phone || '').trim().toLowerCase();
        const cLocNorm = (c.location || '').trim().toLowerCase();
        const cSpecNorm = (c.specialCase || '').trim().toLowerCase();

        const matchStr = `${cMarkNorm} ${cNameNorm} ${cPhoneNorm} ${cLocNorm} ${cSpecNorm}`;

        if (matchStr.includes(q)) {
          let score = 2000;
          if (cMarkUpper === qUpper) {
            score = 20000; // Exact client mark match -> ALWAYS #1!
          } else if (cMarkNorm.startsWith(q)) {
            score = 15000;
          } else if (cMarkNorm.includes(q)) {
            score = 12000;
          } else if (cNameNorm === q) {
            score = 10000;
          } else if (cNameNorm.startsWith(q)) {
            score = 8000;
          } else if (cNameNorm.includes(q)) {
            score = 6000;
          } else if (cPhoneNorm.includes(q)) {
            score = 4000;
          }

          results.push({
            id: `client-${c.id}`,
            category: 'client',
            title: `Client: ${c.name} [Mark: ${c.mark}]`,
            subtitle: `Tel: ${c.phone || 'N/A'} • Location: ${c.location || 'N/A'} ${c.overdraft ? `• Overdraft: ${c.overdraft.toLocaleString()} FCFA` : ''}`,
            badge: 'Client Account',
            badgeColor: 'bg-emerald-100 text-emerald-800 border-emerald-200',
            amount: c.overdraft ? `${c.overdraft.toLocaleString()} FCFA Debt` : undefined,
            score,
            onClick: () => {
              setActiveTab('incubator');
              if (onOpenClient) {
                onOpenClient(c);
              }
              onClose();
            }
          });
        }
      });
    }

    // 2. Egg Batches
    if (selectedCategory === 'all' || selectedCategory === 'batches') {
      incubatorList.forEach((b) => {
        const bMarkUpper = (b.clientMark || '').trim().toUpperCase();
        const bMarkNorm = (b.clientMark || '').trim().toLowerCase();
        const bNameNorm = (b.clientName || '').trim().toLowerCase();

        const matchStr = `${b.clientMark} ${b.clientName} ${b.clientPhone} ${b.eggType || 'Brahma'} ${b.dateBrought} ${b.id} ${b.notes || ''} ${b.specialCase} ${b.eggsCollected} eggs`.toLowerCase();
        if (matchStr.includes(q)) {
          let score = 1000;
          if (bMarkUpper === qUpper) {
            score = 3000;
          } else if (bMarkNorm.startsWith(q)) {
            score = 2500;
          } else if (bMarkNorm.includes(q)) {
            score = 2000;
          } else if (bNameNorm.includes(q)) {
            score = 1500;
          }

          results.push({
            id: `batch-${b.id}`,
            category: 'batch',
            title: `Batch #${b.id.slice(-6).toUpperCase()} — ${b.clientMark} (${b.clientName})`,
            subtitle: `${b.eggsCollected} ${b.eggType || 'Brahma'} eggs brought on ${formatDateDDMMYYYY(b.dateBrought)} • Status: ${b.chicksHatched !== null ? 'Completed' : b.eggsAfterScan !== null ? 'Scanned' : 'In Incubator'}`,
            badge: 'Egg Batch',
            badgeColor: 'bg-amber-100 text-amber-800 border-amber-200',
            date: b.dateBrought,
            amount: `${b.amountDue?.toLocaleString()} FCFA`,
            score,
            onClick: () => {
              setActiveTab('incubator');
              if (onOpenEditRecord) {
                onOpenEditRecord(b);
              }
              onClose();
            }
          });
        }
      });
    }

    // 3. Customer Sales
    if (selectedCategory === 'all' || selectedCategory === 'sales') {
      salesList.forEach((s) => {
        const matchStr = `${s.buyerName} ${s.itemType} ${s.quantity} ${s.unitPrice} ${s.totalAmount} ${s.date} ${s.notes || ''}`.toLowerCase();
        if (matchStr.includes(q)) {
          results.push({
            id: `sale-${s.id}`,
            category: 'sale',
            title: `Sale: ${s.quantity}x ${s.itemType} to ${s.buyerName || 'Walk-in Customer'}`,
            subtitle: `Unit Price: ${s.unitPrice.toLocaleString()} FCFA • Date: ${formatDateDDMMYYYY(s.date)} ${s.notes ? `• ${s.notes}` : ''}`,
            badge: 'Farm Revenue',
            badgeColor: 'bg-blue-100 text-blue-800 border-blue-200',
            date: s.date,
            amount: `+${s.totalAmount.toLocaleString()} FCFA`,
            score: 800,
            onClick: () => {
              setActiveTab('reports');
              onClose();
            }
          });
        }
      });
    }

    // 4. Farm Expenses
    if (selectedCategory === 'all' || selectedCategory === 'expenses') {
      (db.expenses || []).forEach((e) => {
        const matchStr = `${e.category} ${e.description} ${e.amount} ${e.date}`.toLowerCase();
        if (matchStr.includes(q)) {
          results.push({
            id: `exp-${e.id}`,
            category: 'expense',
            title: `Expense: ${e.category} — ${e.description}`,
            subtitle: `Outlay on ${formatDateDDMMYYYY(e.date)}`,
            badge: 'Expense',
            badgeColor: 'bg-rose-100 text-rose-800 border-rose-200',
            date: e.date,
            amount: `-${e.amount.toLocaleString()} FCFA`,
            score: 800,
            onClick: () => {
              setActiveTab('reports');
              onClose();
            }
          });
        }
      });
    }

    // 5. Flocks
    if (selectedCategory === 'all' || selectedCategory === 'flocks' || selectedCategory === 'quail') {
      (db.flocks || []).filter(f => selectedCategory !== 'quail' || f.species === 'Quail' || f.breed?.toLowerCase().includes('quail')).forEach((f) => {
        const matchStr = `${f.name} ${f.breed} ${f.species || ''} ${f.quantity} ${f.notes || ''}`.toLowerCase();
        if (matchStr.includes(q)) {
          results.push({
            id: `flock-${f.id}`,
            category: 'flock',
            title: `Flock: ${f.name} (${f.breed || 'Brahma'})`,
            subtitle: `${f.quantity} birds • Age: ${formatFlockAge(f.dateAdded, f.initialAgeWeeks ?? 0)} • Date Added: ${formatDateDDMMYYYY(f.dateAdded)}`,
            badge: 'Poultry Flock',
            badgeColor: 'bg-teal-100 text-teal-800 border-teal-200',
            date: f.dateAdded,
            amount: `${f.quantity} birds`,
            score: 800,
            onClick: () => {
              if (f.species === 'Quail' || f.breed?.toLowerCase().includes('quail')) onOpenFarmSection?.('quail');
              else setActiveTab('farm');
              onClose();
            }
          });
        }
      });
    }

    if (selectedCategory === 'all' || selectedCategory === 'rabbits') {
      (db.rabbits || []).filter(animal => !animal.grouped).forEach(animal => {
        const match = `${animal.id} ${animal.name || ''} ${animal.tag || ''} ${animal.breed || ''} ${animal.motherId || ''} ${animal.fatherId || ''}`.toLowerCase();
        if (match.includes(q)) results.push({ id: `rabbit-${animal.id}`, category: 'rabbit', title: animal.name || `Bunny ${animal.id}`, subtitle: `${animal.status} · ${animal.sex} · ${animal.litterId ? `Litter ${animal.litterId}` : 'Individual'}`, badge: 'Rabbit', badgeColor: 'bg-emerald-100 text-emerald-900 border-emerald-200', score: 850, onClick: () => { onOpenFarmSection?.('rabbits'); onClose(); } });
      });
    }

    // Sort results by relevance score descending
    results.sort((a, b) => (b.score || 0) - (a.score || 0));
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-12 sm:pt-20 px-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-150">
      {/* Click outside to dismiss */}
      <div className="absolute inset-0" onClick={onClose} />

      {/* Modal Container */}
      <div className="relative w-full max-w-2xl bg-white rounded-3xl shadow-2xl border border-slate-100 overflow-hidden z-10 flex flex-col max-h-[82vh]">
        
        {/* Search Header Input */}
        <div className="p-4 border-b border-slate-100 flex items-center gap-3 bg-slate-50/80">
          <Search size={22} className="text-emerald-600 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search egg batches, client marks, sales, expenses, flocks..."
            className="w-full bg-transparent text-base sm:text-lg font-bold text-slate-800 placeholder-slate-400 focus:outline-none"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200/60 transition-colors cursor-pointer"
            >
              <X size={18} />
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="px-2.5 py-1 text-xs font-black uppercase text-slate-400 hover:text-slate-700 bg-slate-200/50 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
          >
            ESC
          </button>
        </div>

        {/* Category Pill Filters */}
        <div className="px-4 py-2.5 bg-white border-b border-slate-100 flex items-center gap-1.5 overflow-x-auto no-scrollbar">
          {[
            { id: 'all', label: 'All Records' },
            { id: 'batches', label: 'Egg Batches' },
            { id: 'clients', label: 'Clients' },
            { id: 'sales', label: 'Sales' },
            { id: 'expenses', label: 'Expenses' },
            { id: 'flocks', label: 'Flocks' },
            { id: 'rabbits', label: 'Rabbits' },
            { id: 'quail', label: 'Quail' },
          ].map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => setSelectedCategory(cat.id as CategoryType)}
              className={`px-3 py-1 rounded-xl text-xs font-extrabold whitespace-nowrap transition-all cursor-pointer ${
                selectedCategory === cat.id
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* Results Body */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {!q ? (
            <div className="py-12 px-6 text-center text-slate-400 space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-emerald-50 border border-emerald-100 text-emerald-600 flex items-center justify-center mx-auto">
                <Command size={24} />
              </div>
              <p className="text-sm font-extrabold text-slate-700">Quick Hatchery & Farm Search</p>
              <p className="text-xs text-slate-400 max-w-sm mx-auto leading-relaxed">
                Type client mark (e.g., <span className="font-bold text-slate-600">SS</span>), client name, phone number, sale buyer, or expense description to search instant records.
              </p>
              <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setQuery('SS')}
                  className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 rounded-lg text-[11px] font-bold text-slate-600 transition-colors cursor-pointer"
                >
                  Mark 'SS'
                </button>
                <button
                  type="button"
                  onClick={() => setQuery('Vaccine')}
                  className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 rounded-lg text-[11px] font-bold text-slate-600 transition-colors cursor-pointer"
                >
                  'Vaccine'
                </button>
                <button
                  type="button"
                  onClick={() => setQuery('Brahma')}
                  className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 rounded-lg text-[11px] font-bold text-slate-600 transition-colors cursor-pointer"
                >
                  'Brahma'
                </button>
              </div>
            </div>
          ) : results.length === 0 ? (
            <div className="py-12 text-center text-slate-400">
              <p className="text-sm font-extrabold text-slate-600">No matching records found</p>
              <p className="text-xs text-slate-400 mt-1">Try refining your search keyword or switching category tab.</p>
            </div>
          ) : (
            results.map((item) => (
              <button type="button"
                key={item.id}
                onClick={item.onClick}
                className="group w-full p-3.5 rounded-2xl border border-slate-100 hover:border-emerald-300 bg-white hover:bg-emerald-50/40 transition-all flex items-center justify-between gap-3 cursor-pointer text-left"
              >
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`px-2 py-0.5 text-[10px] font-black uppercase rounded-lg border ${item.badgeColor}`}>
                      {item.badge}
                    </span>
                    <h5 className="text-sm font-extrabold text-slate-800 truncate group-hover:text-emerald-900 transition-colors">
                      {item.title}
                    </h5>
                  </div>
                  <p className="text-xs text-slate-500 truncate leading-snug">{item.subtitle}</p>
                </div>

                <div className="flex items-center gap-3 shrink-0 text-right">
                  {item.amount && (
                    <span className="text-xs font-black text-slate-700 bg-slate-100 px-2.5 py-1 rounded-xl">
                      {item.amount}
                    </span>
                  )}
                  <ChevronRight size={18} className="text-slate-300 group-hover:text-emerald-600 transition-colors" />
                </div>
              </button>
            ))
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-3 bg-slate-50 border-t border-slate-100 text-slate-400 text-[11px] font-semibold flex items-center justify-between">
          <span>{results.length} result(s) found</span>
          <span>Tip: Use <kbd className="px-1.5 py-0.5 bg-white border border-slate-200 rounded font-mono text-[10px] text-slate-600">Ctrl+K</kbd> to toggle search anytime</span>
        </div>

      </div>
    </div>
  );
}
