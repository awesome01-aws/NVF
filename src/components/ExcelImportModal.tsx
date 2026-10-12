/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { getCameroonTodayISO } from '../utils/dateUtils';
import React, { useState } from 'react';
import * as XLSX from 'xlsx';
import { Upload, FileSpreadsheet, CheckCircle2, AlertCircle, ArrowRight, Table, Download, X, Layers, Users, Sparkles } from 'lucide-react';

interface ExcelImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  token: string | null;
  triggerRefresh: () => void;
}

export type ImportTargetCategory = 
  | 'flocks'
  | 'incubator'
  | 'feed'
  | 'sales'
  | 'mortality'
  | 'expenses'
  | 'fowls_eaten'
  | 'clients'
  | 'egg_collections';

// Helper to parse Excel numeric dates, JS Date objects, or date strings into ISO YYYY-MM-DD
export function parseExcelDate(val: any): string {
  if (val === null || val === undefined || val === '') {
    return getCameroonTodayISO();
  }

  // 1. Handle JS Date objects (e.g. from SheetJS cellDates)
  if (val instanceof Date || Object.prototype.toString.call(val) === '[object Date]') {
    const d = val as Date;
    if (!isNaN(d.getTime())) {
      // Add 12 hours offset to compensate for negative UTC/local timezone shifts in SheetJS date objects
      const dShifted = new Date(d.getTime() + 12 * 60 * 60 * 1000);
      const y = dShifted.getUTCFullYear();
      const m = String(dShifted.getUTCMonth() + 1).padStart(2, '0');
      const day = String(dShifted.getUTCDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    }
  }

  // 2. Handle Excel serial date numbers (e.g. 46178 or "46178")
  const numVal = Number(val);
  if (
    (typeof val === 'number' || (!isNaN(numVal) && numVal > 20000 && numVal < 90000)) &&
    !String(val).includes('/') &&
    !String(val).includes('-') &&
    !String(val).includes(':')
  ) {
    try {
      const parsed = XLSX.SSF.parse_date_code(Math.floor(numVal));
      if (parsed && parsed.y && parsed.m && parsed.d) {
        const y = parsed.y;
        const m = String(parsed.m).padStart(2, '0');
        const d = String(parsed.d).padStart(2, '0');
        return `${y}-${m}-${d}`;
      }
    } catch {
      // fallback
    }
  }

  const str = String(val).trim();

  // 3. If string is already ISO YYYY-MM-DD or YYYY/MM/DD or YYYY.MM.DD
  const isoMatch = str.match(/^(\d{4})[\/\.-](\d{1,2})[\/\.-](\d{1,2})$/);
  if (isoMatch) {
    const y = isoMatch[1];
    const m = isoMatch[2].padStart(2, '0');
    const d = isoMatch[3].padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  // 4. Handle formatted dates with 4-digit Year at end: DD/MM/YYYY or DD-MM-YYYY or DD.MM.YYYY or D/M/YYYY
  const dmy4Match = str.match(/^(\d{1,2})[\/\.-](\d{1,2})[\/\.-](\d{4})$/);
  if (dmy4Match) {
    const p1 = Number(dmy4Match[1]);
    const p2 = Number(dmy4Match[2]);
    const year = dmy4Match[3];

    let day: number;
    let month: number;

    if (p2 > 12 && p1 <= 12) {
      day = p2;
      month = p1;
    } else {
      day = p1;
      month = p2;
    }

    const mStr = String(month).padStart(2, '0');
    const dStr = String(day).padStart(2, '0');
    return `${year}-${mStr}-${dStr}`;
  }

  // 5. Handle formatted dates with 2-digit Year at end: DD/MM/YY or DD-MM-YY or DD.MM.YY
  const dmy2Match = str.match(/^(\d{1,2})[\/\.-](\d{1,2})[\/\.-](\d{2})$/);
  if (dmy2Match) {
    const p1 = Number(dmy2Match[1]);
    const p2 = Number(dmy2Match[2]);
    const yrNum = Number(dmy2Match[3]);
    const year = yrNum < 50 ? `20${dmy2Match[3]}` : `19${dmy2Match[3]}`;

    let day: number;
    let month: number;

    if (p2 > 12 && p1 <= 12) {
      day = p2;
      month = p1;
    } else {
      day = p1;
      month = p2;
    }

    const mStr = String(month).padStart(2, '0');
    const dStr = String(day).padStart(2, '0');
    return `${year}-${mStr}-${dStr}`;
  }

  // 6. Fallback via Date constructor if text contains month names (e.g., "5 Jun 2026")
  const d = new Date(str);
  if (!isNaN(d.getTime())) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  return getCameroonTodayISO();
}

// Global Template Generator Function for All Tables
export function downloadExcelTemplate(categoryKey: string, format: 'xlsx' | 'csv' = 'xlsx') {
  const templates: Record<string, {
    title: string;
    sheetName: string;
    headers: string[];
    cols: { wch: number }[];
    samples: any[][];
  }> = {
    incubator: {
      title: "Incubator Batches Template",
      sheetName: "Incubator Batches",
      headers: [
        "Date Brought (DD/MM/YYYY)",
        "Client Name",
        "Client Mark (2 Letters)",
        "Egg Type / Species",
        "Number of Eggs",
        "Pricing Tariff / Special Case",
        "Amount Paid (FCFA)",
        "Client Phone (Optional)",
        "Location (Optional)",
        "Notes (Optional)"
      ],
      cols: [
        { wch: 24 }, { wch: 22 }, { wch: 20 }, { wch: 18 }, { wch: 16 },
        { wch: 24 }, { wch: 20 }, { wch: 20 }, { wch: 18 }, { wch: 22 }
      ],
      samples: [
        ["12/07/2026", "R Paulo", "PR", "Brahma", 9, "Standard", 1800, "670000000", "Bafoussam", "Client brought 9 eggs"],
        ["15/07/2026", "Nguefack Martial", "NM", "Turkey", 15, "Tariff A", 3000, "699000000", "Douala", "Paid in full"]
      ]
    },
    clients: {
      title: "Registered Clients Template",
      sheetName: "Registered Clients",
      headers: [
        "Client Mark (2 Letters)",
        "Client Name",
        "Phone Number",
        "Location / Address",
        "Tariff / Special Case",
        "Opening Overdraft Debt (FCFA)",
        "Notes (Optional)"
      ],
      cols: [
        { wch: 22 }, { wch: 24 }, { wch: 20 }, { wch: 22 }, { wch: 22 }, { wch: 26 }, { wch: 25 }
      ],
      samples: [
        ["PR", "R Paulo", "670000000", "Bafoussam", "Standard", 0, "Regular incubator client"],
        ["NM", "Nguefack Martial", "699000000", "Douala", "Tariff A", 5000, "5,000 FCFA overdraft credit"]
      ]
    },
    flocks: {
      title: "Poultry Flocks & Stock Template",
      sheetName: "Flocks & Stock",
      headers: [
        "Block Name",
        "Cage / Pen Number",
        "Flock / Batch Name",
        "Species (Chicken/Turkey/Quail)",
        "Breed (Brahma/Pure Breed/etc)",
        "Bird Quantity",
        "Age (Weeks)",
        "Date Added (DD/MM/YYYY)",
        "Notes (Optional)"
      ],
      cols: [
        { wch: 16 }, { wch: 18 }, { wch: 26 }, { wch: 26 }, { wch: 25 }, { wch: 15 }, { wch: 14 }, { wch: 22 }, { wch: 22 }
      ],
      samples: [
        ["Block A", "Cage 1", "Brahma Breeders 2026", "Chicken", "Brahma", 120, 16, "01/06/2026", "Main breeding stock"],
        ["Block B", "Pen 3", "Turkey Flock 1", "Turkey", "Gobbler", 35, 20, "15/05/2026", "Heavy weight gobblers"]
      ]
    },
    sales: {
      title: "Poultry & Egg Sales Template",
      sheetName: "Sales & Invoices",
      headers: [
        "Sale Date (DD/MM/YYYY)",
        "Customer Name",
        "Item Type (Bird/Egg/Feed/Manure)",
        "Quantity",
        "Unit Price (FCFA)",
        "Total Amount (FCFA)",
        "Amount Paid (FCFA)",
        "Payment Status (Paid/Pending)",
        "Notes (Optional)"
      ],
      cols: [
        { wch: 22 }, { wch: 24 }, { wch: 28 }, { wch: 12 }, { wch: 18 }, { wch: 20 }, { wch: 20 }, { wch: 22 }, { wch: 22 }
      ],
      samples: [
        ["05/08/2026", "Mbah Jean", "Bird", 5, 12000, 60000, 60000, "Paid", "5 Brahma cockerels sold"],
        ["06/08/2026", "Hôtel Du Plateau", "Egg", 100, 120, 12000, 12000, "Paid", "100 fresh table eggs"]
      ]
    },
    feed: {
      title: "Feed Inventory & Usage Template",
      sheetName: "Feed Records",
      headers: [
        "Log Date (DD/MM/YYYY)",
        "Flock Name",
        "Feed Type (Starter/Grower/Layer)",
        "Bags Count",
        "Kg per Bag",
        "Total Cost (FCFA)",
        "Supplier Name",
        "Notes (Optional)"
      ],
      cols: [
        { wch: 22 }, { wch: 24 }, { wch: 28 }, { wch: 14 }, { wch: 14 }, { wch: 18 }, { wch: 20 }, { wch: 22 }
      ],
      samples: [
        ["02/08/2026", "Brahma Breeders 2026", "Grower Mash", 4, 50, 72000, "SPC Feeds", "Weekly feed top-up"],
        ["05/08/2026", "Turkey Flock 1", "Starter Mash", 2, 50, 38000, "Kouoptamo Mill", "Turkey starter bags"]
      ]
    },
    expenses: {
      title: "Operational Expenses Template",
      sheetName: "Expenses",
      headers: [
        "Expense Date (DD/MM/YYYY)",
        "Category (Feed/Drugs/Saw Dust/etc)",
        "Description",
        "Amount (FCFA)",
        "Payment Method (Cash/MOMO)",
        "Notes (Optional)"
      ],
      cols: [
        { wch: 22 }, { wch: 28 }, { wch: 30 }, { wch: 16 }, { wch: 24 }, { wch: 22 }
      ],
      samples: [
        ["03/08/2026", "Drugs", "Newcastle & Gumboro Vaccines", 15000, "Cash", "Vet vaccination batch"],
        ["04/08/2026", "Saw Dust", "10 Bags Pine Sawdust for Litter", 10000, "Mobile Money", "Farm sanitation"]
      ]
    },
    egg_collections: {
      title: "Daily Egg Collections Template",
      sheetName: "Daily Egg Collections",
      headers: [
        "Collection Date (DD/MM/YYYY)",
        "Species / Flock (Chicken/Turkey)",
        "Quantity Collected",
        "Quality Grade (Good/Cracked)",
        "Notes (Optional)"
      ],
      cols: [
        { wch: 24 }, { wch: 26 }, { wch: 20 }, { wch: 24 }, { wch: 22 }
      ],
      samples: [
        ["08/08/2026", "Chicken", 45, "Good", "Morning egg gathering"],
        ["08/08/2026", "Turkey", 12, "Good", "Turkey pen egg gathering"]
      ]
    },
    mortality: {
      title: "Mortality Records Template",
      sheetName: "Mortality Logs",
      headers: [
        "Record Date (DD/MM/YYYY)",
        "Flock Name",
        "Quantity Lost",
        "Cause of Loss",
        "Notes (Optional)"
      ],
      cols: [
        { wch: 22 }, { wch: 24 }, { wch: 16 }, { wch: 24 }, { wch: 22 }
      ],
      samples: [
        ["04/08/2026", "Brahma Breeders 2026", 1, "Natural / Heat stress", "Isolated immediately"]
      ]
    },
    fowls_eaten: {
      title: "Fowls Eaten Template",
      sheetName: "Fowls Eaten",
      headers: [
        "Record Date (DD/MM/YYYY)",
        "Flock Name",
        "Quantity Eaten",
        "Age (Weeks)",
        "Notes (Optional)"
      ],
      cols: [
        { wch: 22 }, { wch: 24 }, { wch: 16 }, { wch: 14 }, { wch: 22 }
      ],
      samples: [
        ["07/08/2026", "Brahma Breeders 2026", 2, 24, "Staff / Home consumption"]
      ]
    }
  };

  const workbook = XLSX.utils.book_new();

  if (categoryKey === 'all_master') {
    // Generate Master Workbook containing ALL 9 worksheet tabs!
    Object.keys(templates).forEach((key) => {
      const t = templates[key];
      const emptyRows: any[][] = Array.from({ length: 10 }, () => Array(t.headers.length).fill(""));
      const matrix = [t.headers, ...t.samples, ...emptyRows];
      const ws = XLSX.utils.aoa_to_sheet(matrix);
      ws['!cols'] = t.cols;
      XLSX.utils.book_append_sheet(workbook, ws, t.sheetName);
    });
    XLSX.writeFile(workbook, "Master_Farm_Data_Templates.xlsx");
    return;
  }

  const t = templates[categoryKey] || templates.incubator;
  const emptyRows: any[][] = Array.from({ length: 15 }, () => Array(t.headers.length).fill(""));
  const matrix = [t.headers, ...t.samples, ...emptyRows];
  const ws = XLSX.utils.aoa_to_sheet(matrix);
  ws['!cols'] = t.cols;
  XLSX.utils.book_append_sheet(workbook, ws, t.sheetName);

  const fileName = `${t.sheetName.replace(/[^a-zA-Z0-9]/g, '_')}_Template.${format}`;
  if (format === 'csv') {
    XLSX.writeFile(workbook, fileName, { bookType: 'csv' });
  } else {
    XLSX.writeFile(workbook, fileName);
  }
}

// Helper to parse farm stock row with intelligent field detection, age calculation, and mixed qty splitting
function parseStockRow(row: any[], headers: string[]): Array<{
  name: string;
  species: string;
  breed: string;
  quantity: number;
  ageWeeks: number;
  dateAdded: string;
  notes: string;
  blockName: string;
  cageName: string;
}> {
  let blockVal = '';
  let cageVal = '';
  let qtyVal = '';
  let flockNameVal = '';
  let ageVal = '';
  let hatchDateRaw: any = null;

  headers.forEach((h, idx) => {
    const rawCell = row[idx];
    const val = rawCell !== undefined && rawCell !== null ? String(rawCell).trim() : '';
    const hLower = String(h || '').toLowerCase();

    if (hLower.includes('block')) blockVal = val;
    else if (hLower.includes('cage') || hLower.includes('pen') || hLower.includes('location')) cageVal = val;
    else if (hLower.includes('qty') || hLower.includes('quantity') || hLower.includes('count') || hLower.includes('fowls') || hLower.includes('birds')) qtyVal = val;
    else if (hLower.includes('flock') || hLower.includes('batch') || hLower.includes('name') || hLower.includes('label')) flockNameVal = val;
    else if (hLower.includes('age') || hLower.includes('hatch') || hLower.includes('weeks') || hLower.includes('date')) {
      ageVal = val;
      hatchDateRaw = rawCell;
    }
  });

  // Position fallback if headers didn't match
  if (!blockVal && row[0] !== undefined) blockVal = String(row[0] || '').trim();
  if (!cageVal && row[1] !== undefined) cageVal = String(row[1] || '').trim();
  if (!qtyVal && row[2] !== undefined) qtyVal = String(row[2] || '').trim();
  if (!flockNameVal && row[3] !== undefined) flockNameVal = String(row[3] || '').trim();
  if (!ageVal && row[4] !== undefined) {
    ageVal = String(row[4] || '').trim();
    hatchDateRaw = row[4];
  }

  // Calculate Age in Weeks
  let ageWeeks = 0;
  let computedDateAdded = getCameroonTodayISO();

  if (typeof hatchDateRaw === 'number' && hatchDateRaw > 1000) {
    computedDateAdded = parseExcelDate(hatchDateRaw);
    ageWeeks = 0;
  } else if (ageVal && (/\d{4}-\d{2}-\d{2}/.test(ageVal) || /\d{1,2}\/\d{1,2}\/\d{2,4}/.test(ageVal))) {
    computedDateAdded = parseExcelDate(ageVal);
    ageWeeks = 0;
  } else if (ageVal) {
    const numMatch = ageVal.match(/(\d+(?:\.\d+)?)/);
    if (numMatch) {
      ageWeeks = parseFloat(numMatch[1]);
    }
  }

  const results: Array<{
    name: string;
    species: string;
    breed: string;
    quantity: number;
    ageWeeks: number;
    dateAdded: string;
    notes: string;
    blockName: string;
    cageName: string;
  }> = [];

  const cageLocation = cageVal ? cageVal.toUpperCase() : 'UNASSIGNED CAGE';
  const blockLocation = blockVal ? blockVal.toUpperCase() : 'BLOCK 0';

  const combinedText = `${qtyVal} ${flockNameVal} ${cageVal}`.toLowerCase();
  const turkeyMatch = combinedText.match(/(\d+)\s*(?:turkey|turkeys|gobbler|hen|tky|tks)/i);
  const fowlMatch = combinedText.match(/(\d+)\s*(?:fowl|fowls|chicken|chickens|brahma|pure breed|birds)/i);

  if (turkeyMatch && fowlMatch) {
    const chickenQty = parseInt(fowlMatch[1], 10);
    const turkeyQty = parseInt(turkeyMatch[1], 10);

    if (chickenQty > 0) {
      let breed = 'Brahma';
      let species = 'Chicken';
      if (combinedText.includes('pure breed') || combinedText.includes('purebreed')) breed = 'Pure Breed';
      if (combinedText.includes('agric')) species = 'Agric Fowls';

      results.push({
        name: flockNameVal ? `${flockNameVal} (Fowls)` : `${cageLocation} Fowl Batch`,
        species,
        breed,
        quantity: chickenQty,
        ageWeeks,
        dateAdded: computedDateAdded,
        notes: cageLocation,
        blockName: blockLocation,
        cageName: cageLocation
      });
    }

    if (turkeyQty > 0) {
      results.push({
        name: flockNameVal ? `${flockNameVal} (Turkeys)` : `${cageLocation} Turkey Batch`,
        species: 'Turkey',
        breed: combinedText.includes('hen') ? 'Hen' : 'Gobbler',
        quantity: turkeyQty,
        ageWeeks,
        dateAdded: computedDateAdded,
        notes: cageLocation,
        blockName: blockLocation,
        cageName: cageLocation
      });
    }
  } else if (qtyVal.includes('+') && (combinedText.includes('turkey') || combinedText.includes('fowl'))) {
    const parts = qtyVal.split('+');
    const q1 = parseInt((parts[0] || '').replace(/\D/g, ''), 10) || 0;
    const q2 = parseInt((parts[1] || '').replace(/\D/g, ''), 10) || 0;

    if (q1 > 0) {
      results.push({
        name: flockNameVal ? `${flockNameVal} (Fowls)` : `${cageLocation} Fowl Batch`,
        species: combinedText.includes('agric') ? 'Agric Fowls' : 'Chicken',
        breed: combinedText.includes('pure breed') ? 'Pure Breed' : 'Brahma',
        quantity: q1,
        ageWeeks,
        dateAdded: computedDateAdded,
        notes: cageLocation,
        blockName: blockLocation,
        cageName: cageLocation
      });
    }

    if (q2 > 0) {
      results.push({
        name: flockNameVal ? `${flockNameVal} (Turkeys)` : `${cageLocation} Turkey Batch`,
        species: 'Turkey',
        breed: 'Turkey',
        quantity: q2,
        ageWeeks,
        dateAdded: computedDateAdded,
        notes: cageLocation,
        blockName: blockLocation,
        cageName: cageLocation
      });
    }
  } else {
    let parsedQty = 0;
    const cleanNumMatch = qtyVal.match(/(\d+)/);
    if (cleanNumMatch) parsedQty = parseInt(cleanNumMatch[1], 10);

    if (parsedQty > 0) {
      let species = 'Chicken';
      let breed = 'Brahma';

      if (combinedText.includes('turkey') || combinedText.includes('gobbler') || combinedText.includes('hen')) {
        species = 'Turkey';
        breed = combinedText.includes('hen') ? 'Hen' : 'Gobbler';
      } else if (combinedText.includes('quail')) {
        species = 'Quail';
        breed = 'Quail';
      } else if (combinedText.includes('agric')) {
        species = 'Agric Fowls';
        breed = 'Agric Mixed';
      }

      if (combinedText.includes('pure breed') || combinedText.includes('purebreed') || combinedText.includes('pure-breed')) {
        breed = 'Pure Breed';
      }

      results.push({
        name: flockNameVal || `${cageLocation} ${species} Batch`,
        species,
        breed,
        quantity: parsedQty,
        ageWeeks,
        dateAdded: computedDateAdded,
        notes: cageLocation,
        blockName: blockLocation,
        cageName: cageLocation
      });
    }
  }

  return results;
}

export default function ExcelImportModal({ isOpen, onClose, token, triggerRefresh }: ExcelImportModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [selectedSheet, setSelectedSheet] = useState<string>('');
  const [parsedRows, setParsedRows] = useState<any[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [workbook, setWorkbook] = useState<XLSX.WorkBook | null>(null);
  const [targetCategory, setTargetCategory] = useState<ImportTargetCategory>('incubator');
  const [isNVFFormat, setIsNVFFormat] = useState(false);
  
  const [isProcessing, setIsProcessing] = useState(false);
  const [importStatus, setImportStatus] = useState<{ success: boolean; message: string } | null>(null);

  if (!isOpen) return null;

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const uploadedFile = e.target.files?.[0];
    if (!uploadedFile) return;

    setFile(uploadedFile);
    setImportStatus(null);

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = new Uint8Array(event.target?.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: 'array', cellDates: true, raw: true });
        setWorkbook(wb);
        setSheetNames(wb.SheetNames);

        // Check if file is the New Vision Farm record template
        const hasNVFSheets = wb.SheetNames.some(s => ['Poultry', 'current stock', 'Turkeys'].includes(s));
        setIsNVFFormat(hasNVFSheets);

        if (wb.SheetNames.length > 0) {
          loadSheetData(wb, wb.SheetNames[0], hasNVFSheets);
        }
      } catch (err) {
        console.error('Error reading Excel file:', err);
        setImportStatus({
          success: false,
          message: 'Failed to read Excel file format. Make sure it is a valid .xlsx, .xls, or .csv file.'
        });
      }
    };
    reader.readAsArrayBuffer(uploadedFile);
  };

  const loadSheetData = (wb: XLSX.WorkBook, sheetName: string, nvfDetected = isNVFFormat) => {
    setSelectedSheet(sheetName);
    const ws = wb.Sheets[sheetName];
    const jsonData = XLSX.utils.sheet_to_json<any>(ws, { header: 1, raw: true });
    
    // Auto-detect target category based on sheet name
    const sLower = sheetName.toLowerCase();
    if (sLower.includes('client') || sLower.includes('customer')) {
      setTargetCategory('clients');
    } else if (sLower.includes('incubator') || sLower.includes('batch') || sLower.includes('hatch')) {
      setTargetCategory('incubator');
    } else if (sLower.includes('flock') || sLower.includes('stock') || sLower.includes('poultry') || sLower.includes('bird') || sLower.includes('cage') || sLower.includes('pen')) {
      setTargetCategory('flocks');
    } else if (sLower.includes('sale') || sLower.includes('revenue') || sLower.includes('invoice')) {
      setTargetCategory('sales');
    } else if (sLower.includes('feed')) {
      setTargetCategory('feed');
    } else if (sLower.includes('expense') || sLower.includes('outlay')) {
      setTargetCategory('expenses');
    } else if (sLower.includes('egg collection') || sLower.includes('daily egg')) {
      setTargetCategory('egg_collections');
    } else if (sLower.includes('mortality') || sLower.includes('death')) {
      setTargetCategory('mortality');
    } else if (sLower.includes('eaten') || sLower.includes('consumption')) {
      setTargetCategory('fowls_eaten');
    }

    if (jsonData.length > 0) {
      if (nvfDetected && (sheetName === 'Poultry' || sheetName === 'Turkeys')) {
        const rawHeaders = ['Day', 'Date', 'Eggs Collected', 'Eggs Incubated', 'Cumm Eggs', 'Chicks Harvested', 'Cum Chicks', 'Hatch Rate', 'Cost Birds', 'Feed Bags', 'Feed Amount FCFA', 'Birds Count', 'Birds Amount', 'Drugs', 'Saw Dust', 'Total Exp', 'Eggs Sold', 'Eggs Sold Amt', 'Birds Sold', 'Birds Sold Amt FCFA', 'Other Income', 'Income Total', 'Net Bal', 'Fowls Eaten', 'Mortality', 'Stock Balance'];
        const rawRows = jsonData.slice(3).filter((r: any) => r && r.length > 0 && r[1] !== undefined && r[1] !== null && r[1] !== '');
        setHeaders(rawHeaders);
        setParsedRows(rawRows);
      } else {
        const rawHeaders = (jsonData[0] as any[]).map(h => String(h || '').trim());
        const rawRows = jsonData.slice(1).filter((r: any) => r && r.length > 0 && r.some((cell: any) => cell !== null && cell !== undefined && cell !== ''));
        setHeaders(rawHeaders);
        setParsedRows(rawRows);
      }
    } else {
      setHeaders([]);
      setParsedRows([]);
    }
  };

  const handleSheetChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const sheetName = e.target.value;
    if (workbook) {
      loadSheetData(workbook, sheetName);
    }
  };

  const handleExecuteImport = async () => {
    if (!token) {
      setImportStatus({ success: false, message: 'You must be logged in as an operator to import data.' });
      return;
    }

    if (parsedRows.length === 0) {
      setImportStatus({ success: false, message: 'No data rows found in selected sheet.' });
      return;
    }

    setIsProcessing(true);
    setImportStatus(null);

    try {
      let importedCount = 0;
      
      // Map row arrays to backend field objects based on target category
      for (const row of parsedRows) {
        let endpoint = '';
        let payload: any = {};

        const getCell = (index: number) => (index >= 0 && row[index] !== undefined && row[index] !== null) ? String(row[index]).trim() : '';
        const getDateCell = (index: number) => parseExcelDate(row[index]);

        // Smart column finder helpers
        const findColIndex = (keywords: string[]) => {
          return headers.findIndex(h => {
            const hLow = String(h || '').toLowerCase();
            return keywords.some(k => hLow.includes(k));
          });
        };

        if (isNVFFormat && (selectedSheet === 'Poultry' || selectedSheet === 'Turkeys')) {
          const rowDate = getDateCell(1);
          const species = selectedSheet === 'Turkeys' ? 'Turkey' : 'Chicken';

          // 1. Egg Collection
          const eggsColl = Number(getCell(2));
          if (eggsColl > 0) {
            await fetch('/api/daily_egg_collections', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': token },
              body: JSON.stringify({
                date: rowDate,
                species: species,
                quantity: eggsColl,
                quality: 'Good',
                notes: `Imported from ${selectedSheet} sheet`
              })
            });
          }

          // 2. Feed Record
          const feedBags = Number(getCell(9));
          const feedAmt = Number(getCell(10));
          if (feedBags > 0 || feedAmt > 0) {
            await fetch('/api/feed-records', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': token },
              body: JSON.stringify({
                date: rowDate,
                flockName: `${species} Flock`,
                feedType: 'Grower / Layer Mash',
                bagsCount: feedBags || 1,
                totalCost: feedAmt || 0,
                notes: `Imported from ${selectedSheet} sheet`
              })
            });
          }

          // 3. Birds Sales
          const birdsSold = Number(getCell(18));
          const birdsAmt = Number(getCell(19));
          if (birdsSold > 0 || birdsAmt > 0) {
            await fetch('/api/poultry-sales', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': token },
              body: JSON.stringify({
                date: rowDate,
                clientName: 'Imported Customer',
                itemType: 'Bird',
                quantity: birdsSold || 1,
                totalAmount: birdsAmt || 0,
                amountPaid: birdsAmt || 0,
                paymentStatus: 'Paid',
                notes: `Imported from ${selectedSheet} sheet (${species})`
              })
            });
          }

          // 4. Fowls Eaten
          const eatenQty = Number(getCell(23));
          if (eatenQty > 0) {
            await fetch('/api/fowls-eaten', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': token },
              body: JSON.stringify({
                date: rowDate,
                flockName: `${species} Flock`,
                quantity: eatenQty,
                notes: `House Consumption (Imported from ${selectedSheet})`
              })
            });
          }

          // 5. Mortality
          const mortalityQty = Number(getCell(24));
          if (mortalityQty > 0) {
            await fetch('/api/mortality', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': token },
              body: JSON.stringify({
                date: rowDate,
                flockName: `${species} Flock`,
                quantity: mortalityQty,
                cause: 'Recorded in Excel log',
                notes: `Imported from ${selectedSheet} sheet`
              })
            });
          }

          importedCount++;
          continue;
        }

        if (targetCategory === 'clients') {
          const hMark = findColIndex(['mark', 'code', 'initial', 'id']);
          const hName = findColIndex(['name', 'client', 'customer', 'nom']);
          const hPhone = findColIndex(['phone', 'tel', 'contact', 'mobile']);
          const hLoc = findColIndex(['location', 'address', 'city', 'ville']);
          const hTariff = findColIndex(['tariff', 'case', 'pricing', 'special']);
          const hDebt = findColIndex(['debt', 'overdraft', 'balance', 'credit']);
          const hNotes = findColIndex(['note', 'comment', 'remark']);

          let mark = (hMark !== -1 ? getCell(hMark) : getCell(0)).trim().toUpperCase();
          const rawName = (hName !== -1 ? getCell(hName) : getCell(1)) || `Client ${mark}`;
          
          if (!mark && rawName) {
            const p = rawName.match(/\(([^)]+)\)/);
            if (p && p[1].trim().length === 2) mark = p[1].trim().toUpperCase();
            else mark = rawName.substring(0, 2).toUpperCase();
          }
          mark = (mark.replace(/[^A-Z0-9]/gi, '') + 'XX').substring(0, 2).toUpperCase();

          const clientName = rawName.replace(/\([^)]*\)/g, '').trim() || `Client ${mark}`;
          const phone = (hPhone !== -1 ? getCell(hPhone) : getCell(2)) || '237650000000';
          const location = (hLoc !== -1 ? getCell(hLoc) : getCell(3)) || 'Bafoussam';
          const specialCase = (hTariff !== -1 ? getCell(hTariff) : getCell(4)) || 'Standard';
          const debtRaw = (hDebt !== -1 ? getCell(hDebt) : getCell(5)).replace(/[^0-9\.]/g, '');
          const overdraft = debtRaw ? Number(debtRaw) : 0;
          const notes = (hNotes !== -1 ? getCell(hNotes) : getCell(6)) || 'Imported client record';

          const res = await fetch('/api/clients', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': token },
            body: JSON.stringify({
              mark,
              name: clientName,
              phone,
              location,
              specialCase,
              overdraft,
              notes
            })
          });
          if (res.ok) importedCount++;
          continue;
        } else if (targetCategory === 'flocks' || selectedSheet.toLowerCase().includes('stock')) {
          const parsedFlocks = parseStockRow(row, headers);
          for (const item of parsedFlocks) {
            if (item.cageName && item.cageName !== 'UNASSIGNED CAGE') {
              try {
                await fetch('/api/cages', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', 'Authorization': token },
                  body: JSON.stringify({ blockName: item.blockName, cageName: item.cageName })
                });
              } catch {
                // Ignore duplicate cage errors
              }
            }

            await fetch('/api/flocks', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': token },
              body: JSON.stringify({
                name: item.name,
                species: item.species,
                breed: item.breed,
                quantity: item.quantity,
                ageWeeks: item.ageWeeks,
                dateAdded: item.dateAdded,
                notes: item.notes
              })
            });
            importedCount++;
          }
          continue;
        } else if (targetCategory === 'incubator') {
          const hMark = findColIndex(['mark', 'initial', 'code', 'marquage']);
          const hName = findColIndex(['client name', 'nom', 'name', 'customer']);
          const hDate = findColIndex(['date brought', 'brought', 'date', 'day 1', 'jour 1']);
          const hType = findColIndex(['egg type', 'species', 'type', 'breed', 'volaille']);
          const hEggs = findColIndex(['number of egg', 'eggs collected', 'eggs brought', 'egg count', 'total egg', 'eggs', 'oeufs', 'qty', 'quantity']);
          const hCase = findColIndex(['case', 'tariff', 'pricing', 'tarification', 'special']);
          const hPaid = findColIndex(['paid', 'paye', 'verse', 'amount paid', 'payment']);
          const hPhone = findColIndex(['phone', 'tel', 'contact']);
          const hLoc = findColIndex(['location', 'city', 'address', 'ville']);
          const hNotes = findColIndex(['notes', 'comment', 'remark']);

          const dateBrought = hDate !== -1 ? getDateCell(hDate) : getDateCell(0);
          const rawName = (hName !== -1 ? getCell(hName) : '') || getCell(1) || getCell(0);
          let clientMark = (hMark !== -1 ? getCell(hMark) : '') || getCell(2) || '';
          
          if (!clientMark && rawName) {
            const parenMatch = rawName.match(/\(([^)]+)\)/);
            if (parenMatch && parenMatch[1].trim().length === 2) {
              clientMark = parenMatch[1].trim().toUpperCase();
            } else {
              clientMark = rawName.substring(0, 2).toUpperCase();
            }
          }
          clientMark = (clientMark.replace(/[^A-Z0-9]/gi, '') + 'XX').substring(0, 2).toUpperCase();

          const clientName = rawName.replace(/\([^)]*\)/g, '').trim() || `Client ${clientMark}`;
          const eggType = (hType !== -1 ? getCell(hType) : '') || getCell(3) || 'Brahma';
          
          let parsedEggs = hEggs !== -1 && row[hEggs] !== undefined ? String(row[hEggs]).replace(/[^0-9]/g, '') : '';
          const eggsCollected = parsedEggs ? Number(parsedEggs) : (Number(getCell(4)) || Number(getCell(3)) || 0);

          const specialCase = (hCase !== -1 ? getCell(hCase) : '') || getCell(5) || 'Standard';
          
          let parsedPaid = hPaid !== -1 && row[hPaid] !== undefined ? String(row[hPaid]).replace(/[^0-9\.]/g, '') : '';
          const amountPaid = parsedPaid ? Number(parsedPaid) : (Number(getCell(6)) || 0);

          const clientPhone = (hPhone !== -1 ? getCell(hPhone) : '') || getCell(7) || '237650000000';
          const clientLocation = (hLoc !== -1 ? getCell(hLoc) : '') || getCell(8) || 'Bafoussam';
          const notes = (hNotes !== -1 ? getCell(hNotes) : '') || getCell(9) || 'Imported from Excel';

          const batchPayload = {
            batches: [{
              clientMark,
              clientName,
              dateBrought,
              eggType,
              eggsCollected,
              specialCase,
              amountPaid,
              clientPhone,
              clientLocation,
              notes
            }]
          };

          const res = await fetch('/api/incubator/import', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': token
            },
            body: JSON.stringify(batchPayload)
          });
          if (res.ok) {
            importedCount++;
          }
          continue;
        } else if (targetCategory === 'feed') {
          const hDate = findColIndex(['date', 'log date']);
          const hFlock = findColIndex(['flock', 'batch', 'poultry']);
          const hType = findColIndex(['type', 'feed type', 'feed']);
          const hBags = findColIndex(['bags', 'count', 'qty', 'quantity']);
          const hKg = findColIndex(['kg', 'weight']);
          const hCost = findColIndex(['cost', 'total cost', 'amount', 'prix']);
          const hSupplier = findColIndex(['supplier', 'vendor', 'source']);
          const hNotes = findColIndex(['notes', 'comment', 'remark']);

          endpoint = '/api/feed-records';
          payload = {
            date: hDate !== -1 ? getDateCell(hDate) : getDateCell(0),
            flockName: (hFlock !== -1 ? getCell(hFlock) : getCell(1)) || 'General Flock',
            feedType: (hType !== -1 ? getCell(hType) : getCell(2)) || 'Grower Mash',
            bagsCount: (hBags !== -1 ? Number(getCell(hBags).replace(/[^0-9]/g, '')) : Number(getCell(3))) || 1,
            kgPerBag: (hKg !== -1 ? Number(getCell(hKg).replace(/[^0-9\.]/g, '')) : Number(getCell(4))) || 50,
            totalCost: (hCost !== -1 ? Number(getCell(hCost).replace(/[^0-9\.]/g, '')) : Number(getCell(5))) || 0,
            supplier: (hSupplier !== -1 ? getCell(hSupplier) : getCell(6)) || '',
            notes: (hNotes !== -1 ? getCell(hNotes) : getCell(7)) || 'Imported from Excel'
          };
        } else if (targetCategory === 'sales') {
          const hDate = findColIndex(['date', 'sale date']);
          const hClient = findColIndex(['client', 'customer', 'name', 'nom']);
          const hItem = findColIndex(['item', 'type', 'product']);
          const hQty = findColIndex(['qty', 'quantity', 'count']);
          const hUnit = findColIndex(['unit price', 'unit', 'price']);
          const hTotal = findColIndex(['total', 'amount', 'total amount']);
          const hPaid = findColIndex(['paid', 'amount paid', 'verse']);
          const hStatus = findColIndex(['status', 'payment status']);
          const hNotes = findColIndex(['notes', 'comment']);

          endpoint = '/api/poultry-sales';
          const qtyVal = hQty !== -1 ? Number(getCell(hQty).replace(/[^0-9]/g, '')) : Number(getCell(3)) || 1;
          const unitVal = hUnit !== -1 ? Number(getCell(hUnit).replace(/[^0-9\.]/g, '')) : Number(getCell(4)) || 0;
          const totalVal = hTotal !== -1 ? Number(getCell(hTotal).replace(/[^0-9\.]/g, '')) : Number(getCell(5)) || (qtyVal * unitVal);

          payload = {
            date: hDate !== -1 ? getDateCell(hDate) : getDateCell(0),
            clientName: (hClient !== -1 ? getCell(hClient) : getCell(1)) || 'Walk-in Customer',
            itemType: (hItem !== -1 ? getCell(hItem) : getCell(2)) || 'Bird',
            quantity: qtyVal,
            unitPrice: unitVal,
            totalAmount: totalVal,
            amountPaid: (hPaid !== -1 ? Number(getCell(hPaid).replace(/[^0-9\.]/g, '')) : Number(getCell(6))) || totalVal,
            paymentStatus: (hStatus !== -1 ? getCell(hStatus) : getCell(7)) || 'Paid',
            notes: (hNotes !== -1 ? getCell(hNotes) : getCell(8)) || 'Imported from Excel'
          };
        } else if (targetCategory === 'mortality') {
          const hDate = findColIndex(['date', 'record date']);
          const hFlock = findColIndex(['flock', 'batch', 'pen']);
          const hQty = findColIndex(['lost', 'qty', 'quantity', 'dead', 'count']);
          const hCause = findColIndex(['cause', 'reason', 'disease']);
          const hNotes = findColIndex(['notes', 'comment']);

          endpoint = '/api/mortality';
          payload = {
            date: hDate !== -1 ? getDateCell(hDate) : getDateCell(0),
            flockName: (hFlock !== -1 ? getCell(hFlock) : getCell(1)) || 'Flock',
            quantity: (hQty !== -1 ? Number(getCell(hQty).replace(/[^0-9]/g, '')) : Number(getCell(2))) || 1,
            cause: (hCause !== -1 ? getCell(hCause) : getCell(3)) || 'Recorded in Excel log',
            notes: (hNotes !== -1 ? getCell(hNotes) : getCell(4)) || 'Imported from Excel'
          };
        } else if (targetCategory === 'expenses') {
          const hDate = findColIndex(['date', 'expense date']);
          const hCat = findColIndex(['category', 'type']);
          const hDesc = findColIndex(['description', 'item', 'details']);
          const hAmt = findColIndex(['amount', 'cost', 'prix', 'montant']);
          const hPay = findColIndex(['method', 'payment', 'paid via']);
          const hNotes = findColIndex(['notes', 'comment']);

          endpoint = '/api/expenses';
          payload = {
            date: hDate !== -1 ? getDateCell(hDate) : getDateCell(0),
            category: (hCat !== -1 ? getCell(hCat) : getCell(1)) || 'General',
            description: (hDesc !== -1 ? getCell(hDesc) : getCell(2)) || 'Farm Expense',
            amount: (hAmt !== -1 ? Number(getCell(hAmt).replace(/[^0-9\.]/g, '')) : Number(getCell(3))) || 0,
            paymentMethod: (hPay !== -1 ? getCell(hPay) : getCell(4)) || 'Cash',
            notes: (hNotes !== -1 ? getCell(hNotes) : getCell(5)) || 'Imported from Excel'
          };
        } else if (targetCategory === 'egg_collections') {
          const hDate = findColIndex(['date', 'collection date']);
          const hSpecies = findColIndex(['species', 'flock', 'breed', 'type']);
          const hQty = findColIndex(['qty', 'quantity', 'count', 'collected', 'eggs']);
          const hQual = findColIndex(['quality', 'grade', 'condition']);
          const hNotes = findColIndex(['notes', 'comment']);

          endpoint = '/api/daily_egg_collections';
          payload = {
            date: hDate !== -1 ? getDateCell(hDate) : getDateCell(0),
            species: (hSpecies !== -1 ? getCell(hSpecies) : getCell(1)) || 'Chicken',
            quantity: (hQty !== -1 ? Number(getCell(hQty).replace(/[^0-9]/g, '')) : Number(getCell(2))) || 1,
            quality: (hQual !== -1 ? getCell(hQual) : getCell(3)) || 'Good',
            notes: (hNotes !== -1 ? getCell(hNotes) : getCell(4)) || 'Imported from Excel'
          };
        } else if (targetCategory === 'fowls_eaten') {
          const hDate = findColIndex(['date', 'record date']);
          const hFlock = findColIndex(['flock', 'batch', 'pen']);
          const hQty = findColIndex(['qty', 'quantity', 'eaten', 'count']);
          const hAge = findColIndex(['age', 'weeks']);
          const hNotes = findColIndex(['notes', 'comment', 'reason']);

          endpoint = '/api/fowls-eaten';
          payload = {
            date: hDate !== -1 ? getDateCell(hDate) : getDateCell(0),
            flockName: (hFlock !== -1 ? getCell(hFlock) : getCell(1)) || 'Flock',
            quantity: (hQty !== -1 ? Number(getCell(hQty).replace(/[^0-9]/g, '')) : Number(getCell(2))) || 1,
            ageWeeks: (hAge !== -1 ? Number(getCell(hAge).replace(/[^0-9]/g, '')) : Number(getCell(3))) || 12,
            notes: (hNotes !== -1 ? getCell(hNotes) : getCell(4)) || 'House Consumption (Imported)'
          };
        }

        if (endpoint) {
          const res = await fetch(endpoint, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': token
            },
            body: JSON.stringify(payload)
          });
          if (res.ok) {
            importedCount++;
          }
        }
      }

      setImportStatus({
        success: true,
        message: `Successfully imported ${importedCount} out of ${parsedRows.length} rows into ${targetCategory.toUpperCase()}!`
      });
      triggerRefresh();
    } catch (err: any) {
      setImportStatus({
        success: false,
        message: `Import failed: ${err.message || 'Server error during import.'}`
      });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
      <div className="bg-white w-full max-w-4xl rounded-3xl shadow-2xl border border-slate-100 overflow-hidden my-auto max-h-[95vh] flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-emerald-800 to-teal-900 p-5 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-white/10 rounded-2xl">
              <FileSpreadsheet size={26} className="text-emerald-300" />
            </div>
            <div>
              <h2 className="text-lg font-black uppercase tracking-tight flex items-center gap-2">
                Excel & CSV Data Import Wizard
                <span className="bg-emerald-500/30 text-emerald-200 text-[10px] px-2 py-0.5 rounded-full font-bold border border-emerald-400/30">
                  Universal Importer
                </span>
              </h2>
              <p className="text-xs text-emerald-200">Organize and import past Excel records into farm tables with 100% precision</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-white/70 hover:text-white bg-white/10 hover:bg-white/20 rounded-full cursor-pointer transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-4 sm:p-6 space-y-6 flex-1 overflow-y-auto">
          {/* SECTION 1: DOWNLOAD TEMPLATES HUB */}
          <div className="bg-emerald-50/60 border border-emerald-200/80 rounded-2xl p-4 sm:p-5 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-1">
                <h3 className="text-xs font-black text-emerald-900 uppercase tracking-wider flex items-center gap-2">
                  <Download size={16} className="text-emerald-600" />
                  1. Download Official Pre-Formatted Excel Templates
                </h3>
                <p className="text-xs text-slate-600 font-medium leading-relaxed">
                  Easily fill your past farm records into structured columns with clear headers and sample rows.
                </p>
              </div>

              {/* Master All-in-One Download Button */}
              <button
                type="button"
                onClick={() => downloadExcelTemplate('all_master')}
                className="shrink-0 bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-700 hover:to-teal-800 text-white text-xs font-black px-4 py-2.5 rounded-xl shadow-sm transition-all flex items-center gap-2 cursor-pointer active:scale-95"
              >
                <Sparkles size={16} className="text-amber-300 animate-pulse" />
                <span>Download Master All-in-One Workbook (.xlsx)</span>
              </button>
            </div>

            {/* Individual Table Templates Grid */}
            <div className="pt-2 border-t border-emerald-200/60">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-2">
                Or download individual table templates:
              </span>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
                {[
                  { key: 'incubator', label: 'Incubator Batches' },
                  { key: 'clients', label: 'Registered Clients' },
                  { key: 'flocks', label: 'Flocks & Stock' },
                  { key: 'sales', label: 'Sales & Invoices' },
                  { key: 'feed', label: 'Feed Records' },
                  { key: 'expenses', label: 'Expenses' },
                  { key: 'egg_collections', label: 'Egg Collections' },
                  { key: 'mortality', label: 'Mortality Logs' },
                  { key: 'fowls_eaten', label: 'Fowls Eaten' }
                ].map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => downloadExcelTemplate(item.key)}
                    className="p-2 bg-white hover:bg-emerald-100/70 border border-emerald-200 rounded-xl text-left transition-colors cursor-pointer group"
                  >
                    <span className="block text-[11px] font-bold text-slate-800 group-hover:text-emerald-800 truncate">
                      {item.label}
                    </span>
                    <span className="text-[9px] font-semibold text-emerald-600 flex items-center gap-1 mt-0.5">
                      <Download size={10} /> Download .xlsx
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* SECTION 2: UPLOAD FILE BOX */}
          <div className="border-2 border-dashed border-emerald-300 bg-emerald-50/20 rounded-2xl p-6 text-center hover:bg-emerald-50/50 transition-colors">
            <input
              type="file"
              accept=".xlsx, .xls, .csv"
              onChange={handleFileUpload}
              className="hidden"
              id="excel_file_input"
            />
            <label htmlFor="excel_file_input" className="cursor-pointer flex flex-col items-center justify-center">
              <Upload size={38} className="text-emerald-600 mb-2 animate-bounce" />
              <span className="text-sm font-extrabold text-slate-800 uppercase tracking-wide">
                {file ? file.name : '2. Select or Drop Your Completed Excel (.xlsx, .xls) or CSV File Here'}
              </span>
              <span className="text-xs text-slate-500 mt-1">
                {file ? `${(file.size / 1024).toFixed(1)} KB uploaded` : 'Supports Microsoft Excel workbooks & raw CSV data tables'}
              </span>
            </label>
          </div>

          {/* SECTION 3: SHEET & CATEGORY SELECTOR */}
          {workbook && sheetNames.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-slate-50 p-4 rounded-2xl border border-slate-200">
              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                  <Layers size={14} className="text-emerald-600" />
                  Select Worksheet Tab
                </label>
                <select
                  value={selectedSheet}
                  onChange={handleSheetChange}
                  className="w-full h-11 px-3 bg-white border border-slate-300 rounded-xl font-semibold text-slate-800 text-xs focus:ring-2 focus:ring-emerald-500"
                >
                  {sheetNames.map((s) => (
                    <option key={s} value={s}>
                      Sheet Tab: {s}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                  <Table size={14} className="text-emerald-600" />
                  Destination App Table
                </label>
                <select
                  value={targetCategory}
                  onChange={(e) => setTargetCategory(e.target.value as ImportTargetCategory)}
                  className="w-full h-11 px-3 bg-white border border-slate-300 rounded-xl font-bold text-emerald-800 text-xs focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="incubator">Incubator Batches & Hatchery Logs</option>
                  <option value="clients">Registered Clients & Overdrafts</option>
                  <option value="flocks">Flocks / Poultry Batches & Pens</option>
                  <option value="sales">Poultry & Egg Sales (Invoices)</option>
                  <option value="feed">Feed Stock & Consumption Log</option>
                  <option value="expenses">Operational Expenses</option>
                  <option value="egg_collections">Daily Egg Collections</option>
                  <option value="mortality">Mortality Records</option>
                  <option value="fowls_eaten">Fowls Eaten at Home</option>
                </select>
              </div>
            </div>
          )}

          {/* SECTION 4: DATA TABLE PREVIEW */}
          {parsedRows.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-black text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                  <Table size={14} className="text-emerald-600" />
                  Preview Sheet Data ({parsedRows.length} rows detected)
                </span>
                <span className="text-[11px] text-slate-500 font-medium">
                  Showing first 5 rows
                </span>
              </div>

              <div className="overflow-x-auto rounded-xl border border-slate-200 max-h-48 overflow-y-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-100 font-bold text-slate-700 uppercase">
                    <tr>
                      <th className="p-2 border-b border-slate-200">#</th>
                      {headers.map((h, i) => (
                        <th key={i} className="p-2 border-b border-slate-200 font-mono text-[11px]">
                          {h || `Col ${i + 1}`}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-600 font-medium">
                    {parsedRows.slice(0, 5).map((row, rIdx) => (
                      <tr key={rIdx} className="hover:bg-slate-50">
                        <td className="p-2 font-mono text-slate-400 font-bold">{rIdx + 1}</td>
                        {headers.map((_, cIdx) => (
                          <td key={cIdx} className="p-2 whitespace-nowrap">
                            {row[cIdx] !== undefined ? String(row[cIdx]) : '-'}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* IMPORT STATUS ALERT */}
          {importStatus && (
            <div
              className={`p-4 rounded-2xl text-xs font-bold flex items-start gap-3 ${
                importStatus.success
                  ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
                  : 'bg-rose-50 border border-rose-200 text-rose-800'
              }`}
            >
              {importStatus.success ? (
                <CheckCircle2 size={18} className="shrink-0 text-emerald-600" />
              ) : (
                <AlertCircle size={18} className="shrink-0 text-rose-600" />
              )}
              <div>
                <p className="font-extrabold">{importStatus.message}</p>
                {importStatus.success && (
                  <p className="text-[11px] font-medium text-emerald-700 mt-1">
                    All valid records have been saved directly to your farm database and synchronized across the application.
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* FOOTER ACTIONS */}
        <div className="p-5 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-bold rounded-xl uppercase tracking-wider cursor-pointer transition-colors"
          >
            Close
          </button>

          <button
            type="button"
            onClick={handleExecuteImport}
            disabled={isProcessing || parsedRows.length === 0}
            className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-black rounded-xl uppercase tracking-wider shadow-md transition-all flex items-center gap-2 cursor-pointer active:scale-95"
          >
            {isProcessing ? 'Processing Import...' : `Import Data Into ${targetCategory.toUpperCase()}`}
            <ArrowRight size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}

