/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import crypto from "crypto";
import { AsyncLocalStorage } from "node:async_hooks";
import XLSX from "xlsx";
import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { applyFarmAction, ensureFarmArrays, quailEggBalance, isProtectedFarmMutation } from './src/lib/farmActions';

function cameroonDate(date: Date = new Date()): string {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Douala', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date).map(part => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

// Ensure data folder exists
const DATA_DIR = process.env.NVF_DATA_DIR || path.join(process.cwd(), "data");
// Public family mode is the default. Set NVF_OPEN_ACCESS=0 to restore the
// legacy account checks without changing stored farm or account records.
const OPEN_ACCESS = process.env.NVF_OPEN_ACCESS !== '0';
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_FILE = path.join(DATA_DIR, "db.json");
const BACKUPS_DIR = path.join(DATA_DIR, "backups");
const LOCAL_RECOVERY_MARKER = path.join(DATA_DIR, '.local_account_recovery_used');
const firebaseConfigPath = path.join(process.cwd(), "firebase-applet-config.json");
const firebaseConfig = process.env.NVF_LOCAL_ONLY !== '1' && fs.existsSync(firebaseConfigPath)
  ? JSON.parse(fs.readFileSync(firebaseConfigPath, "utf-8"))
  : null;
if (!firebaseConfig && process.env.NODE_ENV === 'production' && process.env.NVF_LOCAL_ONLY !== '1') {
  throw new Error('Firebase configuration is missing. Refusing to start a production server with disposable local storage.');
}
if (firebaseConfig && !firebaseConfig.projectId) throw new Error('Firebase projectId is missing.');
const firestoreDb: Firestore | null = firebaseConfig
  ? getFirestore(initializeApp({ credential: applicationDefault(), projectId: firebaseConfig.projectId }), firebaseConfig.firestoreDatabaseId || '(default)')
  : null;
const cloudDocument = firestoreDb?.doc('app_data/main');
let cloudRevision = 0;
const requestSaves = new AsyncLocalStorage<Promise<void>[]>();
const activityContext = new AsyncLocalStorage<{ actor: string; action: string; detail?: string; logged: boolean }>();
let cloudWriteQueue: Promise<void> = Promise.resolve();

// Ensure backups directory exists
if (!fs.existsSync(BACKUPS_DIR)) {
  fs.mkdirSync(BACKUPS_DIR, { recursive: true });
}

// Simple Daily Auto-Backup Feature
function triggerBackup() {
  try {
    if (fs.existsSync(DB_FILE)) {
      const todayStr = cameroonDate();
      const backupPath = path.join(BACKUPS_DIR, `db_backup_${todayStr}.json`);
      fs.copyFileSync(DB_FILE, backupPath);
      console.log(`[Daily Auto-Backup] Successfully backed up database to: ${backupPath}`);
    }
  } catch (err) {
    console.error("[Daily Auto-Backup] Critical error creating database safety backup:", err);
  }
}

// Trigger initial backup on server boot/restart
triggerBackup();

// Setup 24-hour repeating auto-backup safety net (86,400,000 ms)
setInterval(() => {
  console.log("[Daily Auto-Backup] Scheduling daily database snapshot trigger...");
  triggerBackup();
}, 24 * 60 * 60 * 1000);

// Setup hourly active scheduler for automatic daily flock age increments (+1/7 week per day)
setInterval(() => {
  console.log("[Daily Flock Scheduler] Running scheduled check for active flock age updates...");
  try {
    const db = loadDb(); // Reading the database triggers updateFlocksAge and saves changes if any
  } catch (err) {
    console.error("[Daily Flock Scheduler] Error running scheduled flock age increment check:", err);
  }
}, 1 * 60 * 60 * 1000); // Check every hour

const DEFAULT_CAGES = [
  // BLOCK 0
  { id: "c-0-1", blockName: "BLOCK 0", cageName: "ST 1" },
  { id: "c-0-2", blockName: "BLOCK 0", cageName: "ST 2" },
  { id: "c-0-3", blockName: "BLOCK 0", cageName: "ST 3" },
  { id: "c-0-4", blockName: "BLOCK 0", cageName: "ST 4" },
  { id: "c-0-5", blockName: "BLOCK 0", cageName: "ST2" },
  { id: "c-0-6", blockName: "BLOCK 0", cageName: "ST4" },
  // BLOCK 1
  { id: "c-1-1", blockName: "BLOCK 1", cageName: "CAGE B" },
  { id: "c-1-2", blockName: "BLOCK 1", cageName: "CAGE C" },
  { id: "c-1-3", blockName: "BLOCK 1", cageName: "CAGE D" },
  { id: "c-1-4", blockName: "BLOCK 1", cageName: "CAGE B1" },
  { id: "c-1-5", blockName: "BLOCK 1", cageName: "CAGE C1" },
  // BLOCK 2
  { id: "c-2-1", blockName: "BLOCK 2", cageName: "CAGE A" },
  { id: "c-2-2", blockName: "BLOCK 2", cageName: "A FLOOR" },
  { id: "c-2-3", blockName: "BLOCK 2", cageName: "O FLOOR" },
  { id: "c-2-4", blockName: "BLOCK 2", cageName: "STO 1" },
  { id: "c-2-5", blockName: "BLOCK 2", cageName: "STO 2" },
  { id: "c-2-6", blockName: "BLOCK 2", cageName: "STO 3" },
  { id: "c-2-7", blockName: "BLOCK 2", cageName: "STO 4" },
  { id: "c-2-8", blockName: "BLOCK 2", cageName: "STO 0" },
  { id: "c-2-9", blockName: "BLOCK 2", cageName: "CAGE P" },
  { id: "c-2-10", blockName: "BLOCK 2", cageName: "CAGE Q" },
  { id: "c-2-11", blockName: "BLOCK 2", cageName: "CAGE R" },
  { id: "c-2-12", blockName: "BLOCK 2", cageName: "CAGE S" },
  { id: "c-2-13", blockName: "BLOCK 2", cageName: "CAGE T" },
  { id: "c-2-14", blockName: "BLOCK 2", cageName: "CAGE U" },
  { id: "c-2-15", blockName: "BLOCK 2", cageName: "CAGE M" },
  // BLOCK 3
  { id: "c-3-1", blockName: "BLOCK 3", cageName: "H FLOOR" },
  { id: "c-3-2", blockName: "BLOCK 3", cageName: "N FLOOR" },
  { id: "c-3-3", blockName: "BLOCK 3", cageName: "CAGE K" },
  { id: "c-3-4", blockName: "BLOCK 3", cageName: "CAGE L" },
  { id: "c-3-5", blockName: "BLOCK 3", cageName: "CAGE J" },
  { id: "c-3-6", blockName: "BLOCK 3", cageName: "CAGE J1" },
  { id: "c-3-7", blockName: "BLOCK 3", cageName: "GR 1" },
  { id: "c-3-8", blockName: "BLOCK 3", cageName: "GR 2" },
  { id: "c-3-9", blockName: "BLOCK 3", cageName: "GR 3" },
  { id: "c-3-10", blockName: "BLOCK 3", cageName: "CAGE G" },
  { id: "c-3-11", blockName: "BLOCK 3", cageName: "CAGE F" },
  { id: "c-3-12", blockName: "BLOCK 3", cageName: "IN 1" },
  { id: "c-3-13", blockName: "BLOCK 3", cageName: "IN 2" },
  { id: "c-3-14", blockName: "BLOCK 3", cageName: "IN 3" },
  { id: "c-3-15", blockName: "BLOCK 3", cageName: "IN 4" }
];

function findBlockNameForCage(cageName: string, cagesList: any[]): string {
  const norm = (cageName || "").trim().toLowerCase().replace(/\s+/g, "");
  if (cagesList && cagesList.length > 0) {
    const found = cagesList.find((c: any) => (c.cageName || "").trim().toLowerCase().replace(/\s+/g, "") === norm);
    if (found) return found.blockName;
  }
  const def = DEFAULT_CAGES.find((c) => c.cageName.toLowerCase().replace(/\s+/g, "") === norm);
  if (def) return def.blockName;
  return "CUSTOM BLOCK";
}

function parseExcelFlocksAndAllocations() {
  let excelPath = path.join(process.cwd(), "POULTRY RECORDS.xlsx");
  if (!fs.existsSync(excelPath)) {
    excelPath = path.join(process.cwd(), "data", "POULTRY RECORDS.xlsx");
  }
  if (!fs.existsSync(excelPath)) {
    return { flocks: [], cageAllocations: [] };
  }
  try {
    const workbook = XLSX.readFile(excelPath);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });

    const today = new Date();
    const todayStr = cameroonDate(today);

    const parseDateOrAge = (val: any) => {
      if (!val) return { ageWeeks: 0, initialAgeWeeks: 0, hatchDate: todayStr };
      const s = String(val).trim().toUpperCase();
      if (s.includes("WEEK") || s.includes("WK")) {
        const m = s.match(/(\d+(?:\.\d+)?)/);
        const wks = m ? parseFloat(m[1]) : 0;
        const d = new Date();
        d.setDate(d.getDate() - wks * 7);
        const hatchStr = d.toISOString().split("T")[0];
        return { ageWeeks: wks, initialAgeWeeks: wks, hatchDate: hatchStr };
      }
      const parts = s.split("/");
      if (parts.length === 2) {
        const day = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10);
        const hatchStr = `2026-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
        return { ageWeeks: 0, initialAgeWeeks: 0, hatchDate: hatchStr };
      }
      if (parts.length === 3) {
        let day = parseInt(parts[0], 10);
        let month = parseInt(parts[1], 10);
        const year = parseInt(parts[2], 10);
        if (month > 12 && day <= 12) {
          const tmp = day; day = month; month = tmp;
        }
        const hatchStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
        return { ageWeeks: 0, initialAgeWeeks: 0, hatchDate: hatchStr };
      }
      const numMatch = s.match(/(\d+(?:\.\d+)?)/);
      if (numMatch) {
        const wks = parseFloat(numMatch[1]);
        return { ageWeeks: wks, initialAgeWeeks: wks, hatchDate: todayStr };
      }
      return { ageWeeks: 0, initialAgeWeeks: 0, hatchDate: todayStr };
    };

    const parseQuantity = (qtyRaw: any) => {
      if (typeof qtyRaw === "number") {
        return { quantity: qtyRaw, details: "", countMode: "single", speciesBreakdown: [] };
      }
      const qStr = String(qtyRaw || "").trim();
      if (!qStr) return { quantity: 0, details: "", countMode: "single", speciesBreakdown: [] };

      // Parse cocks and hens e.g. "7 cocks+1hen" or "1 hen + 7 cocks"
      const cMatch = qStr.match(/(\d+)\s*(?:cock|cocks|rooster|roosters|males?)/i);
      const hMatch = qStr.match(/(\d+)\s*(?:hen|hens|female|females|layers?)/i);
      if (cMatch || hMatch) {
        const cocks = cMatch ? parseInt(cMatch[1], 10) : 0;
        const hens = hMatch ? parseInt(hMatch[1], 10) : 0;
        const sum = cocks + hens;
        if (sum > 0) {
          return {
            quantity: sum,
            details: qStr,
            countMode: "sex_breakdown",
            cocksCount: cocks,
            hensCount: hens,
            speciesBreakdown: []
          };
        }
      }

      // Parse multi-species e.g. "7 turkey + 2 chicks" or "10 poult, 5 chicks"
      const parts = qStr.split(/(?:\+|\&|,|\band\b)/i).map(p => p.trim()).filter(Boolean);
      if (parts.length > 1) {
        const breakdown: any[] = [];
        let totalQty = 0;
        for (const part of parts) {
          const m = part.match(/(\d+)\s*(.*)/);
          if (m) {
            const q = parseInt(m[1], 10);
            let s = m[2].trim() || "Chicken";
            if (/turkey|tky/i.test(s)) s = "Turkey";
            else if (/chick|chicks/i.test(s)) s = "Chicks";
            else if (/poult|poults/i.test(s)) s = "Poults";
            else if (/fowl|fowls|chicken|brahma/i.test(s)) s = "Chicken";
            breakdown.push({ species: s, quantity: q });
            totalQty += q;
          }
        }
        if (breakdown.length > 0 && totalQty > 0) {
          return {
            quantity: totalQty,
            details: qStr,
            countMode: "multi",
            speciesBreakdown: breakdown
          };
        }
      }

      const numbers = qStr.match(/(\d+)/g);
      if (numbers) {
        const sum = numbers.reduce((acc: number, curr: string) => acc + parseInt(curr, 10), 0);
        return { quantity: sum, details: qStr, countMode: "single", speciesBreakdown: [] };
      }
      return { quantity: 0, details: qStr, countMode: "single", speciesBreakdown: [] };
    };

    const flocks: any[] = [];
    const cageAllocations: any[] = [];

    data.slice(2).forEach((row: any, idx: number) => {
      if (!row || row.length < 2) return;
      const blockRaw = String(row[0] || "").trim().toUpperCase();
      const cageRaw = String(row[1] || "").trim().toUpperCase();
      const flockNum = row[2];
      const qtyRaw = row[3];
      const ageRaw = row[4];

      if (!cageRaw && (qtyRaw === undefined || qtyRaw === null)) return;
      if (qtyRaw === 0 || qtyRaw === "0") return;

      const cageName = cageRaw;
      const blockName = blockRaw ? (blockRaw.startsWith("BLOCK") ? blockRaw : `BLOCK ${blockRaw.replace(/\D/g, "")}`) : findBlockNameForCage(cageName, DEFAULT_CAGES);
      const { ageWeeks, hatchDate } = parseDateOrAge(ageRaw);
      const parsedQty = parseQuantity(qtyRaw);

      const isTurkey = parsedQty.details.toUpperCase().includes("TURKEY") || parsedQty.details.toUpperCase().includes("TKY");

      const flockId = `flock-${flockNum || idx + 1}`;
      const flockName = `Batch #${flockNum || idx + 1}`;

      const flockObj = {
        id: flockId,
        name: flockName,
        species: isTurkey ? "Turkey" : "Chicken",
        breed: isTurkey ? "Turkey" : "Brahma",
        quantity: parsedQty.quantity,
        ageWeeks: ageWeeks,
        initialAgeWeeks: ageWeeks,
        hatchDate: hatchDate,
        dateAdded: hatchDate,
        purpose: "Meat & Eggs",
        countMode: parsedQty.countMode,
        cocksCount: parsedQty.cocksCount,
        hensCount: parsedQty.hensCount,
        speciesBreakdown: parsedQty.speciesBreakdown,
        notes: parsedQty.details
      };
      flocks.push(flockObj);

      cageAllocations.push({
        id: `alloc-${flockId}`,
        blockName: blockName,
        cageName: cageName,
        flockName: flockName,
        species: isTurkey ? "Turkey" : "Chicken",
        quantity: parsedQty.quantity,
        ageWeeks: ageWeeks,
        hatchDate: hatchDate,
        dateAdded: hatchDate,
        dateTransferred: hatchDate,
        countMode: parsedQty.countMode,
        cocksCount: parsedQty.cocksCount,
        hensCount: parsedQty.hensCount,
        speciesBreakdown: parsedQty.speciesBreakdown,
        notes: parsedQty.details
      });
    });

    return { flocks, cageAllocations };
  } catch (e) {
    console.error("Error reading/parsing POULTRY RECORDS.xlsx:", e);
    return { flocks: [], cageAllocations: [] };
  }
}

// Define basic schema helper
const getInitialDb = () => {
  const parsed = parseExcelFlocksAndAllocations();
  return {
    users: [],
    clients: [],
    incubator_records: [],
    flocks: parsed.flocks,
    feed_records: [],
    poultry_sales: [],
    mortality: [],
    expenses: [],
    cage_transfers: [],
    cages: [...DEFAULT_CAGES],
    cage_allocations: parsed.cageAllocations,
    daily_egg_collections: []
  };
};

// Seed/Load database
function updateFlocksAge(db: any) {
  if (!db.flocks || !Array.isArray(db.flocks)) return;
  const today = new Date();
  let changed = false;

  db.flocks.forEach((flock: any) => {
    if (flock.initialAgeWeeks !== undefined && flock.initialAgeWeeks % 1 !== 0) {
      flock.initialAgeWeeks = 0;
      changed = true;
    }
    const hatchStr = flock.dateAdded || flock.hatchDate;
    if (hatchStr) {
      let iso = hatchStr;
      if (hatchStr.includes("/")) {
        const parts = hatchStr.split("/");
        if (parts.length === 3) {
          iso = `${parts[2]}-${String(parts[1]).padStart(2, "0")}-${String(parts[0]).padStart(2, "0")}`;
        }
      }
      const hatch = new Date(iso);
      if (!isNaN(hatch.getTime())) {
        const diffTime = Math.max(0, today.getTime() - hatch.getTime());
        const elapsedWeeks = diffTime / (1000 * 3600 * 24 * 7);
        let baseAge = flock.initialAgeWeeks !== undefined ? Number(flock.initialAgeWeeks) : 0;
        if (baseAge % 1 !== 0) baseAge = 0;
        const computed = Math.round((baseAge + elapsedWeeks) * 10) / 10;
        if (flock.ageWeeks !== computed) {
          flock.ageWeeks = computed;
          changed = true;
        }
      }
    }
  });

  if (changed) {
    saveDbLocalFileOnly(db);
  }
}

function parseDetailString(str: string, fallbackSpecies: string = "Chicken") {
  if (!str) return { quantity: 0, countMode: "single", speciesBreakdown: [] };
  const text = String(str).trim();

  // Check cocks & hens
  const cMatch = text.match(/(\d+)\s*(?:cock|cocks|rooster|roosters|males?)/i);
  const hMatch = text.match(/(\d+)\s*(?:hen|hens|female|females|layers?)/i);
  if (cMatch || hMatch) {
    const cocksCount = cMatch ? parseInt(cMatch[1], 10) : 0;
    const hensCount = hMatch ? parseInt(hMatch[1], 10) : 0;
    const total = cocksCount + hensCount;
    if (total > 0) {
      return {
        quantity: total,
        countMode: "sex_breakdown",
        cocksCount,
        hensCount,
        speciesBreakdown: []
      };
    }
  }

  // Check multi-species (separated by +, &, or comma)
  const parts = text.split(/(?:\+|\&|,|\band\b)/i).map(p => p.trim()).filter(Boolean);
  if (parts.length > 1) {
    const speciesBreakdown: any[] = [];
    let sum = 0;
    for (const part of parts) {
      const match = part.match(/(\d+)\s*(.*)/);
      if (match) {
        const qty = parseInt(match[1], 10);
        let sp = match[2].trim() || fallbackSpecies;
        if (/turkey|tky/i.test(sp)) sp = "Turkey";
        else if (/chick|chicks/i.test(sp)) sp = "Chicks";
        else if (/poult|poults/i.test(sp)) sp = "Poults";
        else if (/fowl|fowls|chicken|brahma/i.test(sp)) sp = "Chicken";
        
        speciesBreakdown.push({ species: sp, quantity: qty });
        sum += qty;
      }
    }
    if (speciesBreakdown.length > 0 && sum > 0) {
      return {
        quantity: sum,
        countMode: "multi",
        speciesBreakdown
      };
    }
  }

  const numbers = text.match(/(\d+)/g);
  if (numbers) {
    const sum = numbers.reduce((acc: number, curr: string) => acc + parseInt(curr, 10), 0);
    return { quantity: sum, countMode: "single", speciesBreakdown: [] };
  }

  return { quantity: 0, countMode: "single", speciesBreakdown: [] };
}

function sanitizeFlockOrAlloc(item: any, defaultIndex: number) {
  if (!item) return;
  const rawName = item.name || item.flockName || "";
  const isRawMisuse = /\d+\s*(cocks|hens|turkey|chicks|poults)/i.test(rawName) || rawName.includes("+");

  if (isRawMisuse) {
    const parsed = parseDetailString(rawName, item.species || "Chicken");
    if (parsed.quantity > 0) {
      if (!item.countMode || item.countMode === "single") item.countMode = parsed.countMode;
      if (parsed.cocksCount !== undefined) item.cocksCount = parsed.cocksCount;
      if (parsed.hensCount !== undefined) item.hensCount = parsed.hensCount;
      if (parsed.speciesBreakdown.length > 0 && (!item.speciesBreakdown || item.speciesBreakdown.length === 0)) {
        item.speciesBreakdown = parsed.speciesBreakdown;
      }
      if (item.quantity === undefined || item.quantity === 0) item.quantity = parsed.quantity;
    }
    const cleanName = `Batch #${defaultIndex + 1}`;
    if (item.name) item.name = cleanName;
    if (item.flockName) item.flockName = cleanName;
  }

  if ((!item.countMode || item.countMode === "single") && item.notes) {
    const parsedNotes = parseDetailString(item.notes, item.species || "Chicken");
    if (parsedNotes.countMode !== "single" && parsedNotes.quantity > 0) {
      item.countMode = parsedNotes.countMode;
      if (parsedNotes.cocksCount !== undefined) item.cocksCount = parsedNotes.cocksCount;
      if (parsedNotes.hensCount !== undefined) item.hensCount = parsedNotes.hensCount;
      if (parsedNotes.speciesBreakdown.length > 0 && (!item.speciesBreakdown || item.speciesBreakdown.length === 0)) {
        item.speciesBreakdown = parsedNotes.speciesBreakdown;
      }
    }
  }
}

// Helper validation functions for strict numerical inputs
function isValidNonNegativeNumber(val: any): boolean {
  if (val === undefined || val === null || val === "") return false;
  const num = Number(val);
  return !isNaN(num) && isFinite(num) && num >= 0;
}

function isValidPositiveNumber(val: any): boolean {
  if (val === undefined || val === null || val === "") return false;
  const num = Number(val);
  return !isNaN(num) && isFinite(num) && num > 0;
}

// Helper to normalize any date input (DD/MM/YYYY, D/M/YYYY, etc.) to ISO YYYY-MM-DD
export function normalizeDateStringToISO(val: any): string {
  if (val === null || val === undefined || val === '') {
    return cameroonDate();
  }

  const str = String(val).trim();

  // If already YYYY-MM-DD or YYYY-M-D
  if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(str)) {
    const parts = str.split('-');
    return `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
  }

  // Handle formatted dates like D/M/YYYY, DD/MM/YYYY, D-M-YYYY, DD.MM.YYYY
  const cleaned = str.replace(/[\/\.]/g, '-');
  const parts = cleaned.split('-');
  if (parts.length === 3) {
    const p1 = parts[0].trim();
    const p2 = parts[1].trim();
    const p3 = parts[2].trim();

    // D/M/YYYY or DD/MM/YYYY or M/D/YYYY
    if (p3.length === 4) {
      const year = p3;
      let day = p1.padStart(2, '0');
      let month = p2.padStart(2, '0');

      // Standard in Cameroon / UK / International format is DD/MM/YYYY (Day/Month/Year).
      // If p2 > 12 and p1 <= 12, p2 must be the Day, and p1 the Month (MM/DD/YYYY)
      if (Number(p2) > 12 && Number(p1) <= 12) {
        day = p2.padStart(2, '0');
        month = p1.padStart(2, '0');
      } else {
        // Default to DD/MM/YYYY (Day/Month/Year)
        day = p1.padStart(2, '0');
        month = p2.padStart(2, '0');
      }

      return `${year}-${month}-${day}`;
    }

    // YYYY/MM/DD or YYYY/M/D
    if (p1.length === 4) {
      const year = p1;
      const month = p2.padStart(2, '0');
      const day = p3.padStart(2, '0');
      return `${year}-${month}-${day}`;
    }

    // D/M/YY or DD/MM/YY
    if (p3.length === 2) {
      const year = Number(p3) < 50 ? `20${p3}` : `19${p3}`;
      let day = p1.padStart(2, '0');
      let month = p2.padStart(2, '0');
      if (Number(p2) > 12 && Number(p1) <= 12) {
        day = p2.padStart(2, '0');
        month = p1.padStart(2, '0');
      }
      return `${year}-${month}-${day}`;
    }
  }

  const d = new Date(str);
  if (!isNaN(d.getTime())) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  return cameroonDate();
}

// Helper to determine standard incubator pricing based on egg species
export function getStandardRateBySpecies(eggType?: string): number {
  const t = String(eggType || '').toLowerCase().trim();
  if (t.includes('quail') || t.includes('cailles') || t.includes('caille')) {
    return 100;
  }
  if (
    t.includes('turkey') || t.includes('dindon') || t.includes('dinde') ||
    t.includes('duck') || t.includes('canard') ||
    t.includes('goose') || t.includes('oie')
  ) {
    return 500;
  }
  return 200;
}

// Helper for Incubator Batch Amount Due Calculations
export const computeAmountDue = (record: {
  specialCase?: string;
  eggType?: string;
  eggsCollected?: number;
  ratePerEgg?: number;
  customRate?: number;
  eggsAfterScan?: number | null;
  chicksHatched?: number | null;
}): { rate: number; amountDue: number } => {
  const sc = String(record.specialCase || 'Standard').trim();
  const stdRate = getStandardRateBySpecies(record.eggType);
  let rate = stdRate;

  if (sc === '150 Per Egg Brought' || sc === 'Discount') {
    rate = 150;
  } else if (sc === 'Free') {
    rate = 0;
  } else if (sc === 'Custom') {
    if (record.customRate !== undefined && record.customRate !== null && isValidNonNegativeNumber(record.customRate) && Number(record.customRate) > 0) {
      rate = Number(record.customRate);
    } else if (record.ratePerEgg !== undefined && record.ratePerEgg !== null && isValidNonNegativeNumber(record.ratePerEgg) && Number(record.ratePerEgg) > 0) {
      rate = Number(record.ratePerEgg);
    } else {
      rate = stdRate;
    }
  } else {
    // Standard, Per Chick, Per Egg After Scan
    if (record.customRate !== undefined && record.customRate !== null && isValidNonNegativeNumber(record.customRate) && Number(record.customRate) > 0) {
      rate = Number(record.customRate);
    } else if (record.ratePerEgg !== undefined && record.ratePerEgg !== null && isValidNonNegativeNumber(record.ratePerEgg) && Number(record.ratePerEgg) > 0 && record.ratePerEgg !== 200 && record.ratePerEgg !== 150 && record.ratePerEgg !== 500 && record.ratePerEgg !== 100) {
      rate = Number(record.ratePerEgg);
    } else {
      rate = stdRate;
    }
  }

  const eggs = Number(record.eggsCollected || 0);

  if (sc === 'Free') {
    return { rate: 0, amountDue: 0 };
  }
  if (sc === '150 Per Egg Brought' || sc === 'Discount') {
    return { rate: 150, amountDue: eggs * 150 };
  }
  if (sc === 'Per Chick') {
    const hatched = (record.chicksHatched !== null && record.chicksHatched !== undefined && !isNaN(Number(record.chicksHatched)))
      ? Number(record.chicksHatched)
      : 0;
    return { rate, amountDue: hatched * rate };
  }
  if (sc === 'Per Egg After Scan') {
    const scanned = (record.eggsAfterScan !== null && record.eggsAfterScan !== undefined && !isNaN(Number(record.eggsAfterScan)))
      ? Number(record.eggsAfterScan)
      : 0;
    return { rate, amountDue: scanned * rate };
  }

  // Standard
  return { rate, amountDue: eggs * rate };
};

let cachedDb: any = null;

function loadDb(): any {
  if (cachedDb) {
    return structuredClone(cachedDb);
  }

  if (!fs.existsSync(DB_FILE)) {
    const initial = getInitialDb();
    const tmpFile = `${DB_FILE}.${crypto.randomUUID()}.tmp`;
    try {
      fs.writeFileSync(tmpFile, JSON.stringify(initial, null, 2), "utf-8");
      fs.renameSync(tmpFile, DB_FILE);
    } catch (err) {
      try { fs.unlinkSync(tmpFile); } catch (_) {}
      throw err;
    }
    cachedDb = initial;
  } else {
    try {
      const content = fs.readFileSync(DB_FILE, "utf-8");
      cachedDb = JSON.parse(content);
    } catch (err) {
      console.error("Failed to read database file; refusing to replace existing farm records:", err);
      throw err;
    }
  }

  const db = cachedDb;

  // Defensively ensure all database collections are arrays
  if (!Array.isArray(db.users)) db.users = [];
  if (!Array.isArray(db.clients)) db.clients = [];
  if (!Array.isArray(db.incubator_records)) db.incubator_records = [];
  if (!Array.isArray(db.flocks)) db.flocks = [];
  if (!Array.isArray(db.feed_records)) db.feed_records = [];
  if (!Array.isArray(db.poultry_sales)) db.poultry_sales = [];
  if (!Array.isArray(db.mortality)) db.mortality = [];
  if (!Array.isArray(db.expenses)) db.expenses = [];
  if (!Array.isArray(db.cage_transfers)) db.cage_transfers = [];
  if (!Array.isArray(db.daily_egg_collections)) db.daily_egg_collections = [];
  if (!Array.isArray(db.fowls_eaten)) db.fowls_eaten = [];
  ensureFarmArrays(db);

  // An intentionally empty flock list is valid. Seeding happens only when a new DB is created.

  // Auto sanitize any legacy text misuse where flock.name or alloc.flockName is raw text like "7 cocks+1hen" or "7 turkey + 2 chicks"
  if (Array.isArray(db.flocks)) {
    db.flocks.forEach((flock: any, idx: number) => {
      sanitizeFlockOrAlloc(flock, idx);
    });
  }
  if (Array.isArray(db.cage_allocations)) {
    db.cage_allocations.forEach((alloc: any, idx: number) => {
      sanitizeFlockOrAlloc(alloc, idx);
    });
  }

  // Ensure incubator records calculations are sanitized and 100% accurate
  let needsSave = false;
  if (Array.isArray(db.incubator_records) && Array.isArray(db.clients)) {
    db.incubator_records.forEach((r: any) => {
      const client = db.clients.find((c: any) => c.id === r.clientId);
      if (client && client.specialCase && (!r.specialCase || r.specialCase === 'Standard')) {
        r.specialCase = client.specialCase;
        needsSave = true;
      }
      const computed = computeAmountDue(r);
      if (r.ratePerEgg !== computed.rate || r.amountDue !== computed.amountDue) {
        r.ratePerEgg = computed.rate;
        r.amountDue = computed.amountDue;
        needsSave = true;
      }
    });
  }

  // Ensure cages list is initialized if missing
  if (!db.cages || !Array.isArray(db.cages)) {
    db.cages = [...DEFAULT_CAGES];
  }

  // Ensure cage allocations list is initialized
  if (!db.cage_allocations || !Array.isArray(db.cage_allocations)) {
    db.cage_allocations = [];
    if (db.flocks && db.flocks.length > 0) {
      db.flocks.forEach((flock: any) => {
        if (flock.quantity > 0) {
          const cName = (flock.notes || "").replace(/\s*\(.*\)/g, "").trim() || "ST 1";
          const bName = findBlockNameForCage(cName, db.cages);
          db.cage_allocations.push({
            id: crypto.randomUUID(),
            blockName: bName,
            cageName: cName,
            flockName: flock.name,
            species: flock.species || "Chicken",
            quantity: flock.quantity,
            ageWeeks: flock.ageWeeks || 0,
            dateAdded: flock.dateAdded || cameroonDate(),
            dateTransferred: flock.dateAdded || cameroonDate(),
            notes: flock.notes || ""
          });
        }
      });
    }
  }

  updateFlocksAge(db);
  cachedDb = db;

  if (needsSave) {
    saveDb(db);
  }

  return structuredClone(cachedDb);
}

let dbVersion = Date.now();

function saveDbLocalFileOnly(data: any) {
  const tmpFile = `${DB_FILE}.${crypto.randomUUID()}.tmp`;
  try {
    const json = JSON.stringify(data);
    fs.writeFileSync(tmpFile, json, "utf-8");
    fs.renameSync(tmpFile, DB_FILE);
    cachedDb = data;
    dbVersion += 1;
  } catch (err) {
    try { fs.unlinkSync(tmpFile); } catch (_) {}
    console.error("Failed to safely persist local database file:", err);
    throw err;
  }
}

class CloudConflictError extends Error {}

async function refreshFromCloud() {
  if (!cloudDocument) return;
  await cloudWriteQueue;
  const snapshot = await cloudDocument.get();
  if (!snapshot.exists || !snapshot.data()) {
    throw new Error('The farm cloud database is missing. Check the Firebase project before continuing.');
  }
  const cloudData = snapshot.data()!;
  const revision = Number(cloudData._revision ?? 0);
  if (!Number.isSafeInteger(revision) || revision < 0) throw new Error('Invalid cloud database revision.');
  if (!cachedDb || cloudRevision !== revision || cachedDb._updatedAt !== cloudData._updatedAt) {
    saveDbLocalFileOnly(cloudData);
    cloudRevision = revision;
  }
}

// The cloud document is authoritative. A checked-in or stale local JSON file never uploads on boot.
const firestoreHydration = refreshFromCloud();

function saveDb(data: any) {
  const activity = activityContext.getStore();
  if (activity && !activity.logged) {
    (data.activity_log ||= []).unshift({ id: crypto.randomUUID(), at: new Date().toISOString(), actor: activity.actor, action: activity.action, detail: activity.detail });
    data.activity_log = data.activity_log.slice(0, 100);
    activity.logged = true;
  }
  data._updatedAt = new Date().toISOString();
  if (!cloudDocument || !firestoreDb) {
    saveDbLocalFileOnly(data);
    return;
  }
  const sanitized = JSON.parse(JSON.stringify(data));
  if (Buffer.byteLength(JSON.stringify(sanitized), 'utf8') > 900_000) {
    throw new Error('Farm database is nearing the Firestore document limit. Export a backup before adding more records.');
  }
  cachedDb = sanitized;
  const operation = cloudWriteQueue.then(async () => {
    const nextRevision = await firestoreDb.runTransaction(async transaction => {
      const snapshot = await transaction.get(cloudDocument);
      if (!snapshot.exists) throw new CloudConflictError('The farm cloud database was removed.');
      const currentRevision = Number(snapshot.data()?._revision ?? 0);
      if (currentRevision !== cloudRevision) throw new CloudConflictError('Farm data changed on another device. Please reload and try again.');
      transaction.set(cloudDocument, { ...sanitized, _revision: currentRevision + 1 });
      return currentRevision + 1;
    });
    cloudRevision = nextRevision;
    cachedDb = { ...sanitized, _revision: nextRevision };
    try { saveDbLocalFileOnly(cachedDb); }
    catch (error) { console.error('Cloud save succeeded, but the disposable local cache could not be updated:', error); }
  });
  cloudWriteQueue = operation.catch(() => {});
  const pending = requestSaves.getStore();
  if (pending) pending.push(operation);
  else operation.catch(error => console.error('Background cloud update failed; next request will reload the authoritative data:', error));
}

function syncFlockWithAllRelatedTables(db: any, flock: any, oldName?: string) {
  if (!db || !flock) return;
  const flockId = flock.id;
  const flockNameNorm = flock.name ? flock.name.trim().toLowerCase() : '';
  const oldNameNorm = oldName ? oldName.trim().toLowerCase() : flockNameNorm;

  // 1. Sync db.cage_allocations
  if (Array.isArray(db.cage_allocations)) {
    db.cage_allocations.forEach((alloc: any, aIdx: number) => {
      const allocFlockNameNorm = alloc.flockName ? alloc.flockName.trim().toLowerCase() : '';
      const isMatch = alloc.id === `flock-${flockId}` ||
                      alloc.id === `alloc-${flockId}` ||
                      alloc.id === flockId ||
                      (allocFlockNameNorm && (allocFlockNameNorm === oldNameNorm || allocFlockNameNorm === flockNameNorm));
      if (isMatch) {
        db.cage_allocations[aIdx] = {
          ...alloc,
          flockName: flock.name,
          species: flock.species || alloc.species,
          quantity: flock.quantity,
          ageWeeks: flock.ageWeeks !== undefined ? flock.ageWeeks : alloc.ageWeeks,
          dateAdded: flock.dateAdded || alloc.dateAdded,
          countMode: flock.countMode || alloc.countMode,
          cocksCount: flock.cocksCount !== undefined ? flock.cocksCount : alloc.cocksCount,
          hensCount: flock.hensCount !== undefined ? flock.hensCount : alloc.hensCount,
          speciesBreakdown: flock.speciesBreakdown || alloc.speciesBreakdown,
          notes: flock.notes || alloc.notes
        };
      }
    });
  }

  // 2. Sync db.mortality flock names
  if (Array.isArray(db.mortality)) {
    db.mortality.forEach((m: any) => {
      if (m.flockId === flockId || (m.flockName && m.flockName.trim().toLowerCase() === oldNameNorm)) {
        m.flockName = flock.name;
      }
    });
  }

  // 3. Sync db.fowls_eaten flock names
  if (Array.isArray(db.fowls_eaten)) {
    db.fowls_eaten.forEach((fe: any) => {
      if (fe.flockId === flockId || (fe.flockName && fe.flockName.trim().toLowerCase() === oldNameNorm)) {
        fe.flockName = flock.name;
      }
    });
  }

  // 4. Sync db.poultry_sales flock names
  if (Array.isArray(db.poultry_sales)) {
    db.poultry_sales.forEach((s: any) => {
      if (s.flockId === flockId || (s.notes && s.notes.trim().toLowerCase() === oldNameNorm)) {
        s.flockName = flock.name;
      }
    });
  }
}

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  return `scrypt:${salt}:${crypto.scryptSync(password, salt, 64).toString('hex')}`;
}

function verifyPassword(password: string, stored: string): boolean {
  if (stored?.startsWith('scrypt:')) {
    const [, salt, expectedHex] = stored.split(':');
    if (!salt || !expectedHex || expectedHex.length !== 128) return false;
    return crypto.timingSafeEqual(crypto.scryptSync(password, salt, 64), Buffer.from(expectedHex, 'hex'));
  }
  const legacy = crypto.createHash('sha256').update(password).digest('hex');
  return typeof stored === 'string' && stored.length === legacy.length &&
    crypto.timingSafeEqual(Buffer.from(legacy), Buffer.from(stored));
}

async function startServer() {
  await firestoreHydration;
  const app = express();
  app.set('trust proxy', 1);
  const PORT = Number(process.env.PORT || 3000);
  const HOST = process.env.NVF_HOST || '0.0.0.0';
  const loginAttempts = new Map<string, { count: number; resetAt: number }>();
  let localRecoveryAvailable = process.env.NVF_LOCAL_ACCOUNT_RECOVERY === '1' &&
    !cloudDocument && process.env.NVF_HOST === '127.0.0.1' && !fs.existsSync(LOCAL_RECOVERY_MARKER);

  function canUseLocalRecovery(req: express.Request): boolean {
    const address = req.socket.remoteAddress;
    return localRecoveryAvailable && (address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1');
  }

  app.use(express.json());

  const allowedOrigins = new Set((process.env.NVF_ALLOWED_ORIGINS || '').split(',').map(origin => origin.trim()).filter(Boolean));
  app.use('/api', (req, res, next) => {
    const origin = req.get('Origin');
    if (!origin) return next();
    const sameHost = origin === `${req.protocol}://${req.get('host')}`;
    if (!sameHost && !allowedOrigins.has(origin)) {
      return res.status(403).json({ error: 'This app origin is not allowed to access the farm API.' });
    }
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, If-None-Match, X-Auth-Token');
    if (req.method === 'OPTIONS') return res.status(204).end();
    next();
  });

  // A family request sees the latest cloud revision and cannot report success until its write commits.
  let apiRequestTail = Promise.resolve();
  app.use('/api', async (_req, res, next) => {
    if (!cloudDocument) return requestSaves.run([], next);
    const previous = apiRequestTail;
    let release!: () => void;
    apiRequestTail = new Promise<void>(resolve => { release = resolve; });
    await previous;
    let released = false;
    const finish = () => { if (!released) { released = true; release(); } };
    res.once('finish', finish);
    res.once('close', finish);
    try {
      await refreshFromCloud();
    } catch (error) {
      console.error('Cloud database is unavailable:', error);
      return res.status(503).json({ error: 'Farm data is temporarily unavailable. No change was saved; please try again later.' });
    }
    requestSaves.run([], () => {
      const send = res.send.bind(res);
      res.send = ((body?: any) => {
        const pending = requestSaves.getStore() || [];
        if (!pending.length) return send(body);
        Promise.all(pending).then(() => send(body)).catch(error => {
          console.error('Cloud save failed:', error);
          res.removeHeader('Content-Length');
          res.status(error instanceof CloudConflictError ? 409 : 503);
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          send(JSON.stringify({ error: error instanceof CloudConflictError
            ? 'Farm data changed on another device. Please reload and try again.'
            : 'Farm data was not saved to the cloud. Please try again.' }));
        });
        return res;
      }) as typeof res.send;
      next();
    });
  });

  // --- AUTHENTICATION MIDDLEWARE ---
  function getAuthorizedUser(req: express.Request): any | null {
    const token = req.headers["authorization"] || req.headers["x-auth-token"];
    if (token) {
      const db = loadDb();
      const tokenHash = crypto.createHash('sha256').update(String(token).replace(/^Bearer\s+/i, '')).digest('hex');
      const session = (db.sessions || []).find((s: any) => s.tokenHash === tokenHash && s.expiresAt > Date.now());
      const user = session && db.users.find((u: any) => u.id === session.userId);
      if (user) return user;
    }
    return OPEN_ACCESS ? { id: 'operator', username: 'operator', name: 'Farm member' } : null;
  }

  function requireAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
    const user = getAuthorizedUser(req);
    if (!user) {
      return res.status(401).json({ error: "Unauthorized access: Please sign in." });
    }
    next();
  }

  // Keep a small shared history in the same save as each authenticated farm change.
  app.use('/api', (req, _res, next) => {
    if (!['POST', 'PUT', 'DELETE'].includes(req.method) || req.path.startsWith('/auth') || req.path === '/sync') return next();
    const user = getAuthorizedUser(req);
    if (!user) return next();
    const label = req.path.startsWith('/farm/actions') ? String(req.body?.kind || 'farm record').replace(/_/g, ' ')
      : req.path.startsWith('/daily_egg_collections') ? 'daily egg collection'
      : req.path.startsWith('/cage-count-corrections') ? 'cage count correction'
      : req.path.startsWith('/cage_transfers') ? 'cage move'
      : req.path.startsWith('/cage_allocations') ? 'cage allocation'
      : req.path.startsWith('/flocks') ? 'flock'
      : req.path.startsWith('/sales') ? 'sale'
      : req.path.startsWith('/mortality') ? 'animal loss'
      : req.path.startsWith('/fowls-eaten') ? 'animals used at home'
      : req.path.startsWith('/incubator') ? 'incubator batch'
      : req.path.startsWith('/clients') ? 'client record'
      : req.path.startsWith('/feed') ? 'feed record'
      : req.path.startsWith('/expenses') ? 'expense'
      : req.path.startsWith('/cages') ? 'cage'
      : 'farm record';
    const verb = req.method === 'POST' ? 'Recorded' : req.method === 'PUT' ? 'Updated' : 'Removed';
    const farmKind = String(req.body?.kind || '');
    const action = req.path.startsWith('/farm/actions') && farmKind === 'cage_count_correct' ? 'Corrected cage count'
      : req.path.startsWith('/farm/actions') && farmKind.endsWith('_void') ? `Reversed ${farmKind.slice(0, -5).replace(/_/g, ' ')}`
      : `${verb} ${label}`;
    const detail = req.path.startsWith('/farm/actions') && req.body?.kind === 'cage_count_correct' ? String(req.body?.payload?.reason || '').trim().slice(0, 160) : undefined;
    activityContext.run({ actor: String(user.name || user.username || 'Family member'), action, detail, logged: false }, next);
  });

  // --- API ENDPOINTS ---

  // Auth Info: Check if setup is needed
  app.get("/api/auth/status", (req, res) => {
    const db = loadDb();
    res.json({
      setupRequired: !OPEN_ACCESS && db.users.length === 0,
      userCount: db.users.length,
      authDisabled: OPEN_ACCESS,
      localRecoveryAllowed: !OPEN_ACCESS && canUseLocalRecovery(req)
    });
  });

  // User Sign-up/Register (Max 5 family members)
  app.post("/api/auth/register", (req, res) => {
    if (OPEN_ACCESS) return res.status(410).json({ error: 'Accounts are disabled in open access mode.' });
    const { username, password, name } = req.body;
    if (typeof username !== 'string' || typeof password !== 'string' || typeof name !== 'string' || !username.trim() || !name.trim() || password.length < 8) {
      return res.status(400).json({ error: "Enter a name, username and password of at least 8 characters." });
    }

    const db = loadDb();
    const signedInUser = db.users.length > 0 ? getAuthorizedUser(req) : null;
    const usingLocalRecovery = db.users.length > 0 && canUseLocalRecovery(req) && !signedInUser;
    if (db.users.length > 0 && !usingLocalRecovery && !signedInUser) {
      return res.status(401).json({ error: 'A signed-in family member must add new users.' });
    }
    if (db.users.length >= 10) {
      return res.status(400).json({ error: "Registration limit reached. Maximum 10 family members allowed." });
    }

    const normalizedUser = username.trim().toLowerCase();
    const exists = db.users.some((u: any) => u.username.toLowerCase() === normalizedUser);
    if (exists) {
      return res.status(400).json({ error: "Username already taken." });
    }

    const newUser = {
      id: crypto.randomUUID(),
      username: username.trim(),
      passwordHash: hashPassword(password),
      name: name.trim()
    };

    db.users.push(newUser);
    if (usingLocalRecovery) {
      try { fs.writeFileSync(LOCAL_RECOVERY_MARKER, new Date().toISOString(), { flag: 'wx' }); }
      catch (error) {
        console.error('Could not reserve the one-time local account recovery:', error);
        return res.status(503).json({ error: 'Local account recovery could not start. Please try again.' });
      }
    }
    try { saveDb(db); }
    catch (error) {
      if (usingLocalRecovery) {
        try { fs.unlinkSync(LOCAL_RECOVERY_MARKER); } catch (_) {}
      }
      throw error;
    }
    if (usingLocalRecovery) {
      localRecoveryAvailable = false;
    }

    res.json({
      success: true,
      user: { id: newUser.id, username: newUser.username, name: newUser.name }
    });
  });

  // User Authentication login
  app.post("/api/auth/login", (req, res) => {
    if (OPEN_ACCESS) return res.status(410).json({ error: 'Sign-in is disabled in open access mode.' });
    const { username, password } = req.body;
    if (typeof username !== 'string' || typeof password !== 'string' || !username.trim() || !password) {
      return res.status(400).json({ error: "Username and password are required." });
    }

    const db = loadDb();
    const norm = username.trim().toLowerCase();
    const attempt = loginAttempts.get(norm);
    if (attempt && attempt.resetAt > Date.now() && attempt.count >= 10) {
      return res.status(429).json({ error: 'Too many sign-in attempts. Try again in 15 minutes.' });
    }
    const user = db.users.find((u: any) => u.username.toLowerCase() === norm);

    if (!user || !verifyPassword(password, user.passwordHash)) {
      loginAttempts.set(norm, { count: attempt && attempt.resetAt > Date.now() ? attempt.count + 1 : 1, resetAt: attempt && attempt.resetAt > Date.now() ? attempt.resetAt : Date.now() + 15 * 60 * 1000 });
      return res.status(401).json({ error: "Invalid username or password." });
    }
    loginAttempts.delete(norm);

    if (!user.passwordHash.startsWith('scrypt:')) user.passwordHash = hashPassword(password);
    const sessionToken = crypto.randomBytes(32).toString('hex');
    db.sessions = (db.sessions || []).filter((s: any) => s.expiresAt > Date.now());
    db.sessions.push({ userId: user.id, tokenHash: crypto.createHash('sha256').update(sessionToken).digest('hex'), expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000 });
    saveDb(db);

    res.json({
      success: true,
      token: sessionToken,
      user: { id: user.id, username: user.username, name: user.name }
    });
  });

  app.post('/api/auth/logout', requireAuth, (req, res) => {
    if (OPEN_ACCESS) return res.status(410).json({ error: 'Sign-out is disabled in open access mode.' });
    const db = loadDb();
    const token = String(req.headers.authorization || req.headers['x-auth-token'] || '').replace(/^Bearer\s+/i, '');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    db.sessions = (db.sessions || []).filter((s: any) => s.tokenHash !== tokenHash);
    saveDb(db);
    res.json({ success: true });
  });

  // Fetch full data snapshot
  app.get("/api/data", requireAuth, (req, res) => {
    const db = loadDb();

    // Fast single-pass client stats calculation O(N + M)
    const clientStatsMap: Record<string, { totalDue: number; totalOverdraftUsed: number; totalPaid: number }> = {};
    if (Array.isArray(db.incubator_records)) {
      db.incubator_records.forEach((r: any) => {
        if (!r || !r.clientId) return;
        if (!clientStatsMap[r.clientId]) {
          clientStatsMap[r.clientId] = { totalDue: 0, totalOverdraftUsed: 0, totalPaid: 0 };
        }
        const entry = clientStatsMap[r.clientId];
        entry.totalDue += (Number(r.amountDue) || 0);
        entry.totalOverdraftUsed += (Number(r.overdraftUsed) || 0);
        entry.totalPaid += (Number(r.amountPaid) || 0);
      });
    }

    let dbChanged = false;
    if (Array.isArray(db.clients)) {
      db.clients.forEach((c: any) => {
        const stats = clientStatsMap[c.id] || { totalDue: 0, totalOverdraftUsed: 0, totalPaid: 0 };
        const netDue = Math.max(0, stats.totalDue - stats.totalOverdraftUsed);
        const calculatedOverdraft = stats.totalPaid > netDue ? (stats.totalPaid - netDue) : 0;

        if (c.overdraft !== calculatedOverdraft) {
          c.overdraft = calculatedOverdraft;
          dbChanged = true;
        }
      });
    }

    if (dbChanged) {
      saveDb(db);
    }

    const etag = `W/"v${dbVersion}"`;
    res.setHeader('ETag', etag);

    if (req.headers['if-none-match'] === etag) {
      return res.status(304).end();
    }

    // Exclude security hashes
    const safeUsers = OPEN_ACCESS ? [] : (db.users || []).map((u: any) => ({ id: u.id, username: u.username, name: u.name }));
    res.json({
      users: safeUsers,
      clients: db.clients || [],
      incubator_records: db.incubator_records || [],
      flocks: db.flocks || [],
      feed_records: db.feed_records || [],
      poultry_sales: db.poultry_sales || [],
      mortality: db.mortality || [],
      expenses: db.expenses || [],
      cage_transfers: db.cage_transfers || [],
      cages: db.cages || [],
      cage_allocations: db.cage_allocations || [],
      daily_egg_collections: db.daily_egg_collections || [],
      fowls_eaten: db.fowls_eaten || [],
      rabbits: db.rabbits || [],
      rabbit_hutches: db.rabbit_hutches || [],
      rabbit_breedings: db.rabbit_breedings || [],
      rabbit_litters: db.rabbit_litters || [],
      rabbit_moves: db.rabbit_moves || [],
      rabbit_losses: db.rabbit_losses || [],
      rabbit_sales: db.rabbit_sales || [],
      rabbit_eaten: db.rabbit_eaten || [],
      animal_care: db.animal_care || [],
      quail_egg_use: db.quail_egg_use || [],
      cage_count_corrections: db.cage_count_corrections || [],
      activity_log: db.activity_log || []
    });
  });

  // A single validated operation keeps linked animals, stock, sales and egg use together.
  app.post('/api/farm/actions', requireAuth, (req, res) => {
    try {
      const db = loadDb();
      const result = applyFarmAction(db, req.body);
      if (req.body?.kind === 'cage_count_correct' && result && typeof result === 'object' && !('alreadySaved' in result)) {
        (result as any).recordedBy = getAuthorizedUser(req)?.name || 'Family member';
        const activity = activityContext.getStore();
        if (activity) activity.detail = `${(result as any).cageName} · ${(result as any).flockName}: ${(result as any).previousQuantity} → ${(result as any).quantity}. Why: ${(result as any).reason}`.slice(0, 260);
      }
      if (result && typeof result === 'object' && 'alreadySaved' in result) return res.json({ success: true, result });
      saveDb(db);
      res.json({ success: true, result });
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : 'Could not save farm record.' });
    }
  });

  // GET simple db configuration
  app.get("/api/db-raw", requireAuth, (req, res) => {
    const db = loadDb();
    const { users, sessions, ...clean } = db;
    res.json(clean);
  });

  // --- MODULE 2: POULTRY FARM ---

  // Flocks
  app.post("/api/flocks", requireAuth, (req, res) => {
    const db = loadDb();
    const { id, name, breed, quantity, ageWeeks, dateAdded, notes, species, countMode, cocksCount, hensCount, speciesBreakdown } = req.body;
    
    if (!name || !breed || quantity === undefined || ageWeeks === undefined || !dateAdded) {
      return res.status(400).json({ error: "Missing required flock parameters." });
    }
    
    if (!isValidNonNegativeNumber(quantity)) {
      return res.status(400).json({ error: "Quantity must be a valid non-negative number." });
    }
    if (!isValidNonNegativeNumber(ageWeeks)) {
      return res.status(400).json({ error: "Age (in weeks) must be a valid non-negative number." });
    }
    
    const flockId = id || crypto.randomUUID();
    const existsIndex = db.flocks.findIndex((f: any) => f.id === flockId);

    const newFlock = {
      id: flockId,
      name: String(name).trim(),
      breed: String(breed).trim(),
      quantity: Number(quantity),
      ageWeeks: Number(ageWeeks),
      dateAdded: String(dateAdded),
      species: species ? String(species) : 'Chicken',
      countMode: countMode || 'single',
      cocksCount: cocksCount !== undefined ? Number(cocksCount) : undefined,
      hensCount: hensCount !== undefined ? Number(hensCount) : undefined,
      speciesBreakdown: Array.isArray(speciesBreakdown) ? speciesBreakdown : [],
      notes: notes ? String(notes).trim() : "",
      initialAgeWeeks: Number(ageWeeks)
    };

    if (existsIndex !== -1) {
      db.flocks[existsIndex] = newFlock;
    } else {
      db.flocks.push(newFlock);
    }
    saveDb(db);
    res.json(newFlock);
  });

  app.put("/api/flocks/:id", requireAuth, (req, res) => {
    const db = loadDb();
    const { id } = req.params;
    const flockIndex = db.flocks.findIndex((f: any) => f.id === id);
    if (flockIndex === -1) return res.status(404).json({ error: "Flock not found." });

    const oldFlock = db.flocks[flockIndex];
    const oldName = oldFlock.name;
    const { name, breed, quantity, ageWeeks, dateAdded, notes, species, countMode, cocksCount, hensCount, speciesBreakdown } = req.body;

    if (quantity !== undefined && !isValidNonNegativeNumber(quantity)) {
      return res.status(400).json({ error: "Quantity must be a valid non-negative number." });
    }
    if (ageWeeks !== undefined && !isValidNonNegativeNumber(ageWeeks)) {
      return res.status(400).json({ error: "Age (in weeks) must be a valid non-negative number." });
    }
    
    const updatedAgeWeeks = ageWeeks !== undefined ? Number(ageWeeks) : oldFlock.ageWeeks;
    const updatedDateAdded = dateAdded !== undefined ? String(dateAdded) : oldFlock.dateAdded;

    const updatedFlock = {
      ...oldFlock,
      name: name !== undefined ? String(name).trim() : oldFlock.name,
      breed: breed !== undefined ? String(breed).trim() : oldFlock.breed,
      quantity: quantity !== undefined ? Number(quantity) : oldFlock.quantity,
      ageWeeks: updatedAgeWeeks,
      dateAdded: updatedDateAdded,
      species: species !== undefined ? String(species) : (oldFlock.species || 'Chicken'),
      countMode: countMode !== undefined ? countMode : oldFlock.countMode,
      cocksCount: cocksCount !== undefined ? Number(cocksCount) : oldFlock.cocksCount,
      hensCount: hensCount !== undefined ? Number(hensCount) : oldFlock.hensCount,
      speciesBreakdown: Array.isArray(speciesBreakdown) ? speciesBreakdown : oldFlock.speciesBreakdown,
      notes: notes !== undefined ? String(notes).trim() : oldFlock.notes,
      initialAgeWeeks: updatedAgeWeeks
    };

    db.flocks[flockIndex] = updatedFlock;

    // Synchronize connected cage allocations
    if (Array.isArray(db.cage_allocations)) {
      db.cage_allocations.forEach((alloc: any, aIdx: number) => {
        const isMatch = alloc.id === `flock-${id}` ||
          (alloc.flockName && alloc.flockName.trim().toLowerCase() === oldName.trim().toLowerCase()) ||
          (alloc.flockName && alloc.flockName.trim().toLowerCase() === updatedFlock.name.trim().toLowerCase());
        if (isMatch) {
          db.cage_allocations[aIdx] = {
            ...alloc,
            flockName: updatedFlock.name,
            species: updatedFlock.species,
            quantity: updatedFlock.quantity,
            ageWeeks: updatedFlock.ageWeeks,
            speciesBreakdown: updatedFlock.speciesBreakdown,
            notes: updatedFlock.notes || alloc.notes
          };
        }
      });
    }

    // Synchronize references in related tables if flock name changed
    if (oldName.trim().toLowerCase() !== updatedFlock.name.trim().toLowerCase()) {
      if (Array.isArray(db.mortality)) {
        db.mortality.forEach((m: any) => {
          if (m.flockId === id || (m.flockName && m.flockName.trim().toLowerCase() === oldName.trim().toLowerCase())) {
            m.flockName = updatedFlock.name;
          }
        });
      }
      if (Array.isArray(db.fowls_eaten)) {
        db.fowls_eaten.forEach((fe: any) => {
          if (fe.flockId === id || (fe.flockName && fe.flockName.trim().toLowerCase() === oldName.trim().toLowerCase())) {
            fe.flockName = updatedFlock.name;
          }
        });
      }
      if (Array.isArray(db.poultry_sales)) {
        db.poultry_sales.forEach((s: any) => {
          if (s.flockId === id) {
            s.flockName = updatedFlock.name;
          }
        });
      }
    }

    saveDb(db);
    res.json(updatedFlock);
  });

  app.delete("/api/flocks/:id", requireAuth, (req, res) => {
    const db = loadDb();
    const { id } = req.params;
    const flockToDelete = db.flocks.find((f: any) => f.id === id);
    const targetName = flockToDelete?.name?.trim().toLowerCase();

    db.flocks = db.flocks.filter((f: any) => f.id !== id);
    db.mortality = db.mortality.filter((m: any) => m.flockId !== id); // Cascade delete references

    // Also remove or clean up cage allocation for deleted flock
    if (Array.isArray(db.cage_allocations)) {
      db.cage_allocations = db.cage_allocations.filter((a: any) => {
        if (a.id === `flock-${id}`) return false;
        if (targetName && a.flockName && a.flockName.trim().toLowerCase() === targetName) return false;
        return true;
      });
    }

    saveDb(db);
    res.json({ success: true });
  });

  // Bulk update flocks
  app.put("/api/flocks-bulk", requireAuth, (req, res) => {
    const db = loadDb();
    const { ids, updates } = req.body;
    if (!Array.isArray(ids) || ids.length === 0 || !updates) {
      return res.status(400).json({ error: "IDs array and updates object are required." });
    }

    let updatedCount = 0;
    db.flocks = db.flocks.map((f: any) => {
      if (ids.includes(f.id)) {
        updatedCount++;
        const newSpecies = updates.species !== undefined && updates.species !== '' ? String(updates.species) : f.species;
        const newBreed = updates.breed !== undefined && updates.breed !== '' ? String(updates.breed) : f.breed;
        const newAgeWeeks = updates.ageWeeks !== undefined && updates.ageWeeks !== '' ? Number(updates.ageWeeks) : f.ageWeeks;
        const newDateAdded = updates.dateAdded !== undefined && updates.dateAdded !== '' ? String(updates.dateAdded) : f.dateAdded;
        const newNotes = updates.notes !== undefined && updates.notes !== '' ? String(updates.notes) : f.notes;
        const newQuantity = updates.quantity !== undefined && updates.quantity !== '' ? Number(updates.quantity) : f.quantity;
        const newHensCount = updates.hensCount !== undefined && updates.hensCount !== '' ? Number(updates.hensCount) : f.hensCount;
        const newCocksCount = updates.cocksCount !== undefined && updates.cocksCount !== '' ? Number(updates.cocksCount) : f.cocksCount;
        const newCountMode = updates.countMode !== undefined && updates.countMode !== '' ? updates.countMode : f.countMode;

        const updated = {
          ...f,
          species: newSpecies,
          breed: newBreed,
          ageWeeks: isNaN(newAgeWeeks) ? f.ageWeeks : newAgeWeeks,
          dateAdded: newDateAdded,
          notes: newNotes,
          quantity: isNaN(newQuantity) ? f.quantity : newQuantity,
          initialAgeWeeks: isNaN(newAgeWeeks) ? f.initialAgeWeeks : newAgeWeeks,
          hensCount: newHensCount !== undefined ? newHensCount : f.hensCount,
          cocksCount: newCocksCount !== undefined ? newCocksCount : f.cocksCount,
          countMode: newCountMode !== undefined ? newCountMode : f.countMode
        };

        // Sync to cage_allocations
        if (Array.isArray(db.cage_allocations)) {
          db.cage_allocations.forEach((alloc: any, aIdx: number) => {
            if (alloc.id === `flock-${f.id}` || (alloc.flockName && alloc.flockName.trim().toLowerCase() === f.name.trim().toLowerCase())) {
              db.cage_allocations[aIdx] = {
                ...db.cage_allocations[aIdx],
                species: updated.species,
                quantity: updated.quantity,
                ageWeeks: updated.ageWeeks,
                notes: updated.notes || alloc.notes
              };
            }
          });
        }

        return updated;
      }
      return f;
    });

    saveDb(db);
    res.json({ success: true, updatedCount });
  });

  // Feed Records
  app.post("/api/feed", requireAuth, (req, res) => {
    const db = loadDb();
    const { id, date, feedType, species, bagsBought, weightPerBag, costBag, stockRemaining } = req.body;

    if (!date || !feedType || bagsBought === undefined || weightPerBag === undefined || costBag === undefined || stockRemaining === undefined) {
      return res.status(400).json({ error: "Missing required feed record fields." });
    }

    if (!isValidNonNegativeNumber(bagsBought) || !isValidNonNegativeNumber(weightPerBag) || !isValidNonNegativeNumber(costBag) || !isValidNonNegativeNumber(stockRemaining)) {
      return res.status(400).json({ error: "Feed numerical parameters (bags, weight, cost, stock) must be valid non-negative numbers." });
    }

    const feedId = id || crypto.randomUUID();
    const existsIndex = db.feed_records.findIndex((f: any) => f.id === feedId);

    const newFeed = {
      id: feedId,
      date: String(date),
      feedType: String(feedType).trim(),
      species: species === 'Rabbit' || species === 'Quail' ? species : 'Poultry',
      bagsBought: Number(bagsBought),
      weightPerBag: Number(weightPerBag),
      costBag: Number(costBag),
      totalCost: Number(bagsBought) * Number(costBag),
      stockRemaining: Number(stockRemaining)
    };

    if (existsIndex !== -1) {
      db.feed_records[existsIndex] = newFeed;
    } else {
      db.feed_records.push(newFeed);
    }
    saveDb(db);
    res.json(newFeed);
  });

  app.put("/api/feed/:id", requireAuth, (req, res) => {
    const db = loadDb();
    const { id } = req.params;
    const index = db.feed_records.findIndex((f: any) => f.id === id);
    if (index === -1) return res.status(404).json({ error: "Feed record not found." });

    const { date, feedType, species, bagsBought, weightPerBag, costBag, stockRemaining } = req.body;
    const item = db.feed_records[index];

    if (bagsBought !== undefined && !isValidNonNegativeNumber(bagsBought)) {
      return res.status(400).json({ error: "Bags bought must be a valid non-negative number." });
    }
    if (weightPerBag !== undefined && !isValidNonNegativeNumber(weightPerBag)) {
      return res.status(400).json({ error: "Weight per bag must be a valid non-negative number." });
    }
    if (costBag !== undefined && !isValidNonNegativeNumber(costBag)) {
      return res.status(400).json({ error: "Cost per bag must be a valid non-negative number." });
    }
    if (stockRemaining !== undefined && !isValidNonNegativeNumber(stockRemaining)) {
      return res.status(400).json({ error: "Stock remaining must be a valid non-negative number." });
    }

    const updatedBags = bagsBought !== undefined ? Number(bagsBought) : item.bagsBought;
    const updatedCost = costBag !== undefined ? Number(costBag) : item.costBag;

    db.feed_records[index] = {
      ...item,
      date: date !== undefined ? String(date) : item.date,
      feedType: feedType !== undefined ? String(feedType).trim() : item.feedType,
      species: species === undefined ? item.species : (species === 'Rabbit' || species === 'Quail' ? species : 'Poultry'),
      bagsBought: updatedBags,
      weightPerBag: weightPerBag !== undefined ? Number(weightPerBag) : item.weightPerBag,
      costBag: updatedCost,
      totalCost: updatedBags * updatedCost,
      stockRemaining: stockRemaining !== undefined ? Number(stockRemaining) : item.stockRemaining
    };

    saveDb(db);
    res.json(db.feed_records[index]);
  });

  app.delete("/api/feed/:id", requireAuth, (req, res) => {
    const db = loadDb();
    db.feed_records = db.feed_records.filter((f: any) => f.id !== req.params.id);
    saveDb(db);
    res.json({ success: true });
  });

  // Poultry Sales
  app.use(['/api/sales', '/api/mortality', '/api/fowls-eaten', '/api/bulk-delete', '/api/bulk-update'], requireAuth, (req, res, next) => {
    if (isProtectedFarmMutation(loadDb(), req.originalUrl.split('?')[0], req.method, req.body)) return res.status(409).json({ error: 'Use the linked Farm action to record or reverse rabbit and quail stock. This keeps animals, cages and balances together.' });
    next();
  });
  app.post("/api/sales", requireAuth, (req, res) => {
    const db = loadDb();
    const { id, date, itemType, quantity, unitPrice, buyerName, notes, flockId, ageWeeks } = req.body;

    if (!date || !itemType || quantity === undefined || unitPrice === undefined || !buyerName) {
      return res.status(400).json({ error: "Missing required sales fields." });
    }

    if (!isValidPositiveNumber(quantity)) {
      return res.status(400).json({ error: "Sales quantity must be a valid positive number." });
    }
    if (!isValidNonNegativeNumber(unitPrice)) {
      return res.status(400).json({ error: "Unit price must be a valid non-negative number." });
    }
    if (ageWeeks !== undefined && ageWeeks !== "" && ageWeeks !== null && !isValidNonNegativeNumber(ageWeeks)) {
      return res.status(400).json({ error: "Age (weeks) must be a valid non-negative number." });
    }

    const qtySold = Number(quantity);
    const price = Number(unitPrice);
    const saleId = id || crypto.randomUUID();
    const existsIndex = db.poultry_sales.findIndex((s: any) => s.id === saleId);

    // If a specific flock is targeted for deduction and this is a new sale
    if (flockId && existsIndex === -1) {
      const flockIndex = db.flocks.findIndex((f: any) => f.id === flockId);
      if (flockIndex !== -1) {
        const flock = db.flocks[flockIndex];
        flock.quantity = Math.max(0, flock.quantity - qtySold);
        if (Array.isArray(db.cage_allocations)) {
          db.cage_allocations.forEach((alloc: any, aIdx: number) => {
            if (alloc.id === `flock-${flock.id}` || (alloc.flockName && alloc.flockName.trim().toLowerCase() === flock.name.trim().toLowerCase())) {
              db.cage_allocations[aIdx].quantity = flock.quantity;
            }
          });
        }
      }
    }

    const newSale = {
      id: saleId,
      date: String(date),
      itemType: String(itemType),
      quantity: qtySold,
      unitPrice: price,
      totalAmount: qtySold * price,
      buyerName: String(buyerName).trim(),
      flockId: flockId || "",
      ageWeeks: ageWeeks !== undefined && ageWeeks !== "" && ageWeeks !== null ? Number(ageWeeks) : null,
      notes: notes ? String(notes).trim() : ""
    };

    if (existsIndex !== -1) {
      db.poultry_sales[existsIndex] = newSale;
    } else {
      db.poultry_sales.push(newSale);
    }
    saveDb(db);
    res.json(newSale);
  });

  app.put("/api/sales/:id", requireAuth, (req, res) => {
    const db = loadDb();
    const { id } = req.params;
    const index = db.poultry_sales.findIndex((s: any) => s.id === id);
    if (index === -1) return res.status(404).json({ error: "Sales entry not found." });

    const { date, itemType, quantity, unitPrice, buyerName, notes } = req.body;
    const item = db.poultry_sales[index];

    if (quantity !== undefined && !isValidPositiveNumber(quantity)) {
      return res.status(400).json({ error: "Quantity must be a valid positive number." });
    }
    if (unitPrice !== undefined && !isValidNonNegativeNumber(unitPrice)) {
      return res.status(400).json({ error: "Unit price must be a valid non-negative number." });
    }

    const updatedQty = quantity !== undefined ? Number(quantity) : item.quantity;
    const updatedPrice = unitPrice !== undefined ? Number(unitPrice) : item.unitPrice;

    db.poultry_sales[index] = {
      ...item,
      date: date !== undefined ? String(date) : item.date,
      itemType: itemType !== undefined ? String(itemType) : item.itemType,
      quantity: updatedQty,
      unitPrice: updatedPrice,
      totalAmount: updatedQty * updatedPrice,
      buyerName: buyerName !== undefined ? String(buyerName).trim() : item.buyerName,
      notes: notes !== undefined ? String(notes).trim() : item.notes
    };

    saveDb(db);
    res.json(db.poultry_sales[index]);
  });

  app.delete("/api/sales/:id", requireAuth, (req, res) => {
    const db = loadDb();
    db.poultry_sales = db.poultry_sales.filter((s: any) => s.id !== req.params.id);
    saveDb(db);
    res.json({ success: true });
  });

  // Mortality Records
  app.post("/api/mortality", requireAuth, (req, res) => {
    const db = loadDb();
    const { id, date, flockId, quantity, cause } = req.body;

    if (!date || !flockId || quantity === undefined) {
      return res.status(400).json({ error: "Missing required mortality record fields." });
    }

    if (!isValidPositiveNumber(quantity)) {
      return res.status(400).json({ error: "Mortality quantity must be a valid positive number." });
    }

    const flock = db.flocks.find((f: any) => f.id === flockId);
    if (!flock) return res.status(404).json({ error: "Flock does not exist." });

    const mortId = id || crypto.randomUUID();
    const existsIndex = db.mortality.findIndex((m: any) => m.id === mortId);

    const newMort = {
      id: mortId,
      date: String(date),
      flockId: String(flockId),
      flockName: flock.name,
      quantity: Number(quantity),
      cause: cause ? String(cause).trim() : ""
    };

    // Auto-update flock count if new
    if (existsIndex === -1) {
      flock.quantity = Math.max(0, flock.quantity - Number(quantity));
      if (Array.isArray(db.cage_allocations)) {
        db.cage_allocations.forEach((alloc: any, aIdx: number) => {
          if (alloc.id === `flock-${flock.id}` || (alloc.flockName && alloc.flockName.trim().toLowerCase() === flock.name.trim().toLowerCase())) {
            db.cage_allocations[aIdx].quantity = flock.quantity;
          }
        });
      }
      db.mortality.push(newMort);
    } else {
      db.mortality[existsIndex] = newMort;
    }

    saveDb(db);
    res.json(newMort);
  });

  app.delete("/api/mortality/:id", requireAuth, (req, res) => {
    const db = loadDb();
    const mortIndex = db.mortality.findIndex((m: any) => m.id === req.params.id);
    if (mortIndex === -1) return res.status(404).json({ error: "Record not found." });

    // Restore flock count? Let's optionally do that to keep stats honest
    const item = db.mortality[mortIndex];
    const flock = db.flocks.find((f: any) => f.id === item.flockId);
    if (flock) {
      flock.quantity += item.quantity;
    }

    db.mortality.splice(mortIndex, 1);
    saveDb(db);
    res.json({ success: true });
  });

  // Fowls Eaten (Home Consumption) Records
  app.post("/api/fowls-eaten", requireAuth, (req, res) => {
    const db = loadDb();
    const { id, date, flockId, quantity, ageWeeks, notes } = req.body;

    if (!date || !flockId || quantity === undefined) {
      return res.status(400).json({ error: "Missing required fields: date, flock, and quantity." });
    }

    if (!isValidPositiveNumber(quantity)) {
      return res.status(400).json({ error: "Quantity eaten must be a valid positive number." });
    }

    if (ageWeeks !== undefined && ageWeeks !== "" && ageWeeks !== null && !isValidNonNegativeNumber(ageWeeks)) {
      return res.status(400).json({ error: "Age (weeks) must be a valid non-negative number." });
    }

    const flock = db.flocks.find((f: any) => f.id === flockId);
    if (!flock) return res.status(404).json({ error: "Selected flock does not exist." });

    const eatenQty = Number(quantity);
    const eatenId = id || crypto.randomUUID();
    if (!Array.isArray(db.fowls_eaten)) db.fowls_eaten = [];
    const existsIndex = db.fowls_eaten.findIndex((fe: any) => fe.id === eatenId);

    const recordAge = ageWeeks !== undefined && ageWeeks !== "" && ageWeeks !== null ? Number(ageWeeks) : flock.ageWeeks;

    const newEaten = {
      id: eatenId,
      date: String(date),
      flockId: String(flockId),
      flockName: flock.name,
      species: flock.species || 'Chicken',
      breed: flock.breed || '',
      quantity: eatenQty,
      ageWeeks: recordAge,
      notes: notes ? String(notes).trim() : ""
    };

    if (existsIndex === -1) {
      // Subtract quantity immediately from the flock batch
      flock.quantity = Math.max(0, flock.quantity - eatenQty);
      if (Array.isArray(db.cage_allocations)) {
        db.cage_allocations.forEach((alloc: any, aIdx: number) => {
          if (alloc.id === `flock-${flock.id}` || (alloc.flockName && alloc.flockName.trim().toLowerCase() === flock.name.trim().toLowerCase())) {
            db.cage_allocations[aIdx].quantity = flock.quantity;
          }
        });
      }
      db.fowls_eaten.push(newEaten);
    } else {
      // If updating, adjust difference if needed
      const oldQty = db.fowls_eaten[existsIndex].quantity;
      const diff = eatenQty - oldQty;
      flock.quantity = Math.max(0, flock.quantity - diff);
      if (Array.isArray(db.cage_allocations)) {
        db.cage_allocations.forEach((alloc: any, aIdx: number) => {
          if (alloc.id === `flock-${flock.id}` || (alloc.flockName && alloc.flockName.trim().toLowerCase() === flock.name.trim().toLowerCase())) {
            db.cage_allocations[aIdx].quantity = flock.quantity;
          }
        });
      }
      db.fowls_eaten[existsIndex] = newEaten;
    }

    saveDb(db);
    res.json(newEaten);
  });

  app.delete("/api/fowls-eaten/:id", requireAuth, (req, res) => {
    const db = loadDb();
    if (!Array.isArray(db.fowls_eaten)) db.fowls_eaten = [];
    const index = db.fowls_eaten.findIndex((fe: any) => fe.id === req.params.id);
    if (index === -1) return res.status(404).json({ error: "Record not found." });

    const item = db.fowls_eaten[index];
    const flock = db.flocks.find((f: any) => f.id === item.flockId);
    if (flock) {
      // Restore the flock quantity if record deleted
      flock.quantity += item.quantity;
    }

    db.fowls_eaten.splice(index, 1);
    saveDb(db);
    res.json({ success: true });
  });

  // Cages Management (Blocks & Cages in Farm)
  app.get("/api/cages", requireAuth, (req, res) => {
    const db = loadDb();
    if (!db.cages) {
      db.cages = [...DEFAULT_CAGES];
      saveDb(db);
    }
    res.json(db.cages);
  });

  app.post("/api/cages", requireAuth, (req, res) => {
    const db = loadDb();
    const { blockName, cageName } = req.body;
    if (!blockName || !cageName) {
      return res.status(400).json({ error: "Block name and Cage name are required." });
    }

    const cleanBlock = String(blockName).trim().toUpperCase();
    const cleanCage = String(cageName).trim().toUpperCase();

    if (!db.cages) db.cages = [...DEFAULT_CAGES];

    const exists = db.cages.some((c: any) => c.cageName.toLowerCase() === cleanCage.toLowerCase());
    if (exists) {
      return res.status(400).json({ error: `Cage '${cleanCage}' already exists.` });
    }

    const newCage = {
      id: crypto.randomUUID(),
      blockName: cleanBlock,
      cageName: cleanCage
    };

    db.cages.push(newCage);
    saveDb(db);
    res.json(newCage);
  });

  app.delete("/api/cages/:id", requireAuth, (req, res) => {
    const db = loadDb();
    if (!db.cages) db.cages = [...DEFAULT_CAGES];
    const target = decodeURIComponent(req.params.id).trim().toLowerCase();
    const index = db.cages.findIndex((c: any) => 
      (c.id && String(c.id).trim().toLowerCase() === target) || 
      (c.cageName && String(c.cageName).trim().toLowerCase() === target)
    );

    if (index === -1) {
      return res.status(404).json({ error: "Cage not found in registry." });
    }

    const cage = db.cages[index];
    if ((db.rabbit_hutches || []).some((h: any) => h.id === cage.id || h.cageId === cage.id)) return res.status(409).json({ error: 'This cage is linked to rabbit housing and must be kept with its history.' });
    if ((db.cage_allocations || []).some((a: any) => a.cageName === cage.cageName && a.blockName === cage.blockName && a.quantity > 0)) return res.status(409).json({ error: 'Move the animals out before removing this cage.' });
    db.cages.splice(index, 1);
    saveDb(db);
    res.json({ success: true });
  });

  // Live Cage Allocations (Live Cage Block Distribution Table)
  app.get("/api/cage_allocations", requireAuth, (req, res) => {
    const db = loadDb();
    res.json(db.cage_allocations || []);
  });

  app.post("/api/cage_allocations", requireAuth, (req, res) => {
    const db = loadDb();
    const { blockName, cageName, flockName, species, quantity, ageWeeks, dateAdded, dateTransferred, notes, countMode, cocksCount, hensCount, speciesBreakdown } = req.body;

    if (!cageName || !flockName || quantity === undefined) {
      return res.status(400).json({ error: "Cage name, flock name, and quantity are required." });
    }

    if (!isValidNonNegativeNumber(quantity)) {
      return res.status(400).json({ error: "Quantity must be a valid non-negative number." });
    }

    if (ageWeeks !== undefined && ageWeeks !== "" && !isValidNonNegativeNumber(ageWeeks)) {
      return res.status(400).json({ error: "Age (weeks) must be a valid non-negative number." });
    }

    if (!db.cage_allocations) db.cage_allocations = [];
    const bName = blockName ? String(blockName).trim().toUpperCase() : findBlockNameForCage(cageName, db.cages);

    const newAlloc = {
      id: crypto.randomUUID(),
      blockName: bName,
      cageName: String(cageName).trim(),
      flockName: String(flockName).trim(),
      species: species || "Chicken",
      quantity: Number(quantity),
      ageWeeks: Number(ageWeeks) || 0,
      dateAdded: dateAdded || cameroonDate(),
      dateTransferred: dateTransferred || dateAdded || cameroonDate(),
      countMode: countMode || 'single',
      cocksCount: cocksCount !== undefined ? Number(cocksCount) : undefined,
      hensCount: hensCount !== undefined ? Number(hensCount) : undefined,
      speciesBreakdown: Array.isArray(speciesBreakdown) ? speciesBreakdown : [],
      notes: notes ? String(notes).trim() : ""
    };

    db.cage_allocations.push(newAlloc);
    saveDb(db);
    res.json(newAlloc);
  });

  app.put("/api/cage_allocations/:id", requireAuth, (req, res) => {
    const db = loadDb();
    const targetId = req.params.id;
    const linkedFlock = targetId.startsWith('flock-') ? (db.flocks || []).find((f: any) => f.id === targetId.slice(6)) : undefined;
    const existingAllocation = (db.cage_allocations || []).find((a: any) => a.id === targetId);
    const currentQuantity = linkedFlock?.quantity ?? existingAllocation?.quantity;
    if (req.body.quantity !== undefined && currentQuantity !== undefined && Number(req.body.quantity) !== Number(currentQuantity)) {
      return res.status(400).json({ error: 'Use Correct count so the change and its reason are recorded together.' });
    }

    if (req.body.quantity !== undefined && !isValidNonNegativeNumber(req.body.quantity)) {
      return res.status(400).json({ error: "Quantity must be a valid non-negative number." });
    }

    if (req.body.ageWeeks !== undefined && req.body.ageWeeks !== "" && !isValidNonNegativeNumber(req.body.ageWeeks)) {
      return res.status(400).json({ error: "Age (weeks) must be a valid non-negative number." });
    }

    if (targetId.startsWith("flock-")) {
      const flockId = targetId.replace("flock-", "");
      if (db.flocks) {
        const flockIdx = db.flocks.findIndex((f: any) => f.id === flockId);
        if (flockIdx !== -1) {
          const flock = db.flocks[flockIdx];
          if (req.body.flockName) flock.name = String(req.body.flockName).trim();
          if (req.body.quantity !== undefined) flock.quantity = Number(req.body.quantity);
          if (req.body.species) flock.species = String(req.body.species);
          if (req.body.cageName) flock.notes = String(req.body.cageName).trim();
          if (req.body.ageWeeks !== undefined) flock.ageWeeks = Number(req.body.ageWeeks);
          if (req.body.dateTransferred || req.body.dateAdded) flock.dateAdded = req.body.dateTransferred || req.body.dateAdded;
          if (req.body.countMode !== undefined) flock.countMode = req.body.countMode;
          if (req.body.cocksCount !== undefined) flock.cocksCount = Number(req.body.cocksCount);
          if (req.body.hensCount !== undefined) flock.hensCount = Number(req.body.hensCount);
          if (Array.isArray(req.body.speciesBreakdown)) flock.speciesBreakdown = req.body.speciesBreakdown;

          if (Array.isArray(db.cage_allocations)) {
            const allocIdx = db.cage_allocations.findIndex((a: any) => a.flockName === flock.name || a.id === targetId);
            if (allocIdx !== -1) {
              db.cage_allocations[allocIdx] = {
                ...db.cage_allocations[allocIdx],
                blockName: req.body.blockName ? String(req.body.blockName).trim().toUpperCase() : db.cage_allocations[allocIdx].blockName,
                cageName: req.body.cageName ? String(req.body.cageName).trim() : db.cage_allocations[allocIdx].cageName,
                flockName: flock.name,
                species: flock.species,
                quantity: flock.quantity,
                ageWeeks: flock.ageWeeks,
                notes: req.body.notes || db.cage_allocations[allocIdx].notes
              };
            }
          }

          saveDb(db);
          return res.json({
            id: targetId,
            blockName: req.body.blockName || 'BLOCK 0',
            cageName: flock.notes,
            flockName: flock.name,
            species: flock.species,
            quantity: flock.quantity,
            ageWeeks: flock.ageWeeks,
            dateAdded: flock.dateAdded,
            notes: req.body.notes || ''
          });
        }
      }
    }

    if (!db.cage_allocations) db.cage_allocations = [];
    const idx = db.cage_allocations.findIndex((a: any) => a.id === targetId);
    if (idx === -1) return res.status(404).json({ error: "Cage allocation record not found." });

    const existing = db.cage_allocations[idx];
    const updated = {
      ...existing,
      ...req.body,
      id: existing.id,
      quantity: req.body.quantity !== undefined ? Number(req.body.quantity) : existing.quantity,
      ageWeeks: req.body.ageWeeks !== undefined ? Number(req.body.ageWeeks) : existing.ageWeeks,
      blockName: req.body.blockName ? String(req.body.blockName).trim().toUpperCase() : existing.blockName,
      cageName: req.body.cageName ? String(req.body.cageName).trim() : existing.cageName,
      flockName: req.body.flockName ? String(req.body.flockName).trim() : existing.flockName,
      countMode: req.body.countMode !== undefined ? req.body.countMode : existing.countMode,
      cocksCount: req.body.cocksCount !== undefined ? Number(req.body.cocksCount) : existing.cocksCount,
      hensCount: req.body.hensCount !== undefined ? Number(req.body.hensCount) : existing.hensCount,
      speciesBreakdown: Array.isArray(req.body.speciesBreakdown) ? req.body.speciesBreakdown : existing.speciesBreakdown
    };

    if (db.flocks) {
      const matchedFlock = db.flocks.find((f: any) => f.name.trim().toLowerCase() === existing.flockName.trim().toLowerCase());
      if (matchedFlock) {
        if (updated.flockName) matchedFlock.name = updated.flockName;
        if (updated.quantity !== undefined) matchedFlock.quantity = updated.quantity;
        if (updated.cageName) matchedFlock.notes = updated.cageName;
        if (updated.species) matchedFlock.species = updated.species;
      }
    }

    db.cage_allocations[idx] = updated;
    saveDb(db);
    res.json(updated);
  });

  app.delete("/api/cage_allocations/:id", requireAuth, (req, res) => {
    const db = loadDb();
    const targetId = req.params.id;

    if (targetId.startsWith("flock-")) {
      const flockId = targetId.replace("flock-", "");
      if (db.flocks) {
        const flockIdx = db.flocks.findIndex((f: any) => f.id === flockId);
        if (flockIdx !== -1) {
          db.flocks.splice(flockIdx, 1);
          saveDb(db);
          return res.json({ success: true, deletedType: "flock" });
        }
      }
    }

    if (!db.cage_allocations) db.cage_allocations = [];
    const idx = db.cage_allocations.findIndex((a: any) => a.id === targetId);
    if (idx !== -1) {
      db.cage_allocations.splice(idx, 1);
      saveDb(db);
      return res.json({ success: true, deletedType: "allocation" });
    }

    return res.status(404).json({ error: "Allocation record not found." });
  });

function calculateCurrentAgeWeeks(
  dateAdded?: string,
  initialAgeWeeks: number = 0,
  targetDate: string = cameroonDate()
): number {
  const baseAge = Number(initialAgeWeeks) || 0;
  if (!dateAdded) return baseAge;

  const addedMs = new Date(dateAdded).getTime();
  const targetMs = new Date(targetDate).getTime();

  if (isNaN(addedMs) || isNaN(targetMs) || targetMs <= addedMs) {
    return baseAge;
  }

  const elapsedDays = (targetMs - addedMs) / (1000 * 60 * 60 * 24);
  const elapsedWeeks = elapsedDays / 7;
  const total = baseAge + elapsedWeeks;
  return Math.round(total * 10) / 10;
}

  // Cage Transfers & Live Distribution Sync
  app.post("/api/cage_transfers", requireAuth, (req, res) => {
    const db = loadDb();
    const { species, flockName, fromCage, toCage, quantity, date, notes, ageWeeks, flockId } = req.body;

    if (!fromCage || !toCage || quantity === undefined) {
      return res.status(400).json({ error: "Source cage, destination cage, and quantity are required." });
    }

    if (!isValidPositiveNumber(quantity)) {
      return res.status(400).json({ error: "Transfer quantity must be a valid positive number." });
    }

    if (ageWeeks !== undefined && ageWeeks !== "" && ageWeeks !== null && !isValidNonNegativeNumber(ageWeeks)) {
      return res.status(400).json({ error: "Bird age (weeks) must be a valid non-negative number." });
    }

    const qtyToMove = Number(quantity);
    const transferDate = date || cameroonDate();
    const cleanFromCage = String(fromCage).trim();
    const cleanToCage = String(toCage).trim();

    if (!db.cages) db.cages = [...DEFAULT_CAGES];
    if (!db.cage_allocations) db.cage_allocations = [];

    const fromBlock = findBlockNameForCage(cleanFromCage, db.cages);
    const toBlock = findBlockNameForCage(cleanToCage, db.cages);

    const fName = flockName ? String(flockName).trim() : "Flock Batch";
    const spec = species || "Chicken";
    let baseBirdAge = ageWeeks !== undefined && ageWeeks !== null ? Number(ageWeeks) : 0;
    let dateAddedVal = transferDate;

    // Check if source flock exists in db to get precise Date Added & initial age
    if (flockId) {
      const sourceFlock = (db.flocks || []).find((f: any) => f.id === flockId);
      if (sourceFlock) {
        if (sourceFlock.dateAdded) dateAddedVal = sourceFlock.dateAdded;
        if (sourceFlock.ageWeeks !== undefined) baseBirdAge = sourceFlock.ageWeeks;
      }
    }

    // 1. Update source cage allocation
    const sourceAllocIdx = db.cage_allocations.findIndex((a: any) =>
      a.cageName.toLowerCase() === cleanFromCage.toLowerCase()
    );

    if (sourceAllocIdx !== -1) {
      const sourceAlloc = db.cage_allocations[sourceAllocIdx];
      dateAddedVal = sourceAlloc.dateAdded || dateAddedVal;
      if (sourceAlloc.ageWeeks !== undefined) baseBirdAge = sourceAlloc.ageWeeks;
      sourceAlloc.quantity -= qtyToMove;
      if (sourceAlloc.quantity <= 0) {
        db.cage_allocations.splice(sourceAllocIdx, 1);
      }
    }

    // Automatically calculate updated flock age based on dateAdded and transfer date
    const calculatedBirdAge = calculateCurrentAgeWeeks(dateAddedVal, baseBirdAge, transferDate);

    // 2. Update destination cage allocation
    const destAllocIdx = db.cage_allocations.findIndex((a: any) =>
      a.cageName.toLowerCase() === cleanToCage.toLowerCase() &&
      a.flockName.toLowerCase() === fName.toLowerCase()
    );

    if (destAllocIdx !== -1) {
      const destAlloc = db.cage_allocations[destAllocIdx];
      destAlloc.quantity += qtyToMove;
      destAlloc.ageWeeks = calculatedBirdAge;
      destAlloc.dateTransferred = transferDate;
      if (notes) destAlloc.notes = String(notes).trim();
    } else {
      db.cage_allocations.push({
        id: crypto.randomUUID(),
        blockName: toBlock,
        cageName: cleanToCage,
        flockName: fName,
        species: spec,
        quantity: qtyToMove,
        ageWeeks: calculatedBirdAge,
        dateAdded: dateAddedVal,
        dateTransferred: transferDate,
        notes: notes ? String(notes).trim() : ""
      });
    }

    // 3. Log transfer history entry
    const transferId = crypto.randomUUID();
    const newTransfer = {
      id: transferId,
      date: transferDate,
      flockId: flockId || "",
      flockName: fName,
      species: spec,
      fromCage: cleanFromCage,
      toCage: cleanToCage,
      quantity: qtyToMove,
      ageWeeks: calculatedBirdAge,
      notes: notes ? String(notes).trim() : ""
    };

    if (!db.cage_transfers) db.cage_transfers = [];
    db.cage_transfers.push(newTransfer);

    // 4. Optionally update flock notes location if flockId matches
    if (flockId) {
      if (!db.flocks) db.flocks = [];
      const fl = db.flocks.find((f: any) => f.id === flockId);
      if (fl) {
        fl.notes = cleanToCage;
      }
    }

    saveDb(db);
    res.json({ success: true, transfer: newTransfer, cage_allocations: db.cage_allocations });
  });

  app.delete("/api/cage_transfers/:id", requireAuth, (req, res) => {
    const db = loadDb();
    if (!db.cage_transfers) db.cage_transfers = [];
    const index = db.cage_transfers.findIndex((t: any) => t.id === req.params.id);
    if (index === -1) return res.status(404).json({ error: "Transfer record not found." });

    db.cage_transfers.splice(index, 1);
    saveDb(db);
    res.json({ success: true });
  });

  // Daily Egg Collections API Routes
  const eggCountsMatch = (row: any, expected: any) => row && expected && row.id === expected.id && Number(row.brahmaEggs || 0) === Number(expected.brahmaEggs || 0) && Number(row.turkeyEggs || 0) === Number(expected.turkeyEggs || 0) && Number(row.quailEggs || 0) === Number(expected.quailEggs || 0);
  app.post("/api/daily_egg_collections", requireAuth, (req, res) => {
    const db = loadDb();
    if (!db.daily_egg_collections) db.daily_egg_collections = [];
    if (['brahmaEggs', 'turkeyEggs', 'quailEggs'].some(key => req.body[key] !== undefined && (!Number.isSafeInteger(Number(req.body[key])) || Number(req.body[key]) < 0))) return res.status(400).json({ error: 'Egg counts must be non-negative whole numbers.' });
    const { id, date, brahmaEggs, turkeyEggs, recordedBy, notes } = req.body;

    const recDate = date || cameroonDate();
    const bEggs = Math.max(0, Number(brahmaEggs) || 0);
    const tEggs = Math.max(0, Number(turkeyEggs) || 0);

    const recId = id || crypto.randomUUID();
    const existingIdx = db.daily_egg_collections.findIndex((e: any) => e.id === recId || e.date === recDate);
    if (req.body.expected !== undefined && (req.body.expected === null ? existingIdx !== -1 : !eggCountsMatch(db.daily_egg_collections[existingIdx], req.body.expected))) return res.status(409).json({ error: 'Another family member changed this day’s egg count. Refresh and review the latest numbers.' });
    const qEggs = req.body.quailEggs !== undefined
      ? Math.max(0, Number(req.body.quailEggs) || 0)
      : (existingIdx !== -1 ? Number(db.daily_egg_collections[existingIdx].quailEggs) || 0 : 0);
    const total = bEggs + tEggs + qEggs;

    const newRecord = {
      id: existingIdx !== -1 ? db.daily_egg_collections[existingIdx].id : recId,
      date: recDate,
      brahmaEggs: bEggs,
      turkeyEggs: tEggs,
      quailEggs: qEggs,
      poultryRecorded: true,
      totalEggs: total,
      recordedBy: recordedBy ? String(recordedBy).trim() : (getAuthorizedUser(req)?.name || "Operator"),
      notes: notes ? String(notes).trim() : ""
    };

    if (existingIdx !== -1) {
      db.daily_egg_collections[existingIdx] = newRecord;
    } else {
      db.daily_egg_collections.push(newRecord);
    }
    if (quailEggBalance(db) < 0) return res.status(400).json({ error: 'This would make quail egg stock negative.' });

    saveDb(db);
    res.json({ success: true, record: newRecord, daily_egg_collections: db.daily_egg_collections });
  });

  app.put("/api/daily_egg_collections/:id", requireAuth, (req, res) => {
    const db = loadDb();
    if (!db.daily_egg_collections) db.daily_egg_collections = [];
    if (['brahmaEggs', 'turkeyEggs', 'quailEggs'].some(key => req.body[key] !== undefined && (!Number.isSafeInteger(Number(req.body[key])) || Number(req.body[key]) < 0))) return res.status(400).json({ error: 'Egg counts must be non-negative whole numbers.' });
    const idx = db.daily_egg_collections.findIndex((e: any) => e.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: "Egg collection record not found." });

    const existing = db.daily_egg_collections[idx];
    if (req.body.expected !== undefined && !eggCountsMatch(existing, req.body.expected)) return res.status(409).json({ error: 'Another family member changed this day’s egg count. Refresh and review the latest numbers.' });
    if (req.body.date && db.daily_egg_collections.some((item: any, index: number) => index !== idx && item.date === req.body.date)) return res.status(400).json({ error: 'An egg collection already exists for that date.' });
    const bEggs = req.body.brahmaEggs !== undefined ? Math.max(0, Number(req.body.brahmaEggs)) : existing.brahmaEggs;
    const tEggs = req.body.turkeyEggs !== undefined ? Math.max(0, Number(req.body.turkeyEggs)) : existing.turkeyEggs;
    const qEggs = req.body.quailEggs !== undefined ? Math.max(0, Number(req.body.quailEggs)) : (Number(existing.quailEggs) || 0);

    const updated = {
      ...existing,
      date: req.body.date || existing.date,
      brahmaEggs: bEggs,
      turkeyEggs: tEggs,
      quailEggs: qEggs,
      poultryRecorded: true,
      totalEggs: bEggs + tEggs + qEggs,
      notes: req.body.notes !== undefined ? String(req.body.notes).trim() : existing.notes,
      recordedBy: req.body.recordedBy !== undefined ? String(req.body.recordedBy).trim() : existing.recordedBy
    };

    db.daily_egg_collections[idx] = updated;
    if (quailEggBalance(db) < 0) return res.status(400).json({ error: 'This would make quail egg stock negative.' });
    saveDb(db);
    res.json({ success: true, record: updated, daily_egg_collections: db.daily_egg_collections });
  });

  app.delete("/api/daily_egg_collections/:id", requireAuth, (req, res) => {
    const db = loadDb();
    if (!db.daily_egg_collections) db.daily_egg_collections = [];
    const idx = db.daily_egg_collections.findIndex((e: any) => e.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: "Egg collection record not found." });

    const existing = db.daily_egg_collections[idx];
    if ((Number(existing.quailEggs) || 0) > 0) {
      db.daily_egg_collections[idx] = { ...existing, brahmaEggs: 0, turkeyEggs: 0, totalEggs: Number(existing.quailEggs) || 0, poultryRecorded: false, recordedBy: '', notes: '' };
    } else {
      db.daily_egg_collections.splice(idx, 1);
    }
    saveDb(db);
    res.json({ success: true, daily_egg_collections: db.daily_egg_collections });
  });

  // Expenses
  app.post("/api/expenses", requireAuth, (req, res) => {
    const db = loadDb();
    const { id, date, category, description, amount } = req.body;

    if (!date || !category || !description || amount === undefined) {
      return res.status(400).json({ error: "Missing required expense parameters." });
    }

    if (!isValidNonNegativeNumber(amount)) {
      return res.status(400).json({ error: "Expense amount must be a valid non-negative number." });
    }

    const expId = id || crypto.randomUUID();
    const existsIndex = db.expenses.findIndex((e: any) => e.id === expId);

    const newExpense = {
      id: expId,
      date: String(date),
      category: String(category),
      description: String(description).trim(),
      amount: Number(amount)
    };

    if (existsIndex !== -1) {
      db.expenses[existsIndex] = newExpense;
    } else {
      db.expenses.push(newExpense);
    }
    saveDb(db);
    res.json(newExpense);
  });

  app.put("/api/expenses/:id", requireAuth, (req, res) => {
    const db = loadDb();
    const { id } = req.params;
    const index = db.expenses.findIndex((e: any) => e.id === id);
    if (index === -1) return res.status(404).json({ error: "Expense not found." });

    const { date, category, description, amount } = req.body;

    if (amount !== undefined && !isValidNonNegativeNumber(amount)) {
      return res.status(400).json({ error: "Expense amount must be a valid non-negative number." });
    }

    db.expenses[index] = {
      ...db.expenses[index],
      date: date !== undefined ? String(date) : db.expenses[index].date,
      category: category !== undefined ? String(category) : db.expenses[index].category,
      description: description !== undefined ? String(description).trim() : db.expenses[index].description,
      amount: amount !== undefined ? Number(amount) : db.expenses[index].amount
    };

    saveDb(db);
    res.json(db.expenses[index]);
  });

  app.delete("/api/expenses/:id", requireAuth, (req, res) => {
    const db = loadDb();
    db.expenses = db.expenses.filter((e: any) => e.id !== req.params.id);
    saveDb(db);
    res.json({ success: true });
  });

  // --- MODULE 3: INCUBATOR (CLIENTS & BATCHES) ---

  // Clients
  app.post("/api/clients", requireAuth, (req, res) => {
    const db = loadDb();
    const { id, name, mark, phone, location, overdraft, specialCase } = req.body;

    if (!name || !mark || !phone) {
      return res.status(400).json({ error: "Client name, mark, and phone are required." });
    }

    if (overdraft !== undefined && !isValidNonNegativeNumber(overdraft)) {
      return res.status(400).json({ error: "Client overdraft credit must be a valid non-negative number." });
    }

    const cleanedMark = String(mark).trim().toUpperCase();
    if (cleanedMark.length !== 2) {
      return res.status(400).json({ error: "Client unique marking must be exactly 2 letters." });
    }

    const clientId = id || crypto.randomUUID();
    const duplicate = db.clients.find((c: any) => c.mark === cleanedMark && c.id !== clientId);
    if (duplicate) {
      return res.status(400).json({ error: `Client mark [${cleanedMark}] is already assigned to ${duplicate.name}. Client marks must be unique.` });
    }

    let existingClient = db.clients.find((c: any) => c.id === clientId);

    if (existingClient) {
      existingClient.name = String(name).trim();
      existingClient.mark = cleanedMark;
      existingClient.phone = String(phone).trim();
      existingClient.location = location ? String(location).trim() : (existingClient.location || "");
      if (specialCase) existingClient.specialCase = String(specialCase);
      if (overdraft !== undefined) existingClient.overdraft = Math.max(0, Number(overdraft) || 0);
      saveDb(db);
      return res.json(existingClient);
    }

    const newClient = {
      id: clientId,
      name: String(name).trim(),
      mark: cleanedMark,
      phone: String(phone).trim(),
      location: location ? String(location).trim() : "",
      specialCase: specialCase ? String(specialCase) : 'Standard',
      overdraft: Math.max(0, Number(overdraft) || 0)
    };

    db.clients.push(newClient);
    saveDb(db);
    res.json(newClient);
  });

  // Edit Client Details & Special Case Scope
  app.put("/api/clients/:id", requireAuth, (req, res) => {
    const db = loadDb();
    const { id } = req.params;
    const clientIndex = db.clients.findIndex((c: any) => c.id === id);
    if (clientIndex === -1) return res.status(404).json({ error: "Client not found." });

    const { name, mark, phone, location, overdraft, specialCase, scope } = req.body;
    const client = db.clients[clientIndex];
    const oldMark = client.mark;

    if (overdraft !== undefined && !isValidNonNegativeNumber(overdraft)) {
      return res.status(400).json({ error: "Client overdraft credit must be a valid non-negative number." });
    }

    if (mark !== undefined && String(mark).trim() !== "") {
      const cleanedMark = String(mark).trim().toUpperCase();
      const duplicate = db.clients.find((c: any) => c.mark === cleanedMark && c.id !== id);
      if (duplicate) {
        return res.status(400).json({ error: `Client mark [${cleanedMark}] is already assigned to ${duplicate.name}. Client marks must be unique.` });
      }
      client.mark = cleanedMark;
    }

    if (name !== undefined) client.name = String(name).trim();
    if (phone !== undefined) client.phone = String(phone).trim();
    if (location !== undefined) client.location = String(location).trim();
    if (overdraft !== undefined) client.overdraft = Number(overdraft) || 0;

    if (specialCase !== undefined && specialCase !== "") {
      client.specialCase = String(specialCase);
      // If scope is 'all_time', recalculate all existing incubator records for this client
      if (scope === 'all_time') {
        db.incubator_records.forEach((r: any) => {
          if (r.clientId === id) {
            r.specialCase = String(specialCase);
            const computed = computeAmountDue(r);
            r.ratePerEgg = computed.rate;
            r.amountDue = computed.amountDue;
          }
        });
      }
    }

    db.clients[clientIndex] = client;

    // Sync clientName, clientMark and clientPhone in incubator records
    db.incubator_records.forEach((r: any) => {
      if (r.clientId === id || (oldMark && r.clientMark === oldMark && r.clientName === client.name)) {
        if (client.mark) r.clientMark = client.mark;
        if (name !== undefined) r.clientName = String(name).trim();
        if (phone !== undefined) r.clientPhone = String(phone).trim();
      }
    });

    // Re-calculate client overdraft cleanly from total cash paid vs net amount due
    const clientRecords = db.incubator_records.filter((r: any) => r.clientId === id);
    const totalDue = clientRecords.reduce((acc: number, r: any) => acc + (r.amountDue || 0), 0);
    const totalOverdraftUsed = clientRecords.reduce((acc: number, r: any) => acc + (r.overdraftUsed || 0), 0);
    const totalPaid = clientRecords.reduce((acc: number, r: any) => acc + (r.amountPaid || 0), 0);
    const netDue = Math.max(0, totalDue - totalOverdraftUsed);
    client.overdraft = totalPaid > netDue ? (totalPaid - netDue) : (overdraft !== undefined ? Number(overdraft) : (client.overdraft || 0));

    db.clients[clientIndex] = client;

    saveDb(db);
    res.json(client);
  });

  // Pay consolidated client debt across individual unpaid batches (oldest to newest)
  app.post("/api/clients/:id/pay-debt", requireAuth, (req, res) => {
    const db = loadDb();
    const { id } = req.params;
    const { paymentAmount } = req.body;

    const client = db.clients.find((c: any) => c.id === id);
    if (!client) {
      return res.status(404).json({ error: "Client not found." });
    }

    if (!isValidPositiveNumber(paymentAmount)) {
      return res.status(400).json({ error: "Payment amount must be a valid positive number." });
    }

    let pAmount = Number(paymentAmount);

    // Get unpaid incubator records for this client, sorted by oldest brought
    const unpaidRecords = db.incubator_records
      .filter((r: any) => r.clientId === id)
      .sort((a: any, b: any) => new Date(a.dateBrought).getTime() - new Date(b.dateBrought).getTime());

    for (const record of unpaidRecords) {
      const owed = record.amountDue - record.amountPaid - (record.overdraftUsed || 0);
      if (owed > 0) {
        if (pAmount >= owed) {
          record.amountPaid = record.amountPaid + owed;
          pAmount -= owed;
        } else {
          record.amountPaid = record.amountPaid + pAmount;
          pAmount = 0;
          break;
        }
      }
    }

    // If there is still extra payment, accumulate it as a credit (overdraft)
    if (pAmount > 0) {
      client.overdraft = (client.overdraft || 0) + pAmount;
    }

    saveDb(db);
    res.json({ success: true, client, recordsUpdatedCount: unpaidRecords.length });
  });

  // Re-distribute a client's cumulative amount paid across their historic egg batches (oldest to newest)
  app.post("/api/clients/:id/update-ledger", requireAuth, (req, res) => {
    const db = loadDb();
    const { id } = req.params;
    const { totalPaid } = req.body;

    const client = db.clients.find((c: any) => c.id === id);
    if (!client) {
      return res.status(404).json({ error: "Client not found." });
    }

    if (!isValidNonNegativeNumber(totalPaid)) {
      return res.status(400).json({ error: "A valid cumulative totalPaid non-negative amount is required." });
    }

    let remainingPaidPool = Number(totalPaid);

    // Get all incubator records for this client, sorted by oldest brought date first
    const clientRecords = db.incubator_records
      .filter((r: any) => r.clientId === id)
      .sort((a: any, b: any) => new Date(a.dateBrought).getTime() - new Date(b.dateBrought).getTime());

    // Re-allocate the paid pool chronologically across batches
    for (const record of clientRecords) {
      const netDue = Math.max(0, record.amountDue - (record.overdraftUsed || 0));
      if (netDue === 0) {
        record.amountPaid = 0;
        continue;
      }

      if (remainingPaidPool >= netDue) {
        record.amountPaid = netDue;
        remainingPaidPool -= netDue;
      } else {
        record.amountPaid = remainingPaidPool;
        remainingPaidPool = 0;
      }
    }

    // Any remaining payment in the pool becomes the client's overdraft credit asset
    client.overdraft = remainingPaidPool;

    saveDb(db);
    res.json({ success: true, client, recordsUpdatedCount: clientRecords.length });
  });

  // Incubator Entry (Egg Batch Record)
  app.post("/api/incubator", requireAuth, (req, res) => {
    const db = loadDb();
    const { id, clientId, dateBrought, eggsCollected, specialCase, customRate, notes, eggType, overdraftUsed, amountPaid } = req.body;

    if (!clientId || !dateBrought || eggsCollected === undefined || !specialCase) {
      return res.status(400).json({ error: "Required incubator entry fields are missing." });
    }

    if (!isValidPositiveNumber(eggsCollected)) {
      return res.status(400).json({ error: "Eggs collected must be a valid positive number." });
    }

    if (amountPaid !== undefined && !isValidNonNegativeNumber(amountPaid)) {
      return res.status(400).json({ error: "Amount paid must be a valid non-negative number." });
    }

    if (overdraftUsed !== undefined && !isValidNonNegativeNumber(overdraftUsed)) {
      return res.status(400).json({ error: "Overdraft used must be a valid non-negative number." });
    }

    const client = db.clients.find((c: any) => c.id === clientId);
    if (!client) {
      return res.status(404).json({ error: "Selected client does not exist." });
    }

    const parsedEggType = String(eggType || 'Brahma');
    const effectiveSpecialCase = specialCase || client.specialCase || "Standard";
    const computed = computeAmountDue({
      specialCase: effectiveSpecialCase,
      eggType: parsedEggType,
      eggsCollected: Number(eggsCollected),
      customRate: customRate !== undefined ? Number(customRate) : undefined,
      eggsAfterScan: null,
      chicksHatched: null
    });

    const eggs = Number(eggsCollected);
    const amountDue = computed.amountDue;
    const rate = computed.rate;

    // Days calculation helpers
    const normalizedDateBrought = normalizeDateStringToISO(dateBrought);
    
    const calculateOffsetDate = (offset: number) => {
      const parts = normalizedDateBrought.split('-');
      if (parts.length === 3) {
        const y = Number(parts[0]);
        const m = Number(parts[1]) - 1;
        const d = Number(parts[2]);
        const dt = new Date(y, m, d);
        dt.setDate(dt.getDate() + offset);
        const resY = dt.getFullYear();
        const resM = String(dt.getMonth() + 1).padStart(2, '0');
        const resD = String(dt.getDate()).padStart(2, '0');
        return `${resY}-${resM}-${resD}`;
      }
      return normalizedDateBrought;
    };
    
    let scanOffset: number | null = 8;
    let transferOffset = 18;
    let hatchOffset = 21;

    if (parsedEggType === 'Turkey') {
      scanOffset = 10;
      transferOffset = 25;
      hatchOffset = 28;
    } else if (parsedEggType === 'Quail') {
      scanOffset = null;
      transferOffset = 15;
      hatchOffset = 18;
    } else if (parsedEggType === 'Goose') {
      scanOffset = 10;
      transferOffset = 26;
      hatchOffset = 30;
    }

    const day8Date = scanOffset !== null ? calculateOffsetDate(scanOffset) : "";
    const day18Date = calculateOffsetDate(transferOffset);
    const day21Date = calculateOffsetDate(hatchOffset);

    // Apply Client Overdraft if used
    client.overdraft = client.overdraft || 0;
    const batchId = id || crypto.randomUUID();
    const existsIndex = db.incubator_records.findIndex((r: any) => r.id === batchId);
    if (existsIndex !== -1 && db.incubator_records[existsIndex].ownerType === 'farm') return res.status(409).json({ error: 'Manage farm-owned quail batches in Farm → Quail.' });

    // Revert old batch overdraft impact if re-saving/updating existing
    if (existsIndex !== -1) {
      const oldBatch = db.incubator_records[existsIndex];
      client.overdraft = Math.max(0, (client.overdraft || 0) + (oldBatch.overdraftUsed || 0) - (oldBatch.overdraftGenerated || 0));
    }

    const requestedOverdraft = Number(overdraftUsed) || 0;
    const actualOverdraftUsed = Math.min(client.overdraft, requestedOverdraft, amountDue);
    if (actualOverdraftUsed > 0) {
      client.overdraft = client.overdraft - actualOverdraftUsed;
    }

    const rawCashPaid = Math.max(0, Number(amountPaid) || 0);
    const netCashDue = Math.max(0, amountDue - actualOverdraftUsed);

    let effectiveAmountPaid = 0;
    let overdraftGenerated = 0;

    if (rawCashPaid > netCashDue) {
      // Client overpaid! Difference is overdraft credit we owe client
      overdraftGenerated = rawCashPaid - netCashDue;
      effectiveAmountPaid = netCashDue;
      client.overdraft = (client.overdraft || 0) + overdraftGenerated;
    } else {
      effectiveAmountPaid = rawCashPaid;
      overdraftGenerated = 0;
    }

    const newBatch = {
      id: batchId,
      clientId: client.id,
      clientName: client.name,
      clientMark: client.mark,
      clientPhone: client.phone,
      eggType: parsedEggType,
      dateBrought: String(dateBrought),
      createdAt: req.body.createdAt || new Date().toISOString(),
      day8Date,
      day18Date,
      day21Date,
      eggsCollected: eggs,
      specialCase: String(specialCase),
      ratePerEgg: rate,
      amountDue: amountDue,
      amountPaid: effectiveAmountPaid,
      overdraftUsed: actualOverdraftUsed,
      overdraftGenerated: overdraftGenerated,
      eggsAfterScan: null,
      chicksHatched: null,
      notes: notes ? String(notes).trim() : ""
    };

    if (existsIndex !== -1) {
      db.incubator_records[existsIndex] = newBatch;
    } else {
      db.incubator_records.push(newBatch);
    }
    saveDb(db);
    res.json(newBatch);
  });

  // Bulk import incubator records from spreadsheet (CSV parse helper payload)
  app.post("/api/incubator/import", requireAuth, (req, res) => {
    const db = loadDb();
    const { batches } = req.body;

    if (!batches || !Array.isArray(batches)) {
      return res.status(400).json({ error: "Invalid data package. Array of batches is required." });
    }

    // Server-side data validation to prevent data corruption is required
    for (let i = 0; i < batches.length; i++) {
      const item = batches[i];
      const eggsVal = item.eggsCollected !== undefined && item.eggsCollected !== null ? item.eggsCollected : item.numberOfEggs;
      const eggs = Number(eggsVal || 0);
      const amountPaid = Number(item.amountPaid || 0);
      const rawMark = String(item.clientMark || "").trim();

      // Skip records that don't have a valid 2-letter client mark as they are filtered anyway,
      // but if they are valid entries we must validate their numeric fields.
      if (rawMark.length === 2) {
        if (isNaN(eggs) || eggs < 0) {
          return res.status(400).json({
            error: `Validation failure at item ${i + 1} (${item.clientName || 'Unknown'}): Eggs Collected must be a non-negative number. Got: ${eggsVal}`
          });
        }
        if (isNaN(amountPaid) || amountPaid < 0) {
          return res.status(400).json({
            error: `Validation failure at item ${i + 1} (${item.clientName || 'Unknown'}): Amount Paid must be a non-negative number. Got: ${item.amountPaid}`
          });
        }
      }
    }

    const importedBatches: any[] = [];
    let newClientsCount = 0;

    for (const item of batches) {
      // Need: clientName, clientMark
      const rawMark = String(item.clientMark || "").trim().toUpperCase();
      if (!rawMark || rawMark.length !== 2) {
        continue; // skip invalid client marks
      }

      const clientName = String(item.clientName || "").trim() || `Client ${rawMark}`;
      
      // Look for existing client with this mark
      let client = db.clients.find((c: any) => c.mark === rawMark);
      if (!client) {
        // Auto-create client
        client = {
          id: crypto.randomUUID(),
          name: clientName,
          mark: rawMark,
          phone: String(item.clientPhone || "").trim() || "237650000000",
          location: String(item.clientLocation || "").trim() || "Bafoussam",
          overdraft: 0
        };
        db.clients.push(client);
        newClientsCount++;
      }

      // Rates calculation based on specialCase & Egg Type
      const importedEggType = String(item.eggType || "Brahma");
      const specialCase = String(item.specialCase || "Standard").trim();
      const stdRate = getStandardRateBySpecies(importedEggType);
      let rate = stdRate;
      if (specialCase === "Discount" || specialCase === "150 Per Egg Brought" || specialCase.includes("150")) rate = 150;
      else if (specialCase === "Free" || specialCase.toLowerCase().includes("free")) rate = 0;
      else if (specialCase === "Custom") {
        rate = Number(item.ratePerEgg || stdRate);
      }

      const eggsVal = item.eggsCollected !== undefined && item.eggsCollected !== null ? item.eggsCollected : item.numberOfEggs;
      const eggs = Number(eggsVal || 0);
      let amountDue = eggs * rate;

      const scanVal = item.eggsAfterScan !== undefined && item.eggsAfterScan !== null && item.eggsAfterScan !== "" ? Number(item.eggsAfterScan) : null;
      const hatchVal = item.chicksHatched !== undefined && item.chicksHatched !== null && item.chicksHatched !== "" ? Number(item.chicksHatched) : null;

      if (specialCase === "Per Chick" && hatchVal !== null) {
        amountDue = hatchVal * rate;
      } else if (specialCase === "Per Egg After Scan" && scanVal !== null) {
        amountDue = scanVal * rate;
      }

      const amountPaid = Number(item.amountPaid || 0);

      // Overdraft & Debt calculation on import
      let overdraftGenerated = 0;
      let overdraftUsed = 0;

      if (amountPaid > amountDue) {
        overdraftGenerated = amountPaid - amountDue;
        client.overdraft = (client.overdraft || 0) + overdraftGenerated;
      } else if (amountPaid < amountDue) {
        if (client.overdraft && client.overdraft > 0) {
          const debtGap = amountDue - amountPaid;
          const applyCredit = Math.min(client.overdraft, debtGap);
          overdraftUsed = applyCredit;
          client.overdraft -= applyCredit;
        }
      }

      const dateBrought = normalizeDateStringToISO(item.dateBrought);
      
      // Safe date calculation helper
      const calculateOffsetDate = (offset: number) => {
        const parts = dateBrought.split('-');
        if (parts.length === 3) {
          const y = Number(parts[0]);
          const m = Number(parts[1]) - 1;
          const d = Number(parts[2]);
          const dt = new Date(y, m, d);
          dt.setDate(dt.getDate() + offset);
          const resY = dt.getFullYear();
          const resM = String(dt.getMonth() + 1).padStart(2, '0');
          const resD = String(dt.getDate()).padStart(2, '0');
          return `${resY}-${resM}-${resD}`;
        }
        return dateBrought;
      };

      const eggTypeVal = String(item.eggType || "Brahma").trim();
      const parsedEggType = (eggTypeVal === "Turkey" || eggTypeVal === "Quail" || eggTypeVal === "Goose" || eggTypeVal === "Brahma")
        ? eggTypeVal
        : "Brahma";

      let scanOffset: number | null = 8;
      let transferOffset = 18;
      let hatchOffset = 21;

      if (parsedEggType === 'Turkey') {
        scanOffset = 10;
        transferOffset = 25;
        hatchOffset = 28;
      } else if (parsedEggType === 'Quail') {
        scanOffset = null;
        transferOffset = 15;
        hatchOffset = 18;
      } else if (parsedEggType === 'Goose') {
        scanOffset = 10;
        transferOffset = 26;
        hatchOffset = 30;
      }

      const day8Date = scanOffset !== null ? calculateOffsetDate(scanOffset) : "";
      const day18Date = calculateOffsetDate(transferOffset);
      const day21Date = calculateOffsetDate(hatchOffset);

      const importedRecord = {
        id: crypto.randomUUID(),
        clientId: client.id,
        clientName: client.name,
        clientMark: client.mark,
        clientPhone: client.phone,
        eggType: parsedEggType,
        dateBrought: dateBrought,
        day8Date,
        day18Date,
        day21Date,
        eggsCollected: eggs,
        specialCase: specialCase,
        ratePerEgg: rate,
        amountDue: amountDue,
        amountPaid: amountPaid,
        overdraftGenerated: overdraftGenerated,
        overdraftUsed: overdraftUsed,
        eggsAfterScan: scanVal,
        chicksHatched: hatchVal,
        notes: item.notes ? String(item.notes).trim() : "Imported from spreadsheet backup"
      };

      db.incubator_records.push(importedRecord);
      importedBatches.push(importedRecord);
    }

    saveDb(db);
    res.json({
      success: true,
      recordsImported: importedBatches.length,
      newClientsRegistered: newClientsCount
    });
  });

  // Edit Incubator record (Modal update)
  app.put("/api/incubator/:id", requireAuth, (req, res) => {
    const db = loadDb();
    const { id } = req.params;
    const index = db.incubator_records.findIndex((r: any) => r.id === id);
    if (index === -1) return res.status(404).json({ error: "Incubator record not found." });

    const {
      dateBrought,
      eggType,
      eggsCollected,
      specialCase,
      customRate,
      ratePerEgg,
      eggsAfterScan,
      chicksHatched,
      amountPaid,
      overdraftUsed,
      notes
    } = req.body;
    const record = db.incubator_records[index];
    if (record.ownerType === 'farm') return res.status(409).json({ error: 'Manage farm-owned quail batches in Farm → Quail.' });

    if (dateBrought !== undefined && dateBrought !== "") {
      record.dateBrought = String(dateBrought);
    }

    if (eggType !== undefined && eggType !== "") {
      record.eggType = String(eggType);
    }

    // Recalculate milestone dates based on dateBrought and eggType
    if (record.dateBrought) {
      const baseDate = new Date(record.dateBrought);
      const calculateOffsetDate = (offset: number) => {
        const d = new Date(baseDate.getTime());
        d.setDate(d.getDate() + offset);
        return d.toISOString().split("T")[0];
      };

      const parsedEggType = String(record.eggType || 'Brahma');
      let scanOffset: number | null = 8;
      let transferOffset = 18;
      let hatchOffset = 21;

      if (parsedEggType === 'Turkey') {
        scanOffset = 10;
        transferOffset = 25;
        hatchOffset = 28;
      } else if (parsedEggType === 'Quail') {
        scanOffset = null;
        transferOffset = 15;
        hatchOffset = 18;
      } else if (parsedEggType === 'Goose') {
        scanOffset = 10;
        transferOffset = 26;
        hatchOffset = 30;
      }

      record.day8Date = scanOffset !== null ? calculateOffsetDate(scanOffset) : "";
      record.day18Date = calculateOffsetDate(transferOffset);
      record.day21Date = calculateOffsetDate(hatchOffset);
    }

    if (specialCase !== undefined && specialCase !== "") {
      record.specialCase = String(specialCase);
      if (customRate !== undefined && isValidNonNegativeNumber(customRate)) {
        record.customRate = Number(customRate);
        record.ratePerEgg = Number(customRate);
      } else if (ratePerEgg !== undefined && isValidNonNegativeNumber(ratePerEgg)) {
        record.ratePerEgg = Number(ratePerEgg);
      }
    } else if (ratePerEgg !== undefined && isValidNonNegativeNumber(ratePerEgg)) {
      record.ratePerEgg = Number(ratePerEgg);
    }

    if (eggsCollected !== undefined && eggsCollected !== "" && eggsCollected !== null) {
      if (!isValidNonNegativeNumber(eggsCollected)) {
        return res.status(400).json({ error: "Eggs collected must be a valid non-negative number." });
      }
      record.eggsCollected = Number(eggsCollected);
    }

    if (eggsAfterScan !== undefined) {
      if (eggsAfterScan === "" || eggsAfterScan === null) {
        record.eggsAfterScan = null;
      } else {
        if (!isValidNonNegativeNumber(eggsAfterScan)) {
          return res.status(400).json({ error: "Candled eggs (after scan) must be a valid non-negative number." });
        }
        record.eggsAfterScan = Number(eggsAfterScan);
      }
    }

    if (chicksHatched !== undefined) {
      if (chicksHatched === "" || chicksHatched === null) {
        record.chicksHatched = null;
      } else {
        if (!isValidNonNegativeNumber(chicksHatched)) {
          return res.status(400).json({ error: "Chicks hatched must be a valid non-negative number." });
        }
        record.chicksHatched = Number(chicksHatched);
      }
    }

    const computed = computeAmountDue(record);
    record.ratePerEgg = computed.rate;
    record.amountDue = computed.amountDue;

    if (amountPaid !== undefined || overdraftUsed !== undefined) {
      if (amountPaid !== undefined && !isValidNonNegativeNumber(amountPaid)) {
        return res.status(400).json({ error: "Amount paid must be a valid non-negative number." });
      }

      const client = db.clients.find((c: any) => c.id === record.clientId);
      if (client) {
        // Revert old record overdraft impact before applying updated amounts
        client.overdraft = Math.max(0, (client.overdraft || 0) + (record.overdraftUsed || 0) - (record.overdraftGenerated || 0));

        const reqOverdraft = overdraftUsed !== undefined ? Number(overdraftUsed) : (record.overdraftUsed || 0);
        const actualOverdraftUsed = Math.min(client.overdraft, reqOverdraft, record.amountDue);
        if (actualOverdraftUsed > 0) {
          client.overdraft -= actualOverdraftUsed;
        }
        record.overdraftUsed = actualOverdraftUsed;

        const rawCashPaid = amountPaid !== undefined ? Math.max(0, Number(amountPaid) || 0) : (record.amountPaid || 0);
        const netCashDue = Math.max(0, record.amountDue - actualOverdraftUsed);

        if (rawCashPaid > netCashDue) {
          record.overdraftGenerated = rawCashPaid - netCashDue;
          record.amountPaid = netCashDue;
          client.overdraft = (client.overdraft || 0) + record.overdraftGenerated;
        } else {
          record.amountPaid = rawCashPaid;
          record.overdraftGenerated = 0;
        }
      }
    }

    if (notes !== undefined) {
      record.notes = String(notes).trim();
    }

    db.incubator_records[index] = record;
    saveDb(db);
    res.json(record);
  });

  app.delete("/api/incubator/:id", requireAuth, (req, res) => {
    const db = loadDb();
    const record = db.incubator_records.find((r: any) => r.id === req.params.id);
    if (record?.ownerType === 'farm') return res.status(409).json({ error: 'Farm-owned quail batches cannot be deleted here.' });
    if (record) {
      const client = db.clients.find((c: any) => c.id === record.clientId);
      if (client) {
        client.overdraft = Math.max(0, (client.overdraft || 0) + (record.overdraftUsed || 0) - (record.overdraftGenerated || 0));
      }
    }
    db.incubator_records = db.incubator_records.filter((r: any) => r.id !== req.params.id);
    saveDb(db);
    res.json({ success: true });
  });

  // Bulk Delete API Endpoint
  app.post("/api/bulk-delete", requireAuth, (req, res) => {
    const { type, ids } = req.body;
    if (!type || !Array.isArray(ids)) {
      return res.status(400).json({ error: "Invalid bulk-delete payload" });
    }
    const db = loadDb();
    
    let key = "";
    if (type === "incubator") key = "incubator_records";
    else if (type === "flocks") key = "flocks";
    else if (type === "feed") key = "feed_records";
    else if (type === "sales") key = "poultry_sales";
    else if (type === "mortality") key = "mortality";
    else if (type === "expenses") key = "expenses";
    else if (type === "fowls_eaten") key = "fowls_eaten";
    
    if (!key || !(key in db)) {
      return res.status(400).json({ error: "Invalid type specified for bulk delete" });
    }
    if (type === 'incubator' && db.incubator_records.some((record: any) => record.ownerType === 'farm' && ids.includes(record.id))) return res.status(409).json({ error: 'Farm-owned quail batches cannot be deleted here.' });
    
    db[key] = (db[key] as any[]).filter((r: any) => !ids.includes(r.id));
    saveDb(db);
    res.json({ success: true, count: ids.length });
  });

  // Bulk Update API Endpoint
  app.post("/api/bulk-update", requireAuth, (req, res) => {
    const { type, ids, updates } = req.body;
    if (!type || !Array.isArray(ids) || !updates) {
      return res.status(400).json({ error: "Invalid bulk-update payload" });
    }
    const db = loadDb();
    
    let key = "";
    if (type === "incubator") key = "incubator_records";
    else if (type === "flocks") key = "flocks";
    else if (type === "feed") key = "feed_records";
    else if (type === "sales") key = "poultry_sales";
    else if (type === "mortality") key = "mortality";
    else if (type === "expenses") key = "expenses";
    else if (type === "fowls_eaten") key = "fowls_eaten";
    
    if (!key || !(key in db)) {
      return res.status(400).json({ error: "Invalid type specified for bulk update" });
    }
    if (type === 'incubator' && db.incubator_records.some((record: any) => record.ownerType === 'farm' && ids.includes(record.id))) return res.status(409).json({ error: 'Manage farm-owned quail batches in Farm → Quail.' });
    
    db[key] = (db[key] as any[]).map((r: any) => {
      if (ids.includes(r.id)) {
        const merged = { ...r, ...updates };
        if (updates.eggsCollected !== undefined) merged.eggsCollected = Number(updates.eggsCollected);
        if (updates.amountPaid !== undefined) merged.amountPaid = Number(updates.amountPaid);
        if (updates.markPaid === true) {
          merged.amountPaid = merged.amountDue || r.amountDue || 0;
        }
        if (updates.eggsAfterScan !== undefined) {
          merged.eggsAfterScan = updates.eggsAfterScan === "" ? null : Number(updates.eggsAfterScan);
        }
        if (updates.chicksHatched !== undefined) {
          merged.chicksHatched = updates.chicksHatched === "" ? null : Number(updates.chicksHatched);
        }
        
        // Re-calculate derived fields for incubator batches
        if (key === "incubator_records") {
          const eggs = merged.eggsCollected;
          const rate = merged.ratePerEgg;
          merged.amountDue = eggs * rate;
        }
        return merged;
      }
      return r;
    });
    
    saveDb(db);
    res.json({ success: true, count: ids.length });
  });

  // Global Sync Endpoint
  app.get("/api/db", requireAuth, (req, res) => {
    const db = loadDb();
    const { users, sessions, ...rest } = db;
    res.json(rest);
  });

  // Batch Sync Endpoint for Offline PWA Syncing
  app.post("/api/sync", requireAuth, (req, res) => {
    const { items } = req.body;
    if (!items || !Array.isArray(items)) {
      return res.status(400).json({ error: "Invalid sync payload. Array of items required." });
    }

    const db = loadDb();
    let processedCount = 0;

    const farmBatchIds = new Set(db.incubator_records.filter((record: any) => record.ownerType === 'farm').map((record: any) => record.id));
    if (items.some((item: any) => {
      const endpoint = String(item?.endpoint || '');
      if (endpoint === '/api/incubator' && item?.body?.id && farmBatchIds.has(item.body.id)) return true;
      if (endpoint.startsWith('/api/incubator/') && farmBatchIds.has(endpoint.slice('/api/incubator/'.length))) return true;
      return (endpoint === '/api/bulk-delete' || endpoint === '/api/bulk-update') && item?.body?.type === 'incubator' && Array.isArray(item.body.ids) && item.body.ids.some((id: string) => farmBatchIds.has(id));
    })) return res.status(409).json({ error: 'Manage farm-owned quail batches in Farm → Quail.' });

    // Process items in timestamp order (prioritizing latest entries chronologically)
    const sortedItems = [...items].sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

    for (const item of sortedItems) {
      const { endpoint, method, body } = item;
      if (!endpoint || !method) continue;

      try {
        if (isProtectedFarmMutation(db, endpoint, method, body)) throw new Error('Use linked Farm actions for rabbit and quail changes.');
        if (endpoint === "/api/flocks" && method === "POST") {
          if (body && body.name && body.breed) {
            const flockId = body.id || crypto.randomUUID();
            const existsIndex = db.flocks.findIndex((f: any) => f.id === flockId);
            const flockObj = {
              id: flockId,
              name: String(body.name).trim(),
              breed: String(body.breed).trim(),
              quantity: Number(body.quantity || 0),
              ageWeeks: Number(body.ageWeeks || 0),
              dateAdded: String(body.dateAdded || cameroonDate()),
              species: body.species ? String(body.species) : 'Chicken',
              notes: body.notes ? String(body.notes).trim() : "",
              initialAgeWeeks: Number(body.ageWeeks || 0)
            };
            if (existsIndex !== -1) {
              db.flocks[existsIndex] = flockObj;
            } else {
              db.flocks.push(flockObj);
            }
            processedCount++;
          }
        } else if (endpoint.startsWith("/api/flocks/") && method === "PUT") {
          const id = endpoint.replace("/api/flocks/", "");
          const idx = db.flocks.findIndex((f: any) => f.id === id);
          if (idx !== -1 && body) {
            db.flocks[idx] = { ...db.flocks[idx], ...body };
            processedCount++;
          }
        } else if (endpoint.startsWith("/api/flocks/") && method === "DELETE") {
          const id = endpoint.replace("/api/flocks/", "");
          db.flocks = db.flocks.filter((f: any) => f.id !== id);
          db.mortality = db.mortality.filter((m: any) => m.flockId !== id);
          processedCount++;
        }
        else if (endpoint === "/api/feed" && method === "POST") {
          if (body && body.feedType) {
            const feedId = body.id || crypto.randomUUID();
            const existsIdx = db.feed_records.findIndex((f: any) => f.id === feedId);
            const feedObj = {
              id: feedId,
              date: String(body.date || cameroonDate()),
              feedType: String(body.feedType).trim(),
              species: body.species === 'Rabbit' || body.species === 'Quail' ? body.species : 'Poultry',
              bagsBought: Number(body.bagsBought || 0),
              weightPerBag: Number(body.weightPerBag || 50),
              costBag: Number(body.costBag || 0),
              totalCost: Number(body.bagsBought || 0) * Number(body.costBag || 0),
              stockRemaining: Number(body.stockRemaining || 0)
            };
            if (existsIdx !== -1) {
              db.feed_records[existsIdx] = feedObj;
            } else {
              db.feed_records.push(feedObj);
            }
            processedCount++;
          }
        } else if (endpoint.startsWith("/api/feed/") && method === "PUT") {
          const id = endpoint.replace("/api/feed/", "");
          const idx = db.feed_records.findIndex((f: any) => f.id === id);
          if (idx !== -1 && body) {
            db.feed_records[idx] = { ...db.feed_records[idx], ...body };
            processedCount++;
          }
        } else if (endpoint.startsWith("/api/feed/") && method === "DELETE") {
          const id = endpoint.replace("/api/feed/", "");
          db.feed_records = db.feed_records.filter((f: any) => f.id !== id);
          processedCount++;
        }
        else if (endpoint === "/api/sales" && method === "POST") {
          if (body && body.itemType) {
            const saleId = body.id || crypto.randomUUID();
            const existsIdx = db.poultry_sales.findIndex((s: any) => s.id === saleId);
            const saleObj = {
              id: saleId,
              date: String(body.date || cameroonDate()),
              itemType: String(body.itemType),
              quantity: Number(body.quantity || 0),
              unitPrice: Number(body.unitPrice || 0),
              totalAmount: Number(body.quantity || 0) * Number(body.unitPrice || 0),
              buyerName: String(body.buyerName || "").trim(),
              flockId: body.flockId || "",
              ageWeeks: body.ageWeeks ? Number(body.ageWeeks) : null,
              notes: body.notes ? String(body.notes).trim() : ""
            };
            if (body.flockId && existsIdx === -1) {
              const flockIndex = db.flocks.findIndex((f: any) => f.id === body.flockId);
              if (flockIndex !== -1) {
                db.flocks[flockIndex].quantity = Math.max(0, db.flocks[flockIndex].quantity - saleObj.quantity);
              }
            }
            if (existsIdx !== -1) {
              db.poultry_sales[existsIdx] = saleObj;
            } else {
              db.poultry_sales.push(saleObj);
            }
            processedCount++;
          }
        } else if (endpoint.startsWith("/api/sales/") && method === "PUT") {
          const id = endpoint.replace("/api/sales/", "");
          const idx = db.poultry_sales.findIndex((s: any) => s.id === id);
          if (idx !== -1 && body) {
            db.poultry_sales[idx] = { ...db.poultry_sales[idx], ...body };
            processedCount++;
          }
        } else if (endpoint.startsWith("/api/sales/") && method === "DELETE") {
          const id = endpoint.replace("/api/sales/", "");
          db.poultry_sales = db.poultry_sales.filter((s: any) => s.id !== id);
          processedCount++;
        }
        else if (endpoint === "/api/mortality" && method === "POST") {
          if (body && body.flockId) {
            const mortId = body.id || crypto.randomUUID();
            const existsIdx = db.mortality.findIndex((m: any) => m.id === mortId);
            const flock = db.flocks.find((f: any) => f.id === body.flockId);
            const mortObj = {
              id: mortId,
              date: String(body.date || cameroonDate()),
              flockId: String(body.flockId),
              flockName: flock ? flock.name : (body.flockName || "Flock"),
              quantity: Number(body.quantity || 0),
              cause: body.cause ? String(body.cause).trim() : ""
            };
            if (flock && existsIdx === -1) {
              flock.quantity = Math.max(0, flock.quantity - mortObj.quantity);
            }
            if (existsIdx !== -1) {
              db.mortality[existsIdx] = mortObj;
            } else {
              db.mortality.push(mortObj);
            }
            processedCount++;
          }
        } else if (endpoint.startsWith("/api/mortality/") && method === "DELETE") {
          const id = endpoint.replace("/api/mortality/", "");
          db.mortality = db.mortality.filter((m: any) => m.id !== id);
          processedCount++;
        }
        else if (endpoint === "/api/expenses" && method === "POST") {
          if (body && body.category) {
            const expId = body.id || crypto.randomUUID();
            const existsIdx = db.expenses.findIndex((e: any) => e.id === expId);
            const expObj = {
              id: expId,
              date: String(body.date || cameroonDate()),
              category: String(body.category),
              description: String(body.description || "").trim(),
              amount: Number(body.amount || 0)
            };
            if (existsIdx !== -1) {
              db.expenses[existsIdx] = expObj;
            } else {
              db.expenses.push(expObj);
            }
            processedCount++;
          }
        } else if (endpoint.startsWith("/api/expenses/") && method === "PUT") {
          const id = endpoint.replace("/api/expenses/", "");
          const idx = db.expenses.findIndex((e: any) => e.id === id);
          if (idx !== -1 && body) {
            db.expenses[idx] = { ...db.expenses[idx], ...body };
            processedCount++;
          }
        } else if (endpoint.startsWith("/api/expenses/") && method === "DELETE") {
          const id = endpoint.replace("/api/expenses/", "");
          db.expenses = db.expenses.filter((e: any) => e.id !== id);
          processedCount++;
        }
        else if (endpoint === "/api/fowls-eaten" && method === "POST") {
          if (body && body.flockId) {
            const eatenId = body.id || crypto.randomUUID();
            if (!Array.isArray(db.fowls_eaten)) db.fowls_eaten = [];
            const existsIdx = db.fowls_eaten.findIndex((fe: any) => fe.id === eatenId);
            const flock = db.flocks.find((f: any) => f.id === body.flockId);
            const eatenObj = {
              id: eatenId,
              date: String(body.date || cameroonDate()),
              flockId: String(body.flockId),
              flockName: flock ? flock.name : (body.flockName || "Flock"),
              species: flock ? (flock.species || 'Chicken') : 'Chicken',
              breed: flock ? (flock.breed || '') : '',
              quantity: Number(body.quantity || 0),
              ageWeeks: body.ageWeeks ? Number(body.ageWeeks) : (flock ? flock.ageWeeks : 0),
              notes: body.notes ? String(body.notes).trim() : ""
            };
            if (flock && existsIdx === -1) {
              flock.quantity = Math.max(0, flock.quantity - eatenObj.quantity);
            }
            if (existsIdx !== -1) {
              db.fowls_eaten[existsIdx] = eatenObj;
            } else {
              db.fowls_eaten.push(eatenObj);
            }
            processedCount++;
          }
        } else if (endpoint.startsWith("/api/fowls-eaten/") && method === "DELETE") {
          const id = endpoint.replace("/api/fowls-eaten/", "");
          if (!Array.isArray(db.fowls_eaten)) db.fowls_eaten = [];
          db.fowls_eaten = db.fowls_eaten.filter((fe: any) => fe.id !== id);
          processedCount++;
        }
        else if (endpoint === "/api/clients" && method === "POST") {
          if (body && body.name && body.mark) {
            const mark = String(body.mark).trim().toUpperCase();
            const clientId = body.id || crypto.randomUUID();
            let client = db.clients.find((c: any) => c.id === clientId || c.mark === mark);
            if (client) {
              client.name = body.name;
              client.phone = body.phone;
              client.location = body.location;
              if (body.overdraft !== undefined) client.overdraft = body.overdraft;
            } else {
              client = {
                id: clientId,
                name: String(body.name).trim(),
                mark,
                phone: String(body.phone).trim(),
                location: String(body.location).trim(),
                overdraft: Math.max(0, Number(body.overdraft) || 0)
              };
              db.clients.push(client);
            }
            processedCount++;
          }
        } else if (endpoint.startsWith("/api/clients/") && method === "PUT") {
          const id = endpoint.replace("/api/clients/", "");
          const idx = db.clients.findIndex((c: any) => c.id === id);
          if (idx !== -1 && body) {
            db.clients[idx] = { ...db.clients[idx], ...body };
            processedCount++;
          }
        }
        else if (endpoint === "/api/incubator" && method === "POST") {
          if (body && body.clientId && body.dateBrought) {
            const batchId = body.id || crypto.randomUUID();
            const existsIdx = db.incubator_records.findIndex((r: any) => r.id === batchId);
            const recObj = {
              id: batchId,
              clientId: body.clientId,
              clientName: body.clientName || "",
              clientMark: body.clientMark || "",
              clientPhone: body.clientPhone || "",
              eggType: body.eggType || 'Brahma',
              dateBrought: String(body.dateBrought),
              day8Date: body.day8Date || "",
              day18Date: body.day18Date || "",
              day21Date: body.day21Date || "",
              eggsCollected: Number(body.eggsCollected || 0),
              specialCase: String(body.specialCase || "Standard"),
              ratePerEgg: Number(body.ratePerEgg || 200),
              amountDue: Number(body.amountDue || 0),
              amountPaid: Number(body.amountPaid || 0),
              overdraftUsed: Number(body.overdraftUsed || 0),
              eggsAfterScan: body.eggsAfterScan !== undefined ? body.eggsAfterScan : null,
              chicksHatched: body.chicksHatched !== undefined ? body.chicksHatched : null,
              notes: body.notes ? String(body.notes).trim() : ""
            };
            if (existsIdx !== -1) {
              db.incubator_records[existsIdx] = recObj;
            } else {
              db.incubator_records.push(recObj);
            }
            processedCount++;
          }
        } else if (endpoint.startsWith("/api/incubator/") && method === "PUT") {
          const id = endpoint.replace("/api/incubator/", "");
          const idx = db.incubator_records.findIndex((r: any) => r.id === id);
          if (idx !== -1 && body) {
            db.incubator_records[idx] = { ...db.incubator_records[idx], ...body };
            processedCount++;
          }
        } else if (endpoint.startsWith("/api/incubator/") && method === "DELETE") {
          const id = endpoint.replace("/api/incubator/", "");
          db.incubator_records = db.incubator_records.filter((r: any) => r.id !== id);
          processedCount++;
        }
        else if (endpoint === "/api/bulk-delete" && method === "POST") {
          const { type, ids } = body || {};
          let key = "";
          if (type === "incubator") key = "incubator_records";
          else if (type === "flocks") key = "flocks";
          else if (type === "feed") key = "feed_records";
          else if (type === "sales") key = "poultry_sales";
          else if (type === "mortality") key = "mortality";
          else if (type === "expenses") key = "expenses";

          if (key && key in db && Array.isArray(ids)) {
            db[key] = (db[key] as any[]).filter((r: any) => !ids.includes(r.id));
            processedCount++;
          }
        }
        else if (endpoint === "/api/bulk-update" && method === "POST") {
          const { type, ids, updates } = body || {};
          let key = "";
          if (type === "incubator") key = "incubator_records";
          else if (type === "flocks") key = "flocks";
          else if (type === "feed") key = "feed_records";
          else if (type === "sales") key = "poultry_sales";
          else if (type === "mortality") key = "mortality";
          else if (type === "expenses") key = "expenses";

          if (key && key in db && Array.isArray(ids) && updates) {
            db[key] = (db[key] as any[]).map((r: any) => {
              if (ids.includes(r.id)) {
                return { ...r, ...updates };
              }
              return r;
            });
            processedCount++;
          }
        }
      } catch (itemErr) {
        console.error("Error processing sync item:", itemErr, item);
      }
    }

    if (processedCount !== items.length) {
      return res.status(409).json({ error: 'Some offline changes could not be applied.', processedCount, requestedCount: items.length });
    }
    saveDb(db);

    const safeUsers = db.users.map((u: any) => ({ id: u.id, username: u.username, name: u.name }));
    res.json({
      success: true,
      processedCount,
      db: {
        users: safeUsers,
        clients: db.clients,
        incubator_records: db.incubator_records,
        flocks: db.flocks,
        feed_records: db.feed_records,
        poultry_sales: db.poultry_sales,
        mortality: db.mortality,
        expenses: db.expenses,
        fowls_eaten: db.fowls_eaten || []
      }
    });
  });

  // Serve static UI assets & public folder for Service Worker & Manifest
  if (process.env.NODE_ENV !== "production") {
    const publicPath = path.join(process.cwd(), "public");
    if (fs.existsSync(publicPath)) app.use(express.static(publicPath));
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, HOST, () => {
    console.log(`NEW VISION FARMS server listening on port ${PORT}`);
  });
}

startServer().catch(err => {
  console.error("Critical server initialization failed:", err);
});
