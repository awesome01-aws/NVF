/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import * as XLSX from 'xlsx';
import { 
  Plus, Minus, Egg, Phone, MapPin, User, Tag, 
  HelpCircle, AlertCircle, Sparkles, Filter, 
  ArrowUpDown, Check, CheckCircle2, FileEdit, Trash2, X, MessageSquare,
  FileText, Maximize2, Minimize2, ZoomIn, ZoomOut, RotateCcw,
  ChevronDown, Search, Calendar, DollarSign, TrendingUp, BarChart3
} from 'lucide-react';
import { Client, IncubatorRecord, SpecialCase } from '../types';
import { computeAmountDue, getStandardRateBySpecies } from '../lib/offlineStore';
import { recordShortcutUsage } from '../utils/shortcutTracker';
import { useFormAutoSave, DraftSavedBadge } from '../lib/useFormAutoSave';
import { parseExcelDate, downloadExcelTemplate } from './ExcelImportModal';
import { getCameroonTodayISO, formatDateDDMMYYYY } from '../utils/dateUtils';

interface IncubatorModProps {
  data: {
    clients: Client[];
    incubator_records: IncubatorRecord[];
  };
  triggerRefresh: () => void;
  token: string;
  selectedEditRecord: IncubatorRecord | null;
  setSelectedEditRecord: (record: IncubatorRecord | null) => void;
  selectedClientForEdit?: Client | null;
  setSelectedClientForEdit?: (client: Client | null) => void;
  quickFormKey: string | null;
  setQuickFormKey: (key: string | null) => void;
}

export const isRecordHatched = (rec: any): boolean => {
  if (!rec) return false;
  return rec.chicksHatched !== null && rec.chicksHatched !== undefined && String(rec.chicksHatched).trim() !== '';
};

export const getSuggestedUnusedMarks = (
  clientName: string,
  currentMark: string,
  allClients: any[],
  limit: number = 8
): string[] => {
  const usedMarks = new Set<string>();
  (allClients || []).forEach((c: any) => {
    if (c.mark) {
      usedMarks.add(String(c.mark).trim().toUpperCase());
    }
  });

  const candidates: string[] = [];

  // Parse initials from clientName
  const cleanName = String(clientName || '').toUpperCase().replace(/[^A-Z0-9\s]/g, '').trim();
  const words = cleanName.split(/\s+/).filter(Boolean);

  if (words.length >= 2) {
    const w1 = words[0];
    const w2 = words[1];
    candidates.push(w1[0] + w2[0]);
    candidates.push(w2[0] + w1[0]);
    if (w1.length >= 2) candidates.push(w1.slice(0, 2));
    if (w2.length >= 2) candidates.push(w2.slice(0, 2));
    if (w1.length >= 2) candidates.push(w1[0] + w1[w1.length - 1]);
    if (w2.length >= 2) candidates.push(w2[0] + w2[w2.length - 1]);
  } else if (words.length === 1 && words[0].length >= 1) {
    const w = words[0];
    if (w.length >= 2) candidates.push(w.slice(0, 2));
    candidates.push(w[0] + '1');
    candidates.push(w[0] + '2');
    if (w.length >= 2) candidates.push(w[0] + w[w.length - 1]);
  }

  // Base initials for numbered variants
  const base = candidates[0] || (cleanName ? cleanName[0] : 'C');
  for (let i = 1; i <= 9; i++) {
    candidates.push(`${base}${i}`);
  }

  // Common alphabet pairs
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  for (let i = 0; i < alphabet.length; i++) {
    for (let j = 0; j < alphabet.length; j++) {
      if (candidates.length >= 60) break;
      candidates.push(alphabet[i] + alphabet[j]);
    }
  }

  const result: string[] = [];
  const seen = new Set<string>();
  const currentClean = String(currentMark || '').trim().toUpperCase();

  for (const cand of candidates) {
    const uppercaseCand = cand.toUpperCase().trim();
    if (
      uppercaseCand &&
      !usedMarks.has(uppercaseCand) &&
      !seen.has(uppercaseCand) &&
      uppercaseCand !== currentClean
    ) {
      seen.add(uppercaseCand);
      result.push(uppercaseCand);
      if (result.length >= limit) break;
    }
  }

  return result;
};

export interface WeeklySummaryRow {
  weekKey: string;
  mondayObj: Date;
  sundayObj: Date;
  label: string;
  weekNumber: number;
  records: IncubatorRecord[];
  clientCount: number;
  clientsList: string[];
  totalEggs: number;
  eggsBySpecies: Record<string, number>;
  totalScan: number;
  scanBySpecies: Record<string, number>;
  totalHatched: number;
  hatchedBySpecies: Record<string, number>;
  revenue: number;
  overdraft: number;
  debt: number;
}

const getWeeklySummaries = (recordsList: IncubatorRecord[]): WeeklySummaryRow[] => {
  if (!recordsList || recordsList.length === 0) return [];

  const map = new Map<string, {
    weekKey: string;
    mondayObj: Date;
    sundayObj: Date;
    label: string;
    records: IncubatorRecord[];
    clientSet: Set<string>;
    eggsBySpecies: Record<string, number>;
    scanBySpecies: Record<string, number>;
    hatchedBySpecies: Record<string, number>;
    revenue: number;
    overdraft: number;
    debt: number;
  }>();

  recordsList.forEach((rec) => {
    const dateStr = rec.dateBrought || (rec as any).datePlaced || '';
    if (!dateStr) return;

    const cleanDate = dateStr.replace(/[\/\.]/g, '-');
    const parts = cleanDate.split('-');
    let year = 2026, month = 1, day = 1;
    if (parts.length === 3) {
      if (parts[0].length === 4) {
        year = parseInt(parts[0], 10);
        month = parseInt(parts[1], 10);
        day = parseInt(parts[2], 10);
      } else {
        day = parseInt(parts[0], 10);
        month = parseInt(parts[1], 10);
        year = parseInt(parts[2], 10);
        if (year < 100) year += 2000;
      }
    }
    const d = new Date(year, month - 1, day);
    if (isNaN(d.getTime())) return;

    const dayOfWeek = d.getDay();
    const diffToMon = dayOfWeek === 0 ? 6 : dayOfWeek - 1;

    const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() - diffToMon);
    const sunday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6);

    const pad = (n: number) => String(n).padStart(2, '0');
    const formatShort = (dt: Date) => `${pad(dt.getDate())}/${pad(dt.getMonth() + 1)}/${String(dt.getFullYear()).slice(-2)}`;

    const mondayKey = `${monday.getFullYear()}-${pad(monday.getMonth() + 1)}-${pad(monday.getDate())}`;
    const label = `(${formatShort(monday)} - ${formatShort(sunday)})`;

    if (!map.has(mondayKey)) {
      map.set(mondayKey, {
        weekKey: mondayKey,
        mondayObj: monday,
        sundayObj: sunday,
        label,
        records: [],
        clientSet: new Set(),
        eggsBySpecies: {},
        scanBySpecies: {},
        hatchedBySpecies: {},
        revenue: 0,
        overdraft: 0,
        debt: 0
      });
    }

    const group = map.get(mondayKey)!;
    group.records.push(rec);

    const clientIdentifier = rec.clientId || rec.clientMark || rec.clientName;
    if (clientIdentifier) {
      group.clientSet.add(clientIdentifier);
    }

    const species = rec.eggType || 'Brahma';
    const eggCount = Number(rec.eggsCollected) || 0;
    group.eggsBySpecies[species] = (group.eggsBySpecies[species] || 0) + eggCount;

    if (rec.eggsAfterScan !== null && rec.eggsAfterScan !== undefined && String(rec.eggsAfterScan) !== '') {
      const scanCount = Number(rec.eggsAfterScan) || 0;
      group.scanBySpecies[species] = (group.scanBySpecies[species] || 0) + scanCount;
    }

    if (rec.chicksHatched !== null && rec.chicksHatched !== undefined && String(rec.chicksHatched) !== '') {
      const hatchCount = Number(rec.chicksHatched) || 0;
      group.hatchedBySpecies[species] = (group.hatchedBySpecies[species] || 0) + hatchCount;
    }

    group.revenue += Number(rec.amountPaid) || 0;
    group.overdraft += (Number(rec.overdraftGenerated) || 0) + (Number(rec.overdraftUsed) || 0);

    const totalCost = Number(rec.amountDue) || 0;
    const paid = Number(rec.amountPaid) || 0;
    const odUsed = Number(rec.overdraftUsed) || 0;
    const remainingDebt = Math.max(0, totalCost - paid - odUsed);
    group.debt += remainingDebt;
  });

  const sortedChronological = Array.from(map.values()).sort((a, b) => a.mondayObj.getTime() - b.mondayObj.getTime());

  const rows: WeeklySummaryRow[] = sortedChronological.map((item, index) => {
    const totalEggs = Object.values(item.eggsBySpecies).reduce((a, b) => a + b, 0);
    const totalScan = Object.values(item.scanBySpecies).reduce((a, b) => a + b, 0);
    const totalHatched = Object.values(item.hatchedBySpecies).reduce((a, b) => a + b, 0);

    return {
      weekKey: item.weekKey,
      mondayObj: item.mondayObj,
      sundayObj: item.sundayObj,
      label: item.label,
      weekNumber: index + 1,
      records: item.records,
      clientCount: item.clientSet.size,
      clientsList: Array.from(item.clientSet),
      totalEggs,
      eggsBySpecies: item.eggsBySpecies,
      totalScan,
      scanBySpecies: item.scanBySpecies,
      totalHatched,
      hatchedBySpecies: item.hatchedBySpecies,
      revenue: item.revenue,
      overdraft: item.overdraft,
      debt: item.debt
    };
  });

  return rows.sort((a, b) => b.mondayObj.getTime() - a.mondayObj.getTime());
};

interface GaugeItem {
  label: string;
  subLabel: string;
  pct: number;
  hatched: number;
  scanned: number;
  collected: number;
  batches: number;
  colorTheme: {
    ringStroke: string;
    bgRing: string;
    text: string;
    bgBadge: string;
    gradientStart: string;
    gradientEnd: string;
  };
}

const parseRecordDate = (dateStr: string | undefined | null): Date | null => {
  if (!dateStr) return null;
  const str = String(dateStr).trim();
  if (!str) return null;

  const direct = new Date(str);
  if (!isNaN(direct.getTime()) && str.length >= 8) {
    return direct;
  }

  const clean = str.replace(/[\/\.]/g, '-');
  const parts = clean.split('-');
  if (parts.length === 3) {
    if (parts[0].length === 4) {
      const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
      if (!isNaN(d.getTime())) return d;
    } else {
      let y = parseInt(parts[2], 10);
      if (y < 100) y += 2000;
      const d = new Date(y, parseInt(parts[1], 10) - 1, parseInt(parts[0], 10));
      if (!isNaN(d.getTime())) return d;
    }
  }
  return null;
};

const HatchingCircleGauge: React.FC<{ item: GaugeItem; isVisible: boolean }> = ({ item, isVisible }) => {
  const [displayedPct, setDisplayedPct] = useState(0);
  const [animActive, setAnimActive] = useState(false);

  useEffect(() => {
    setAnimActive(false);
    setDisplayedPct(0);

    const timer = setTimeout(() => {
      setAnimActive(true);
    }, 120);

    return () => clearTimeout(timer);
  }, [item.pct, isVisible]);

  useEffect(() => {
    if (!animActive || !isVisible) {
      setDisplayedPct(0);
      return;
    }

    let start = 0;
    const end = item.pct;
    const duration = 1100;
    const startTime = performance.now();

    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const easedProgress = 1 - Math.pow(1 - progress, 3);
      setDisplayedPct(easedProgress * end);

      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        setDisplayedPct(end);
      }
    };

    requestAnimationFrame(animate);
  }, [animActive, isVisible, item.pct]);

  const radius = 52;
  const strokeWidth = 10;
  const circumference = 2 * Math.PI * radius;
  const targetOffset = circumference - (circumference * item.pct) / 100;
  const strokeDashoffset = animActive && isVisible ? targetOffset : circumference;
  const gradientId = `grad_${item.label.replace(/[^a-zA-Z0-9]/g, '')}`;

  return (
    <div className="bg-slate-50/80 border border-slate-100 rounded-2xl p-5 flex flex-col items-center justify-between text-center space-y-4 hover:shadow-xs transition-all">
      <div className="w-full">
        <span className="text-xs font-black text-slate-800 uppercase tracking-tight block">
          {item.label}
        </span>
        <span className="text-[11px] font-extrabold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full inline-block mt-1">
          {item.subLabel}
        </span>
      </div>

      {/* Circle Graphic */}
      <div className="relative w-36 h-36 flex items-center justify-center my-1">
        <svg className="w-full h-full transform -rotate-90 origin-center" viewBox="0 0 120 120">
          <defs>
            <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor={item.colorTheme.gradientStart} />
              <stop offset="100%" stopColor={item.colorTheme.gradientEnd} />
            </linearGradient>
          </defs>

          {/* Background Ring */}
          <circle
            cx="60"
            cy="60"
            r={radius}
            stroke={item.colorTheme.bgRing}
            strokeWidth={strokeWidth}
            fill="transparent"
          />

          {/* Foreground Animated Ring */}
          <circle
            cx="60"
            cy="60"
            r={radius}
            stroke={`url(#${gradientId})`}
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            fill="transparent"
            style={{
              transition: 'stroke-dashoffset 1.3s cubic-bezier(0.34, 1.25, 0.64, 1)',
            }}
          />
        </svg>

        {/* Center Percentage Digit */}
        <div className="absolute inset-0 flex flex-col items-center justify-center p-2">
          <span className={`text-2xl sm:text-3xl font-black ${item.colorTheme.text} tracking-tighter`}>
            {displayedPct.toFixed(1)}%
          </span>
          <span className="text-[9px] font-black uppercase tracking-wider text-slate-400">
            Hatch Rate
          </span>
        </div>
      </div>

      {/* Stats Footnote */}
      <div className="w-full space-y-2 pt-2 border-t border-slate-200/60">
        <div className={`inline-block px-3 py-1 rounded-full border text-xs font-extrabold ${item.colorTheme.bgBadge}`}>
          {item.hatched.toLocaleString()} Hatched / {item.scanned.toLocaleString()} Scanned
        </div>

        <div className="flex justify-between items-center text-[11px] text-slate-500 font-medium px-1">
          <span>Total Eggs Brought:</span>
          <span className="font-extrabold text-slate-800">{item.collected.toLocaleString()}</span>
        </div>
        <div className="flex justify-between items-center text-[11px] text-slate-500 font-medium px-1">
          <span>Batches Recorded:</span>
          <span className="font-extrabold text-slate-800">{item.batches}</span>
        </div>
      </div>
    </div>
  );
};

export const HatchingAnalyticsSection: React.FC<{ records: IncubatorRecord[] }> = ({ records }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(true);
  const [selectedYearMode, setSelectedYearMode] = useState<string>('auto');

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setIsVisible(true);
          }
        });
      },
      { threshold: 0.05 }
    );

    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    return () => {
      if (containerRef.current) {
        observer.unobserve(containerRef.current);
      }
    };
  }, []);

  // Compute available years and active records
  const availableYears = React.useMemo(() => {
    const yearsSet = new Set<number>();
    (records || []).forEach((r) => {
      const dt = parseRecordDate(r.dateBrought || r.day8Date || r.day21Date);
      if (dt) yearsSet.add(dt.getFullYear());
    });
    const sorted = Array.from(yearsSet).sort((a, b) => b - a);
    return sorted;
  }, [records]);

  const stats = React.useMemo(() => {
    const now = new Date();
    const currentYear = now.getFullYear();

    // Determine target year
    let targetYear = currentYear;
    if (selectedYearMode === 'auto') {
      const currentYearHasData = (records || []).some((r) => {
        const dt = parseRecordDate(r.dateBrought || r.day8Date || r.day21Date);
        return dt && dt.getFullYear() === currentYear;
      });

      if (!currentYearHasData && availableYears.length > 0) {
        targetYear = availableYears[0]; // pick latest available year with data
      }
    } else if (selectedYearMode !== 'all') {
      targetYear = parseInt(selectedYearMode, 10);
    }

    // Filter valid records with dates
    const parsedRecords = (records || [])
      .map((rec) => ({
        rec,
        dt: parseRecordDate(rec.dateBrought || rec.day8Date || rec.day21Date),
        collected: Number(rec.eggsCollected) || 0,
        scanned: (rec.eggsAfterScan !== null && rec.eggsAfterScan !== undefined)
          ? Number(rec.eggsAfterScan)
          : (rec.chicksHatched !== null && rec.chicksHatched !== undefined ? Number(rec.eggsCollected) : 0),
        hatched: (rec.chicksHatched !== null && rec.chicksHatched !== undefined)
          ? Number(rec.chicksHatched)
          : 0,
      }))
      .filter((item) => item.dt !== null);

    // 1. YEARLY AGGREGATION
    const yearlyItems = selectedYearMode === 'all'
      ? parsedRecords
      : parsedRecords.filter((item) => item.dt!.getFullYear() === targetYear);

    let yearly = { collected: 0, scanned: 0, hatched: 0, count: 0 };
    yearlyItems.forEach((item) => {
      yearly.collected += item.collected;
      yearly.scanned += item.scanned;
      yearly.hatched += item.hatched;
      yearly.count += 1;
    });

    // 2. MONTHLY AGGREGATION
    // Find latest active month in target year
    let targetMonth = now.getMonth();
    if ((selectedYearMode === 'auto' && targetYear !== currentYear) || selectedYearMode !== '2026') {
      const monthsInTargetYear = yearlyItems.map((i) => i.dt!.getMonth());
      if (monthsInTargetYear.length > 0) {
        targetMonth = Math.max(...monthsInTargetYear);
      }
    }

    const monthlyItems = yearlyItems.filter((item) => item.dt!.getMonth() === targetMonth);
    let monthly = { collected: 0, scanned: 0, hatched: 0, count: 0 };
    monthlyItems.forEach((item) => {
      monthly.collected += item.collected;
      monthly.scanned += item.scanned;
      monthly.hatched += item.hatched;
      monthly.count += 1;
    });

    // 3. WEEKLY AGGREGATION
    // Find latest active week or current calendar week
    let latestWeekStart: Date;
    let latestWeekEnd: Date;

    if ((selectedYearMode === 'auto' && targetYear !== currentYear) && monthlyItems.length > 0) {
      const latestItemDt = new Date(Math.max(...monthlyItems.map((i) => i.dt!.getTime())));
      const dayOfWeek = latestItemDt.getDay();
      const diffToMon = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
      latestWeekStart = new Date(latestItemDt.getFullYear(), latestItemDt.getMonth(), latestItemDt.getDate() - diffToMon, 0, 0, 0);
      latestWeekEnd = new Date(latestWeekStart.getFullYear(), latestWeekStart.getMonth(), latestWeekStart.getDate() + 6, 23, 59, 59);
    } else {
      const dayOfWeek = now.getDay();
      const diffToMon = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
      latestWeekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - diffToMon, 0, 0, 0);
      latestWeekEnd = new Date(latestWeekStart.getFullYear(), latestWeekStart.getMonth(), latestWeekStart.getDate() + 6, 23, 59, 59);
    }

    const weeklyItems = parsedRecords.filter((item) => item.dt! >= latestWeekStart && item.dt! <= latestWeekEnd);
    let weekly = { collected: 0, scanned: 0, hatched: 0, count: 0 };
    weeklyItems.forEach((item) => {
      weekly.collected += item.collected;
      weekly.scanned += item.scanned;
      weekly.hatched += item.hatched;
      weekly.count += 1;
    });

    const pad = (n: number) => String(n).padStart(2, '0');
    const weekRangeLabel = `${pad(latestWeekStart.getDate())}/${pad(latestWeekStart.getMonth() + 1)} - ${pad(latestWeekEnd.getDate())}/${pad(latestWeekEnd.getMonth() + 1)}/${latestWeekEnd.getFullYear()}`;

    const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    const monthLabel = `${monthNames[targetMonth]} ${targetYear}`;
    const yearLabel = selectedYearMode === 'all' ? 'All-Time Records' : `Year ${targetYear}`;

    const calcPct = (hatched: number, scanned: number) => {
      if (!scanned || scanned <= 0) return 0;
      return Math.min(100, Math.round((hatched / scanned) * 1000) / 10);
    };

    return {
      targetYear,
      weekly: {
        label: '1. Weekly Hatching Rate',
        subLabel: weekRangeLabel,
        pct: calcPct(weekly.hatched, weekly.scanned),
        hatched: weekly.hatched,
        scanned: weekly.scanned,
        collected: weekly.collected,
        batches: weekly.count,
        colorTheme: {
          ringStroke: '#059669',
          bgRing: '#d1fae5',
          text: 'text-emerald-700',
          bgBadge: 'bg-emerald-50 text-emerald-800 border-emerald-200',
          gradientStart: '#10b981',
          gradientEnd: '#047857',
        },
      },
      monthly: {
        label: '2. Monthly Hatching Rate',
        subLabel: monthLabel,
        pct: calcPct(monthly.hatched, monthly.scanned),
        hatched: monthly.hatched,
        scanned: monthly.scanned,
        collected: monthly.collected,
        batches: monthly.count,
        colorTheme: {
          ringStroke: '#4f46e5',
          bgRing: '#e0e7ff',
          text: 'text-indigo-700',
          bgBadge: 'bg-indigo-50 text-indigo-800 border-indigo-200',
          gradientStart: '#6366f1',
          gradientEnd: '#3730a3',
        },
      },
      yearly: {
        label: '3. Yearly Hatching Rate',
        subLabel: yearLabel,
        pct: calcPct(yearly.hatched, yearly.scanned),
        hatched: yearly.hatched,
        scanned: yearly.scanned,
        collected: yearly.collected,
        batches: yearly.count,
        colorTheme: {
          ringStroke: '#d97706',
          bgRing: '#fef3c7',
          text: 'text-amber-700',
          bgBadge: 'bg-amber-50 text-amber-900 border-amber-200',
          gradientStart: '#f59e0b',
          gradientEnd: '#b45309',
        },
      },
    };
  }, [records, selectedYearMode, availableYears]);

  return (
    <div ref={containerRef} className="mt-8 bg-white rounded-3xl p-5 sm:p-6 border border-slate-100 shadow-xs space-y-6 text-left">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 bg-emerald-50 text-emerald-700 rounded-xl">
              <Sparkles size={18} />
            </div>
            <h3 className="text-base sm:text-lg font-black text-slate-900 uppercase tracking-tight">
              Post-Scan Hatching Percentage
            </h3>
          </div>
          <p className="text-xs font-semibold text-slate-500 mt-1 ml-9">
            Calculated as (Total Chicks Hatched / Total Eggs Scanned) × 100% in real-time.
          </p>
        </div>

        {/* Period Selector Controls */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-extrabold text-slate-500 uppercase tracking-wider">
            Period:
          </span>
          <select
            value={selectedYearMode}
            onChange={(e) => setSelectedYearMode(e.target.value)}
            className="bg-slate-50 border border-slate-200 text-slate-800 text-xs font-bold rounded-xl px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer shadow-2xs"
          >
            <option value="auto">⚡ Auto (Active Dataset: {stats.targetYear})</option>
            <option value="2026">2026 (Real-Time Current)</option>
            {availableYears.map((y) => (
              <option key={y} value={String(y)}>
                Year {y}
              </option>
            ))}
            <option value="all">All-Time Combined</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <HatchingCircleGauge item={stats.weekly} isVisible={isVisible} />
        <HatchingCircleGauge item={stats.monthly} isVisible={isVisible} />
        <HatchingCircleGauge item={stats.yearly} isVisible={isVisible} />
      </div>
    </div>
  );
};

export default function IncubatorMod({
  data,
  triggerRefresh,
  token,
  selectedEditRecord,
  setSelectedEditRecord,
  selectedClientForEdit,
  setSelectedClientForEdit,
  quickFormKey,
  setQuickFormKey
}: IncubatorModProps) {
  
  // Tabs within Incubator Module: 'records' | 'clients' | 'import'
  const [activeTabSub, setActiveTabSub] = useState<'records' | 'clients' | 'import'>('records');

  // CSV Spreadsheet Import States
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [parsedRows, setParsedRows] = useState<any[]>([]);
  const [importNotice, setImportNotice] = useState('');
  const [importSuccessCount, setImportSuccessCount] = useState<number | null>(null);

  // Collapse controllers
  const [showClientForm, setShowClientForm] = useState(false);
  const [showBatchForm, setShowBatchForm] = useState(false);
  const [showAdvancedRecords, setShowAdvancedRecords] = useState(false);

  // Sorting configurations
  // Options: 'newest_brought' | 'oldest_brought' | 'client_name_az' | 'amount_owed_desc' | 'egg_type' | 'hatcher_transit' | 'to_candle' | 'just_hatched'
  const [activeSort, setActiveSort] = useState<
    'newest_brought' | 'oldest_brought' | 'client_name_az' | 'amount_owed_desc' | 'egg_type' | 'hatcher_transit' | 'to_candle' | 'just_hatched'
  >('newest_brought');

  // Status Filter for Master Table: 'all' | 'active' | 'hatched'
  const [batchStatusFilter, setBatchStatusFilter] = useState<'all' | 'active' | 'hatched'>('all');

  // Fullscreen Table Overlay state & Zoom Scale (default 85% for ~85% fit-all high density view)
  const [fullscreenTable, setFullscreenTable] = useState<{
    title: string;
    subtitle?: string;
    badge?: string;
    icon?: React.ReactNode;
    content: React.ReactNode;
  } | null>(null);
  const [fullscreenZoom, setFullscreenZoom] = useState<number>(100);

  const touchStartDistRef = useRef<number | null>(null);
  const touchStartZoomRef = useRef<number>(100);

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

  useEffect(() => {
    if (fullscreenTable) {
      setFullscreenZoom(85);
    }
  }, [fullscreenTable]);

  const formatShortBatch = (name: string) => {
    if (!name) return '';
    return name
      .replace(/(?:Flock|Brooder|Growing)\s+/gi, '')
      .replace(/Batch\s*#/gi, '#')
      .replace(/Batch\s+(\d+)/gi, '#$1')
      .trim();
  };

  // Search filter
  const [searchQuery, setSearchQuery] = useState('');

  // Form states: New Client
  const [clientName, setClientName] = useState('');
  const [clientMark, setClientMark] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [clientLoc, setClientLoc] = useState('');
  const [clientOverdraftVal, setClientOverdraftVal] = useState('');
  const [clientSpecialCase, setClientSpecialCase] = useState<SpecialCase>('Standard');

  // Form states: Edit Client
  const [editingClient, setEditingClient] = useState<any | null>(null);
  const [editClientName, setEditClientName] = useState('');
  const [editClientMark, setEditClientMark] = useState('');
  const [editClientPhone, setEditClientPhone] = useState('');
  const [editClientLoc, setEditClientLoc] = useState('');
  const [editClientOverdraft, setEditClientOverdraft] = useState('');
  const [editClientSpecialCase, setEditClientSpecialCase] = useState<SpecialCase>('Standard');
  const [clientEditError, setClientEditError] = useState('');
  const [clientEditSuccess, setClientEditSuccess] = useState('');

  const openEditClientModal = (c: any) => {
    setEditingClient(c);
    setEditClientName(c.name || '');
    setEditClientMark(c.mark || '');
    setEditClientPhone(c.phone || '');
    setEditClientLoc(c.location || '');
    setEditClientOverdraft(String(c.overdraft || 0));
    setEditClientSpecialCase((c.specialCase as SpecialCase) || 'Standard');
    setClientEditError('');
    setClientEditSuccess('');
    setErrorMsg('');
    setSuccessMsg('');
  };

  // Prompt modal for special case scope change ('from_today' vs 'all_time')
  const [specialCasePromptData, setSpecialCasePromptData] = useState<{
    client: any;
    newSpecialCase: SpecialCase;
    name: string;
    mark: string;
    phone: string;
    location: string;
    overdraft: number;
  } | null>(null);

  // Form states: New Batch
  const [batchClientId, setBatchClientId] = useState('');
  const [clientSearchQuery, setClientSearchQuery] = useState('');
  const [isClientDropdownOpen, setIsClientDropdownOpen] = useState(false);
  const clientDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (clientDropdownRef.current && !clientDropdownRef.current.contains(event.target as Node)) {
        setIsClientDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const filteredBatchClients = data.clients.filter(c => {
    const query = clientSearchQuery.trim().toLowerCase();
    if (!query) return true;
    const nameMatch = c.name?.toLowerCase().includes(query);
    const markMatch = c.mark?.toLowerCase().includes(query);
    const phoneMatch = c.phone?.toLowerCase().includes(query);
    return nameMatch || markMatch || phoneMatch;
  }).sort((a, b) => {
    const query = clientSearchQuery.trim().toLowerCase();
    if (!query) return a.name.localeCompare(b.name);

    const aMarkExact = a.mark?.toLowerCase() === query;
    const bMarkExact = b.mark?.toLowerCase() === query;
    if (aMarkExact && !bMarkExact) return -1;
    if (!aMarkExact && bMarkExact) return 1;

    const aMarkStarts = a.mark?.toLowerCase().startsWith(query);
    const bMarkStarts = b.mark?.toLowerCase().startsWith(query);
    if (aMarkStarts && !bMarkStarts) return -1;
    if (!aMarkStarts && bMarkStarts) return 1;

    const aNameStarts = a.name?.toLowerCase().startsWith(query);
    const bNameStarts = b.name?.toLowerCase().startsWith(query);
    if (aNameStarts && !bNameStarts) return -1;
    if (!aNameStarts && bNameStarts) return 1;

    return a.name.localeCompare(b.name);
  });

  const handleClientSearchChange = (val: string) => {
    setClientSearchQuery(val);
    setIsClientDropdownOpen(true);

    const q = val.trim().toLowerCase();
    const matchedClient = data.clients.find(c => 
      c.id === val ||
      c.name.toLowerCase() === q ||
      c.mark.toLowerCase() === q ||
      `[${c.mark.toLowerCase()}] ${c.name.toLowerCase()}` === q ||
      `${c.name.toLowerCase()} (${c.mark.toLowerCase()})` === q
    );

    if (matchedClient) {
      setBatchClientId(matchedClient.id);
      if (matchedClient.specialCase) {
        setBatchSpecialCase(matchedClient.specialCase as SpecialCase);
      }
    } else {
      setBatchClientId('');
    }
  };

  const handleSelectBatchClient = (client: Client) => {
    setBatchClientId(client.id);
    setClientSearchQuery(`[${client.mark}] ${client.name}`);
    if (client.specialCase) {
      setBatchSpecialCase(client.specialCase as SpecialCase);
    }
    setIsClientDropdownOpen(false);
  };
  const [batchDate, setBatchDate] = useState(getCameroonTodayISO());
  const [batchEggs, setBatchEggs] = useState('');
  const [batchSpecialCase, setBatchSpecialCase] = useState<SpecialCase>('Standard');
  const [batchCustomRate, setBatchCustomRate] = useState('');
  const [batchNotes, setBatchNotes] = useState('');
  const [batchEggType, setBatchEggType] = useState<'Brahma' | 'Turkey' | 'Goose' | 'Quail'>('Brahma');
  const [overdraftOption, setOverdraftOption] = useState<'none' | 'full' | 'custom'>('none');
  const [customOverdraftAmount, setCustomOverdraftAmount] = useState('');
  const [batchAmountPaid, setBatchAmountPaid] = useState('');

  // Auto-Save Drafts for Client & Batch Forms
  const clientFormValues = React.useMemo(() => ({
    clientName,
    clientMark,
    clientPhone,
    clientLoc,
    clientOverdraftVal,
    clientSpecialCase
  }), [clientName, clientMark, clientPhone, clientLoc, clientOverdraftVal, clientSpecialCase]);

  const { hasRestoredDraft: hasClientDraft, clearDraft: clearClientDraft } = useFormAutoSave(
    'nvf_draft_incubator_client',
    clientFormValues,
    (draft) => {
      if (draft.clientName !== undefined) setClientName(draft.clientName);
      if (draft.clientMark !== undefined) setClientMark(draft.clientMark);
      if (draft.clientPhone !== undefined) setClientPhone(draft.clientPhone);
      if (draft.clientLoc !== undefined) setClientLoc(draft.clientLoc);
      if (draft.clientOverdraftVal !== undefined) setClientOverdraftVal(draft.clientOverdraftVal);
      if (draft.clientSpecialCase !== undefined) setClientSpecialCase(draft.clientSpecialCase);
    }
  );

  const batchFormValues = React.useMemo(() => ({
    batchClientId,
    clientSearchQuery,
    batchDate,
    batchEggs,
    batchSpecialCase,
    batchCustomRate,
    batchNotes,
    batchEggType,
    overdraftOption,
    customOverdraftAmount,
    batchAmountPaid
  }), [batchClientId, clientSearchQuery, batchDate, batchEggs, batchSpecialCase, batchCustomRate, batchNotes, batchEggType, overdraftOption, customOverdraftAmount, batchAmountPaid]);

  const { hasRestoredDraft: hasBatchDraft, clearDraft: clearBatchDraft } = useFormAutoSave(
    'nvf_draft_incubator_batch',
    batchFormValues,
    (draft) => {
      if (draft.batchClientId !== undefined) setBatchClientId(draft.batchClientId);
      if (draft.clientSearchQuery !== undefined) setClientSearchQuery(draft.clientSearchQuery);
      if (draft.batchDate !== undefined) setBatchDate(draft.batchDate);
      if (draft.batchEggs !== undefined) setBatchEggs(draft.batchEggs);
      if (draft.batchSpecialCase !== undefined) setBatchSpecialCase(draft.batchSpecialCase);
      if (draft.batchCustomRate !== undefined) setBatchCustomRate(draft.batchCustomRate);
      if (draft.batchNotes !== undefined) setBatchNotes(draft.batchNotes);
      if (draft.batchEggType !== undefined) setBatchEggType(draft.batchEggType);
      if (draft.overdraftOption !== undefined) setOverdraftOption(draft.overdraftOption);
      if (draft.customOverdraftAmount !== undefined) setCustomOverdraftAmount(draft.customOverdraftAmount);
      if (draft.batchAmountPaid !== undefined) setBatchAmountPaid(draft.batchAmountPaid);
    }
  );

  // Modal edit states
  const [editDateBrought, setEditDateBrought] = useState('');
  const [editEggType, setEditEggType] = useState<'Brahma' | 'Turkey' | 'Goose' | 'Quail'>('Brahma');
  const [editEggsCollected, setEditEggsCollected] = useState('');
  const [editSpecialCase, setEditSpecialCase] = useState<SpecialCase>('Standard');
  const [editCustomRate, setEditCustomRate] = useState('');
  const [editEggsAfterScan, setEditEggsAfterScan] = useState('');
  const [editChicksHatched, setEditChicksHatched] = useState('');
  const [editAmountPaid, setEditAmountPaid] = useState('');
  const [editNotes, setEditNotes] = useState('');

  // Notification overlays
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  useEffect(() => {
    if (!successMsg) return;
    const timer = setTimeout(() => setSuccessMsg(''), 6000);
    return () => clearTimeout(timer);
  }, [successMsg]);
  const [loading, setLoading] = useState(false);

  // Quick form action mapping from Dashboard
  useEffect(() => {
    if (quickFormKey === 'client') {
      setActiveTabSub('clients');
      setShowClientForm(true);
      setQuickFormKey(null);
    } else if (quickFormKey === 'batch') {
      setActiveTabSub('records');
      setShowBatchForm(true);
      setQuickFormKey(null);
    } else if (quickFormKey === 'active_batches' || quickFormKey === 'batches_table') {
      setActiveTabSub('records');
      setBatchStatusFilter('active');
      setQuickFormKey(null);
      setTimeout(() => {
        const el = document.getElementById('incubator_records_section') || document.getElementById('incubator_table_wrapper') || document.getElementById('tab_sub_records');
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    }
  }, [quickFormKey, setQuickFormKey]);

  // Open client edit modal when selected from global search
  useEffect(() => {
    if (selectedClientForEdit) {
      setActiveTabSub('clients');
      openEditClientModal(selectedClientForEdit);
      if (setSelectedClientForEdit) {
        setSelectedClientForEdit(null);
      }
    }
  }, [selectedClientForEdit, setSelectedClientForEdit]);

  // Initial edit modal mapping - with local mirroring and ref decoupling
  const [localEditRecord, setLocalEditRecord] = useState<IncubatorRecord | null>(null);

  useEffect(() => {
    if (selectedEditRecord) {
      setLocalEditRecord(selectedEditRecord);
    } else {
      setLocalEditRecord(null);
    }
  }, [selectedEditRecord]);

  useEffect(() => {
    if (localEditRecord) {
      setEditDateBrought(localEditRecord.dateBrought || '');
      setEditEggType(['Brahma', 'Turkey', 'Quail', 'Goose'].includes(localEditRecord.eggType || '') ? localEditRecord.eggType as 'Brahma' | 'Turkey' | 'Quail' | 'Goose' : 'Brahma');
      setEditEggsCollected(localEditRecord.eggsCollected !== undefined ? String(localEditRecord.eggsCollected) : '');
      setEditSpecialCase(localEditRecord.specialCase || 'Standard');
      setEditCustomRate(localEditRecord.ratePerEgg !== undefined ? String(localEditRecord.ratePerEgg) : '200');
      setEditEggsAfterScan(localEditRecord.eggsAfterScan !== null && localEditRecord.eggsAfterScan !== undefined ? String(localEditRecord.eggsAfterScan) : '');
      setEditChicksHatched(localEditRecord.chicksHatched !== null && localEditRecord.chicksHatched !== undefined ? String(localEditRecord.chicksHatched) : '');
      setEditAmountPaid(String(localEditRecord.amountPaid || 0));
      setEditNotes(localEditRecord.notes || '');
    }
  }, [localEditRecord]);

  const handleCloseEditModal = () => {
    setLocalEditRecord(null);
    setSelectedEditRecord(null);
  };

  // Deletion Confirmation Modal States
  const [recordToDelete, setRecordToDelete] = useState<IncubatorRecord | null>(null);
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState<boolean>(false);
  const [showBulkPaidConfirm, setShowBulkPaidConfirm] = useState<boolean>(false);

  // Client Statement & Compilation ledger states
  const [selectedLedgerClient, setSelectedLedgerClient] = useState<any | null>(null);

  // Selected week summary modal state
  const [selectedWeekSummary, setSelectedWeekSummary] = useState<WeeklySummaryRow | null>(null);

  // Auto-calculated weekly totals summaries from all incubator records
  const weeklySummaries = React.useMemo(() => {
    return getWeeklySummaries(data.incubator_records || []);
  }, [data.incubator_records]);

  // Grand total calculations across all recorded weeks
  const grandTotals = React.useMemo(() => {
    let totalEggs = 0;
    let totalScan = 0;
    let totalHatched = 0;
    let totalRevenue = 0;
    let totalOverdraft = 0;
    let totalDebt = 0;
    const clientSet = new Set<string>();

    weeklySummaries.forEach(row => {
      totalEggs += row.totalEggs;
      totalScan += row.totalScan;
      totalHatched += row.totalHatched;
      totalRevenue += row.revenue;
      totalOverdraft += row.overdraft;
      totalDebt += row.debt;
      row.clientsList.forEach(c => clientSet.add(c));
    });

    return {
      totalEggs,
      totalScan,
      totalHatched,
      totalRevenue,
      totalOverdraft,
      totalDebt,
      totalClients: clientSet.size
    };
  }, [weeklySummaries]);

  // Auto suggest unique initials marking when typing client's name
  const handleClientNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setClientName(value);

    // Dynamic initial auto suggestion
    if (value.trim()) {
      const parts = value.trim().split(/\s+/);
      let initials = '';
      if (parts.length >= 2) {
        initials = (parts[0][0] + parts[1][0]).toUpperCase();
      } else if (parts[0].length >= 2) {
        initials = parts[0].substring(0, 2).toUpperCase();
      } else {
        initials = parts[0][0].toUpperCase();
      }
      
      // Filter out non-alphabetic characters
      const regexInitials = initials.substring(0, 2).replace(/[^A-Z]/gi, '');
      setClientMark(regexInitials);
    } else {
      setClientMark('');
    }
  };



  // Submit Client Register
  const handleAddClient = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    const trimmedMark = clientMark.trim().toUpperCase();
    if (!clientName.trim() || trimmedMark.length !== 2 || !clientPhone.trim()) {
      setErrorMsg('Please complete name, unique 2-letter mark, and phone number.');
      return;
    }

    const duplicateClient = data.clients?.find(
      (c: any) => c.mark && c.mark.toUpperCase() === trimmedMark
    );
    if (duplicateClient) {
      setErrorMsg(`Client mark [${trimmedMark}] is already assigned to ${duplicateClient.name}. Client marks must be unique!`);
      return;
    }

    if (clientOverdraftVal && (Number(clientOverdraftVal) < 0 || isNaN(Number(clientOverdraftVal)))) {
      setErrorMsg('Overdraft credit value cannot be negative.');
      return;
    }

    setLoading(true);

    try {
      const res = await fetch('/api/clients', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': token
        },
        body: JSON.stringify({
          name: clientName,
          mark: trimmedMark,
          phone: clientPhone,
          location: clientLoc,
          overdraft: Number(clientOverdraftVal) || 0,
          specialCase: clientSpecialCase
        })
      });

      const resData = await res.json();
      if (!res.ok) {
        throw new Error(resData.error || 'Failed to register client.');
      }

      setSuccessMsg(`Client registered successfully! Assigned mark is "${trimmedMark}" with special case "${clientSpecialCase}".`);
      triggerRefresh();
      
      // Cleanup
      clearClientDraft();
      setClientName('');
      setClientMark('');
      setClientPhone('');
      setClientLoc('');
      setClientOverdraftVal('');
      setClientSpecialCase('Standard');
      setShowClientForm(false);
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Submit Client Edit Detail Changes (including overdraft & special case)
  const handleEditClient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingClient) return;
    setErrorMsg('');
    setSuccessMsg('');
    setClientEditError('');
    setClientEditSuccess('');

    if (!editClientName.trim() || !editClientMark.trim()) {
      const msg = 'Please complete name and unique client mark fields.';
      setClientEditError(msg);
      setErrorMsg(msg);
      return;
    }

    const trimmedMark = editClientMark.trim().toUpperCase();

    // Check duplicate client mark
    const duplicateClient = data.clients?.find(
      (c: any) => c.mark && c.mark.toUpperCase() === trimmedMark && c.id !== editingClient.id
    );
    if (duplicateClient) {
      const msg = `Client mark [${trimmedMark}] is already assigned to ${duplicateClient.name}. Client marks must be unique!`;
      setClientEditError(msg);
      setErrorMsg(msg);
      return;
    }

    if (editClientOverdraft && (Number(editClientOverdraft) < 0 || isNaN(Number(editClientOverdraft)))) {
      const msg = 'Overdraft credit value cannot be negative.';
      setClientEditError(msg);
      setErrorMsg(msg);
      return;
    }

    const currentCase = editingClient.specialCase || 'Standard';

    // If Special Case has been modified, prompt for Scope ('from_today' vs 'all_time')
    if (editClientSpecialCase !== currentCase) {
      setSpecialCasePromptData({
        client: editingClient,
        newSpecialCase: editClientSpecialCase,
        name: editClientName.trim(),
        mark: trimmedMark,
        phone: editClientPhone ? editClientPhone.trim() : '',
        location: editClientLoc ? editClientLoc.trim() : '',
        overdraft: Number(editClientOverdraft) || 0
      });
      return;
    }

    setLoading(true);

    try {
      const res = await fetch(`/api/clients/${editingClient.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': token
        },
        body: JSON.stringify({
          name: editClientName.trim(),
          mark: trimmedMark,
          phone: editClientPhone ? editClientPhone.trim() : '',
          location: editClientLoc ? editClientLoc.trim() : '',
          overdraft: Number(editClientOverdraft) || 0,
          specialCase: editClientSpecialCase
        })
      });

      const resData = await res.json();
      if (!res.ok) {
        throw new Error(resData.error || 'Failed to update client.');
      }

      const msg = `Client [${resData.mark || trimmedMark}] details updated successfully across all database entries!`;
      setSuccessMsg(msg);
      setClientEditSuccess(msg);
      triggerRefresh();
      setTimeout(() => {
        setEditingClient(null);
      }, 250);
    } catch (err: any) {
      const errMsg = err.message || 'Error updating client records.';
      setErrorMsg(errMsg);
      setClientEditError(errMsg);
    } finally {
      setLoading(false);
    }
  };

  // Handle Special Case Scope Confirmation from Prompt Modal
  const handleConfirmSpecialCaseScope = async (scope: 'from_today' | 'all_time') => {
    if (!specialCasePromptData) return;
    
    const targetMark = specialCasePromptData.mark.toUpperCase();
    const duplicateClient = data.clients?.find(
      (c: any) => c.mark && c.mark.toUpperCase() === targetMark && c.id !== specialCasePromptData.client.id
    );
    if (duplicateClient) {
      const msg = `Client mark [${targetMark}] is already assigned to ${duplicateClient.name}. Client marks must be unique!`;
      setErrorMsg(msg);
      setClientEditError(msg);
      setSpecialCasePromptData(null);
      return;
    }

    setLoading(true);
    setErrorMsg('');
    setSuccessMsg('');
    setClientEditError('');
    setClientEditSuccess('');

    try {
      const res = await fetch(`/api/clients/${specialCasePromptData.client.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': token
        },
        body: JSON.stringify({
          name: specialCasePromptData.name,
          mark: specialCasePromptData.mark,
          phone: specialCasePromptData.phone,
          location: specialCasePromptData.location,
          overdraft: specialCasePromptData.overdraft,
          specialCase: specialCasePromptData.newSpecialCase,
          scope
        })
      });

      const resData = await res.json();
      if (!res.ok) {
        throw new Error(resData.error || 'Failed to update client special case.');
      }

      let msg = '';
      if (scope === 'all_time') {
        msg = `Client [${resData.mark}] updated to "${specialCasePromptData.newSpecialCase}". All historical egg batches recalculated!`;
      } else {
        msg = `Client [${resData.mark}] updated to "${specialCasePromptData.newSpecialCase}". Will apply to current/future batches from today.`;
      }

      setSuccessMsg(msg);
      setClientEditSuccess(msg);
      triggerRefresh();
      setEditingClient(null);
      setSpecialCasePromptData(null);
    } catch (err: any) {
      const errMsg = err.message || 'Error updating client special case.';
      setErrorMsg(errMsg);
      setClientEditError(errMsg);
      setSpecialCasePromptData(null);
    } finally {
      setLoading(false);
    }
  };

  // Live Batch Calculation parameters
  const getLiveRateAndDue = () => {
    const computed = computeAmountDue({
      specialCase: batchSpecialCase,
      eggsCollected: Number(batchEggs) || 0,
      customRate: Number(batchCustomRate) || undefined
    });
    return { rate: computed.rate, due: computed.amountDue };
  };

  // Submit New Eggs Batch (Incubator entry)
  const handleAddBatch = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    if (!batchClientId || !batchDate || !batchEggs) {
      if (!batchClientId) {
        setErrorMsg('Please select a registered client account or type a matching client name/mark.');
      } else {
        setErrorMsg('Please select client, date brought, and egg count.');
      }
      return;
    }

    if (Number(batchEggs) <= 0 || isNaN(Number(batchEggs))) {
      setErrorMsg('Egg count must be a valid positive number.');
      return;
    }

    if (batchAmountPaid && (Number(batchAmountPaid) < 0 || isNaN(Number(batchAmountPaid)))) {
      setErrorMsg('Amount paid cannot be negative.');
      return;
    }

    if (batchSpecialCase === 'Custom') {
      if (!batchCustomRate || isNaN(Number(batchCustomRate)) || Number(batchCustomRate) < 0) {
        setErrorMsg('Please supply a valid non-negative custom rate per egg in FCFA.');
        return;
      }
    }

    const selectedClient = data.clients.find(c => c.id === batchClientId);
    const availableOverdraft = selectedClient ? (selectedClient.overdraft || 0) : 0;
    const { due: liveDue } = getLiveRateAndDue();

    let overdraftToUse = 0;
    if (overdraftOption === 'full') {
      overdraftToUse = Math.min(availableOverdraft, liveDue);
    } else if (overdraftOption === 'custom') {
      const customVal = Number(customOverdraftAmount) || 0;
      if (customVal < 0 || isNaN(customVal)) {
        setErrorMsg('Overdraft deduction amount cannot be negative or invalid.');
        return;
      }
      if (customVal > availableOverdraft) {
        setErrorMsg(`Selected client only has ${availableOverdraft.toLocaleString()} FCFA in overdraft credit.`);
        return;
      }
      if (customVal > liveDue) {
        setErrorMsg(`You cannot deduct more than the batch total due of ${liveDue.toLocaleString()} FCFA.`);
        return;
      }
      overdraftToUse = customVal;
    }

    setLoading(true);

    try {
      const res = await fetch('/api/incubator', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': token
        },
        body: JSON.stringify({
          clientId: batchClientId,
          dateBrought: batchDate,
          eggsCollected: Number(batchEggs),
          specialCase: batchSpecialCase,
          customRate: batchSpecialCase === 'Custom' ? Number(batchCustomRate) : undefined,
          notes: batchNotes,
          eggType: batchEggType,
          overdraftUsed: overdraftToUse,
          amountPaid: Number(batchAmountPaid) || 0
        })
      });

      const resData = await res.json();
      if (!res.ok) {
        throw new Error(resData.error || 'Failed to enter incubator batch.');
      }

      setSuccessMsg('Egg batch entered successfully! Calculations recorded.');
      triggerRefresh();

      // Reset
      clearBatchDraft();
      setBatchClientId('');
      setClientSearchQuery('');
      setIsClientDropdownOpen(false);
      setBatchEggs('');
      setBatchSpecialCase('Standard');
      setBatchCustomRate('');
      setBatchNotes('');
      setBatchEggType('Brahma');
      setOverdraftOption('none');
      setCustomOverdraftAmount('');
      setBatchAmountPaid('');
      setShowBatchForm(false);
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Submit Modal Edit Updates
  const handleSaveModalEdits = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!localEditRecord) return;

    setErrorMsg('');

    if (!editDateBrought) {
      setErrorMsg('Date brought is required.');
      return;
    }

    if (!editEggsCollected || Number(editEggsCollected) <= 0 || isNaN(Number(editEggsCollected))) {
      setErrorMsg('Eggs collected must be a valid positive number.');
      return;
    }

    if (editEggsAfterScan !== '' && (Number(editEggsAfterScan) < 0 || isNaN(Number(editEggsAfterScan)))) {
      setErrorMsg('Candled eggs count cannot be negative.');
      return;
    }

    if (editChicksHatched !== '' && (Number(editChicksHatched) < 0 || isNaN(Number(editChicksHatched)))) {
      setErrorMsg('Hatched chicks count cannot be negative.');
      return;
    }

    if (editAmountPaid !== '' && (Number(editAmountPaid) < 0 || isNaN(Number(editAmountPaid)))) {
      setErrorMsg('Amount paid cannot be negative.');
      return;
    }

    setLoading(true);

    try {
      const res = await fetch(`/api/incubator/${localEditRecord.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': token
        },
        body: JSON.stringify({
          dateBrought: editDateBrought,
          eggType: editEggType,
          eggsCollected: Number(editEggsCollected),
          specialCase: editSpecialCase,
          customRate: editSpecialCase === 'Custom' ? Number(editCustomRate) : undefined,
          eggsAfterScan: editEggsAfterScan === '' ? null : Number(editEggsAfterScan),
          chicksHatched: editChicksHatched === '' ? null : Number(editChicksHatched),
          amountPaid: Number(editAmountPaid) || 0,
          notes: editNotes
        })
      });

      const resData = await res.json();
      if (!res.ok) {
        throw new Error(resData.error || 'Failed to update record details.');
      }

      triggerRefresh();
      handleCloseEditModal(); // Close Modal and update parent
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Delete Incubator Record handler (triggers in-app confirm modal)
  const handleDeleteRecord = (id: string) => {
    const found = (data.incubator_records || []).find(r => r.id === id) || localEditRecord;
    if (found) {
      setRecordToDelete(found);
    }
  };

  const confirmDeleteSingleRecord = async (id: string) => {
    setLoading(true);
    setErrorMsg('');
    setSuccessMsg('');
    try {
      const res = await fetch(`/api/incubator/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': token }
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success !== false) {
        // Explicit deletion success check
        console.log(`[DELETION SUCCESS CHECK] Incubator record ID '${id}' was successfully removed from the server database.`);
        setRecordToDelete(null);
        handleCloseEditModal();
        setSuccessMsg(`✓ Deletion Success: Incubator batch (${id}) successfully removed from server.`);
        
        // Immediately refresh database state so UI table updates
        if (triggerRefresh) {
          triggerRefresh();
        }
      } else {
        const errMsg = data.error || 'Deletion has failed on the server.';
        console.error(`[DELETION ERROR] Server failed to delete incubator record ${id}:`, errMsg);
        setErrorMsg(errMsg);
      }
    } catch (e: any) {
      console.error('[DELETION EXCEPTION] Error occurred while deleting batch:', e);
      setErrorMsg(e.message || 'Error occurred while deleting batch.');
    } finally {
      setLoading(false);
    }
  };

  // WhatsApp helper
  const openWhatsApp = (phone: string, text: string) => {
    // Cameroon wa.me trigger wa.me/237...
    const cleanPhone = phone.replace(/\D/g, '');
    const finalPhone = cleanPhone.startsWith('237') ? cleanPhone : `237${cleanPhone}`;
    const url = `https://wa.me/${finalPhone}?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
  };

  // 1-Click Excel / CSV Template Download
  const downloadSampleTemplate = (format: 'xlsx' | 'csv' = 'xlsx') => {
    downloadExcelTemplate('incubator', format);
  };

  const downloadSampleCSV = () => downloadSampleTemplate('xlsx');

  // Universal Spreadsheet File Parser (.xlsx, .xls, .csv, .tsv)
  const parseSpreadsheetData = (arrayBuffer: ArrayBuffer) => {
    try {
      const workbook = XLSX.read(arrayBuffer, { type: 'array', cellDates: true, raw: true });
      const sheetName = workbook.SheetNames[0];
      if (!sheetName) throw new Error("Spreadsheet contains no sheets.");

      const worksheet = workbook.Sheets[sheetName];
      const rawRows: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "", raw: true });

      if (rawRows.length < 2) {
        throw new Error("Spreadsheet is empty or contains no data rows.");
      }

      // Find header row (search first 5 rows for column names)
      let headerIdx = 0;
      for (let i = 0; i < Math.min(5, rawRows.length); i++) {
        const rowStr = rawRows[i].map((c: any) => String(c).toLowerCase()).join(' ');
        if (rowStr.includes('name') || rowStr.includes('client') || rowStr.includes('eggs') || rowStr.includes('mark') || rowStr.includes('nom') || rowStr.includes('oeufs')) {
          headerIdx = i;
          break;
        }
      }

      const headers = rawRows[headerIdx].map((h: any) => String(h || '').trim().toLowerCase());

      // Look up column indexes using flexible and precise keyword matching
      const idxMark = headers.findIndex((h: string) => h.includes('mark') || h.includes('initial') || h.includes('marquage') || h.includes('code'));
      const idxName = headers.findIndex((h: string) => h.includes('name') || h.includes('nom') || h.includes('client name') || (h.includes('client') && !h.includes('mark')));
      const idxDate = headers.findIndex((h: string) => h.includes('date') || h.includes('day 1') || h.includes('brought') || h.includes('livraison'));
      
      const idxEggType = headers.findIndex((h: string) => 
        (h.includes('egg') && h.includes('type')) || h.includes('species') || h.includes('volaille') || h.includes('type of egg') || (h.includes('type') && !h.includes('case'))
      );

      const idxEggs = headers.findIndex((h: string) => {
        const isTypeCol = h.includes('type') || h.includes('species') || h.includes('volaille') || h.includes('case') || h.includes('special') || h.includes('tariff') || h.includes('rate') || h.includes('price');
        if (isTypeCol) return false;
        return h.includes('number of egg') || h.includes('nber of egg') || h.includes('no of egg') || h.includes('eggs collected') || h.includes('eggs brought') || h.includes('egg count') || h.includes('eggs count') || h.includes('total egg') || h.includes('number of eggs') || h.includes('qty') || h.includes('quantity') || h.includes('quantite') || h.includes('count') || h.includes('eggs') || h.includes('oeuf') || h.includes('oeufs');
      });

      const idxCase = headers.findIndex((h: string) => h.includes('case') || h.includes('special') || h.includes('tariff') || h.includes('tarification') || h.includes('prix') || h.includes('pricing'));
      const idxPaid = headers.findIndex((h: string) => h.includes('paid') || h.includes('paye') || h.includes('verse') || h.includes('montant') || h.includes('amount paid') || h.includes('payment'));
      const idxScan = headers.findIndex((h: string) => h.includes('scan') || h.includes('candling') || h.includes('mirage') || h.includes('post-scan') || h.includes('day 8') || h.includes('day 10'));
      const idxHatch = headers.findIndex((h: string) => h.includes('hatch') || h.includes('chick') || h.includes('poussin') || h.includes('eclosion'));
      const idxPhone = headers.findIndex((h: string) => h.includes('phone') || h.includes('contact') || h.includes('tel') || h.includes('whatsapp'));
      const idxLoc = headers.findIndex((h: string) => h.includes('loc') || h.includes('city') || h.includes('adresse') || h.includes('quartier'));
      const idxNotes = headers.findIndex((h: string) => h.includes('note') || h.includes('comment') || h.includes('remarque'));

      if (idxName === -1 && idxMark === -1) {
        throw new Error("Could not detect 'Client Name' or 'Client Mark' header column in the spreadsheet.");
      }

      const rowsData = rawRows.slice(headerIdx + 1).map((cols: any[], rIdx: number) => {
        if (!cols || cols.length === 0 || cols.every(c => String(c).trim() === '')) return null;

        let rawName = idxName !== -1 && cols[idxName] ? String(cols[idxName]).trim() : "";
        let rawMark = idxMark !== -1 ? String(cols[idxMark] || '').trim().toUpperCase() : "";

        if (!rawName && !rawMark) return null; // Skip empty row

        // Extract client mark if parenthesized in name, e.g., "John Doe (JD)"
        let clientMark = rawMark;
        const parenMatch = rawName.match(/\(([^)]+)\)/);
        if (parenMatch && parenMatch[1].trim().length === 2) {
          clientMark = parenMatch[1].trim().toUpperCase();
        }

        if (!clientMark && rawName) {
          const cleanName = rawName.replace(/\([^)]*\)/g, '').trim();
          const parts = cleanName.split(/\s+/);
          if (parts.length >= 2 && parts[0] && parts[1]) {
            clientMark = (parts[0][0] + parts[1][0]).toUpperCase().replace(/[^A-Z]/g, '');
          } else {
            clientMark = cleanName.substring(0, 2).toUpperCase().replace(/[^A-Z]/g, '');
          }
        }

        // Limit mark length to 2 uppercase letters
        clientMark = clientMark.substring(0, 2).toUpperCase();
        if (clientMark.length < 2) {
          clientMark = (clientMark + 'X').substring(0, 2);
        }

        let displayClientName = rawName;
        if (rawName.includes('(')) {
          displayClientName = rawName.replace(/\([^)]*\)/g, '').trim();
        }
        if (!displayClientName) {
          displayClientName = `Client ${clientMark}`;
        }

        // Date brought parsing
        let rawDate = idxDate !== -1 && cols[idxDate] !== undefined && cols[idxDate] !== null ? cols[idxDate] : "";
        let dateBrought = parseExcelDate(rawDate);

        // Egg Type parsing
        const rawEggType = idxEggType !== -1 && cols[idxEggType] ? String(cols[idxEggType]).trim().toLowerCase() : "";
        let eggType: 'Brahma' | 'Turkey' | 'Quail' | 'Goose' = 'Brahma';
        if (rawEggType.includes('turkey') || rawEggType.includes('dinde')) eggType = 'Turkey';
        else if (rawEggType.includes('quail') || rawEggType.includes('caille')) eggType = 'Quail';
        else if (rawEggType.includes('goose') || rawEggType.includes('oie')) eggType = 'Goose';

        // Eggs count
        let parsedEggs = "";
        if (idxEggs !== -1 && cols[idxEggs] !== undefined && cols[idxEggs] !== null) {
          parsedEggs = String(cols[idxEggs]).replace(/[^0-9]/g, '');
        }
        // Fallback: search columns for numeric value if idxEggs didn't match or returned empty
        if (!parsedEggs) {
          for (let colIdx = 0; colIdx < cols.length; colIdx++) {
            if (colIdx !== idxMark && colIdx !== idxName && colIdx !== idxDate && colIdx !== idxEggType && colIdx !== idxCase && colIdx !== idxPaid && colIdx !== idxPhone && colIdx !== idxLoc) {
              const val = cols[colIdx];
              if (val !== undefined && val !== null && val !== "") {
                const cleaned = String(val).replace(/[^0-9]/g, '');
                if (cleaned.length > 0) {
                  parsedEggs = cleaned;
                  break;
                }
              }
            }
          }
        }
        const eggsCollected = Number(parsedEggs) || 0;

        // Tariff / Special Case
        const rawCase = idxCase !== -1 && cols[idxCase] ? String(cols[idxCase]).trim().toLowerCase() : "standard";
        let specialCase: SpecialCase = "Standard";
        if (rawCase.includes("150") || rawCase.includes("brought")) specialCase = "150 Per Egg Brought";
        else if (rawCase.includes("chick") || rawCase.includes("poussin")) specialCase = "Per Chick";
        else if (rawCase.includes("after scan") || rawCase.includes("post scan") || rawCase.includes("mirage")) specialCase = "Per Egg After Scan";
        else if (rawCase.includes("discount") || rawCase.includes("reduc")) specialCase = "Discount";
        else if (rawCase.includes("free") || rawCase.includes("gratuit")) specialCase = "Free";
        else if (rawCase.includes("custom") || rawCase.includes("perso")) specialCase = "Custom";

        // Financials & Counts
        const rawPaid = idxPaid !== -1 && cols[idxPaid] ? String(cols[idxPaid]).replace(/[^0-9\.]/g, '') : "0";
        const amountPaid = Number(rawPaid) || 0;

        const rawScan = idxScan !== -1 && cols[idxScan] !== undefined && cols[idxScan] !== "" ? String(cols[idxScan]).replace(/[^0-9]/g, '') : "";
        const eggsAfterScan = rawScan !== "" ? Number(rawScan) : null;

        const rawHatch = idxHatch !== -1 && cols[idxHatch] !== undefined && cols[idxHatch] !== "" ? String(cols[idxHatch]).replace(/[^0-9]/g, '') : "";
        const chicksHatched = rawHatch !== "" ? Number(rawHatch) : null;

        const clientPhone = idxPhone !== -1 && cols[idxPhone] ? String(cols[idxPhone]).trim() : "237650000000";
        const clientLocation = idxLoc !== -1 && cols[idxLoc] ? String(cols[idxLoc]).trim() : "";
        const notes = idxNotes !== -1 && cols[idxNotes] ? String(cols[idxNotes]).trim() : "Imported from spreadsheet backup";

        return {
          rowNumber: headerIdx + rIdx + 2,
          clientMark,
          clientName: displayClientName,
          eggType,
          dateBrought,
          eggsCollected,
          numberOfEggs: eggsCollected,
          specialCase,
          amountPaid,
          eggsAfterScan,
          chicksHatched,
          clientPhone,
          clientLocation,
          notes
        };
      }).filter(Boolean).filter((r: any) => r.clientMark.length === 2);

      if (rowsData.length === 0) {
        throw new Error("No valid data rows with client information were found in the spreadsheet.");
      }

      return rowsData;
    } catch (e: any) {
      throw new Error(`Error parsing spreadsheet: ${e.message}`);
    }
  };

  const handleCSVFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    setErrorMsg('');
    setImportNotice('');
    setImportSuccessCount(null);
    if (!file) return;

    setCsvFile(file);
    try {
      const buffer = await file.arrayBuffer();
      const parsed = parseSpreadsheetData(buffer);
      setParsedRows(parsed);
      setImportNotice(`Loaded "${file.name}" successfully! Detected ${parsed.length} valid historic incubator batch rows ready for import.`);
    } catch (err: any) {
      setErrorMsg(err.message || 'Error occurred reading the spreadsheet file.');
      setParsedRows([]);
    }
  };

  const handleImportSubmit = async () => {
    if (parsedRows.length === 0) {
      setErrorMsg('No valid rows parsed from spreadsheet yet.');
      return;
    }

    setLoading(true);
    setErrorMsg('');
    setImportNotice('');

    try {
      const res = await fetch('/api/incubator/import', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': token
        },
        body: JSON.stringify({ batches: parsedRows })
      });

      const resData = await res.json();
      if (!res.ok) {
        throw new Error(resData.error || 'Bulk imports failed.');
      }

      setImportSuccessCount(resData.recordsImported);
      setSuccessMsg(`Spreadsheet Import complete! Successfully processed ${resData.recordsImported} old incubator rows and auto-registered ${resData.newClientsRegistered} new client markings.`);
      setParsedRows([]);
      setCsvFile(null);
      triggerRefresh();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failures occurred during spreadsheet upload.');
    } finally {
      setLoading(false);
    }
  };

  // Sorting & Filtering Process
  const getSortedRecords = () => {
    if (!data.incubator_records) return [];

    const indexed = data.incubator_records.map((rec, origIdx) => ({ rec, origIdx }));

    const filtered = indexed.filter(({ rec }) => {
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch = !q || (
        rec.clientName.toLowerCase().includes(q) ||
        rec.clientMark.toLowerCase().includes(q) ||
        (rec.notes && rec.notes.toLowerCase().includes(q))
      );
      if (!matchesSearch) return false;

      const isHatched = isRecordHatched(rec);
      if (batchStatusFilter === 'active') return !isHatched;
      if (batchStatusFilter === 'hatched') return isHatched;
      return true;
    });

    const todayTime = new Date(getCameroonTodayISO()).getTime();

    const sortedItems = [...filtered].sort((itemA, itemB) => {
      const a = itemA.rec;
      const b = itemB.rec;

      if (activeSort === 'newest_brought') {
        const dateDiff = new Date(b.dateBrought).getTime() - new Date(a.dateBrought).getTime();
        if (dateDiff !== 0) return dateDiff;

        // Same day entry: sort newest created time first or higher insertion order (no alphabetical priority)
        const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        if (timeA && timeB && timeA !== timeB) return timeB - timeA;

        return itemB.origIdx - itemA.origIdx;
      }

      if (activeSort === 'oldest_brought') {
        const dateDiff = new Date(a.dateBrought).getTime() - new Date(b.dateBrought).getTime();
        if (dateDiff !== 0) return dateDiff;

        // Same day entry: sort oldest created time first or lower insertion order
        const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        if (timeA && timeB && timeA !== timeB) return timeA - timeB;

        return itemA.origIdx - itemB.origIdx;
      }

      if (activeSort === 'client_name_az') {
        return a.clientName.localeCompare(b.clientName);
      }
      if (activeSort === 'amount_owed_desc') {
        const owedA = a.amountDue - a.amountPaid;
        const owedB = b.amountDue - b.amountPaid;
        return owedB - owedA;
      }
      if (activeSort === 'egg_type') {
        const typeA = a.eggType || 'Brahma';
        const typeB = b.eggType || 'Brahma';
        return typeA.localeCompare(typeB);
      }
      if (activeSort === 'hatcher_transit') {
        const broughtTimeA = new Date(a.dateBrought).getTime();
        const daysA = Math.floor((todayTime - broughtTimeA) / (24 * 60 * 60 * 1000));
        const speciesA = a.eggType || 'Brahma';
        const transDayA = speciesA === 'Turkey' ? 25 : speciesA === 'Quail' ? 15 : speciesA === 'Goose' ? 26 : 18;
        const hatchDayA = speciesA === 'Turkey' ? 28 : speciesA === 'Quail' ? 18 : speciesA === 'Goose' ? 30 : 21;
        const isTransitA = daysA >= transDayA && daysA < hatchDayA && !isRecordHatched(a);

        const broughtTimeB = new Date(b.dateBrought).getTime();
        const daysB = Math.floor((todayTime - broughtTimeB) / (24 * 60 * 60 * 1000));
        const speciesB = b.eggType || 'Brahma';
        const transDayB = speciesB === 'Turkey' ? 25 : speciesB === 'Quail' ? 15 : speciesB === 'Goose' ? 26 : 18;
        const hatchDayB = speciesB === 'Turkey' ? 28 : speciesB === 'Quail' ? 18 : speciesB === 'Goose' ? 30 : 21;
        const isTransitB = daysB >= transDayB && daysB < hatchDayB && !isRecordHatched(b);

        if (isTransitA && !isTransitB) return -1;
        if (!isTransitA && isTransitB) return 1;
        return new Date(b.dateBrought).getTime() - new Date(a.dateBrought).getTime();
      }
      if (activeSort === 'to_candle') {
        const broughtTimeA = new Date(a.dateBrought).getTime();
        const daysA = Math.floor((todayTime - broughtTimeA) / (24 * 60 * 60 * 1000));
        const speciesA = a.eggType || 'Brahma';
        const candleDayA = speciesA === 'Turkey' ? 10 : speciesA === 'Quail' ? -1 : speciesA === 'Goose' ? 10 : 8;
        const isCandleA = candleDayA !== -1 && daysA >= candleDayA && (a.eggsAfterScan === null || a.eggsAfterScan === undefined);

        const broughtTimeB = new Date(b.dateBrought).getTime();
        const daysB = Math.floor((todayTime - broughtTimeB) / (24 * 60 * 60 * 1000));
        const speciesB = b.eggType || 'Brahma';
        const candleDayB = speciesB === 'Turkey' ? 10 : speciesB === 'Quail' ? -1 : speciesB === 'Goose' ? 10 : 8;
        const isCandleB = candleDayB !== -1 && daysB >= candleDayB && (b.eggsAfterScan === null || b.eggsAfterScan === undefined);

        if (isCandleA && !isCandleB) return -1;
        if (!isCandleA && isCandleB) return 1;
        return new Date(b.dateBrought).getTime() - new Date(a.dateBrought).getTime();
      }
      if (activeSort === 'just_hatched') {
        const broughtTimeA = new Date(a.dateBrought).getTime();
        const daysA = Math.floor((todayTime - broughtTimeA) / (24 * 60 * 60 * 1000));
        const speciesA = a.eggType || 'Brahma';
        const hatchDayA = speciesA === 'Turkey' ? 28 : speciesA === 'Quail' ? 18 : speciesA === 'Goose' ? 30 : 21;
        const isHatchedA = daysA >= hatchDayA && !isRecordHatched(a);

        const broughtTimeB = new Date(b.dateBrought).getTime();
        const daysB = Math.floor((todayTime - broughtTimeB) / (24 * 60 * 60 * 1000));
        const speciesB = b.eggType || 'Brahma';
        const hatchDayB = speciesB === 'Turkey' ? 28 : speciesB === 'Quail' ? 18 : speciesB === 'Goose' ? 30 : 21;
        const isHatchedB = daysB >= hatchDayB && !isRecordHatched(b);

        if (isHatchedA && !isHatchedB) return -1;
        if (!isHatchedA && isHatchedB) return 1;
        return new Date(b.dateBrought).getTime() - new Date(a.dateBrought).getTime();
      }
      return 0;
    });

    return sortedItems.map(item => item.rec);
  };

  // Checkbox selection states
  const [selectedRecordIds, setSelectedRecordIds] = useState<string[]>([]);
  const [bulkEditLoading, setBulkEditLoading] = useState(false);

  const handleBulkDeleteRecords = () => {
    if (selectedRecordIds.length === 0) return;
    setShowBulkDeleteConfirm(true);
  };

  const confirmBulkDeleteRecords = async () => {
    if (selectedRecordIds.length === 0) return;
    
    setBulkEditLoading(true);
    setErrorMsg('');
    setSuccessMsg('');
    try {
      const res = await fetch('/api/bulk-delete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': token
        },
        body: JSON.stringify({ type: 'incubator', ids: selectedRecordIds })
      });
      const resData = await res.json().catch(() => ({}));
      if (res.ok && resData.success !== false) {
        const deletedCount = resData.count || selectedRecordIds.length;
        console.log(`[BULK DELETION SUCCESS CHECK] ${deletedCount} incubator batch(es) successfully removed from server database.`);
        setSelectedRecordIds([]);
        setShowBulkDeleteConfirm(false);
        setSuccessMsg(`✓ Deletion Success: ${deletedCount} incubator batch(es) successfully removed from server.`);
        if (triggerRefresh) {
          triggerRefresh();
        }
      } else {
        const errMsg = resData.error || 'Failed to bulk delete records.';
        console.error('[BULK DELETION ERROR]:', errMsg);
        throw new Error(errMsg);
      }
    } catch (e: any) {
      console.error('[BULK DELETION EXCEPTION]:', e);
      setErrorMsg(e.message || 'Error executing bulk delete.');
    } finally {
      setBulkEditLoading(false);
    }
  };

  const handleBulkUpdateRecords = async (updates: any) => {
    if (selectedRecordIds.length === 0) return;
    setBulkEditLoading(true);
    setErrorMsg('');
    setSuccessMsg('');
    try {
      const res = await fetch('/api/bulk-update', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': token
        },
        body: JSON.stringify({ type: 'incubator', ids: selectedRecordIds, updates })
      });
      const resData = await res.json();
      if (res.ok) {
        setSelectedRecordIds([]);
        setSuccessMsg(`Successfully updated ${resData.count || selectedRecordIds.length} records.`);
        triggerRefresh();
      } else {
        throw new Error(resData.error || 'Failed to bulk update records.');
      }
    } catch (e: any) {
      setErrorMsg(e.message || 'Error executing bulk update.');
    } finally {
      setBulkEditLoading(false);
    }
  };

  const { rate: liveRate, due: liveDue } = getLiveRateAndDue();
  const sortedRecords = getSortedRecords();
  const activeBatchesCount = (data.incubator_records || []).filter(r => !isRecordHatched(r)).length;
  const hatchedBatchesCount = (data.incubator_records || []).filter(r => isRecordHatched(r)).length;
  const totalBatchesCount = (data.incubator_records || []).length;
  const largeInputClass = "w-full h-12 px-4 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-medium text-slate-800 transition-colors bg-white";

  return (
    <div id="incubator_tab" className="space-y-6 pb-28">
      
      {/* Sub Tabs Toggle (Records vs Clients vs Import) */}
      <div className="flex bg-emerald-50 p-1.5 rounded-2xl border border-emerald-100 space-x-1.5">
        <button
          id="tab_sub_records"
          onClick={() => { setActiveTabSub('records'); setErrorMsg(''); setSuccessMsg(''); }}
          className={`flex-1 min-h-12 py-2 px-2 text-center rounded-xl font-bold text-sm transition-all cursor-pointer flex items-center justify-center gap-2 ${
            activeTabSub === 'records'
              ? 'bg-white text-emerald-800 shadow-sm font-extrabold ring-1 ring-slate-900/5'
              : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
          }`}
        >
          <Egg size={16} className={activeTabSub === 'records' ? 'text-emerald-600' : 'text-slate-400'} />
          <span>Batches</span>
        </button>
        <button
          id="tab_sub_clients"
          onClick={() => { setActiveTabSub('clients'); setErrorMsg(''); setSuccessMsg(''); }}
          className={`flex-1 min-h-12 py-2 px-2 text-center rounded-xl font-bold text-sm transition-all cursor-pointer flex items-center justify-center gap-2 ${
            activeTabSub === 'clients'
              ? 'bg-white text-emerald-800 shadow-sm font-extrabold ring-1 ring-slate-900/5'
              : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
          }`}
        >
          <User size={16} className={activeTabSub === 'clients' ? 'text-emerald-600' : 'text-slate-400'} />
          <span>Clients ({data.clients.length})</span>
        </button>
        <button
          id="tab_sub_import"
          onClick={() => { setActiveTabSub('import'); setErrorMsg(''); setSuccessMsg(''); }}
          className={`flex-1 min-h-12 py-2 px-2 text-center rounded-xl font-bold text-sm transition-all cursor-pointer flex items-center justify-center gap-2 ${
            activeTabSub === 'import'
              ? 'bg-white text-emerald-800 shadow-sm font-extrabold ring-1 ring-slate-900/5'
              : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
          }`}
        >
          <FileText size={16} className={activeTabSub === 'import' ? 'text-emerald-600' : 'text-slate-400'} />
          <span>Import</span>
        </button>
      </div>

      {/* Global Module Alerts: fixed so a result is visible wherever the button was tapped */}
      {(errorMsg || successMsg) && (
        <div role="status" aria-live="polite" className="fixed inset-x-3 bottom-20 z-[60] mx-auto max-w-md space-y-2">
          {errorMsg && (
            <div role="alert" className="p-4 bg-rose-50 border border-rose-200 rounded-2xl text-rose-700 text-sm flex gap-2 shadow-lg">
              <AlertCircle size={20} className="shrink-0" />
              <p className="font-semibold flex-1">{errorMsg}</p>
              <button type="button" aria-label="Dismiss message" onClick={() => setErrorMsg('')} className="shrink-0 text-rose-500"><X size={16} /></button>
            </div>
          )}
          {successMsg && !errorMsg && (
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl text-emerald-700 text-sm flex gap-2 shadow-lg">
              <Sparkles size={20} className="shrink-0" />
              <p className="font-semibold flex-1">{successMsg}</p>
              <button type="button" aria-label="Dismiss message" onClick={() => setSuccessMsg('')} className="shrink-0 text-emerald-600"><X size={16} /></button>
            </div>
          )}
        </div>
      )}

      {/* SUB TAB: CLIENTS */}
      {activeTabSub === 'clients' && (
        <div id="clients_subtab" className="space-y-6">
          <div className="bg-white rounded-3xl p-5 border border-slate-100 shadow-xs">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-black text-slate-800 uppercase tracking-tight">Client Registration</h3>
                <p className="text-slate-400 text-xs font-semibold">Store family client reference & markings</p>
              </div>
              <button
                id="toggle_client_form"
                onClick={() => setShowClientForm(!showClientForm)}
                className={`cursor-pointer w-10 h-10 rounded-full flex items-center justify-center transition-colors ${
                  showClientForm ? 'bg-rose-50 text-rose-600' : 'bg-emerald-50 text-emerald-600'
                }`}
              >
                {showClientForm ? <Minus size={20} /> : <Plus size={20} />}
              </button>
            </div>

            {/* Collapsible Client Register Form */}
            {showClientForm && (
              <form onSubmit={handleAddClient} className="bg-slate-50/50 p-4 border border-slate-100 rounded-2xl space-y-4 mb-6">
                <DraftSavedBadge
                  hasRestoredDraft={hasClientDraft}
                  onDiscard={() => {
                    clearClientDraft();
                    setClientName('');
                    setClientMark('');
                    setClientPhone('');
                    setClientLoc('');
                    setClientOverdraftVal('');
                    setClientSpecialCase('Standard');
                  }}
                />
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 ml-1">Client Full Name</label>
                  <input
                    id="client_name_input"
                    type="text"
                    placeholder="e.g. Samuel Samehn"
                    value={clientName}
                    onChange={handleClientNameChange}
                    className={largeInputClass}
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5 ml-1">
                      Client Mark (Unique Code)
                    </label>
                    <input
                      id="client_mark_input"
                      type="text"
                      placeholder="e.g. SS"
                      maxLength={10}
                      value={clientMark}
                      onChange={(e) => setClientMark(e.target.value.toUpperCase().replace(/[^A-Z0-9]/gi, ''))}
                      className="w-full h-12 px-4 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-extrabold text-lg text-emerald-800 tracking-wider transition-colors text-center"
                      required
                    />
                    <span className="text-[10px] text-slate-400 block mt-1 leading-tight px-1 font-semibold">
                      Must be strictly unique. Select an available mark badge below.
                    </span>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5 ml-1">Phone Number</label>
                    <input
                      id="client_phone_input"
                      type="tel"
                      placeholder="6XXXXXXXX"
                      value={clientPhone}
                      onChange={(e) => setClientPhone(e.target.value)}
                      className={largeInputClass}
                      required
                    />
                  </div>
                </div>

                {/* Available Unused Mark Badges for New Client */}
                {(() => {
                  const currentMark = (clientMark || '').trim().toUpperCase();
                  const usedMarksSet = new Set(
                    (data.clients || [])
                      .map((c: any) => (c.mark || '').trim().toUpperCase())
                      .filter(Boolean)
                  );
                  const isConflict = currentMark !== '' && usedMarksSet.has(currentMark);
                  const dupeClientObj = isConflict
                    ? data.clients?.find((c: any) => (c.mark || '').trim().toUpperCase() === currentMark)
                    : null;

                  const suggestedUnused = getSuggestedUnusedMarks(
                    clientName || '',
                    currentMark,
                    data.clients || [],
                    8
                  );

                  return (
                    <div className="space-y-1.5 bg-white p-3 rounded-2xl border border-slate-200 shadow-2xs">
                      <div className="flex flex-wrap items-center justify-between gap-1 text-[11px] font-bold">
                        <span className="flex items-center gap-1.5 text-slate-700">
                          <Sparkles size={13} className="text-amber-500 shrink-0" />
                          <span>Available Unused Marks (Click to assign):</span>
                        </span>
                        {isConflict && (
                          <span className="text-rose-600 font-extrabold flex items-center gap-1 bg-rose-50 px-2 py-0.5 rounded-md border border-rose-200">
                            <AlertCircle size={12} className="shrink-0" />
                            Taken by {dupeClientObj?.name || 'another client'}
                          </span>
                        )}
                      </div>

                      <div className="flex flex-wrap gap-1.5 pt-0.5">
                        {suggestedUnused.map((m) => (
                          <button
                            key={m}
                            type="button"
                            onClick={() => setClientMark(m)}
                            className={`px-2.5 py-1 rounded-xl text-xs font-black tracking-wider uppercase transition-all cursor-pointer border ${
                              currentMark === m
                                ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                                : 'bg-slate-50 hover:bg-emerald-50 text-emerald-800 border-emerald-200 hover:border-emerald-300'
                            }`}
                          >
                            +{m}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })()}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 ml-1">Location / Village (Optional)</label>
                    <input
                      id="client_loc_input"
                      type="text"
                      placeholder="e.g. Bafoussam III (Optional)"
                      value={clientLoc}
                      onChange={(e) => setClientLoc(e.target.value)}
                      className={largeInputClass}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-blue-600 uppercase tracking-wider mb-1 ml-1">Initial Overdraft Balance / Credit (FCFA)</label>
                    <input
                      id="client_overdraft_input"
                      type="number"
                      placeholder="e.g. 15000 (Optional)"
                      min="0"
                      value={clientOverdraftVal}
                      onChange={(e) => setClientOverdraftVal(e.target.value)}
                      className={largeInputClass}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-indigo-700 uppercase tracking-wider mb-1 ml-1">Default Special Case Pricing</label>
                  <select
                    id="client_special_case_input"
                    value={clientSpecialCase}
                    onChange={(e) => setClientSpecialCase(e.target.value as SpecialCase)}
                    className="w-full h-12 px-4 rounded-xl border border-indigo-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-extrabold text-slate-800 text-xs bg-white cursor-pointer"
                  >
                    <option value="Standard">Standard Species Rate (Quail 100 FCFA, Turkey/Duck/Goose 500 FCFA, Brahma/Others 200 FCFA)</option>
                    <option value="150 Per Egg Brought">150 FCFA Per Egg Brought</option>
                    <option value="Per Chick">Per Chick Hatched (Standard Rate)</option>
                    <option value="Per Egg After Scan">Per Egg After Scan (Standard Rate)</option>
                    <option value="Free">Free (0 FCFA)</option>
                    <option value="Custom">Custom Rate</option>
                  </select>
                </div>

                <button
                  id="client_submit_btn"
                  type="submit"
                  disabled={loading}
                  className="w-full h-12 bg-emerald-600 text-white rounded-xl font-bold uppercase tracking-wider text-sm shadow hover:bg-emerald-700 transition-colors active:scale-[0.98] cursor-pointer"
                >
                  {loading ? 'Validating unique mark...' : 'Register Client Account'}
                </button>
              </form>
            )}

            {/* Clients Listing Table */}
            <div className="flex items-center justify-between mb-3 mt-4">
              <h4 className="text-xs font-black text-slate-700 uppercase tracking-wider">
                Registered Client Accounts Directory ({data.clients.length})
              </h4>
              <button
                type="button"
                onClick={() => setFullscreenTable({
                  title: "REGISTERED CLIENT ACCOUNTS DIRECTORY",
                  subtitle: "Complete roster of registered client accounts, WhatsApp numbers, markings, and ledger status",
                  badge: `${data.clients.length} Clients`,
                  icon: <User size={20} />,
                  content: (
                    <div className="overflow-x-auto select-none rounded-2xl border border-slate-100 bg-white">
                      <table className="w-full border-collapse text-left min-w-[340px] sm:min-w-[500px]">
                        <thead className="bg-slate-50 sticky top-0 text-[9px] sm:text-xs font-bold text-slate-500 uppercase tracking-wider z-10">
                          <tr>
                            <th className="p-1.5 sm:p-3">Mark</th>
                            <th className="p-1.5 sm:p-3">Client Name</th>
                            <th className="p-1.5 sm:p-3">Special Case</th>
                            <th className="p-1.5 sm:p-3">Phone (WhatsApp)</th>
                            <th className="p-1.5 sm:p-3">Location</th>
                            <th className="p-1.5 sm:p-3">Financial Status</th>
                            <th className="p-1.5 sm:p-3">Overdraft Credit</th>
                            <th className="p-1.5 sm:p-3 text-center">Compilation Ledger</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 font-medium text-slate-700 text-[11px] sm:text-sm">
                          {data.clients.length === 0 ? (
                            <tr>
                              <td colSpan={8} className="p-3 sm:p-4 text-center text-slate-400 font-semibold bg-slate-50/50">
                                No clients registered yet.
                              </td>
                            </tr>
                          ) : (
                            data.clients.map((c) => {
                              const clientRecords = (data.incubator_records || []).filter(r => r.clientId === c.id);
                              const totalDue = clientRecords.reduce((acc, r) => acc + (r.amountDue || 0), 0);
                              const totalPaid = clientRecords.reduce((acc, r) => acc + (r.amountPaid || 0), 0);
                              const totalOverdraftUsed = clientRecords.reduce((acc, r) => acc + (r.overdraftUsed || 0), 0);
                              const netDue = Math.max(0, totalDue - totalOverdraftUsed);

                              const netBalance = totalPaid - netDue;
                              const totalOwed = netBalance < 0 ? Math.abs(netBalance) : 0;
                              const totalOverdraft = netBalance > 0 ? netBalance : 0;
                              return (
                                <tr key={c.id} className="hover:bg-slate-50/40">
                                  <td className="p-1.5 sm:p-3 font-extrabold text-emerald-800 text-xs sm:text-base">{c.mark}</td>
                                  <td className="p-1.5 sm:p-3 text-slate-950 font-bold text-xs sm:text-sm">{c.name}</td>
                                  <td className="p-1.5 sm:p-3 text-[10px] sm:text-xs">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        openEditClientModal(c);
                                        setFullscreenTable(null);
                                      }}
                                      className={`inline-flex items-center gap-1 px-1.5 py-0.5 sm:px-2.5 sm:py-1 rounded-lg text-[9px] sm:text-[10px] font-black uppercase border transition-all cursor-pointer ${
                                        c.specialCase === '150 Per Egg Brought' || c.specialCase === 'Discount' ? 'bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100' :
                                        c.specialCase === 'Per Chick' ? 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100' :
                                        c.specialCase === 'Per Egg After Scan' ? 'bg-amber-50 text-amber-900 border-amber-200 hover:bg-amber-100' :
                                        c.specialCase === 'Free' ? 'bg-teal-50 text-teal-800 border-teal-200 hover:bg-teal-100' :
                                        c.specialCase === 'Custom' ? 'bg-purple-50 text-purple-800 border-purple-200 hover:bg-purple-100' :
                                        'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200'
                                      }`}
                                      title="Click to edit special case"
                                    >
                                      <span>{c.specialCase || 'Standard'}</span>
                                      <FileEdit size={10} className="opacity-60" />
                                    </button>
                                  </td>
                                  <td className="p-1.5 sm:p-3 font-mono text-[10px] sm:text-xs">{c.phone || '-'}</td>
                                  <td className="p-1.5 sm:p-3 text-[10px] sm:text-xs text-slate-500">{c.location || '-'}</td>
                                  <td className="p-1.5 sm:p-3 text-[10px] sm:text-xs">
                                    <div className="flex flex-col gap-0.5 sm:gap-1">
                                      {totalOwed > 0 && <span className="text-rose-700 font-black bg-rose-50 border border-rose-200 px-1.5 py-0.5 rounded-md w-fit text-[9px] sm:text-xs">Owed: {totalOwed.toLocaleString()} FCFA</span>}
                                      {totalOverdraft > 0 && <span className="text-blue-800 font-black bg-blue-50 border border-blue-200 px-1.5 py-0.5 rounded-md w-fit flex items-center gap-1 text-[9px] sm:text-xs">💳 Overdraft: {totalOverdraft.toLocaleString()} FCFA</span>}
                                      {totalOwed === 0 && totalOverdraft === 0 && <span className="text-emerald-700 font-bold bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded-md w-fit text-[9px] sm:text-xs">Settled / Clear</span>}
                                    </div>
                                  </td>
                                  <td className="p-1.5 sm:p-3 text-[10px] sm:text-xs font-bold">
                                    {totalOverdraft > 0 ? (
                                      <span className="text-blue-800 font-extrabold bg-blue-50 border border-blue-200 px-1.5 py-0.5 sm:px-2.5 sm:py-1 rounded-lg text-[9px] sm:text-xs inline-flex items-center gap-1">
                                        💳 {totalOverdraft.toLocaleString()} FCFA Credit
                                      </span>
                                    ) : (
                                      <span className="text-slate-400 font-medium">0 FCFA</span>
                                    )}
                                  </td>
                                  <td className="p-1.5 sm:p-3 text-center font-bold">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setSelectedLedgerClient(c);
                                        setFullscreenTable(null);
                                      }}
                                      className="px-2 py-1 sm:px-3 sm:py-1.5 bg-blue-600 text-white rounded-lg text-[10px] sm:text-xs hover:bg-blue-700 transition-colors cursor-pointer"
                                    >
                                      Compile Info
                                    </button>
                                  </td>
                                </tr>
                              );
                            })
                          )}
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

            <div className="overflow-x-auto select-none rounded-xl border border-slate-100 max-h-96">
              <table className="w-full border-collapse text-left min-w-[340px] sm:min-w-[400px]">
                <thead className="bg-slate-50 sticky top-0 text-[9px] sm:text-xs font-bold text-slate-500 uppercase tracking-wider">
                  <tr>
                    <th className="p-1.5 sm:p-3">Mark</th>
                    <th className="p-1.5 sm:p-3">Client Name</th>
                    <th className="p-1.5 sm:p-3">Special Case</th>
                    <th className="p-1.5 sm:p-3">Phone (WhatsApp)</th>
                    <th className="p-1.5 sm:p-3">Location</th>
                    <th className="p-1.5 sm:p-3">Financial Status</th>
                    <th className="p-1.5 sm:p-3">Overdraft Credit</th>
                    <th className="p-1.5 sm:p-3 text-center">Compilation Ledger</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium text-slate-700 text-[11px] sm:text-sm">
                  {data.clients.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="p-3 sm:p-4 text-center text-slate-400 font-semibold bg-slate-50/50">
                        No clients registered yet. Define the first family client above.
                      </td>
                    </tr>
                  ) : (
                    data.clients.map((c) => {
                      // Calculate consolidated balances
                      const clientRecords = (data.incubator_records || []).filter(r => r.clientId === c.id);
                      const totalDue = clientRecords.reduce((acc, r) => acc + (r.amountDue || 0), 0);
                      const totalPaid = clientRecords.reduce((acc, r) => acc + (r.amountPaid || 0), 0);
                      const totalOverdraftUsed = clientRecords.reduce((acc, r) => acc + (r.overdraftUsed || 0), 0);
                      const netDue = Math.max(0, totalDue - totalOverdraftUsed);

                      const netBalance = totalPaid - netDue;
                      const totalOwed = netBalance < 0 ? Math.abs(netBalance) : 0;
                      const totalOverdraft = netBalance > 0 ? netBalance : 0;

                      return (
                        <tr key={c.id} className="hover:bg-slate-50/40">
                          <td className="p-1.5 sm:p-3">
                            <button
                              type="button"
                              onClick={() => openEditClientModal(c)}
                              className="font-extrabold text-emerald-800 text-xs sm:text-base hover:underline hover:text-emerald-600 transition-colors cursor-pointer flex items-center gap-1"
                              title="Click to edit client mark or details"
                            >
                              <span>{c.mark}</span>
                              <FileEdit size={11} className="opacity-60" />
                            </button>
                          </td>
                          <td className="p-1.5 sm:p-3 text-slate-950 font-bold text-xs sm:text-sm">{c.name}</td>
                          <td className="p-1.5 sm:p-3 text-[10px] sm:text-xs">
                            <button
                              type="button"
                              onClick={() => openEditClientModal(c)}
                              className={`inline-flex items-center gap-1 px-1.5 py-0.5 sm:px-2.5 sm:py-1 rounded-lg text-[9px] sm:text-[10px] font-black uppercase border transition-all cursor-pointer ${
                                c.specialCase === '150 Per Egg Brought' || c.specialCase === 'Discount' ? 'bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100' :
                                c.specialCase === 'Per Chick' ? 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100' :
                                c.specialCase === 'Per Egg After Scan' ? 'bg-amber-50 text-amber-900 border-amber-200 hover:bg-amber-100' :
                                c.specialCase === 'Free' ? 'bg-teal-50 text-teal-800 border-teal-200 hover:bg-teal-100' :
                                c.specialCase === 'Custom' ? 'bg-purple-50 text-purple-800 border-purple-200 hover:bg-purple-100' :
                                'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200'
                              }`}
                              title="Click to edit special case"
                            >
                              <span>{c.specialCase || 'Standard'}</span>
                              <FileEdit size={10} className="opacity-60" />
                            </button>
                          </td>
                          <td className="p-1.5 sm:p-3">
                            <button
                              id={`wa_client_${c.id}`}
                              onClick={() => openWhatsApp(c.phone, `Hello ${c.name}, this is New Vision Farms. Sharing active incubator status updates.`)}
                              className="bg-emerald-50 border border-emerald-100 text-emerald-700 rounded-xl px-1.5 py-1 sm:px-2.5 sm:py-1.5 text-[10px] sm:text-xs font-bold flex items-center gap-1 hover:bg-emerald-100 transition-colors cursor-pointer"
                            >
                              <Phone size={12} />
                              <span>{c.phone}</span>
                            </button>
                          </td>
                          <td className="p-1.5 sm:p-3 text-[10px] sm:text-xs text-slate-500">
                            <div className="flex items-center gap-1">
                              <MapPin size={11} className="text-slate-400 shrink-0" />
                              <span>{c.location}</span>
                            </div>
                          </td>
                          <td className="p-1.5 sm:p-3 text-[10px] sm:text-xs">
                            <div className="flex flex-col gap-0.5 sm:gap-1">
                              {totalOwed > 0 && (
                                <span className="text-rose-700 font-black bg-rose-50 border border-rose-200 px-1.5 py-0.5 rounded-md w-fit text-[9px] sm:text-xs">
                                  Owed: {totalOwed.toLocaleString()} FCFA
                                </span>
                              )}
                              {totalOverdraft > 0 && (
                                <span className="text-blue-800 font-black bg-blue-50 border border-blue-200 px-1.5 py-0.5 rounded-md w-fit text-[9px] sm:text-xs">
                                  💳 Overdraft (We Owe): {totalOverdraft.toLocaleString()} FCFA
                                </span>
                              )}
                              {totalOwed === 0 && totalOverdraft === 0 && (
                                <span className="text-emerald-700 font-bold bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded-md w-fit text-[9px] sm:text-xs">
                                  Settled / Clear
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="p-1.5 sm:p-3 text-[10px] sm:text-xs font-bold">
                            {totalOverdraft > 0 ? (
                              <span className="text-blue-800 font-extrabold bg-blue-50 border border-blue-200 px-1.5 py-0.5 sm:px-2.5 sm:py-1 rounded-lg text-[9px] sm:text-xs inline-flex items-center gap-1">
                                💳 {totalOverdraft.toLocaleString()} FCFA Credit
                              </span>
                            ) : (
                              <span className="text-slate-400 font-medium">0 FCFA</span>
                            )}
                          </td>
                          <td className="p-1.5 sm:p-3 text-center">
                            <div className="flex items-center justify-center gap-1 sm:gap-2">
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedLedgerClient(c);
                                  setErrorMsg('');
                                  setSuccessMsg('');
                                }}
                                className="px-2 py-1 sm:px-3 sm:py-1.5 bg-blue-650 hover:bg-blue-700 text-white rounded-xl text-[10px] sm:text-xs font-extrabold uppercase tracking-wide cursor-pointer shadow-xs hover:shadow transition-all inline-flex items-center gap-1"
                              >
                                <FileText size={11} />
                                <span>Compile Info</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => openEditClientModal(c)}
                                className="px-3 py-1.5 bg-amber-50 border border-amber-200 text-amber-700 hover:bg-amber-100 rounded-xl text-xs font-extrabold uppercase tracking-wide cursor-pointer shadow-xs hover:shadow transition-all inline-flex items-center gap-1"
                              >
                                <FileEdit size={12} />
                                <span>Edit details</span>
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
        </div>
      )}

      {/* SUB TAB: EGG BATCHES */}
      {activeTabSub === 'records' && (
        <div id="records_subtab" className="space-y-6">
          <div><h1 className="text-2xl font-bold text-emerald-950">Egg batches</h1><p className="text-sm text-slate-600">Add eggs, then follow each batch until hatching.</p></div>
          
          {/* Create Batch Card */}
          <div className="bg-white rounded-3xl p-5 border border-slate-100 shadow-xs">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-bold text-slate-900">New egg batch</h3>
                <p className="text-slate-600 text-sm">Record eggs delivered by a client.</p>
              </div>
              <button
                id="toggle_batch_form"
                onClick={() => setShowBatchForm(!showBatchForm)}
                className={`cursor-pointer min-h-11 px-3 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition-colors ${
                  showBatchForm ? 'bg-rose-50 text-rose-600' : 'bg-emerald-50 text-emerald-600'
                }`}
              >
                {showBatchForm ? <><Minus size={18} /> Close</> : <><Plus size={18} /> Add batch</>}
              </button>
            </div>

            {/* Collapsible New Batch Record */}
            {showBatchForm && (
              <form onSubmit={handleAddBatch} className="bg-slate-50/50 p-4 border border-slate-100 rounded-2xl space-y-4 mb-6">
                <DraftSavedBadge
                  hasRestoredDraft={hasBatchDraft}
                  onDiscard={() => {
                    clearBatchDraft();
                    setBatchClientId('');
                    setClientSearchQuery('');
                    setBatchEggs('');
                    setBatchSpecialCase('Standard');
                    setBatchCustomRate('');
                    setBatchNotes('');
                    setBatchEggType('Brahma');
                    setOverdraftOption('none');
                    setCustomOverdraftAmount('');
                    setBatchAmountPaid('');
                  }}
                />
                {/* Searchable Client Account Combobox */}
                <div className="relative" ref={clientDropdownRef}>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 ml-1">
                    1. Choose a client
                  </label>
                  <div className="relative flex items-center">
                    <div className="absolute left-3.5 text-slate-400 pointer-events-none">
                      <User size={18} />
                    </div>
                    <input
                      id="batch_client_search_input"
                      type="text"
                      placeholder="Type client name or mark (e.g. M1 or John)..."
                      value={clientSearchQuery}
                      onChange={(e) => handleClientSearchChange(e.target.value)}
                      onFocus={() => setIsClientDropdownOpen(true)}
                      className={`${largeInputClass} pl-10 pr-20`}
                      autoComplete="off"
                    />
                    <div className="absolute right-2 flex items-center gap-1">
                      {clientSearchQuery && (
                        <button
                          type="button"
                          onClick={() => {
                            setBatchClientId('');
                            setClientSearchQuery('');
                            setIsClientDropdownOpen(true);
                          }}
                          className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
                          title="Clear selection"
                        >
                          <X size={16} />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setIsClientDropdownOpen(!isClientDropdownOpen)}
                        className="p-1.5 text-slate-500 hover:text-slate-800 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
                        title="Toggle dropdown list"
                      >
                        <ChevronDown size={18} className={`transition-transform duration-200 ${isClientDropdownOpen ? 'rotate-180' : ''}`} />
                      </button>
                    </div>
                  </div>

                  {/* Active Selected Client Badge */}
                  {(() => {
                    const selClient = data.clients.find(c => c.id === batchClientId);
                    if (!selClient) return null;
                    return (
                      <div className="mt-1.5 ml-1 flex items-center gap-2 text-xs font-bold text-emerald-800 bg-emerald-50 border border-emerald-200/80 px-2.5 py-1 rounded-lg w-fit shadow-2xs">
                        <Check size={14} className="text-emerald-600" />
                        <span>Selected Client: <strong>[{selClient.mark}] {selClient.name}</strong></span>
                        {selClient.phone && <span className="text-slate-500 text-[11px] font-mono">({selClient.phone})</span>}
                      </div>
                    );
                  })()}

                  {/* Dropdown Options List */}
                  {isClientDropdownOpen && (
                    <div className="absolute left-0 right-0 top-full mt-1.5 bg-white border border-slate-200 rounded-2xl shadow-xl z-40 max-h-60 overflow-y-auto divide-y divide-slate-100">
                      {filteredBatchClients.length > 0 ? (
                        filteredBatchClients.map((c) => {
                          const isSelected = c.id === batchClientId;
                          return (
                            <button
                              key={c.id}
                              type="button"
                              onClick={() => handleSelectBatchClient(c)}
                              className={`w-full text-left px-3.5 py-2.5 flex items-center justify-between hover:bg-emerald-50/70 transition-colors cursor-pointer ${
                                isSelected ? 'bg-emerald-50 text-emerald-950 font-bold' : 'text-slate-700'
                              }`}
                            >
                              <div className="flex items-center gap-2.5 min-w-0">
                                <span className="px-2 py-0.5 rounded-lg bg-emerald-100 text-emerald-800 font-extrabold text-xs shrink-0">
                                  {c.mark}
                                </span>
                                <div className="truncate">
                                  <div className="font-bold text-xs text-slate-900 truncate">{c.name}</div>
                                  <div className="text-[11px] text-slate-500 font-medium truncate">
                                    {c.phone ? `Phone: ${c.phone}` : 'No phone'} {c.location ? `• ${c.location}` : ''}
                                  </div>
                                </div>
                              </div>

                              <div className="flex items-center gap-2 shrink-0 ml-2">
                                {c.specialCase && c.specialCase !== 'Standard' && (
                                  <span className="text-[10px] font-extrabold bg-indigo-50 text-indigo-700 border border-indigo-100 px-1.5 py-0.5 rounded uppercase">
                                    {c.specialCase}
                                  </span>
                                )}
                                {isSelected && <Check size={16} className="text-emerald-600 shrink-0" />}
                              </div>
                            </button>
                          );
                        })
                      ) : (
                        <div className="p-3.5 text-center text-xs text-slate-500 font-medium italic">
                          No registered clients found matching "{clientSearchQuery}"
                        </div>
                      )}
                    </div>
                  )}

                  {/* Prompt Notice when typed client is not registered / not found */}
                  {(data.clients.length === 0 || (clientSearchQuery.trim() !== '' && !batchClientId && filteredBatchClients.length === 0)) && (
                    <div className="mt-2 p-2.5 bg-amber-50 border border-amber-200/90 rounded-xl text-xs font-medium text-amber-900 flex items-start gap-2 shadow-2xs">
                      <AlertCircle size={16} className="text-amber-600 shrink-0 mt-0.5" />
                      <div className="leading-snug">
                        <span>{data.clients.length === 0 ? 'Add a client before recording their eggs. ' : 'No matching client. Check the name or '}</span>
                        <button
                          type="button"
                          onClick={() => {
                            setActiveTabSub('clients');
                            setShowClientForm(true);
                            window.scrollTo({ top: 0, behavior: 'smooth' });
                          }}
                          className="underline font-bold text-amber-950 hover:text-amber-700 cursor-pointer"
                        >
                          add a new client
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 ml-1 font-extrabold text-slate-600">Egg Species / Type</label>
                    <select
                      id="batch_egg_type_select"
                      value={batchEggType}
                      onChange={(e) => setBatchEggType(e.target.value as any)}
                      className={largeInputClass}
                      required
                    >
                      <option value="Brahma">🐓 Brahma / Local Eggs (200 FCFA)</option>
                      <option value="Turkey">🦃 Turkey Eggs (500 FCFA)</option>
                      <option value="Duck">🦆 Duck Eggs (500 FCFA)</option>
                      <option value="Quail">🪶 Quail Eggs (100 FCFA)</option>
                      <option value="Goose">🪿 Goose Eggs (500 FCFA)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 ml-1">Date Brought</label>
                    <input
                      id="batch_date_input"
                      type="date"
                      value={batchDate}
                      onChange={(e) => setBatchDate(e.target.value)}
                      className={largeInputClass}
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 ml-1">Eggs Collected</label>
                    <input
                      id="batch_eggs_input"
                      type="number"
                      placeholder="e.g. 100"
                      min="1"
                      value={batchEggs}
                      onChange={(e) => setBatchEggs(e.target.value)}
                      className={largeInputClass}
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5 ml-1">Pricing Special Case</label>
                    <select
                      id="batch_special_select"
                      value={batchSpecialCase}
                      onChange={(e) => setBatchSpecialCase(e.target.value as SpecialCase)}
                      className={largeInputClass}
                    >
                      <option value="Standard">Standard ({getStandardRateBySpecies(batchEggType)} FCFA / egg brought)</option>
                      <option value="150 Per Egg Brought">150 FCFA Per Egg Brought</option>
                      <option value="Per Chick">Per Chick Hatched ({getStandardRateBySpecies(batchEggType)} FCFA / chick)</option>
                      <option value="Per Egg After Scan">Per Egg After Scan ({getStandardRateBySpecies(batchEggType)} FCFA / scanned egg)</option>
                      <option value="Free">Free (0 FCFA)</option>
                      <option value="Custom">Custom Rate</option>
                    </select>
                  </div>

                  {batchSpecialCase === 'Custom' ? (
                    <div>
                      <label className="block text-xs font-bold text-rose-600 uppercase tracking-wider mb-1.5 ml-1">Custom Rate per Egg (FCFA)</label>
                      <input
                        id="batch_custom_rate_input"
                        type="number"
                        placeholder="e.g. 180"
                        min="1"
                        value={batchCustomRate}
                        onChange={(e) => setBatchCustomRate(e.target.value)}
                        className={largeInputClass}
                        required
                      />
                    </div>
                  ) : (
                    <div>
                      <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5 ml-1">Calculated Base Rate</label>
                      <div className="h-12 bg-slate-100 border border-slate-200 rounded-xl px-4 flex items-center text-slate-700 font-extrabold text-xs">
                        {batchSpecialCase === 'Standard' ? '200 FCFA / Egg Brought' :
                         batchSpecialCase === '150 Per Egg Brought' || batchSpecialCase === 'Discount' ? '150 FCFA / Egg Brought' :
                         batchSpecialCase === 'Per Chick' ? '200 FCFA / Chick Hatched' :
                         batchSpecialCase === 'Per Egg After Scan' ? '200 FCFA / Scanned Egg' : '0 FCFA'}
                      </div>
                    </div>
                  )}
                </div>

                {/* OVERDRAFT DEDUCTION COMPONENT TABLE */}
                {(() => {
                  const selectedClient = data.clients.find(c => c.id === batchClientId);
                  const clientOverdraft = selectedClient ? (selectedClient.overdraft || 0) : 0;
                  if (clientOverdraft <= 0) return null;

                  let overdraftApplied = 0;
                  if (overdraftOption === 'full') {
                    overdraftApplied = Math.min(clientOverdraft, liveDue);
                  } else if (overdraftOption === 'custom') {
                    overdraftApplied = Math.min(clientOverdraft, Math.max(0, Number(customOverdraftAmount) || 0), liveDue);
                  }

                  const remainingCredit = clientOverdraft - overdraftApplied;
                  const netCashDue = Math.max(0, liveDue - overdraftApplied);

                  return (
                    <div id="batch_overdraft_wrapper" className="bg-blue-50/70 border-2 border-blue-200 p-4 rounded-2xl space-y-3 shadow-xs">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="text-xl">💳</span>
                          <div>
                            <h5 className="text-xs font-black text-blue-900 uppercase tracking-wider">Client Overdraft Credit Account</h5>
                            <p className="text-[11px] text-blue-700 font-semibold">Amount we owe {selectedClient?.name} from previous overpayments</p>
                          </div>
                        </div>
                        <span className="bg-blue-600 text-white text-xs font-black px-3 py-1 rounded-lg shadow-2xs self-start sm:self-auto">
                          {clientOverdraft.toLocaleString()} FCFA Credit Available
                        </span>
                      </div>

                      <div className="overflow-x-auto rounded-xl border border-blue-200 bg-white shadow-2xs">
                        <table className="w-full text-xs text-left border-collapse min-w-[500px]">
                          <thead className="bg-blue-100/80 font-extrabold text-blue-900 uppercase text-[10px]">
                            <tr>
                              <th className="p-2.5">Client Credit</th>
                              <th className="p-2.5">Batch Bill</th>
                              <th className="p-2.5 min-w-[150px]">Overdraft to Use Now</th>
                              <th className="p-2.5">Remaining Credit</th>
                              <th className="p-2.5 text-right">Net Cash Due</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-blue-100 font-bold text-slate-800">
                            <tr>
                              <td className="p-2.5 text-blue-800 font-black text-sm">{clientOverdraft.toLocaleString()} FCFA</td>
                              <td className="p-2.5 text-slate-900 font-black text-sm">{liveDue.toLocaleString()} FCFA</td>
                              <td className="p-2.5">
                                <div className="space-y-1.5">
                                  <input
                                    id="batch_custom_overdraft_input"
                                    type="number"
                                    placeholder="Enter overdraft to use..."
                                    value={overdraftOption === 'custom' ? customOverdraftAmount : (overdraftOption === 'full' ? Math.min(clientOverdraft, liveDue) : '0')}
                                    onChange={(e) => {
                                      setOverdraftOption('custom');
                                      setCustomOverdraftAmount(e.target.value);
                                    }}
                                    max={Math.min(clientOverdraft, liveDue)}
                                    min="0"
                                    className="w-full h-9 px-3 bg-blue-50/50 border border-blue-300 rounded-lg text-xs font-extrabold text-blue-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                  />
                                  <div className="flex gap-1">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setOverdraftOption('full');
                                        setCustomOverdraftAmount(String(Math.min(clientOverdraft, liveDue)));
                                      }}
                                      className="px-2 py-0.5 bg-blue-600 text-white text-[10px] font-black rounded hover:bg-blue-700 transition-colors cursor-pointer"
                                    >
                                      Use All ({Math.min(clientOverdraft, liveDue).toLocaleString()} FCFA)
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setOverdraftOption('none');
                                        setCustomOverdraftAmount('0');
                                      }}
                                      className="px-2 py-0.5 bg-slate-200 text-slate-700 text-[10px] font-bold rounded hover:bg-slate-300 transition-colors cursor-pointer"
                                    >
                                      Use 0
                                    </button>
                                  </div>
                                </div>
                              </td>
                              <td className="p-2.5 text-blue-700 font-extrabold text-sm">{remainingCredit.toLocaleString()} FCFA</td>
                              <td className="p-2.5 text-right font-black text-emerald-800 text-sm">{netCashDue.toLocaleString()} FCFA</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </div>
                  );
                })()}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 ml-1 text-slate-600 select-none">Amount Paid (FCFA)</label>
                    <input
                      id="batch_amount_paid_input"
                      type="number"
                      placeholder="e.g. 10000 (Default 0)"
                      min="0"
                      value={batchAmountPaid}
                      onChange={(e) => setBatchAmountPaid(e.target.value)}
                      className={largeInputClass}
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 ml-1">Internal Notes</label>
                    <input
                      id="batch_notes_input"
                      type="text"
                      placeholder="Dry shells, small sizing..."
                      value={batchNotes}
                      onChange={(e) => setBatchNotes(e.target.value)}
                      className={largeInputClass}
                    />
                  </div>
                </div>

                {/* LIVE AUTO-CALCULATION DISPLAY */}
                {(() => {
                  const selectedClient = data.clients.find(c => c.id === batchClientId);
                  const clientOverdraft = selectedClient ? (selectedClient.overdraft || 0) : 0;
                  
                  let overdraftApplied = 0;
                  if (clientOverdraft > 0) {
                    if (overdraftOption === 'full') {
                      overdraftApplied = Math.min(clientOverdraft, liveDue);
                    } else if (overdraftOption === 'custom') {
                      overdraftApplied = Math.min(clientOverdraft, Math.max(0, Number(customOverdraftAmount) || 0), liveDue);
                    }
                  }
                  const finalDue = Math.max(0, liveDue - overdraftApplied);
                  const enteredPaid = Number(batchAmountPaid) || 0;
                  const finalRemainingUnpaid = Math.max(0, finalDue - enteredPaid);
                  const excessOverdraftGenerated = enteredPaid > finalDue ? enteredPaid - finalDue : 0;

                  return (
                    <div id="live_calculation_box" className="p-4 bg-emerald-50 rounded-2xl border border-emerald-100/60 space-y-2.5">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-[11px] font-extrabold text-emerald-800 uppercase tracking-wider">Hatchery Bill Calculation (Live)</p>
                          <p className="text-xs text-emerald-600 font-semibold mt-0.5">
                            {Number(batchEggs) || 0} Eggs @ {liveRate} FCFA
                          </p>
                        </div>
                        <strong className="text-base font-black text-emerald-800">
                          {liveDue.toLocaleString()} FCFA
                        </strong>
                      </div>

                      {overdraftApplied > 0 && (
                        <div className="flex items-center justify-between border-t border-emerald-100/30 pt-1.5 text-xs">
                          <span className="text-blue-800 font-medium">Minus Client Overdraft Credit Used:</span>
                          <span className="text-blue-700 font-extrabold">-{overdraftApplied.toLocaleString()} FCFA</span>
                        </div>
                      )}

                      {enteredPaid > 0 && (
                        <div className="flex items-center justify-between border-t border-emerald-100/30 pt-1.5 text-xs">
                          <span className="text-emerald-800 font-medium">Minus Cash Amount Paid Now:</span>
                          <span className="text-emerald-700 font-extrabold">-{enteredPaid.toLocaleString()} FCFA</span>
                        </div>
                      )}

                      {excessOverdraftGenerated > 0 && (
                        <div className="flex items-center justify-between border-t border-amber-200 pt-1.5 text-xs bg-amber-50/90 p-2.5 rounded-xl">
                          <span className="text-amber-900 font-extrabold">🎉 Overpayment (New Overdraft Credit for Client):</span>
                          <span className="text-amber-900 font-black text-sm">+{excessOverdraftGenerated.toLocaleString()} FCFA</span>
                        </div>
                      )}

                      <div className="flex items-center justify-between border-t border-emerald-200/50 pt-2.5">
                        <span className="text-xs text-emerald-950 font-black uppercase">Final Unpaid Balance (Pay Later):</span>
                        <strong className="text-xl font-black text-emerald-950">
                          {finalRemainingUnpaid.toLocaleString()} FCFA
                        </strong>
                      </div>
                    </div>
                  );
                })()}

                <button
                  id="batch_submit_btn"
                  type="submit"
                  className="w-full h-12 bg-emerald-600 text-white rounded-xl font-bold uppercase tracking-wider text-sm shadow hover:bg-emerald-700 transition-colors active:scale-[0.98] cursor-pointer"
                >
                  Save Incubator Egg Record
                </button>
              </form>
            )}
          </div>

          {totalBatchesCount === 0 && <div className="rounded-2xl border border-emerald-100 bg-white p-6 text-center"><Egg size={30} className="text-emerald-700 mx-auto"/><h3 className="text-lg font-bold mt-3">No egg batches yet</h3><p className="text-sm text-slate-600 mt-1">Add the first batch to start tracking incubation.</p><button type="button" onClick={() => setShowBatchForm(true)} className="mt-4 min-h-11 px-5 rounded-xl bg-emerald-700 text-white font-bold">Add egg batch</button></div>}
          {/* Table Management Dashboard */}
          <div className="bg-white rounded-3xl p-5 border border-slate-100 shadow-xs">
            
            {/* Master Incubator Table Section Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <Egg size={22} className="text-emerald-600 shrink-0" />
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-lg font-black text-slate-900 uppercase tracking-tight">
                      INCUBATOR BATCHES
                    </h3>
                    <span className={`text-[10px] font-black px-2.5 py-0.5 rounded-full uppercase border ${
                      activeBatchesCount > 0 
                        ? 'bg-emerald-100 text-emerald-800 border-emerald-300' 
                        : 'bg-slate-100 text-slate-600 border-slate-200'
                    }`}>
                      {activeBatchesCount} Active {activeBatchesCount === 1 ? 'Batch' : 'Batches'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
            
            <button type="button" onClick={() => setShowAdvancedRecords(!showAdvancedRecords)} className="min-h-11 px-4 mb-4 rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-900 font-semibold">{showAdvancedRecords ? 'Hide filters' : 'More filters'}</button>
            {/* Filter Search & Batch Status Filter Component */}
            <div hidden={!showAdvancedRecords} className="flex flex-col gap-3 mb-5">
              <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
                <div className="relative flex-1">
                  <input
                    type="text"
                    placeholder="Filter incubator by client name or mark..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full h-11 pl-10 pr-4 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-medium text-sm text-slate-800"
                  />
                  <Filter size={16} className="absolute left-3.5 top-3.5 text-slate-400" />
                </div>

                {/* Status Filter Tabs */}
                <div className="flex items-center bg-slate-100 p-1 rounded-xl shrink-0 self-start sm:self-auto">
                  <button
                    type="button"
                    onClick={() => setBatchStatusFilter('all')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      batchStatusFilter === 'all'
                        ? 'bg-white text-slate-800 shadow-xs'
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    All ({totalBatchesCount})
                  </button>
                  <button
                    type="button"
                    onClick={() => setBatchStatusFilter('active')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all cursor-pointer flex items-center gap-1.5 ${
                      batchStatusFilter === 'active'
                        ? 'bg-emerald-600 text-white shadow-xs'
                        : 'text-emerald-700 hover:bg-emerald-50'
                    }`}
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                    Active Only ({activeBatchesCount})
                  </button>
                  <button
                    type="button"
                    onClick={() => setBatchStatusFilter('hatched')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      batchStatusFilter === 'hatched'
                        ? 'bg-slate-800 text-white shadow-xs'
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    🐣 Hatched ({hatchedBatchesCount})
                  </button>
                </div>
              </div>

              {/* Sorting toggles */}
              <div className="flex flex-wrap gap-1.5">
                <button
                  onClick={() => setActiveSort('newest_brought')}
                  className={`px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1 transition-all border cursor-pointer ${
                    activeSort === 'newest_brought'
                      ? 'bg-emerald-600 text-white border-emerald-600 font-bold'
                      : 'bg-slate-50 text-slate-500 border-slate-100 hover:bg-slate-100'
                  }`}
                >
                  Newest First
                </button>
                <button
                  onClick={() => setActiveSort('oldest_brought')}
                  className={`px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1 transition-all border cursor-pointer ${
                    activeSort === 'oldest_brought'
                      ? 'bg-emerald-600 text-white border-emerald-600 font-bold'
                      : 'bg-slate-50 text-slate-500 border-slate-100 hover:bg-slate-100'
                  }`}
                >
                  Oldest First
                </button>
                <button
                  onClick={() => setActiveSort('client_name_az')}
                  className={`px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1 transition-all border cursor-pointer ${
                    activeSort === 'client_name_az'
                      ? 'bg-emerald-600 text-white border-emerald-600 font-bold'
                      : 'bg-slate-50 text-slate-500 border-slate-100 hover:bg-slate-100'
                  }`}
                >
                  Client Name (A-Z)
                </button>
                <button
                  onClick={() => setActiveSort('amount_owed_desc')}
                  className={`px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1 transition-all border cursor-pointer ${
                    activeSort === 'amount_owed_desc'
                      ? 'bg-emerald-600 text-white border-emerald-600 font-bold'
                      : 'bg-slate-50 text-slate-500 border-slate-100 hover:bg-slate-100'
                  }`}
                >
                  Owed Highest
                </button>
                <button
                  onClick={() => setActiveSort('egg_type')}
                  className={`px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1 transition-all border cursor-pointer ${
                    activeSort === 'egg_type'
                      ? 'bg-emerald-600 text-white border-emerald-600 font-bold'
                      : 'bg-slate-50 text-slate-500 border-slate-100 hover:bg-slate-100'
                  }`}
                >
                  🥚 Egg Type
                </button>
                <button
                  onClick={() => setActiveSort('hatcher_transit')}
                  className={`px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1 transition-all border cursor-pointer ${
                    activeSort === 'hatcher_transit'
                      ? 'bg-emerald-600 text-white border-emerald-600 font-bold'
                      : 'bg-slate-50 text-slate-500 border-slate-100 hover:bg-slate-100'
                  }`}
                >
                  🚚 To Hatcher
                </button>
                <button
                  onClick={() => setActiveSort('to_candle')}
                  className={`px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1 transition-all border cursor-pointer ${
                    activeSort === 'to_candle'
                      ? 'bg-emerald-600 text-white border-emerald-600 font-bold'
                      : 'bg-slate-50 text-slate-500 border-slate-100 hover:bg-slate-100'
                  }`}
                >
                  🔍 To Candle
                </button>
                <button
                  onClick={() => setActiveSort('just_hatched')}
                  className={`px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1 transition-all border cursor-pointer ${
                    activeSort === 'just_hatched'
                      ? 'bg-emerald-600 text-white border-emerald-600 font-bold'
                      : 'bg-slate-50 text-slate-500 border-slate-100 hover:bg-slate-100'
                  }`}
                >
                  🐣 Just Hatched
                </button>
              </div>
            </div>



            {/* BULK MANAGEMENT CONTROL HUB */}
            {selectedRecordIds.length > 0 && (
              <div className="mb-4 p-4 bg-slate-900 text-white rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4 animate-in fade-in slide-in-from-top-4 duration-200 text-left">
                <div className="flex items-center gap-3">
                  <div className="bg-emerald-600/20 text-emerald-400 p-2 rounded-xl">
                    <span className="text-xl">⚡</span>
                  </div>
                  <div>
                    <h4 className="text-xs font-black uppercase tracking-widest text-emerald-400">Bulk Management Actions</h4>
                    <p className="text-[11px] text-slate-300 font-bold">
                      Selected <span className="font-extrabold text-emerald-300 text-sm">{selectedRecordIds.length}</span> batch{selectedRecordIds.length > 1 ? 'es' : ''} for rapid processing.
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[10px] uppercase font-bold text-slate-400 mr-1">Set Case:</span>
                  {(['Standard', 'Discount', 'Free', 'Custom'] as SpecialCase[]).map((scValue) => (
                    <button
                      key={scValue}
                      type="button"
                      disabled={bulkEditLoading}
                      onClick={() => handleBulkUpdateRecords({ specialCase: scValue })}
                      className="px-2 py-1 bg-white/10 hover:bg-emerald-600 hover:text-white rounded-lg text-[10px] font-black uppercase transition-all border border-white/5 cursor-pointer disabled:opacity-50"
                    >
                      {scValue}
                    </button>
                  ))}

                  <div className="h-4 w-px bg-white/10 mx-1 hidden sm:block"></div>

                  <button
                    type="button"
                    disabled={bulkEditLoading}
                    onClick={() => setShowBulkPaidConfirm(true)}
                    className="px-2.5 py-1 bg-teal-500/20 hover:bg-teal-500 text-teal-200 hover:text-white rounded-lg text-[10px] font-black uppercase transition-all border border-teal-500/20 cursor-pointer disabled:opacity-50 flex items-center gap-1"
                  >
                    <span>💰 Fully Paid</span>
                  </button>

                  <div className="h-4 w-px bg-white/10 mx-1"></div>

                  <button
                    type="button"
                    disabled={bulkEditLoading}
                    onClick={handleBulkDeleteRecords}
                    className="px-2.5 py-1 bg-red-600/30 hover:bg-red-600 text-red-100 hover:text-white rounded-lg text-[10px] font-black uppercase transition-all border border-red-600/30 cursor-pointer disabled:opacity-50 flex items-center gap-1"
                  >
                    <span>🗑️ Delete</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSelectedRecordIds([])}
                    className="px-2 py-1 bg-white/5 hover:bg-white/15 rounded-lg text-[10px] font-black uppercase text-slate-350 transition-all cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* DIRECT ON TOP OF TABLE: Table Title & Fullscreen Button */}
            <div className="flex items-center justify-between mb-2 px-1">
              <div className="flex items-center gap-2">
                <span className="text-xs font-black text-slate-800 uppercase tracking-wider">
                  Batches & Setting Records ({sortedRecords.length})
                </span>
                <span className="text-[11px] font-semibold text-slate-400">
                  • 14 Columns
                </span>
              </div>
              <button
                type="button"
                onClick={() => setFullscreenTable({
                  title: "INCUBATOR BATCHES",
                  subtitle: "Master view of active setting batches, candling schedules, hatcher transfers & financials",
                  badge: `${activeBatchesCount} Active Batches (${totalBatchesCount} Total Records)`,
                  icon: <Egg size={22} />,
                  content: (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between px-1 text-[11px] font-bold text-slate-500">
                        <span className="flex items-center gap-1.5 text-slate-600">
                          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                          Scroll horizontally to view all columns
                        </span>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => {
                              const el = document.getElementById('fullscreen_incubator_table_wrapper');
                              if (el) el.scrollTo({ left: 0, behavior: 'smooth' });
                            }}
                            className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-[10px] font-black cursor-pointer transition-colors"
                          >
                            ◀ Start (Cols 1-8)
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              const el = document.getElementById('fullscreen_incubator_table_wrapper');
                              if (el) el.scrollTo({ left: el.scrollWidth, behavior: 'smooth' });
                            }}
                            className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-[10px] font-black cursor-pointer transition-colors"
                          >
                            End (Cols 9-16 / Actions) ▶
                          </button>
                        </div>
                      </div>
                      <div id="fullscreen_incubator_table_wrapper" className="overflow-x-auto select-none rounded-2xl border border-slate-100 shadow-xs bg-white touch-pan-x scroll-smooth">
                        <table className="w-full border-collapse text-left min-w-[1550px]">
                        <thead className="bg-slate-100 sticky top-0 text-[10px] font-black text-slate-600 uppercase tracking-wider border-b border-slate-200 z-10 whitespace-nowrap">
                          <tr>
                            <th className="p-1.5 text-center w-7">#</th>
                            <th className="p-1.5">CLIENT [MARK]</th>
                            <th className="p-1.5">EGG</th>
                            <th className="p-1.5">BROUGHT</th>
                            <th className="p-1.5">CANDLE D8</th>
                            <th className="p-1.5">HATCHER D18</th>
                            <th className="p-1.5">HATCH D21</th>
                            <th className="p-1.5 text-right">EGGS</th>
                            <th className="p-1.5 text-right">INF</th>
                            <th className="p-1.5 text-right">HATCHED</th>
                            <th className="p-1.5 text-right">UNHATCH</th>
                            <th className="p-1.5 text-right">DUE (F)</th>
                            <th className="p-1.5 text-right">PAID (F)</th>
                            <th className="p-1.5 text-center">OVERDRAFT</th>
                            <th className="p-1.5 text-right">OWED</th>
                            <th className="p-1.5 text-center">STATUS</th>
                            <th className="p-1.5 text-center">ACTION</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 font-medium text-slate-800 text-[11px] whitespace-nowrap">
                          {sortedRecords.length === 0 ? (
                            <tr>
                              <td colSpan={17} className="p-6 text-center text-slate-400 font-bold bg-slate-50">
                                No incubator setting records found matching criteria.
                              </td>
                            </tr>
                          ) : (
                            sortedRecords.map((r, idx) => {
                              const owed = Math.max(0, r.amountDue - r.amountPaid - (r.overdraftUsed || 0));
                              const eggShort = (r.eggType || 'Chicken').replace(/Chicken/i, 'Chk').replace(/Turkey/i, 'Trk');
                              return (
                                <tr key={r.id} className="hover:bg-emerald-50/20 transition-colors">
                                  <td className="p-1.5 text-center font-mono text-[10px] text-slate-400 font-bold">{idx + 1}</td>
                                  <td className="p-1.5 font-black text-slate-900">
                                    {r.clientName} <span className="text-emerald-700 font-mono">[{r.clientMark}]</span>
                                  </td>
                                  <td className="p-1.5 font-bold text-slate-800">{eggShort}</td>
                                  <td className="p-1.5 font-mono text-slate-600 text-[10px]">{formatDateDDMMYYYY(r.dateBrought)}</td>
                                  <td className="p-1.5 font-mono text-slate-600 text-[10px]">{formatDateDDMMYYYY(r.day8Date)}</td>
                                  <td className="p-1.5 font-mono text-slate-600 text-[10px]">{formatDateDDMMYYYY(r.day18Date)}</td>
                                  <td className="p-1.5 font-mono text-slate-600 text-[10px]">{formatDateDDMMYYYY(r.day21Date)}</td>
                                  <td className="p-1.5 text-right font-black text-slate-900">{r.eggsCollected}</td>
                                  <td className="p-1.5 text-right font-bold text-rose-600">
                                    {r.eggsAfterScan !== null ? Math.max(0, r.eggsCollected - r.eggsAfterScan) : 0}
                                  </td>
                                  <td className="p-1.5 text-right font-bold text-emerald-600">{r.chicksHatched || 0}</td>
                                  <td className="p-1.5 text-right font-bold text-amber-600">
                                    {r.eggsAfterScan !== null && r.chicksHatched !== null ? Math.max(0, r.eggsAfterScan - r.chicksHatched) : 0}
                                  </td>
                                  <td className="p-1.5 text-right font-mono font-bold text-slate-800">{r.amountDue.toLocaleString()}</td>
                                  <td className="p-1.5 text-right font-mono font-bold text-emerald-700">{r.amountPaid.toLocaleString()}</td>
                                  <td className="p-1.5 text-center font-mono font-bold">
                                    {r.overdraftUsed && r.overdraftUsed > 0 ? (
                                      <span className="text-blue-700 bg-blue-50 px-1 py-0.5 rounded text-[10px] border border-blue-100 whitespace-nowrap">
                                        -{r.overdraftUsed.toLocaleString()} F
                                      </span>
                                    ) : r.overdraftGenerated && r.overdraftGenerated > 0 ? (
                                      <span className="text-amber-800 bg-amber-50 px-1 py-0.5 rounded text-[10px] border border-amber-200 whitespace-nowrap">
                                        +{r.overdraftGenerated.toLocaleString()} F
                                      </span>
                                    ) : (
                                      <span className="text-slate-400 text-[10px]">0 F</span>
                                    )}
                                  </td>
                                  <td className="p-1.5 text-right font-mono font-black text-rose-700">
                                    {owed > 0 ? `${owed.toLocaleString()} F` : 'PAID'}
                                  </td>
                                  <td className="p-1.5 text-center font-black text-[9px]">
                                    <span className={`px-1.5 py-0.5 rounded uppercase ${
                                      owed <= 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                                    }`}>
                                      {owed <= 0 ? 'PAID' : 'UNPAID'}
                                    </span>
                                  </td>
                                  <td className="p-1.5 text-center">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setFullscreenTable(null);
                                        setSelectedEditRecord(r);
                                      }}
                                      className="p-1 bg-slate-100 hover:bg-emerald-50 hover:text-emerald-700 text-slate-600 rounded-lg cursor-pointer transition-colors"
                                      title="Edit Batch"
                                    >
                                      <FileEdit size={13} />
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
                )
              })}
                className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer border border-slate-200"
                title="View Master Table Fullscreen"
              >
                <Maximize2 size={15} />
                <span className="hidden sm:inline">Fullscreen</span>
              </button>
            </div>

            {/* THE MOST CRITICAL TABLE: EXACT COLUMN ORDER REQUIRED */}
            <div id="incubator_table_wrapper" className="overflow-x-auto select-none rounded-2xl border border-slate-200 shadow-xs max-h-[520px] overflow-y-auto touch-pan-x touch-pan-y scroll-smooth bg-white">
              <table className="w-full border-collapse text-left min-w-[700px] sm:min-w-[1650px]">
                <thead className="bg-slate-50 sticky top-0 text-[9px] sm:text-xs font-extrabold text-slate-500 uppercase tracking-wider border-b border-slate-200 z-10 whitespace-nowrap">
                  <tr>
                    {/* Select All Checkbox Column */}
                    <th className="p-1.5 sm:p-3 bg-slate-50 text-center w-8 sm:w-12">
                      <input
                        type="checkbox"
                        onClick={(e) => e.stopPropagation()}
                        checked={sortedRecords.some(r => r.ownerType !== 'farm') && selectedRecordIds.length === sortedRecords.filter(r => r.ownerType !== 'farm').length}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedRecordIds(sortedRecords.filter(r => r.ownerType !== 'farm').map(r => r.id));
                          } else {
                            setSelectedRecordIds([]);
                          }
                        }}
                        className="rounded border-slate-300 text-emerald-650 focus:ring-emerald-500 w-3.5 h-3.5 sm:w-4 sm:h-4 cursor-pointer"
                      />
                    </th>
                    {/* Exact columns structure:
                        1. Client Name, 2. Client Mark, 3. Date Eggs Brought, 4. Day 8, 5. Day 18, 6. Day 21,
                        7. Eggs Collected, 8. Amount Due, 9. Special Case, 10. Amount Paid, 11. Eggs after scan,
                        12. Chicks Hatched, 13. Client Phone, 14. Action edit button */}
                    <th className="p-1.5 sm:p-3 bg-slate-50 min-w-[90px] sm:min-w-[150px]">1. Client Name</th>
                    <th className="p-1.5 sm:p-3 bg-slate-50 text-center min-w-[45px] sm:min-w-[80px]">2. Mark</th>
                    <th className="p-1.5 sm:p-3 bg-slate-50 text-center min-w-[65px] sm:min-w-[110px]">3. Brought Date</th>
                    <th className="p-1.5 sm:p-3 bg-slate-100 text-center min-w-[70px] sm:min-w-[120px]">4. Candling Date</th>
                    <th className="p-1.5 sm:p-3 bg-slate-100 text-center min-w-[80px] sm:min-w-[140px]">5. Hatcher Trans</th>
                    <th className="p-1.5 sm:p-3 bg-slate-100 text-center min-w-[80px] sm:min-w-[140px]">6. Hatch Date</th>
                    <th className="p-1.5 sm:p-3 bg-slate-50 text-center min-w-[55px] sm:min-w-[110px]">7. Eggs Brought</th>
                    <th className="p-1.5 sm:p-3 bg-slate-50 text-right min-w-[65px] sm:min-w-[120px]">8. Amount Due</th>
                    <th className="p-1.5 sm:p-3 bg-slate-50 text-center min-w-[60px] sm:min-w-[110px]">9. Special Case</th>
                    <th className="p-1.5 sm:p-3 bg-slate-50 text-right min-w-[65px] sm:min-w-[120px]">10. Amount Paid</th>
                    <th className="p-1.5 sm:p-3 bg-blue-50/50 text-center min-w-[70px] sm:min-w-[130px]">11. Overdraft</th>
                    <th className="p-1.5 sm:p-3 bg-yellow-50/50 text-center min-w-[60px] sm:min-w-[120px]">12. Eggs Post-Scan</th>
                    <th className="p-1.5 sm:p-3 bg-emerald-50/20 text-center min-w-[60px] sm:min-w-[120px]">13. Chicks Hatched</th>
                    <th className="p-1.5 sm:p-3 bg-slate-50 text-center min-w-[70px] sm:min-w-[130px]">14. WhatsApp Direct</th>
                    <th className="p-1.5 sm:p-3 bg-slate-50 text-center min-w-[50px] sm:min-w-[100px]">15. Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-bold text-slate-700 text-[10px] sm:text-[13px] whitespace-nowrap">
                  {sortedRecords.length === 0 ? (
                    <tr>
                      <td colSpan={16} className="p-4 sm:p-8 text-center text-slate-400 font-semibold bg-slate-50/50">
                        No incubator egg batches found. Verify database or register entries above.
                      </td>
                    </tr>
                  ) : (
                    sortedRecords.map((rec) => {
                      const balance = rec.amountDue - rec.amountPaid;
                      const isPaidFull = balance <= 0;
                      const isSelected = selectedRecordIds.includes(rec.id);

                      // Detailed status calculations for visual prioritization
                      const rTodayTime = new Date(getCameroonTodayISO()).getTime();
                      const rBroughtTime = new Date(rec.dateBrought).getTime();
                      const rDaysPassed = Math.floor((rTodayTime - rBroughtTime) / (24 * 60 * 60 * 1000));
                      const rSpecies = rec.eggType || 'Brahma';
                      const rTransDay = rSpecies === 'Turkey' ? 25 : rSpecies === 'Quail' ? 15 : rSpecies === 'Goose' ? 26 : 18;
                      const rHatchDay = rSpecies === 'Turkey' ? 28 : rSpecies === 'Quail' ? 18 : rSpecies === 'Goose' ? 30 : 21;

                      const isHatched = isRecordHatched(rec);
                      const isHatcherActive = !isHatched && rDaysPassed >= rTransDay;
                      const isUpcomingTransit = !isHatched && rDaysPassed >= rTransDay - 2 && rDaysPassed < rTransDay;
                      const isOverdueHatch = !isHatched && rDaysPassed >= rHatchDay;

                      let rowBgClass = '';
                      let borderClass = 'border-l-4 border-l-transparent';

                      if (isSelected) {
                        rowBgClass = 'bg-emerald-50/25';
                      } else if (isOverdueHatch) {
                        rowBgClass = 'bg-rose-500/[0.04] hover:bg-rose-500/[0.08]';
                        borderClass = 'border-l-4 border-l-rose-500';
                      } else if (isHatcherActive) {
                        rowBgClass = 'bg-amber-500/[0.03] hover:bg-amber-500/[0.07]';
                        borderClass = 'border-l-4 border-l-amber-500';
                      } else if (isUpcomingTransit) {
                        rowBgClass = 'bg-indigo-500/[0.015] hover:bg-indigo-500/[0.05]';
                        borderClass = 'border-l-4 border-l-indigo-400';
                      } else {
                        rowBgClass = 'hover:bg-slate-50/30';
                      }
                      
                      return (
                        <tr key={rec.id} className={`transition-all duration-200 border-b border-slate-100 ${rowBgClass} ${borderClass}`}>
                          {/* Row Checkbox Selector */}
                          <td className="p-1.5 sm:p-3 text-center w-8 sm:w-12">
                            <input
                              type="checkbox"
                              disabled={rec.ownerType === 'farm'}
                              title={rec.ownerType === 'farm' ? 'Manage this batch in Farm → Quail' : undefined}
                              onClick={(e) => e.stopPropagation()}
                              checked={isSelected}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedRecordIds([...selectedRecordIds, rec.id]);
                                } else {
                                  setSelectedRecordIds(selectedRecordIds.filter(id => id !== rec.id));
                                }
                              }}
                              className="rounded border-slate-300 text-emerald-650 focus:ring-emerald-500 w-3.5 h-3.5 sm:w-4 sm:h-4 cursor-pointer"
                            />
                          </td>
                          {/* 1. Client Name */}
                          <td className="p-1.5 sm:p-3 text-slate-900 font-black truncate max-w-[100px] sm:max-w-[150px]" title={rec.clientName}>
                            <div>{rec.clientName}</div>
                            {rec.ownerType === 'farm' && <span className="block text-[9px] font-bold text-emerald-700">Farm-owned · manage in Farm → Quail</span>}
                            <span className="inline-block px-1 py-0.2 sm:px-1.5 sm:py-0.5 mt-0.5 rounded text-[8px] sm:text-[9px] font-black uppercase bg-slate-100 text-slate-700">
                              {rec.eggType || 'Brahma'}
                            </span>
                          </td>
                          {/* 2. Client Mark */}
                          <td className="p-1.5 sm:p-3 text-center text-xs sm:text-base font-extrabold text-emerald-800 bg-emerald-50/10">
                            {rec.clientMark}
                          </td>
                          {/* 3. Date Eggs Brought */}
                          <td className="p-1.5 sm:p-3 text-center font-mono text-[10px] sm:text-xs text-slate-500">{formatDateDDMMYYYY(rec.dateBrought)}</td>
                          
                          {/* 4. Candling Date */}
                          <td className="p-1.5 sm:p-3 text-center bg-slate-100/30 text-[10px] sm:text-xs font-mono">
                            {rec.eggType === 'Quail' ? (
                              <span className="text-slate-400 font-bold">N/A</span>
                            ) : (
                              <>
                                <div>{formatDateDDMMYYYY(rec.day8Date)}</div>
                                {rec.eggsAfterScan === null && (
                                  <span className="text-[8px] sm:text-[9px] font-black uppercase text-amber-500 bg-amber-50 px-1 py-0.2 rounded mt-0.5 inline-block">
                                    CANDLE (D{rec.eggType === 'Turkey' || rec.eggType === 'Goose' ? 10 : 8})
                                  </span>
                                )}
                              </>
                            )}
                          </td>
                          
                          {/* 5. Hatcher Trans */}
                          <td className={`p-1.5 sm:p-3 text-center text-[10px] sm:text-xs font-mono transition-colors duration-250 ${isHatcherActive ? 'bg-amber-550/[0.04]' : 'bg-slate-100/30'}`}>
                            <div>{formatDateDDMMYYYY(rec.day18Date)}</div>
                            {isHatcherActive ? (
                              <div className="inline-flex items-center gap-1 bg-amber-500 text-white font-black text-[8px] sm:text-[9px] uppercase px-1 py-0.2 sm:px-1.5 sm:py-0.5 rounded-md mt-0.5 tracking-tight shadow-xs animate-pulse">
                                <span className="relative flex h-1.5 w-1.5 sm:h-2 sm:w-2">
                                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
                                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 sm:h-2 sm:w-2 bg-white"></span>
                                </span>
                                <span>🚨 HATCHER ACTIVE</span>
                              </div>
                            ) : isUpcomingTransit ? (
                              <div className="inline-flex items-center gap-1 bg-indigo-500 text-white font-black text-[8px] sm:text-[9px] uppercase px-1 py-0.2 sm:px-1.5 sm:py-0.5 rounded-md mt-0.5 tracking-tight shadow-xs animate-pulse">
                                <span className="h-1 sm:h-1.5 w-1 sm:w-1.5 rounded-full bg-indigo-200 block animate-pulse"></span>
                                <span>⏳ TRANSIT PREP</span>
                              </div>
                            ) : (
                              !isRecordHatched(rec) && (
                                <span className="text-[8px] sm:text-[9px] font-black uppercase text-indigo-600 bg-indigo-50 px-1 py-0.2 sm:px-1.5 sm:py-0.5 rounded mt-0.5 inline-block">
                                  TRANS (D{rec.eggType === 'Turkey' ? 25 : rec.eggType === 'Quail' ? 15 : rec.eggType === 'Goose' ? 26 : 18})
                                </span>
                              )
                            )}
                          </td>
                          
                          {/* 6. Hatch Date */}
                          <td className={`p-1.5 sm:p-3 text-center text-[10px] sm:text-xs font-mono transition-colors duration-250 ${isOverdueHatch ? 'bg-rose-500/[0.04]' : 'bg-slate-100/30'}`}>
                            <div>{formatDateDDMMYYYY(rec.day21Date)}</div>
                            {isOverdueHatch ? (
                              <div className="inline-flex items-center gap-1 bg-rose-600 text-white font-black text-[8px] sm:text-[9px] uppercase px-1 py-0.2 sm:px-1.5 sm:py-0.5 rounded-md mt-0.5 tracking-tight animate-bounce">
                                <span className="relative flex h-1.5 w-1.5 sm:h-2 sm:w-2">
                                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
                                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 sm:h-2 sm:w-2 bg-white"></span>
                                </span>
                                <span>⚠️ OVERDUE HATCH</span>
                              </div>
                            ) : (
                              !isRecordHatched(rec) && (
                                <span className="text-[8px] sm:text-[9px] font-black uppercase text-rose-500 bg-rose-50 px-1 py-0.2 sm:px-1.5 sm:py-0.5 rounded mt-0.5 inline-block">
                                  HATCH (D{rec.eggType === 'Turkey' ? 28 : rec.eggType === 'Quail' ? 18 : rec.eggType === 'Goose' ? 30 : 21})
                                </span>
                              )
                            )}
                          </td>
                          
                          {/* 7. Eggs Collected */}
                          <td className="p-1.5 sm:p-3 text-center text-slate-900 font-black text-xs sm:text-sm">{rec.eggsCollected}</td>
                          
                          {/* 8. Amount Due */}
                          <td className="p-1.5 sm:p-3 text-right text-slate-900 font-extrabold text-[10px] sm:text-xs">{rec.amountDue.toLocaleString()}</td>
                          
                          {/* 9. Special Case */}
                          <td className="p-1.5 sm:p-3 text-center">
                            <span className={`text-[8px] sm:text-[10px] font-black uppercase p-0.5 px-1 sm:p-1 sm:px-2 rounded-lg border ${
                              rec.specialCase === 'Standard' ? 'bg-slate-50 text-slate-600 border-slate-100' :
                              rec.specialCase === 'Discount' ? 'bg-indigo-50 text-indigo-700 border-indigo-100' :
                              rec.specialCase === 'Free' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' :
                              'bg-amber-50 text-amber-800 border-amber-200'
                            }`}>
                              {rec.specialCase}
                            </span>
                          </td>
                          
                          {/* 10. Amount Paid */}
                          <td className={`p-1.5 sm:p-3 text-right font-black ${isPaidFull ? 'text-emerald-700 bg-emerald-50/20' : 'text-slate-800'}`}>
                            <div>{rec.amountPaid.toLocaleString()} FCFA</div>
                            {rec.overdraftUsed ? (
                              <span className="text-[8px] sm:text-[10px] font-bold text-blue-700 bg-blue-50 px-1 py-0.2 sm:px-1.5 sm:py-0.5 rounded border border-blue-100 mt-0.5 block leading-tight">
                                (+{rec.overdraftUsed.toLocaleString()} overdraft used)
                              </span>
                            ) : null}
                            {rec.overdraftGenerated ? (
                              <span className="text-[8px] sm:text-[10px] font-bold text-amber-800 bg-amber-50 px-1 py-0.2 sm:px-1.5 sm:py-0.5 rounded border border-amber-200 mt-0.5 block leading-tight">
                                (+{rec.overdraftGenerated.toLocaleString()} credit created)
                              </span>
                            ) : null}
                            {!isPaidFull && (
                              <div className="text-[8px] sm:text-[10px] font-bold text-rose-600 mt-0.5">Owes: {Math.max(0, rec.amountDue - rec.amountPaid - (rec.overdraftUsed || 0)).toLocaleString()} FCFA</div>
                            )}
                          </td>
                          
                          {/* 11. Overdraft */}
                          <td className="p-1.5 sm:p-3 text-center bg-blue-50/10">
                            {rec.overdraftUsed && rec.overdraftUsed > 0 ? (
                              <span className="text-blue-800 font-extrabold bg-blue-50 border border-blue-200 px-1.5 py-0.5 sm:px-2 sm:py-1 rounded-md text-[9px] sm:text-xs inline-block">
                                -{rec.overdraftUsed.toLocaleString()} FCFA (Used)
                              </span>
                            ) : rec.overdraftGenerated && rec.overdraftGenerated > 0 ? (
                              <span className="text-amber-800 font-black bg-amber-50 border border-amber-200 px-1.5 py-0.5 sm:px-2 sm:py-1 rounded-md text-[9px] sm:text-xs inline-block">
                                +{rec.overdraftGenerated.toLocaleString()} FCFA (Credit)
                              </span>
                            ) : (
                              <span className="text-slate-400 font-medium text-[9px] sm:text-xs">0 FCFA</span>
                            )}
                          </td>
                          
                          {/* 12. Eggs After Scan */}
                          <td className="p-1.5 sm:p-3 text-center bg-yellow-50/10 font-black text-xs sm:text-sm text-yellow-700">
                            {rec.eggsAfterScan !== null ? rec.eggsAfterScan : '—'}
                          </td>
                          
                          {/* 12. Chicks Hatched */}
                          <td className="p-1.5 sm:p-3 text-center bg-emerald-50/5 font-black text-xs sm:text-sm text-emerald-700">
                            {rec.chicksHatched !== null ? rec.chicksHatched : '—'}
                          </td>
                          
                          {/* 13. Client Phone WhatsApp */}
                          <td className="p-1.5 sm:p-3 text-center">
                            {rec.ownerType === 'farm' ? <span className="text-[10px] text-slate-500">Farm batch</span> : <button
                              onClick={() => openWhatsApp(rec.clientPhone, `Hello ${rec.clientName}, update on egg batch brought of date ${formatDateDDMMYYYY(rec.dateBrought)}: Day 21 status.`)}
                              className="inline-flex items-center gap-1 bg-emerald-50 border border-emerald-100 text-emerald-700 px-1.5 py-0.5 sm:px-2.5 sm:py-1 rounded-lg text-[10px] sm:text-xs hover:bg-emerald-100 transition-all cursor-pointer"
                            >
                              <MessageSquare size={11} />
                              <span>Click WA</span>
                            </button>}
                          </td>
                          
                          {/* 14. Edit Record button */}
                          <td className="p-1.5 sm:p-3 text-center">
                            {rec.ownerType === 'farm' ? <span className="text-[10px] text-emerald-700">Use Farm → Quail</span> : <button
                              onClick={() => setSelectedEditRecord(rec)}
                              className="p-1 sm:p-2 bg-slate-50 hover:bg-emerald-50 hover:text-emerald-700 border border-slate-100 text-slate-500 rounded-lg cursor-pointer transition-colors"
                              title="Update incubator status values"
                            >
                              <FileEdit size={12} className="sm:w-[14px] sm:h-[14px]" />
                            </button>}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* WEEKLY TOTALS SUMMARY TABLE (Mon-Sun calculated from incubator batch inputs) */}
          <div className="mt-8 bg-white rounded-3xl p-5 sm:p-6 border border-slate-100 shadow-xs space-y-4 text-left">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-emerald-50 text-emerald-700 rounded-xl">
                    <Calendar size={18} />
                  </div>
                  <h3 className="text-base sm:text-lg font-black text-slate-900 uppercase tracking-tight">
                    Weekly Incubator Summary Totals
                  </h3>
                </div>
                <p className="text-xs font-semibold text-slate-500 mt-1 ml-9">
                  Accurate weekly summaries (Monday to Sunday) auto-calculated from all new egg batch records.
                </p>
              </div>

              <div className="flex items-center gap-2 self-start sm:self-auto">
                <span className="text-xs font-extrabold text-emerald-800 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-full">
                  {weeklySummaries.length} {weeklySummaries.length === 1 ? 'Week Recorded' : 'Weeks Recorded'}
                </span>
                <button
                  type="button"
                  onClick={() => setFullscreenTable({
                    title: "WEEKLY INCUBATOR SUMMARY TOTALS",
                    subtitle: "Accurate weekly summaries (Monday to Sunday) auto-calculated from all new egg batch records",
                    badge: `${weeklySummaries.length} Weeks Recorded`,
                    icon: <BarChart3 size={20} />,
                    content: (
                      <div className="overflow-x-auto rounded-2xl border border-slate-200 shadow-2xs bg-white h-full min-h-full overflow-y-auto">
                        <table className="w-full border-collapse text-left min-w-[950px]">
                          <thead className="bg-slate-50 sticky top-0 text-[11px] font-black text-slate-600 uppercase tracking-wider border-b border-slate-200 z-10">
                            <tr>
                              <th className="p-3">Week (Mon - Sun)</th>
                              <th className="p-3 text-center">Clients</th>
                              <th className="p-3">Eggs</th>
                              <th className="p-3">After Scan</th>
                              <th className="p-3">Hatched</th>
                              <th className="p-3 text-right">Revenue</th>
                              <th className="p-3 text-right">Overdraft</th>
                              <th className="p-3 text-right">Debt</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 font-medium text-slate-800 text-xs">
                            {weeklySummaries.map((row) => (
                              <tr key={row.weekKey} className="hover:bg-slate-50/70 transition-colors">
                                <td className="p-3 font-mono font-bold text-slate-900">
                                  Week #{row.weekNumber} ({row.label})
                                </td>
                                <td className="p-3 text-center font-bold">{row.clientCount}</td>
                                <td className="p-3 font-bold text-amber-950">{row.totalEggs.toLocaleString()}</td>
                                <td className="p-3 font-bold text-yellow-900">{row.totalScan.toLocaleString()}</td>
                                <td className="p-3 font-bold text-emerald-800">{row.totalHatched.toLocaleString()}</td>
                                <td className="p-3 font-mono font-bold text-emerald-800 text-right">{row.revenue.toLocaleString()} FCFA</td>
                                <td className="p-3 font-mono text-blue-700 text-right">{row.overdraft > 0 ? `+${row.overdraft.toLocaleString()}` : '0'} FCFA</td>
                                <td className="p-3 font-mono font-bold text-rose-700 text-right">{row.debt > 0 ? `${row.debt.toLocaleString()} FCFA` : '0 FCFA'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )
                  })}
                  className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer border border-slate-200"
                  title="View Weekly Totals Fullscreen"
                >
                  <Maximize2 size={15} />
                  <span className="hidden sm:inline">Fullscreen</span>
                </button>
              </div>
            </div>

            <div className="overflow-x-auto rounded-2xl border border-slate-200 shadow-2xs">
              <table className="w-full border-collapse text-left min-w-[950px]">
                <thead className="bg-slate-50/90 text-[11px] font-black text-slate-600 uppercase tracking-wider border-b border-slate-200">
                  <tr>
                    <th className="p-3.5">Week (Mon - Sun)</th>
                    <th className="p-3.5 text-center">Number of Clients</th>
                    <th className="p-3.5">Number of Eggs</th>
                    <th className="p-3.5">Number After Scan</th>
                    <th className="p-3.5">Number Hatched</th>
                    <th className="p-3.5 text-right">Revenue</th>
                    <th className="p-3.5 text-right">Overdraft</th>
                    <th className="p-3.5 text-right">Debt</th>
                    <th className="p-3.5 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium text-slate-800 text-xs sm:text-sm">
                  {weeklySummaries.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="p-6 text-center text-slate-400 font-semibold bg-slate-50/40">
                        No incubator batch records found. Add batch entries in the form above to generate weekly totals.
                      </td>
                    </tr>
                  ) : (
                    weeklySummaries.map((row) => (
                      <tr key={row.weekKey} className="hover:bg-slate-50/70 transition-colors">
                        {/* 1. Week */}
                        <td className="p-3.5 align-top">
                          <div className="flex items-center gap-2">
                            <span className="bg-emerald-600 text-white font-extrabold text-[10px] px-2 py-0.5 rounded-md shadow-2xs">
                              Week #{row.weekNumber}
                            </span>
                          </div>
                          <div className="font-extrabold text-slate-900 font-mono text-xs mt-1">
                            {row.label}
                          </div>
                          <div className="text-[10px] text-slate-400 font-medium mt-0.5">
                            {row.records.length} {row.records.length === 1 ? 'batch' : 'batches'}
                          </div>
                        </td>

                        {/* 2. Number of Clients */}
                        <td className="p-3.5 text-center align-top">
                          <div className="inline-flex flex-col items-center">
                            <span className="font-black text-slate-900 text-base">{row.clientCount}</span>
                            <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">
                              {row.clientCount === 1 ? 'client' : 'clients'}
                            </span>
                          </div>
                        </td>

                        {/* 3. Number of Eggs */}
                        <td className="p-3.5 align-top">
                          <div className="font-black text-amber-950 text-sm">
                            {row.totalEggs.toLocaleString()} <span className="text-xs font-bold text-amber-800">eggs</span>
                          </div>
                          <div className="flex flex-wrap gap-1 mt-1.5">
                            {Object.entries(row.eggsBySpecies).map(([species, count]) => (
                              <span
                                key={species}
                                className="inline-flex items-center gap-1 text-[10px] font-extrabold px-2 py-0.5 rounded-md bg-amber-50 text-amber-900 border border-amber-200/80"
                              >
                                <span>{species}:</span>
                                <span className="font-black text-amber-950">{count.toLocaleString()}</span>
                              </span>
                            ))}
                          </div>
                        </td>

                        {/* 4. Number After Scan */}
                        <td className="p-3.5 align-top">
                          <div className="font-black text-yellow-900 text-sm">
                            {row.totalScan.toLocaleString()} <span className="text-xs font-bold text-yellow-800">scanned</span>
                          </div>
                          <div className="flex flex-wrap gap-1 mt-1.5">
                            {Object.entries(row.scanBySpecies).length > 0 ? (
                              Object.entries(row.scanBySpecies).map(([species, count]) => (
                                <span
                                  key={species}
                                  className="inline-flex items-center gap-1 text-[10px] font-extrabold px-2 py-0.5 rounded-md bg-yellow-50 text-yellow-900 border border-yellow-200/80"
                                >
                                  <span>{species}:</span>
                                  <span className="font-black text-yellow-950">{count.toLocaleString()}</span>
                                </span>
                              ))
                            ) : (
                              <span className="text-[10px] text-slate-400 font-semibold italic">No scan data</span>
                            )}
                          </div>
                        </td>

                        {/* 5. Number Hatched */}
                        <td className="p-3.5 align-top">
                          <div className="font-black text-emerald-900 text-sm">
                            {row.totalHatched.toLocaleString()} <span className="text-xs font-bold text-emerald-800">hatched</span>
                          </div>
                          <div className="flex flex-wrap gap-1 mt-1.5">
                            {Object.entries(row.hatchedBySpecies).length > 0 ? (
                              Object.entries(row.hatchedBySpecies).map(([species, count]) => (
                                <span
                                  key={species}
                                  className="inline-flex items-center gap-1 text-[10px] font-extrabold px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-900 border border-emerald-200/80"
                                >
                                  <span>{species}:</span>
                                  <span className="font-black text-emerald-950">{count.toLocaleString()}</span>
                                </span>
                              ))
                            ) : (
                              <span className="text-[10px] text-slate-400 font-semibold italic">No hatch data</span>
                            )}
                          </div>
                        </td>

                        {/* 6. Revenue */}
                        <td className="p-3.5 text-right font-black text-emerald-700 align-top">
                          <div className="text-sm">{row.revenue.toLocaleString()} FCFA</div>
                        </td>

                        {/* 7. Overdraft */}
                        <td className="p-3.5 text-right font-bold text-blue-700 align-top">
                          <div className="text-sm">{row.overdraft > 0 ? `${row.overdraft.toLocaleString()} FCFA` : '0 FCFA'}</div>
                        </td>

                        {/* 8. Debt */}
                        <td className="p-3.5 text-right font-black align-top">
                          <div className={`text-sm ${row.debt > 0 ? 'text-rose-600' : 'text-slate-400'}`}>
                            {row.debt.toLocaleString()} FCFA
                          </div>
                        </td>

                        {/* 9. Actions / Edit */}
                        <td className="p-3.5 text-center align-top">
                          <button
                            type="button"
                            onClick={() => setSelectedWeekSummary(row)}
                            className="p-1.5 bg-slate-50 hover:bg-emerald-50 text-slate-700 hover:text-emerald-800 border border-slate-200 hover:border-emerald-300 rounded-xl text-xs font-bold inline-flex items-center gap-1 transition-all cursor-pointer shadow-2xs"
                            title="View & Edit batches for this week"
                          >
                            <FileEdit size={14} />
                            <span>Edit Week</span>
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
                {weeklySummaries.length > 0 && (
                  <tfoot className="bg-slate-100/80 font-black text-slate-900 text-xs border-t-2 border-slate-300">
                    <tr>
                      <td className="p-3.5 uppercase tracking-wider">Grand Total (All Weeks)</td>
                      <td className="p-3.5 text-center font-extrabold">
                        {grandTotals.totalClients} unique
                      </td>
                      <td className="p-3.5 text-amber-950 font-black">
                        {grandTotals.totalEggs.toLocaleString()} eggs
                      </td>
                      <td className="p-3.5 text-yellow-900 font-black">
                        {grandTotals.totalScan.toLocaleString()} scanned
                      </td>
                      <td className="p-3.5 text-emerald-950 font-black">
                        {grandTotals.totalHatched.toLocaleString()} hatched
                      </td>
                      <td className="p-3.5 text-right text-emerald-700 font-black">
                        {grandTotals.totalRevenue.toLocaleString()} FCFA
                      </td>
                      <td className="p-3.5 text-right text-blue-800 font-black">
                        {grandTotals.totalOverdraft.toLocaleString()} FCFA
                      </td>
                      <td className="p-3.5 text-right text-rose-700 font-black">
                        {grandTotals.totalDebt.toLocaleString()} FCFA
                      </td>
                      <td></td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>

          {/* Real-time Hatching Percentage Circular Analytics Feature */}
          <HatchingAnalyticsSection records={data.incubator_records} />
        </div>
      )}

      {/* SUB TAB: SPREADSHEET IMPORTER */}
      {activeTabSub === 'import' && (
        <div id="import_spreadsheet_subtab" className="space-y-6">
          <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-xs space-y-6">
            <div>
              <h3 className="text-lg font-black text-slate-800 uppercase tracking-tight flex items-center gap-1.5">
                <span className="text-emerald-600">📥</span> Import Historic Incubator Data
              </h3>
              <p className="text-slate-400 text-xs font-semibold mt-1">
                Batch upload your Google Sheets or Microsoft Excel offline files.
              </p>
            </div>

            {/* Downloader Buttons */}
            <div className="p-4 bg-emerald-50/50 border border-emerald-100 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="space-y-1 text-left">
                <h4 className="text-xs font-black text-emerald-800 uppercase tracking-wide">Need the official incubator spreadsheet template?</h4>
                <p className="text-[11px] text-slate-500 font-semibold leading-relaxed">
                  Download a pre-formatted Excel (.xlsx) or CSV template with headers ready to fill on laptop or phone.
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  id="template_download_xlsx_btn"
                  onClick={() => downloadSampleTemplate('xlsx')}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs px-3.5 py-2.5 rounded-xl transition-colors cursor-pointer flex items-center gap-1.5 shadow-xs"
                >
                  <span>📊 Download Excel (.xlsx)</span>
                </button>
                <button
                  type="button"
                  id="template_download_csv_btn"
                  onClick={() => downloadSampleTemplate('csv')}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-extrabold text-xs px-3 py-2.5 rounded-xl transition-colors cursor-pointer border border-slate-200"
                >
                  <span>CSV</span>
                </button>
              </div>
            </div>

            {/* Instruction Column Info */}
            <div className="border border-slate-100 rounded-2xl bg-zinc-50/50 p-5 space-y-4 text-left">
              <div className="space-y-1">
                <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                  <span>📊 Standardized Column Format Specifications:</span>
                  <span className="bg-emerald-500 text-white font-black text-[9px] px-2 py-0.5 rounded-full uppercase pb-1">
                    Auto-Matching Headers
                  </span>
                </h4>
                <p className="text-[11px] text-slate-400 font-semibold">
                  Simplified Template: You only need to enter <strong>Day 1 (Date Brought)</strong>. All schedule dates (Candling, Transfer to Hatcher, Hatching) are calculated automatically! Location is optional.
                </p>
              </div>

              <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 text-[11px] text-slate-650 font-bold">
                <div className="flex flex-col p-2.5 bg-white rounded-xl border border-slate-100">
                  <span className="text-slate-400 text-[10px]">1. Day/Date Brought (Day 1)</span>
                  <span className="text-slate-800 font-extrabold mt-0.5">"Day/Date Brought (Day 1)"</span>
                  <p className="text-[9px] text-emerald-650 font-extrabold mt-1">E.g., 2026-06-02 (Required)</p>
                </div>
                <div className="flex flex-col p-2.5 bg-white rounded-xl border border-slate-100">
                  <span className="text-slate-400 text-[10px]">2. Client Name</span>
                  <span className="text-slate-800 font-extrabold mt-0.5">"Client Name"</span>
                  <p className="text-[9px] text-emerald-650 font-bold mt-1">E.g., John Doe</p>
                </div>
                <div className="flex flex-col p-2.5 bg-white rounded-xl border border-slate-100">
                  <span className="text-slate-400 text-[10px]">3. Client Mark</span>
                  <span className="text-slate-800 font-extrabold mt-0.5">"Client Mark"</span>
                  <p className="text-[9px] text-emerald-650 font-bold mt-1">E.g., JD (2 letters)</p>
                </div>
                <div className="flex flex-col p-2.5 bg-white rounded-xl border border-slate-100">
                  <span className="text-slate-400 text-[10px]">4. Egg Type / Species</span>
                  <span className="text-slate-800 font-extrabold mt-0.5">"Egg Type / Species"</span>
                  <p className="text-[9px] text-indigo-650 font-bold mt-0.5">Brahma, Turkey, Quail, Goose</p>
                </div>
                <div className="flex flex-col p-2.5 bg-white rounded-xl border border-slate-100">
                  <span className="text-slate-400 text-[10px]">5. Number of Eggs</span>
                  <span className="text-slate-800 font-extrabold mt-0.5">"Number of Eggs"</span>
                  <p className="text-[9px] text-zinc-400 font-semibold mt-1">E.g., 100</p>
                </div>
                <div className="flex flex-col p-2.5 bg-white rounded-xl border border-slate-100">
                  <span className="text-slate-400 text-[10px]">6. Tariff / Special Case</span>
                  <span className="text-slate-800 font-extrabold mt-0.5">"Tariff / Special Case"</span>
                  <p className="text-[9px] text-indigo-650 font-bold mt-0.5">Standard, Discount, Free, etc.</p>
                </div>
              </div>
              <div className="p-3 bg-emerald-50 border border-emerald-200/80 rounded-xl text-[11px] text-emerald-900 font-medium space-y-1">
                <p className="font-black flex items-center gap-1.5 text-emerald-950">
                  <span>✨ Automatic Schedule Calculation</span>
                </p>
                <p className="text-[10px] text-emerald-800 leading-relaxed">
                  You do not need to enter Candling Date, Transfer Date, or Hatching Date in the template. When imported, the app automatically calculates:
                  <br />• <strong>Candling Date:</strong> Day 8 (or Day 10 for Turkeys/Geese, skipped for Quails)
                  <br />• <strong>Transfer Date:</strong> Day 18 (or Day 25/26 for Turkeys/Geese, Day 15 for Quails)
                  <br />• <strong>Hatching Date:</strong> Day 21 (or Day 28/30 for Turkeys/Geese, Day 18 for Quails)
                </p>
              </div>
            </div>

            {/* Custom File Upload Input */}
            <div className="space-y-2 text-left">
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider ml-1">
                Upload Spreadsheet File (.xlsx, .xls, .csv)
              </label>

              <div className="relative border-2 border-dashed border-slate-200 rounded-3xl p-8 hover:border-emerald-500 flex flex-col items-center justify-center text-center transition-colors bg-slate-50/50">
                <input
                  type="file"
                  id="csv_import_file_input"
                  accept=".xlsx,.xls,.csv,.tsv"
                  onChange={handleCSVFileChange}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                />
                
                <span className="text-3xl">📊</span>
                <span className="text-sm font-extrabold text-slate-700 mt-2 block">
                  {csvFile ? csvFile.name : "Select or drag Excel (.xlsx / .xls) or CSV file here"}
                </span>
                <p className="text-[11px] text-slate-400 font-bold uppercase mt-1">
                  {csvFile ? `Size: ${(csvFile.size / 1024).toFixed(1)} KB` : "Supports Excel (.xlsx, .xls), CSV, & Google Sheets files"}
                </p>
              </div>
            </div>

            {/* Status alerts */}
            {importNotice && (
              <div className="p-4 bg-emerald-50 border border-emerald-100 text-emerald-800 rounded-2xl text-xs font-bold text-left leading-relaxed">
                🎉 {importNotice}
              </div>
            )}

            {/* Raw parsed items preview panel */}
            {parsedRows.length > 0 && (
              <div className="space-y-3.5 pt-2 text-left">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-extrabold text-slate-600 uppercase tracking-wider">
                    Rows Verification Preview ({parsedRows.length} items parsed)
                  </h4>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-slate-400 font-bold italic">Checking client markings</span>
                    <button
                      type="button"
                      onClick={() => setFullscreenTable({
                        title: "EXCEL BULK PASTE VERIFICATION PREVIEW",
                        subtitle: "Preview of parsed spreadsheet rows before committing batch records to database",
                        badge: `${parsedRows.length} Parsed Rows`,
                        icon: <FileText size={20} />,
                        content: (
                          <div className="overflow-x-auto rounded-2xl border border-slate-100 bg-white">
                            <table className="w-full text-left border-collapse">
                              <thead className="bg-slate-50 text-[10px] uppercase font-bold text-slate-450 tracking-wider">
                                <tr>
                                  <th className="p-2.5">Row</th>
                                  <th className="p-2.5">Client [Mark]</th>
                                  <th className="p-2.5">Date</th>
                                  <th className="p-2.5 text-right">Eggs</th>
                                  <th className="p-2.5 text-center">Case</th>
                                  <th className="p-2.5 text-right">Paid</th>
                                  <th className="p-2.5 text-center">Verification</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100 text-[12px] text-slate-750 font-semibold">
                                {parsedRows.map((row, index) => {
                                  const existingClient = data.clients.find(c => c.mark === row.clientMark);
                                  return (
                                    <tr key={index} className="hover:bg-slate-50/50">
                                      <td className="p-2 text-slate-400 font-mono">#{row.rowNumber}</td>
                                      <td className="p-2 font-bold">
                                        {row.clientName} <span className="text-slate-500 font-black">[{row.clientMark}]</span>
                                      </td>
                                      <td className="p-2 font-mono text-slate-500">{formatDateDDMMYYYY(row.dateBrought)}</td>
                                      <td className="p-2 text-right font-extrabold text-slate-900">{row.numberOfEggs}</td>
                                      <td className="p-2 text-center">
                                        <span className="px-2 py-0.5 bg-slate-100 rounded text-[10px] font-extrabold text-slate-700 uppercase">
                                          {row.specialCase}
                                        </span>
                                      </td>
                                      <td className="p-2 text-right font-mono text-emerald-700 font-bold">{row.amountPaid.toLocaleString()} FCFA</td>
                                      <td className="p-2 text-center">
                                        {existingClient ? (
                                          <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded font-bold text-[10px]">
                                            ✓ Matched Mark
                                          </span>
                                        ) : (
                                          <span className="px-2 py-0.5 bg-amber-100 text-amber-800 rounded font-bold text-[10px]">
                                            New Client Profile
                                          </span>
                                        )}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        )
                      })}
                      className="p-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold flex items-center gap-1 transition-colors cursor-pointer border border-slate-200"
                      title="View Fullscreen"
                    >
                      <Maximize2 size={14} />
                      <span className="hidden sm:inline">Fullscreen</span>
                    </button>
                  </div>
                </div>

                <div className="overflow-x-auto rounded-2xl border border-slate-100 max-h-72">
                  <table className="w-full text-left border-collapse">
                    <thead className="bg-slate-50 text-[10px] uppercase font-bold text-slate-450 tracking-wider">
                      <tr>
                        <th className="p-2.5">Row</th>
                        <th className="p-2.5">Client [Mark]</th>
                        <th className="p-2.5">Date</th>
                        <th className="p-2.5 text-right">Eggs</th>
                        <th className="p-2.5 text-center">Case</th>
                        <th className="p-2.5 text-right">Paid</th>
                        <th className="p-2.5 text-center">Verification</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-[12px] text-slate-750 font-semibold">
                      {parsedRows.map((row, index) => {
                        const existingClient = data.clients.find(c => c.mark === row.clientMark);
                        return (
                          <tr key={index} className="hover:bg-slate-50/50">
                            <td className="p-2 text-slate-400 font-mono">#{row.rowNumber}</td>
                            <td className="p-2 font-bold">
                              {row.clientName} <span className="text-slate-500 font-black">[{row.clientMark}]</span>
                            </td>
                            <td className="p-2 font-mono text-slate-500">{formatDateDDMMYYYY(row.dateBrought)}</td>
                            <td className="p-2 text-right font-extrabold">{row.eggsCollected}</td>
                            <td className="p-2 text-center text-[10px] font-black">{row.specialCase}</td>
                            <td className="p-2 text-right font-mono text-xs text-emerald-800">{row.amountPaid.toLocaleString()} FCFA</td>
                            <td className="p-2 text-center">
                              {existingClient ? (
                                <span className="inline-block bg-emerald-50 text-emerald-700 border border-emerald-100 text-[10px] font-bold uppercase px-2 py-0.5 rounded">
                                  ✅ Link to {existingClient.name}
                                </span>
                              ) : (
                                <span className="inline-block bg-amber-50 text-amber-800 border border-amber-100 text-[10px] font-bold uppercase px-2 py-0.5 rounded">
                                  🆕 Will Register Client
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Final Submit Trigger and Cancel buttons */}
                <div className="flex flex-col sm:flex-row items-center gap-3 pt-2">
                  <button
                    type="button"
                    id="cancel_import_btn"
                    onClick={() => {
                      setParsedRows([]);
                      setCsvFile(null);
                      setImportNotice('');
                      setErrorMsg('');
                      const input = document.getElementById('csv_import_file_input') as HTMLInputElement;
                      if (input) input.value = '';
                    }}
                    className="w-full sm:w-1/3 h-14 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 font-extrabold text-sm uppercase rounded-2xl transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-[0.98]"
                  >
                    <span>❌ CANCEL IMPORT</span>
                  </button>

                  <button
                    type="button"
                    id="execute_import_submit_btn"
                    onClick={handleImportSubmit}
                    disabled={loading}
                    className="w-full sm:w-2/3 h-14 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-black text-base uppercase rounded-2xl shadow-lg transition-all flex items-center justify-center gap-2 active:scale-[0.98] cursor-pointer disabled:opacity-50"
                  >
                    {loading ? (
                      <span>IMPORTING...</span>
                    ) : (
                      <span>⚡ START SPREADSHEET IMPORT OF {parsedRows.length} RECORDS</span>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* CLIENT DETAILS EDIT MODAL */}
      {editingClient && (
        <div id="client_edit_modal_backdrop" className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div id="client_edit_modal" className="bg-white rounded-3xl w-full max-w-lg shadow-2xl border border-blue-100 overflow-hidden my-auto max-h-[92vh] flex flex-col text-slate-800 animate-in fade-in-50 zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="bg-gradient-to-br from-blue-700 to-indigo-900 p-5 text-white relative shrink-0">
              <button
                type="button"
                onClick={() => setEditingClient(null)}
                className="absolute top-4 right-4 p-2 bg-white/10 hover:bg-white/20 rounded-full text-white cursor-pointer transition-colors"
                id="close_edit_client_btn"
              >
                <X size={18} />
              </button>
              <span className="bg-yellow-400 text-slate-900 font-extrabold text-[10px] tracking-wider uppercase px-2.5 py-0.5 rounded-full">
                Edit Client Reference
              </span>
              <h3 className="text-xl font-black mt-2 leading-none">{editingClient.name}</h3>
              <p className="text-blue-100 text-xs mt-1.5 font-medium">
                Unique Mark: <strong className="text-white text-sm">[{editingClient.mark}]</strong>
              </p>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleEditClient} className="p-6 space-y-4 overflow-y-auto max-h-[calc(92vh-120px)] flex-1">
              {clientEditError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-2xl text-rose-700 text-xs font-bold flex items-center gap-2.5 shadow-2xs">
                  <AlertCircle size={18} className="shrink-0 text-rose-600" />
                  <span>{clientEditError}</span>
                </div>
              )}

              {clientEditSuccess && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-2xl text-emerald-700 text-xs font-bold flex items-center gap-2.5 shadow-2xs">
                  <CheckCircle2 size={18} className="shrink-0 text-emerald-600" />
                  <span>{clientEditSuccess}</span>
                </div>
              )}

              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 ml-1 select-none">Client Full Name</label>
                  <input
                    type="text"
                    value={editClientName || ''}
                    onChange={(e) => {
                      setEditClientName(e.target.value);
                      setClientEditError('');
                    }}
                    className={largeInputClass}
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-emerald-700 uppercase tracking-wider mb-1 ml-1 select-none">Client Mark</label>
                  <input
                    type="text"
                    value={editClientMark || ''}
                    onChange={(e) => {
                      setEditClientMark(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10));
                      setClientEditError('');
                    }}
                    className={`${largeInputClass} font-mono font-black text-emerald-800 uppercase text-center tracking-widest`}
                    required
                    placeholder="MARK"
                  />
                </div>
              </div>

              {/* Suggested Unused Marks Badges */}
              {(() => {
                const currentMark = (editClientMark || '').trim().toUpperCase();
                const usedMarksSet = new Set(
                  (data.clients || [])
                    .filter((c: any) => c.id !== editingClient.id)
                    .map((c: any) => (c.mark || '').trim().toUpperCase())
                    .filter(Boolean)
                );
                const isConflict = currentMark !== '' && usedMarksSet.has(currentMark);
                const dupeClientObj = isConflict
                  ? data.clients?.find((c: any) => (c.mark || '').trim().toUpperCase() === currentMark && c.id !== editingClient.id)
                  : null;

                const suggestedUnused = getSuggestedUnusedMarks(
                  editClientName || editingClient.name || '',
                  currentMark,
                  data.clients || [],
                  8
                );

                return (
                  <div className="space-y-2 bg-slate-50 p-3.5 rounded-2xl border border-slate-200/80">
                    <div className="flex flex-wrap items-center justify-between gap-1 text-[11px] font-bold">
                      <span className="flex items-center gap-1.5 text-slate-700">
                        <Sparkles size={13} className="text-amber-500 shrink-0 animate-pulse" />
                        <span>Available Unused Marks (Click to pick):</span>
                      </span>
                      {isConflict && (
                        <span className="text-rose-600 font-extrabold flex items-center gap-1 bg-rose-50 px-2 py-0.5 rounded-md border border-rose-200">
                          <AlertCircle size={12} className="shrink-0" />
                          Mark [{currentMark}] is taken by {dupeClientObj?.name || 'another client'}
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-1.5 pt-0.5">
                      {suggestedUnused.map((m) => (
                        <button
                          key={m}
                          type="button"
                          onClick={() => {
                            setEditClientMark(m);
                            setClientEditError('');
                          }}
                          className={`px-2.5 py-1 rounded-xl text-xs font-black tracking-wider uppercase transition-all cursor-pointer border ${
                            currentMark === m
                              ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                              : 'bg-white hover:bg-emerald-100/70 text-emerald-800 border-emerald-200 hover:border-emerald-400 shadow-2xs'
                          }`}
                          title={`Click to select mark ${m}`}
                        >
                          +{m}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })()}

              <p className="text-[10px] text-emerald-700 font-semibold leading-relaxed">
                * Note: Editing the client mark will immediately update this mark across all existing incubator records and database entries for this client.
              </p>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 ml-1 select-none">Phone Number</label>
                  <input
                    type="tel"
                    value={editClientPhone || ''}
                    onChange={(e) => setEditClientPhone(e.target.value)}
                    className={largeInputClass}
                    placeholder="Optional phone"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 ml-1 select-none">Location / Village</label>
                  <input
                    type="text"
                    value={editClientLoc || ''}
                    onChange={(e) => setEditClientLoc(e.target.value)}
                    className={largeInputClass}
                    placeholder="Optional location"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-blue-600 uppercase tracking-wider mb-1 ml-1 select-none">Overdraft Balance / Credit (FCFA)</label>
                <div className="relative">
                  <input
                    type="number"
                    min="0"
                    placeholder="0"
                    value={editClientOverdraft ?? ''}
                    onChange={(e) => setEditClientOverdraft(e.target.value)}
                    className="w-full h-12 pr-14 pl-4 rounded-xl border border-blue-200 focus:ring-2 focus:ring-blue-500 font-extrabold text-slate-900 text-sm bg-white"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">FCFA</span>
                </div>
                <p className="text-[10px] text-slate-400 mt-1 font-semibold leading-relaxed">
                  * Override or directly credit this family client's account with cash surplus. This credit balance is eligible for automated deduction when creating incubator entry batches.
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-indigo-700 uppercase tracking-wider mb-1 ml-1 select-none">Client Special Case Pricing</label>
                <select
                  value={editClientSpecialCase || 'Standard'}
                  onChange={(e) => setEditClientSpecialCase(e.target.value as SpecialCase)}
                  className="w-full h-12 px-4 rounded-xl border border-indigo-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-extrabold text-slate-800 text-xs bg-white cursor-pointer"
                >
                  <option value="Standard">Standard Species Rate (Quail 100 FCFA, Turkey/Duck/Goose 500 FCFA, Brahma/Others 200 FCFA)</option>
                  <option value="150 Per Egg Brought">150 FCFA Per Egg Brought</option>
                  <option value="Per Chick">Per Chick Hatched (Standard Rate)</option>
                  <option value="Per Egg After Scan">Per Egg After Scan (Standard Rate)</option>
                  <option value="Free">Free (0 FCFA)</option>
                  <option value="Custom">Custom Rate</option>
                </select>
                <p className="text-[10px] text-slate-400 mt-1 font-semibold leading-relaxed">
                  * Changing special case pricing will prompt if the rule applies to current batch from today or retroactively for all time.
                </p>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100 sticky bottom-0 bg-white z-10">
                <button
                  type="button"
                  onClick={() => setEditingClient(null)}
                  className="px-4 h-11 border border-slate-200 rounded-xl text-xs font-bold text-slate-650 hover:bg-slate-50 cursor-pointer transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-6 h-11 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-xl text-xs font-black uppercase tracking-wider shadow-md hover:shadow-lg cursor-pointer transition-all disabled:opacity-50 flex items-center gap-2"
                >
                  {loading ? (
                    <span>Saving...</span>
                  ) : (
                    <span>💾 Save Changes</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* SPECIAL CASE RECALCULATION SCOPE PROMPT MODAL */}
      {specialCasePromptData && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-indigo-100 space-y-5 animate-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shrink-0">
                <HelpCircle size={26} />
              </div>
              <div>
                <span className="text-[10px] font-extrabold uppercase tracking-widest text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-md">
                  Pricing Rule Change
                </span>
                <h3 className="text-lg font-black text-slate-900 leading-tight mt-0.5">
                  Apply Special Case Scope?
                </h3>
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed bg-slate-50 p-3.5 rounded-2xl border border-slate-100 font-medium">
              You are updating client <strong className="text-slate-900">{specialCasePromptData.name} ({specialCasePromptData.client.mark})</strong> to special case: <strong className="text-indigo-700 font-bold">"{specialCasePromptData.newSpecialCase}"</strong>.
            </p>

            <div className="space-y-3">
              <p className="text-xs font-bold text-slate-700">When should this special case apply from?</p>

              <button
                type="button"
                onClick={() => handleConfirmSpecialCaseScope('from_today')}
                disabled={loading}
                className="w-full text-left p-4 rounded-2xl border-2 border-emerald-500/80 bg-emerald-50/40 hover:bg-emerald-50 text-emerald-950 transition-all cursor-pointer group"
              >
                <div className="flex items-center justify-between">
                  <span className="font-extrabold text-sm text-emerald-900">📅 Current batch from today</span>
                  <span className="text-[10px] font-black bg-emerald-600 text-white px-2 py-0.5 rounded-full uppercase">Recommended</span>
                </div>
                <p className="text-xs text-emerald-700/90 mt-1 font-medium leading-normal">
                  Applies only to batches starting today. Previous batches keep their historical standard pricing and paid amounts without generating fake overdues.
                </p>
              </button>

              <button
                type="button"
                onClick={() => handleConfirmSpecialCaseScope('all_time')}
                disabled={loading}
                className="w-full text-left p-4 rounded-2xl border-2 border-amber-400/80 bg-amber-50/40 hover:bg-amber-50 text-amber-950 transition-all cursor-pointer group"
              >
                <div className="flex items-center justify-between">
                  <span className="font-extrabold text-sm text-amber-900">⏳ All time (Retroactive)</span>
                </div>
                <p className="text-xs text-amber-800/90 mt-1 font-medium leading-normal">
                  Recalculates all historical incubator batches for this client using the new rate, updating amounts due and ledger balances across history.
                </p>
              </button>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={() => setSpecialCasePromptData(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-colors cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DETAILED BOTTOM SHEET / DIALOG POPUP MODAL FOR RECORD UPDATE */}
      {localEditRecord && (
        <div id="details_edit_modal_backdrop" className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div id="details_edit_modal" className="bg-white rounded-3xl w-full max-w-lg shadow-2xl border border-emerald-100 overflow-hidden animate-in fade-in-50 zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="bg-gradient-to-br from-emerald-700 to-teal-850 p-6 text-white relative">
              <button
                type="button"
                onClick={handleCloseEditModal}
                className="absolute top-5 right-5 p-2 bg-white/10 hover:bg-white/20 rounded-full text-white cursor-pointer transition-colors"
              >
                <X size={18} />
              </button>
              <span className="bg-yellow-400 text-slate-900 font-extrabold text-[10px] tracking-wider uppercase px-2.5 py-0.5 rounded-full">
                Incubator Record Manager
              </span>
              <h3 className="text-xl font-black mt-2 leading-none">{localEditRecord.clientName}</h3>
              <p className="text-emerald-100 text-xs mt-1.5 font-medium">Unique Mark: <strong className="text-white text-sm">{localEditRecord.clientMark}</strong> • Placed {localEditRecord.eggsCollected} eggs on {formatDateDDMMYYYY(localEditRecord.dateBrought)}</p>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSaveModalEdits} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
              
              {/* Date Brought & Species */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-extrabold text-slate-500 uppercase tracking-widest block mb-1">
                    Date Brought
                  </label>
                  <input
                    type="date"
                    value={editDateBrought || ''}
                    onChange={(e) => setEditDateBrought(e.target.value)}
                    className={largeInputClass}
                    required
                  />
                </div>
                <div>
                  <label className="text-xs font-extrabold text-slate-500 uppercase tracking-widest block mb-1">
                    Egg Type / Species
                  </label>
                  <select
                    value={editEggType || 'Brahma'}
                    onChange={(e) => setEditEggType(e.target.value as any)}
                    className={largeInputClass}
                  >
                    <option value="Brahma">Chicken (Brahma) [21 Days]</option>
                    <option value="Turkey">Turkey [28 Days]</option>
                    <option value="Goose">Goose [30 Days]</option>
                    <option value="Quail">Quail [18 Days]</option>
                  </select>
                </div>
              </div>

              {/* Eggs Count & Pricing Case */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-extrabold text-slate-500 uppercase tracking-widest block mb-1">
                    Eggs Placed / Collected
                  </label>
                  <input
                    type="number"
                    min="1"
                    placeholder="Quantity"
                    value={editEggsCollected || ''}
                    onChange={(e) => setEditEggsCollected(e.target.value)}
                    className={largeInputClass}
                    required
                  />
                </div>
                <div>
                  <label className="text-xs font-extrabold text-slate-500 uppercase tracking-widest block mb-1">
                    Pricing Rate / Case
                  </label>
                  <select
                    value={editSpecialCase || 'Standard'}
                    onChange={(e) => setEditSpecialCase(e.target.value as SpecialCase)}
                    className={largeInputClass}
                  >
                    <option value="Standard">Standard ({getStandardRateBySpecies(localEditRecord.eggType)} FCFA / egg brought)</option>
                    <option value="150 Per Egg Brought">150 FCFA Per Egg Brought</option>
                    <option value="Per Chick">Per Chick Hatched ({getStandardRateBySpecies(localEditRecord.eggType)} FCFA / chick)</option>
                    <option value="Per Egg After Scan">Per Egg After Scan ({getStandardRateBySpecies(localEditRecord.eggType)} FCFA / scanned egg)</option>
                    <option value="Free">Free (0 FCFA)</option>
                    <option value="Custom">Custom Rate</option>
                  </select>
                </div>
              </div>

              {editSpecialCase === 'Custom' && (
                <div>
                  <label className="text-xs font-extrabold text-slate-500 uppercase tracking-widest block mb-1">
                    Custom Rate Per Egg (FCFA)
                  </label>
                  <input
                    type="number"
                    min="0"
                    placeholder="Rate per egg in FCFA"
                    value={editCustomRate || ''}
                    onChange={(e) => setEditCustomRate(e.target.value)}
                    className={largeInputClass}
                  />
                </div>
              )}

              {/* Day 8 Scan Entry */}
              <div>
                <div className="flex justify-between items-center mb-1.5">
                  <label className="text-xs font-extrabold text-slate-500 uppercase tracking-widest block">
                    Fertile Eggs (After Candling Scan)
                  </label>
                  <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded">
                    Day 8 Expected: {formatDateDDMMYYYY(localEditRecord.day8Date)}
                  </span>
                </div>
                <input
                  type="number"
                  placeholder="Count of fertile eggs remaining after scan"
                  value={editEggsAfterScan || ''}
                  max={editEggsCollected || localEditRecord.eggsCollected}
                  min="0"
                  onChange={(e) => setEditEggsAfterScan(e.target.value)}
                  className={largeInputClass}
                />
                <span className="text-[10px] text-slate-400 block mt-1">
                  Leave blank if candling scan hasn't been performed yet.
                </span>
              </div>

              {/* Day 21 Hatch Entry */}
              <div>
                <div className="flex justify-between items-center mb-1.5">
                  <label className="text-xs font-extrabold text-slate-500 uppercase tracking-widest block">
                    Chicks Hatched
                  </label>
                  <span className="text-[10px] font-bold text-rose-500 bg-rose-50 px-2 py-0.5 rounded">
                    Hatch Expected: {formatDateDDMMYYYY(localEditRecord.day21Date)}
                  </span>
                </div>
                <input
                  type="number"
                  placeholder="Actual count of live hatched chicks"
                  value={editChicksHatched || ''}
                  max={editEggsAfterScan || editEggsCollected || localEditRecord.eggsCollected}
                  min="0"
                  onChange={(e) => setEditChicksHatched(e.target.value)}
                  className={largeInputClass}
                />
              </div>

              {/* Amount Paid update */}
              <div>
                <div className="flex justify-between items-center mb-1.5">
                  <label className="text-xs font-extrabold text-slate-500 uppercase tracking-widest block">
                    Cumulative Paid (FCFA)
                  </label>
                  <span className="text-xs font-black text-emerald-800">
                    Calculated Due: {computeAmountDue({
                      specialCase: editSpecialCase,
                      eggType: localEditRecord.eggType,
                      eggsCollected: Number(editEggsCollected) || 0,
                      customRate: Number(editCustomRate) || undefined,
                      ratePerEgg: Number(localEditRecord.ratePerEgg) || undefined,
                      eggsAfterScan: editEggsAfterScan === '' ? null : Number(editEggsAfterScan),
                      chicksHatched: editChicksHatched === '' ? null : Number(editChicksHatched)
                    }).amountDue.toLocaleString()} FCFA
                  </span>
                </div>
                <input
                  type="number"
                  placeholder="FCFA amount client cleared"
                  value={editAmountPaid || ''}
                  min="0"
                  onChange={(e) => setEditAmountPaid(e.target.value)}
                  className={largeInputClass}
                />
                <div className="mt-1 px-1 flex justify-between text-[11px] font-bold">
                  <span className="text-slate-400">Paid so far: {Number(editAmountPaid || 0).toLocaleString()} FCFA</span>
                  <span className="text-rose-600">
                    Owed: {Math.max(0, computeAmountDue({
                      specialCase: editSpecialCase,
                      eggType: localEditRecord.eggType,
                      eggsCollected: Number(editEggsCollected) || 0,
                      customRate: Number(editCustomRate) || undefined,
                      ratePerEgg: Number(localEditRecord.ratePerEgg) || undefined,
                      eggsAfterScan: editEggsAfterScan === '' ? null : Number(editEggsAfterScan),
                      chicksHatched: editChicksHatched === '' ? null : Number(editChicksHatched)
                    }).amountDue - Number(editAmountPaid || 0) - (localEditRecord.overdraftUsed || 0)).toLocaleString()} FCFA
                  </span>
                </div>
                {localEditRecord.overdraftUsed ? (
                  <div className="mt-1.5 px-2.5 py-1.5 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-900 font-extrabold flex justify-between">
                    <span>💳 Overdraft Used on Batch:</span>
                    <span>+{localEditRecord.overdraftUsed.toLocaleString()} FCFA</span>
                  </div>
                ) : null}
                {localEditRecord.overdraftGenerated ? (
                  <div className="mt-1.5 px-2.5 py-1.5 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 font-extrabold flex justify-between">
                    <span>🎉 Overpayment Credit Created:</span>
                    <span>+{localEditRecord.overdraftGenerated.toLocaleString()} FCFA</span>
                  </div>
                ) : null}
              </div>

              {/* Notes */}
              <div>
                <label className="block text-xs font-extrabold text-slate-500 uppercase tracking-widest mb-1.5">
                  Internal Operations Notes
                </label>
                <textarea
                  value={editNotes || ''}
                  onChange={(e) => setEditNotes(e.target.value)}
                  rows={2}
                  className="w-full p-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-medium text-slate-800 text-sm"
                  placeholder="Specific shell cracks or pickup delay remarks..."
                />
              </div>

              {/* Actions Footer */}
              <div className="flex gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => handleDeleteRecord(localEditRecord.id)}
                  className="px-4 bg-red-50 border border-red-100 hover:bg-red-100 text-rose-700 font-bold rounded-xl text-xs flex items-center gap-1 scroll-ms-1 select-none cursor-pointer"
                  title="Remove eggs entry"
                >
                  <Trash2 size={16} />
                  <span>Delete Batch</span>
                </button>

                <button
                  type="button"
                  onClick={handleCloseEditModal}
                  className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-center cursor-pointer"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 py-3 bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-black rounded-xl text-center shadow-md cursor-pointer"
                >
                  {loading ? 'Saving...' : 'Save Updates'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CLIENT COMPILED STATEMENT MODAL */}
      {selectedLedgerClient && (
        <ClientLedger
          client={selectedLedgerClient}
          incubatorRecords={data.incubator_records || []}
          token={token}
          onClose={() => setSelectedLedgerClient(null)}
          onRefresh={triggerRefresh}
          onSelectEditRecord={(r) => setSelectedEditRecord(r)}
        />
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

      {/* SINGLE RECORD DELETE CONFIRMATION MODAL */}
      {recordToDelete && (
        <div id="delete_record_modal_backdrop" className="fixed inset-0 z-[99999] bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div id="delete_record_modal" className="bg-white rounded-3xl w-full max-w-md shadow-2xl border border-rose-100 overflow-hidden animate-in fade-in-50 zoom-in-95 duration-200 text-slate-800">
            <div className="bg-gradient-to-br from-rose-600 to-red-800 p-6 text-white relative">
              <button
                type="button"
                onClick={() => setRecordToDelete(null)}
                className="absolute top-5 right-5 p-2 bg-white/10 hover:bg-white/20 rounded-full text-white cursor-pointer transition-colors"
              >
                <X size={18} />
              </button>
              <div className="w-10 h-10 rounded-2xl bg-white/20 flex items-center justify-center text-white mb-3">
                <Trash2 size={22} />
              </div>
              <h3 className="text-xl font-black leading-tight">Delete Incubator Batch?</h3>
              <p className="text-rose-100 text-xs mt-1 font-medium">
                This will permanently remove the batch and adjust financial ledger records.
              </p>
            </div>

            <div className="p-6 space-y-4">
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-1.5 text-xs text-slate-700 font-medium">
                <p><strong>Client:</strong> {recordToDelete.clientName} <span className="text-slate-500 font-black">[{recordToDelete.clientMark}]</span></p>
                <p><strong>Date Placed:</strong> {formatDateDDMMYYYY(recordToDelete.dateBrought)}</p>
                <p><strong>Eggs Collected:</strong> <strong className="text-slate-900">{recordToDelete.eggsCollected}</strong> ({recordToDelete.eggType || 'Chicken'})</p>
                {recordToDelete.amountPaid > 0 && (
                  <p className="text-emerald-700 font-bold"><strong>Amount Paid:</strong> {recordToDelete.amountPaid.toLocaleString()} FCFA</p>
                )}
              </div>

              <p className="text-xs text-rose-600 font-bold bg-rose-50 p-3 rounded-xl border border-rose-100 leading-relaxed">
                ⚠️ Warning: All associated candling scan data and chick hatch logs for this batch will be permanently removed.
              </p>

              <div className="flex justify-end gap-3 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setRecordToDelete(null)}
                  disabled={loading}
                  className="px-4 h-11 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => confirmDeleteSingleRecord(recordToDelete.id)}
                  disabled={loading}
                  className="px-6 h-11 bg-rose-600 hover:bg-rose-700 text-white font-black text-xs uppercase tracking-wider rounded-xl shadow cursor-pointer transition-colors"
                >
                  {loading ? 'Deleting...' : 'Yes, Delete Batch'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* BULK DELETE CONFIRMATION MODAL */}
      {showBulkDeleteConfirm && (
        <div id="bulk_delete_modal_backdrop" className="fixed inset-0 z-[99999] bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div id="bulk_delete_modal" className="bg-white rounded-3xl w-full max-w-md shadow-2xl border border-rose-100 overflow-hidden animate-in fade-in-50 zoom-in-95 duration-200 text-slate-800">
            <div className="bg-gradient-to-br from-rose-600 to-red-800 p-6 text-white relative">
              <button
                type="button"
                onClick={() => setShowBulkDeleteConfirm(false)}
                className="absolute top-5 right-5 p-2 bg-white/10 hover:bg-white/20 rounded-full text-white cursor-pointer transition-colors"
              >
                <X size={18} />
              </button>
              <div className="w-10 h-10 rounded-2xl bg-white/20 flex items-center justify-center text-white mb-3">
                <Trash2 size={22} />
              </div>
              <h3 className="text-xl font-black leading-tight">Delete {selectedRecordIds.length} Selected Batches?</h3>
              <p className="text-rose-100 text-xs mt-1 font-medium">
                Bulk deletion is permanent and cannot be undone.
              </p>
            </div>

            <div className="p-6 space-y-4">
              <p className="text-xs text-slate-700 font-medium leading-relaxed">
                You are about to permanently delete <strong className="text-rose-700 font-black">{selectedRecordIds.length} selected incubator batches</strong> along with all their candling scans and hatch history records.
              </p>

              <div className="flex justify-end gap-3 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowBulkDeleteConfirm(false)}
                  disabled={bulkEditLoading}
                  className="px-4 h-11 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={confirmBulkDeleteRecords}
                  disabled={bulkEditLoading}
                  className="px-6 h-11 bg-rose-600 hover:bg-rose-700 text-white font-black text-xs uppercase tracking-wider rounded-xl shadow cursor-pointer transition-colors"
                >
                  {bulkEditLoading ? 'Deleting...' : `Yes, Delete ${selectedRecordIds.length} Batches`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* BULK PAID CONFIRMATION MODAL */}
      {showBulkPaidConfirm && (
        <div id="bulk_paid_modal_backdrop" className="fixed inset-0 z-[99999] bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div id="bulk_paid_modal" className="bg-white rounded-3xl w-full max-w-md shadow-2xl border border-teal-100 overflow-hidden animate-in fade-in-50 zoom-in-95 duration-200 text-slate-800">
            <div className="bg-gradient-to-br from-teal-600 to-emerald-800 p-6 text-white relative">
              <button
                type="button"
                onClick={() => setShowBulkPaidConfirm(false)}
                className="absolute top-5 right-5 p-2 bg-white/10 hover:bg-white/20 rounded-full text-white cursor-pointer transition-colors"
              >
                <X size={18} />
              </button>
              <h3 className="text-xl font-black leading-tight">Mark {selectedRecordIds.length} Batches as Fully Paid?</h3>
            </div>

            <div className="p-6 space-y-4">
              <p className="text-xs text-slate-700 font-medium leading-relaxed">
                This will clear all outstanding debt balances and update the status to fully paid for <strong className="text-emerald-700 font-black">{selectedRecordIds.length} selected batches</strong>.
              </p>

              <div className="flex justify-end gap-3 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowBulkPaidConfirm(false)}
                  disabled={bulkEditLoading}
                  className="px-4 h-11 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowBulkPaidConfirm(false);
                    handleBulkUpdateRecords({ markPaid: true });
                  }}
                  disabled={bulkEditLoading}
                  className="px-6 h-11 bg-teal-600 hover:bg-teal-700 text-white font-black text-xs uppercase tracking-wider rounded-xl shadow cursor-pointer transition-colors"
                >
                  {bulkEditLoading ? 'Updating...' : 'Yes, Mark Paid'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

interface ClientLedgerProps {
  client: Client;
  incubatorRecords: IncubatorRecord[];
  token: string;
  onClose: () => void;
  onRefresh: () => void;
  onSelectEditRecord?: (record: IncubatorRecord) => void;
}

export function ClientLedger({
  client,
  incubatorRecords,
  token,
  onClose,
  onRefresh,
  onSelectEditRecord
}: ClientLedgerProps) {
  const [localClient, setLocalClient] = useState<Client>(client);
  const [ledgerTimeFilter, setLedgerTimeFilter] = useState<'all' | '1w' | '2w' | 'custom'>('all');
  const [ledgerCustomWeeks, setLedgerCustomWeeks] = useState('3');
  const [ledgerPaymentAmount, setLedgerPaymentAmount] = useState('');
  const [ledgerEditMode, setLedgerEditMode] = useState(false);
  const [ledgerEditPaid, setLedgerEditPaid] = useState('');
  const [loading, setLoading] = useState(false);
  const [localError, setLocalError] = useState('');
  const [localSuccess, setLocalSuccess] = useState('');

  const [fullscreenTable, setFullscreenTable] = useState<{
    title: string;
    subtitle?: string;
    badge?: string;
    icon?: React.ReactNode;
    content: React.ReactNode;
  } | null>(null);
  const [fullscreenZoom, setFullscreenZoom] = useState<number>(100);
  const touchStartDistRef = useRef<number | null>(null);
  const touchStartZoomRef = useRef<number>(100);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      touchStartDistRef.current = dist;
      touchStartZoomRef.current = fullscreenZoom;
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && touchStartDistRef.current !== null) {
      const currentDist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      const scale = currentDist / touchStartDistRef.current;
      const newZoom = Math.min(200, Math.max(35, Math.round(touchStartZoomRef.current * scale)));
      setFullscreenZoom(newZoom);
    }
  };

  const handleTouchEnd = () => {
    touchStartDistRef.current = null;
  };

  useEffect(() => {
    if (fullscreenTable) {
      setFullscreenZoom(85);
    }
  }, [fullscreenTable]);

  // Sync client updates
  useEffect(() => {
    setLocalClient(client);
  }, [client]);

  const handleClientLedgerPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!localClient || !ledgerPaymentAmount) return;
    setLoading(true);
    setLocalError('');
    setLocalSuccess('');
    try {
      const res = await fetch(`/api/clients/${localClient.id}/pay-debt`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': token
        },
        body: JSON.stringify({ paymentAmount: Number(ledgerPaymentAmount) })
      });
      const resData = await res.json();
      if (!res.ok) {
        throw new Error(resData.error || 'Failed to apply ledger payment.');
      }
      setLocalSuccess(`Successfully processed payment of ${Number(ledgerPaymentAmount).toLocaleString()} FCFA for ${localClient.name}. Unpaid batches updated starting from the oldest.`);
      setLedgerPaymentAmount('');
      
      if (resData.client) {
        setLocalClient(resData.client);
      } else {
        setLocalClient((prev: any) => prev ? { ...prev, overdraft: (prev.overdraft || 0) + (Number(ledgerPaymentAmount) || 0) } : null);
      }
      
      onRefresh();
    } catch (err: any) {
      setLocalError(err.message || 'Error occurred during ledger payment.');
    } finally {
      setLoading(false);
    }
  };

  const handleClientLedgerUpdate = async (newTotalPaid: number) => {
    if (!localClient) return;
    setLoading(true);
    setLocalError('');
    setLocalSuccess('');
    try {
      const res = await fetch(`/api/clients/${localClient.id}/update-ledger`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': token
        },
        body: JSON.stringify({ totalPaid: newTotalPaid })
      });
      const resData = await res.json();
      if (!res.ok) {
        throw new Error(resData.error || 'Failed to update ledger allocations.');
      }
      setLocalSuccess(`Successfully updated cumulative allocations to ${newTotalPaid.toLocaleString()} FCFA for ${localClient.name}. All batches redistributed.`);
      
      if (resData.client) {
        setLocalClient(resData.client);
      }
      setLedgerEditMode(false);
      onRefresh();
    } catch (err: any) {
      setLocalError(err.message || 'Error updating client compilation ledger.');
    } finally {
      setLoading(false);
    }
  };

  const filteredRecords = (incubatorRecords || [])
    .filter(r => r.clientId === localClient.id)
    .filter(r => {
      if (ledgerTimeFilter === 'all') return true;
      const rDate = new Date(r.dateBrought).getTime();
      const now = new Date().getTime();
      const diffDays = (now - rDate) / (1000 * 60 * 60 * 24);
      if (ledgerTimeFilter === '1w') return diffDays <= 7;
      if (ledgerTimeFilter === '2w') return diffDays <= 14;
      if (ledgerTimeFilter === 'custom') {
        const configWeeks = Number(ledgerCustomWeeks) || 3;
        return diffDays <= (configWeeks * 7);
      }
      return true;
    });

  const compiledEggsBrought = filteredRecords.reduce((acc, r) => acc + r.eggsCollected, 0);
  
  const scannedBatches = filteredRecords.filter(r => r.eggsAfterScan !== null && r.eggsAfterScan !== undefined);
  const eggsDeliveredForScanned = scannedBatches.reduce((acc, r) => acc + r.eggsCollected, 0);
  const compiledEggsAfterScan = scannedBatches.reduce((acc, r) => acc + (r.eggsAfterScan || 0), 0);
  const compiledCandlingPercentage = eggsDeliveredForScanned > 0 ? (compiledEggsAfterScan / eggsDeliveredForScanned) * 100 : 0;

  const hatchedBatches = filteredRecords.filter(r => isRecordHatched(r));
  const eggsDeliveredForHatched = hatchedBatches.reduce((acc, r) => acc + r.eggsCollected, 0);
  const eggsScannedForHatched = hatchedBatches.reduce((acc, r) => acc + (r.eggsAfterScan || r.eggsCollected), 0);
  const compiledHatched = hatchedBatches.reduce((acc, r) => acc + (r.chicksHatched || 0), 0);
  const compiledHatchPercentageOfTotal = eggsDeliveredForHatched > 0 ? (compiledHatched / eggsDeliveredForHatched) * 100 : 0;
  const compiledHatchPercentageOfCandling = eggsScannedForHatched > 0 ? (compiledHatched / eggsScannedForHatched) * 100 : 0;

  const compiledAmountDue = filteredRecords.reduce((acc, r) => acc + (r.amountDue || 0), 0);
  const compiledAmountPaid = filteredRecords.reduce((acc, r) => acc + (r.amountPaid || 0), 0);
  const compiledOverdraftUsed = filteredRecords.reduce((acc, r) => acc + (r.overdraftUsed || 0), 0);
  const compiledNetDue = Math.max(0, compiledAmountDue - compiledOverdraftUsed);
  const compiledNetBalance = compiledAmountPaid - compiledNetDue;
  const compiledAmountOwed = compiledNetBalance < 0 ? Math.abs(compiledNetBalance) : 0;
  const currentOverdraft = compiledNetBalance > 0 ? compiledNetBalance : 0;

  return (
    <div id="ledger_modal_backdrop" className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div id="ledger_modal" className="w-full max-w-5xl bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh] animate-in zoom-in-95 duration-100 text-slate-800">
        {/* Header */}
        <div className="bg-slate-900 p-6 text-white flex justify-between items-center">
          <div>
            <div className="flex items-center gap-2">
              <span className="bg-blue-600 text-white font-extrabold text-[10px] tracking-wider uppercase px-2.5 py-1 rounded-full">
                Client Business Ledger
              </span>
              <span className="font-extrabold text-blue-300 text-sm">[{localClient.mark}]</span>
            </div>
            <h3 className="text-xl font-black mt-1.5 leading-none text-white">{localClient.name}</h3>
            <p className="text-slate-400 text-xs mt-1.5 font-semibold">
              Phone: {localClient.phone} • Location: {localClient.location}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="bg-white/10 hover:bg-white/20 text-white rounded-full p-2 h-8 w-8 flex items-center justify-center cursor-pointer transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Status/Notification Banners within ledger modal */}
        {(localError || localSuccess) && (
          <div className="px-6 pt-4 shrink-0">
            {localError && (
              <div className="p-3 bg-rose-50 border border-rose-100 text-rose-800 rounded-xl text-xs font-bold leading-relaxed flex items-center gap-2">
                <AlertCircle size={14} className="text-rose-600 shrink-0" />
                <span>{localError}</span>
              </div>
            )}
            {localSuccess && (
              <div className="p-3 bg-emerald-50 border border-emerald-100 text-emerald-800 rounded-xl text-xs font-bold leading-relaxed flex items-center gap-2 animate-pulse">
                <Check size={14} className="text-emerald-600 shrink-0" />
                <span>{localSuccess}</span>
              </div>
            )}
          </div>
        )}

        {/* Toolbar & Filters */}
        <div className="p-4 bg-slate-50 border-b border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-3">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Select Period:</span>
            <div className="flex items-center gap-2">
              <select
                value={ledgerTimeFilter}
                onChange={(e) => setLedgerTimeFilter(e.target.value as any)}
                className="h-9 px-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 text-xs font-bold text-slate-700 bg-white cursor-pointer"
              >
                <option value="all">📅 All Time Records</option>
                <option value="1w">📅 Last 1 Week</option>
                <option value="2w">📅 Last 2 Weeks</option>
                <option value="custom">📅 Custom Weeks Range</option>
              </select>

              {ledgerTimeFilter === 'custom' && (
                <div className="flex items-center gap-1.5 bg-white border border-slate-200 pl-3 pr-2 py-1 rounded-xl h-9">
                  <span className="text-[10px] text-slate-400 font-extrabold uppercase">Weeks:</span>
                  <input
                    type="number"
                    min="1"
                    max="52"
                    value={ledgerCustomWeeks}
                    onChange={(e) => setLedgerCustomWeeks(e.target.value)}
                    className="w-10 h-full text-center text-xs font-black text-slate-800 bg-transparent focus:outline-none focus:border-none focus:ring-0"
                  />
                </div>
              )}
            </div>
          </div>

          <div className="text-xs font-bold text-slate-500 bg-slate-200/50 px-3 py-1.5 rounded-lg">
            Showing <strong className="text-slate-900">{filteredRecords.length}</strong> matching batch entries
          </div>
        </div>

        {/* Compilation Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2 p-4 bg-blue-50/10 border-b border-blue-105 shrink-0">
          <div className="p-2.5 bg-white rounded-2xl border border-slate-100 shadow-xs text-center flex flex-col justify-center">
            <span className="text-[9px] font-extrabold text-slate-400 block uppercase tracking-wider leading-tight">Delivered</span>
            <strong className="text-base font-black text-slate-850 block mt-1">{compiledEggsBrought.toLocaleString()}</strong>
            <span className="text-[9px] text-slate-400 font-semibold mt-0.5">Eggs Brought</span>
          </div>

          <div className="p-2.5 bg-white rounded-2xl border border-slate-100 shadow-xs text-center flex flex-col justify-center">
            <span className="text-[9px] font-extrabold text-slate-400 block uppercase tracking-wider leading-tight">Candled Eggs</span>
            <strong className="text-base font-black text-slate-800 block mt-1">
              {scannedBatches.length > 0 ? compiledEggsAfterScan.toLocaleString() : '—'}
            </strong>
            {scannedBatches.length > 0 && (
              <span className="text-[9px] font-bold text-blue-600 block mt-0.5 bg-blue-50 rounded py-0.5">{compiledCandlingPercentage.toFixed(1)}% scan</span>
            )}
          </div>

          <div className="p-2.5 bg-white rounded-2xl border border-slate-100 shadow-xs text-center flex flex-col justify-center">
            <span className="text-[9px] font-extrabold text-slate-400 block uppercase tracking-wider leading-tight">Chicks Hatched</span>
            <strong className="text-base font-black text-emerald-800 block mt-1">
              {hatchedBatches.length > 0 ? compiledHatched.toLocaleString() : '—'}
            </strong>
            {hatchedBatches.length > 0 && (
              <span className="text-[9px] font-bold text-emerald-600 block mt-0.5 bg-emerald-50 rounded py-0.5">{compiledHatchPercentageOfTotal.toFixed(1)}% hatch</span>
            )}
          </div>

          <div className="p-2.5 bg-white rounded-2xl border border-slate-100 shadow-xs text-center flex flex-col justify-center">
            <span className="text-[9px] font-extrabold text-slate-400 block uppercase tracking-wider leading-tight">Total Charge</span>
            <strong className="text-base font-black text-slate-800 block mt-1">{compiledAmountDue.toLocaleString()}</strong>
            <span className="text-[9px] text-slate-400 font-bold block mt-0.5">FCFA</span>
          </div>

          <div className="p-2.5 bg-white rounded-2xl border border-emerald-100 shadow-xs text-center bg-emerald-50/10 flex flex-col justify-center">
            <span className="text-[9px] font-extrabold text-emerald-600 block uppercase tracking-wider leading-tight">Amount Paid</span>
            <strong className="text-base font-black text-emerald-600 block mt-1">{compiledAmountPaid.toLocaleString()}</strong>
            <span className="text-[9px] text-emerald-450 font-bold block mt-0.5">FCFA</span>
          </div>

          <div className="p-2.5 bg-white rounded-2xl border border-rose-100 shadow-xs text-center bg-rose-50/10 flex flex-col justify-center">
            <span className="text-[9px] font-extrabold text-rose-500 block uppercase tracking-wider leading-tight">Balance Owed</span>
            <strong className="text-base font-black text-rose-750 block mt-1">{compiledAmountOwed.toLocaleString()}</strong>
            <span className="text-[9px] text-rose-500 font-bold block mt-0.5">FCFA</span>
          </div>

          <div className="p-2.5 bg-white rounded-2xl border border-blue-100 shadow-xs text-center bg-blue-50/20 flex flex-col justify-center">
            <span className="text-[9px] font-extrabold text-blue-500 block uppercase tracking-wider leading-tight">Overdraft</span>
            <strong className="text-base font-black text-blue-700 block mt-1">{currentOverdraft.toLocaleString()}</strong>
            <span className="text-[9px] text-blue-500 font-bold block mt-0.5">FCFA</span>
          </div>
        </div>

        {/* Scrollable Detailed Table & Editor Area */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* INTERACTIVE COMPILATION BALANCE EDITOR CONTAINER */}
          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100/80 shadow-xs flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex-1">
              <h4 className="text-xs font-black text-slate-800 uppercase tracking-tight flex items-center gap-1.5">
                <Sparkles size={14} className="text-blue-600 animate-pulse" />
                <span>Interactive Balance & compiled payments Editor</span>
              </h4>
              <p className="text-[11px] text-slate-400 mt-1 font-semibold leading-relaxed">
                Change the client's total compiled payment amount below. The system will cleanly re-distribute the updated funds chronologically across all batches (oldest to newest), only modifying unpaid balances!
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setLedgerEditMode(!ledgerEditMode);
                setLedgerEditPaid(String(compiledAmountPaid));
              }}
              className={`cursor-pointer px-4 py-2 rounded-xl text-xs font-extrabold uppercase tracking-wide transition-all ${
                ledgerEditMode 
                  ? 'bg-rose-50 border border-rose-200 text-rose-700' 
                  : 'bg-emerald-50 border border-emerald-150 text-emerald-700 hover:bg-emerald-100'
              }`}
            >
              {ledgerEditMode ? 'Cancel Editing' : '✏️ Edit Total Paid Balance'}
            </button>
          </div>

          {/* Ledger Edit Panel */}
          {ledgerEditMode && (
            <div className="bg-slate-50/60 p-4 rounded-2xl border border-blue-100/50 space-y-4 animate-in fade-in duration-150">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-[10px] font-extrabold text-slate-500 uppercase tracking-wider mb-1 ml-1 select-none">Total All-Time Due</label>
                  <div className="h-11 px-4 bg-slate-100 border border-slate-200 rounded-xl flex items-center font-extrabold text-slate-700 text-sm">
                    {compiledAmountDue.toLocaleString()} FCFA
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-extrabold text-blue-600 uppercase tracking-wider mb-1 ml-1 select-none">Edit Cumulative Paid Amount (to Date)</label>
                  <div className="relative">
                    <input
                      type="number"
                      min="0"
                      placeholder="Cumulative Paid"
                      value={ledgerEditPaid}
                      onChange={(e) => setLedgerEditPaid(e.target.value)}
                      className="w-full h-11 pr-14 pl-4 rounded-xl border border-blue-200 focus:outline-none focus:ring-2 focus:ring-blue-500 font-extrabold text-slate-900 text-sm bg-white"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400">FCFA</span>
                  </div>
                  <span className="text-[9px] text-slate-400 block mt-1 px-1 font-semibold">
                    Current payment state: {compiledAmountPaid.toLocaleString()} FCFA
                  </span>
                </div>

                <div>
                  <label className="block text-[10px] font-extrabold text-slate-500 uppercase tracking-wider mb-1 ml-1 select-none">New Balance Owed Position</label>
                  <div className="h-11 px-4 bg-rose-50 border border-rose-100 rounded-xl flex items-center font-black text-rose-700 text-sm">
                    {Math.max(0, compiledAmountDue - (Number(ledgerEditPaid) || 0)).toLocaleString()} FCFA
                  </div>
                </div>
              </div>

              <div className="p-3 bg-amber-50 rounded-xl border border-amber-100/50 flex gap-2 text-[11px] text-amber-800">
                <AlertCircle size={15} className="shrink-0 mt-0.5 text-amber-600" />
                <div>
                  <strong className="block font-black uppercase text-[9px] text-amber-900 tracking-wider mb-0.5">FIFO Distribution Logic (First-in First-out)</strong>
                  <span>
                    Applying this change will automatically reset and re-allocate <strong>{(Number(ledgerEditPaid) || 0).toLocaleString()} FCFA</strong> across individual egg batches from oldest to newest. Portions of batches that are fully or partially outstanding will be marked as settled. Any surplus beyond the total due will be generated as <strong>{Math.max(0, (Number(ledgerEditPaid) || 0) - compiledAmountDue).toLocaleString()} FCFA</strong> of client overdraft credit.
                  </span>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setLedgerEditMode(false)}
                  className="px-4 h-10 border border-slate-200 rounded-xl text-xs font-bold text-slate-650 hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => handleClientLedgerUpdate(Number(ledgerEditPaid) || 0)}
                  className="px-6 h-10 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black uppercase tracking-wider shadow cursor-pointer transition-colors"
                >
                  {loading ? 'Redistributing...' : '💾 Save & Distribute'}
                </button>
              </div>
            </div>
          )}

          {/* Batch Data Table Header with Fullscreen Toggle */}
          <div className="flex items-center justify-between mt-2 mb-1">
            <h4 className="text-xs font-black text-slate-700 uppercase tracking-wider">
              Client Statement Batches Breakdown ({filteredRecords.length} Records)
            </h4>
            {filteredRecords.length > 0 && (
              <button
                type="button"
                onClick={() => setFullscreenTable({
                  title: `${localClient.name || 'Client'} Statement Batches Breakdown`,
                  subtitle: `Detailed batch history, egg counts, hatch rates, amounts due & payment status for mark [${localClient.mark || '-'}]`,
                  badge: `${filteredRecords.length} Batches`,
                  icon: <FileText size={20} />,
                  content: (
                    <div className="border border-slate-100 rounded-2xl overflow-x-auto shadow-xs bg-white">
                      <table className="w-full text-left border-collapse text-xs min-w-[950px]">
                        <thead className="bg-slate-50 uppercase text-[10px] font-bold text-slate-500 tracking-wider sticky top-0 z-10">
                          <tr>
                            <th className="p-3">Delivered Date</th>
                            <th className="p-3">Egg Type</th>
                            <th className="p-3">Eggs Count</th>
                            <th className="p-3">Hatched</th>
                            <th className="p-3">Due (FCFA)</th>
                            <th className="p-3">Paid (FCFA)</th>
                            <th className="p-3">Owed Amount</th>
                            <th className="p-3">Status</th>
                            <th className="p-3 text-center">Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                          {filteredRecords.map(rec => {
                            const owed = Math.max(0, rec.amountDue - rec.amountPaid - (rec.overdraftUsed || 0));
                            return (
                              <tr key={rec.id} className="hover:bg-slate-50/50">
                                <td className="p-3 font-mono font-bold text-slate-800">{formatDateDDMMYYYY(rec.dateBrought)}</td>
                                <td className="p-3 font-bold text-slate-900">{rec.eggType || 'Chicken'}</td>
                                <td className="p-3 font-extrabold text-slate-900">{rec.eggsCollected}</td>
                                <td className="p-3 font-bold text-emerald-700">{rec.chicksHatched || 0}</td>
                                <td className="p-3 font-mono font-bold text-slate-800">{rec.amountDue.toLocaleString()} FCFA</td>
                                <td className="p-3 font-mono font-bold text-emerald-700">{rec.amountPaid.toLocaleString()} FCFA</td>
                                <td className="p-3 font-mono font-black text-rose-700">{owed > 0 ? `${owed.toLocaleString()} FCFA` : 'SETTLED'}</td>
                                <td className="p-3">
                                  <span className={`px-2 py-0.5 rounded text-[10px] font-extrabold uppercase ${
                                    owed <= 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                                  }`}>
                                    {owed <= 0 ? 'PAID' : 'UNPAID'}
                                  </span>
                                </td>
                                <td className="p-3 text-center">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setFullscreenTable(null);
                                      if (onSelectEditRecord) onSelectEditRecord(rec);
                                    }}
                                    className="p-1.5 bg-slate-100 hover:bg-emerald-50 hover:text-emerald-700 text-slate-600 rounded-lg cursor-pointer transition-colors inline-flex items-center gap-1 text-[11px] font-bold"
                                    title="Edit Batch"
                                  >
                                    <FileEdit size={13} />
                                    <span>Edit</span>
                                  </button>
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
            )}
          </div>

          {/* Batch Data Table */}
          {filteredRecords.length === 0 ? (
            <div className="p-8 sm:p-12 text-center text-slate-400 font-semibold italic bg-slate-50 rounded-2xl text-xs sm:text-sm">
              No egg batches delivered during this specified timeframe.
            </div>
          ) : (
            <div className="border border-slate-100 rounded-2xl overflow-x-auto shadow-xs">
              <table className="w-full text-left border-collapse text-[10px] sm:text-xs min-w-[550px] sm:min-w-full">
                <thead className="bg-slate-50 uppercase text-[8px] sm:text-[10px] font-bold text-slate-500 tracking-wider">
                  <tr>
                    <th className="p-1.5 sm:p-3">Delivered Date</th>
                    <th className="p-1.5 sm:p-3">Egg Type</th>
                    <th className="p-1.5 sm:p-3">Eggs Count</th>
                    <th className="p-1.5 sm:p-3">Hatched</th>
                    <th className="p-1.5 sm:p-3">Due (FCFA)</th>
                    <th className="p-1.5 sm:p-3">Paid (FCFA)</th>
                    <th className="p-1.5 sm:p-3">Owed Amount</th>
                    <th className="p-1.5 sm:p-3">Status</th>
                    <th className="p-1.5 sm:p-3 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                  {filteredRecords.map(rec => {
                    const owed = Math.max(0, rec.amountDue - rec.amountPaid - (rec.overdraftUsed || 0));
                    return (
                      <tr key={rec.id} className="hover:bg-slate-50/40">
                        <td className="p-1.5 sm:p-3 font-mono text-slate-500 text-[10px] sm:text-xs">{formatDateDDMMYYYY(rec.dateBrought)}</td>
                        <td className="p-1.5 sm:p-3">
                          <span className="bg-slate-100 font-extrabold text-[8px] sm:text-[10px] uppercase text-slate-700 px-1 py-0.2 sm:px-1.5 sm:py-0.5 rounded">
                            {rec.eggType || 'Brahma'}
                          </span>
                        </td>
                        <td className="p-1.5 sm:p-3 font-extrabold text-slate-900">{rec.eggsCollected}</td>
                        <td className="p-1.5 sm:p-3 font-bold text-emerald-700">{rec.chicksHatched !== null && rec.chicksHatched !== undefined ? rec.chicksHatched : '—'}</td>
                        <td className="p-1.5 sm:p-3">{rec.amountDue.toLocaleString()}</td>
                        <td className="p-1.5 sm:p-3 text-emerald-600">
                          {rec.amountPaid.toLocaleString()}
                          {rec.overdraftUsed ? (
                            <span className="text-[8px] sm:text-[9px] text-blue-600 block leading-tight mt-0.5 font-bold">
                              (+{rec.overdraftUsed} overdraft)
                            </span>
                          ) : null}
                        </td>
                        <td className="p-1.5 sm:p-3 font-black text-rose-700">{owed.toLocaleString()}</td>
                        <td className="p-1.5 sm:p-3">
                          {owed === 0 ? (
                            <span className="text-[8px] sm:text-[10px] bg-emerald-50 text-emerald-700 px-1.5 py-0.5 sm:px-2.5 sm:py-0.5 rounded-full font-extrabold uppercase">Cleared</span>
                          ) : (
                            <span className="text-[8px] sm:text-[10px] bg-amber-50 text-amber-700 px-1.5 py-0.5 sm:px-2 sm:py-0.5 rounded-full font-extrabold uppercase truncate">Unpaid</span>
                          )}
                        </td>
                        <td className="p-1.5 sm:p-3 text-center">
                          <button
                            type="button"
                            onClick={() => {
                              if (onSelectEditRecord) onSelectEditRecord(rec);
                            }}
                            className="p-1 sm:p-1.5 bg-slate-100 hover:bg-emerald-50 hover:text-emerald-700 text-slate-600 rounded-lg cursor-pointer transition-colors inline-flex items-center gap-0.5 sm:gap-1 text-[10px] sm:text-[11px] font-bold"
                            title="Edit Batch"
                          >
                            <FileEdit size={11} className="sm:w-[13px] sm:h-[13px]" />
                            <span>Edit</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Action Footer: Pay Debt Form & Settlement */}
        <div className="p-6 bg-slate-50 border-t border-slate-100 shrink-0">
          <form onSubmit={handleClientLedgerPayment} className="flex flex-col sm:flex-row items-end gap-3 max-w-xl">
            <div className="flex-1 w-full">
              <label className="block text-[11px] font-extrabold text-slate-500 uppercase tracking-wider mb-1.5 ml-0.5">
                Or Record Direct Settlement / New Payment Received
              </label>
              <div className="relative">
                <input
                  type="number"
                  placeholder="Amount to clear oldest outstanding batches first"
                  value={ledgerPaymentAmount}
                  onChange={(e) => setLedgerPaymentAmount(e.target.value)}
                  className="w-full h-11 pr-16 pl-4 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 font-extrabold text-slate-800 text-sm bg-white"
                  min="1"
                  required
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-black text-slate-400">FCFA</span>
              </div>
            </div>
            <button
              type="submit"
              disabled={loading}
              className="h-11 px-6 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-extrabold uppercase tracking-widest cursor-pointer transition-all shrink-0 w-full sm:w-auto"
            >
              {loading ? 'Processing...' : 'Settle Debt'}
            </button>
          </form>
          <div className="flex gap-4 mt-3">
            <button
              type="button"
              onClick={() => setLedgerPaymentAmount(String(compiledAmountOwed))}
              className="text-[10px] text-blue-600 hover:text-blue-800 font-extrabold uppercase tracking-wide cursor-pointer flex items-center gap-1 bg-blue-50 hover:bg-blue-100 px-2 py-1 rounded"
            >
              💡 Pre-fill Owed Balance ({compiledAmountOwed.toLocaleString()} FCFA)
            </button>
          </div>
          <p className="text-[10px] text-slate-400 mt-2.5 font-semibold">
            * Dynamic debt settlements are applied chronologically starting from the oldest outstanding unpaid eggs delivery record. Excess amounts automatically rollover as Client Overdraft credit.
          </p>
        </div>
      </div>

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

    </div>
  );
}
