const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
const DB_FILE = path.join(DATA_DIR, 'db.json');

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

function parseExcelFlocks() {
  let excelPath = './POULTRY RECORDS.xlsx';
  if (!fs.existsSync(excelPath)) excelPath = '/POULTRY RECORDS.xlsx';
  if (!fs.existsSync(excelPath)) {
    const files = fs.readdirSync('.').filter(f => f.toLowerCase().includes('poultry') || f.endsWith('.xlsx'));
    if (files.length > 0) excelPath = './' + files[0];
  }

  if (!fs.existsSync(excelPath)) {
    console.error('No Excel file found at', excelPath);
    return [];
  }

  const workbook = XLSX.readFile(excelPath);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });

  const parseDateOrAge = (val) => {
    if (!val) return { ageWeeks: 0, dateAdded: '2026-08-03' };
    const s = String(val).trim().toUpperCase();
    if (s.includes('WEEK') || s.includes('WK')) {
      const m = s.match(/(\d+)/);
      const wks = m ? parseInt(m[1], 10) : 0;
      const d = new Date('2026-08-03');
      d.setDate(d.getDate() - wks * 7);
      return { ageWeeks: wks, dateAdded: d.toISOString().split('T')[0] };
    }
    const parts = s.split('/');
    if (parts.length === 2) {
      const day = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10);
      const dateStr = `2026-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
      const hatchDate = new Date(dateStr);
      const today = new Date('2026-08-03');
      const diffDays = Math.max(0, (today.getTime() - hatchDate.getTime()) / (1000 * 3600 * 24));
      const ageWeeks = Math.round((diffDays / 7) * 10) / 10;
      return { ageWeeks, dateAdded: dateStr };
    }
    return { ageWeeks: 0, dateAdded: '2026-08-03' };
  };

  const flocks = [];

  data.slice(2).forEach((row, idx) => {
    if (!row || row.length === 0) return;
    const blockRaw = String(row[0] || '').trim().toUpperCase();
    const cageRaw = String(row[1] || '').trim().toUpperCase();
    const flockNum = row[2];
    const qtyRaw = row[3];
    const ageRaw = row[4];

    if (!cageRaw && !qtyRaw) return;

    const cageName = cageRaw;
    const { ageWeeks, dateAdded } = parseDateOrAge(ageRaw);
    const qStr = String(qtyRaw || '').trim();

    const addFlock = (name, species, breed, qty, detail) => {
      if (qty <= 0) return;
      flocks.push({
        id: `flock-${idx + 1}-${species.toLowerCase()}-${flocks.length + 1}`,
        name,
        species,
        breed,
        quantity: qty,
        ageWeeks,
        initialAgeWeeks: ageWeeks,
        dateAdded,
        purpose: 'Meat & Eggs',
        notes: cageName + (detail ? ` (${detail})` : '')
      });
    };

    if (qStr.includes('+')) {
      const hasTurkey = qStr.toUpperCase().includes('TURKEY') || qStr.toUpperCase().includes('TKY');
      const hasPureBreed = qStr.toUpperCase().includes('PURE BREED') || qStr.toUpperCase().includes('PUREBREED');
      
      if (hasTurkey) {
        const parts = qStr.split('+');
        parts.forEach(part => {
          const p = part.trim().toUpperCase();
          const numMatch = p.match(/(\d+)/);
          const q = numMatch ? parseInt(numMatch[1], 10) : 0;
          if (q <= 0) return;

          if (p.includes('TURKEY') || p.includes('TKY')) {
            addFlock(`Batch #${flockNum || idx} (Turkey)`, 'Turkey', 'Turkey', q, part.trim());
          } else {
            addFlock(`Batch #${flockNum || idx} (Brahma)`, 'Chicken', 'Brahma', q, part.trim());
          }
        });
      } else if (hasPureBreed) {
        const parts = qStr.split('+');
        parts.forEach(part => {
          const p = part.trim().toUpperCase();
          const numMatch = p.match(/(\d+)/);
          const q = numMatch ? parseInt(numMatch[1], 10) : 0;
          if (q <= 0) return;

          if (p.includes('PURE BREED') || p.includes('PUREBREED')) {
            addFlock(`Batch #${flockNum || idx} (Pure Breed Brahma)`, 'Chicken', 'Pure Breed', q, part.trim());
          } else {
            addFlock(`Batch #${flockNum || idx} (Brahma)`, 'Chicken', 'Brahma', q, part.trim());
          }
        });
      } else {
        const parts = qStr.split('+');
        let totalQty = 0;
        parts.forEach(p => {
          const numMatch = p.match(/(\d+)/);
          if (numMatch) totalQty += parseInt(numMatch[1], 10);
        });
        if (totalQty > 0) {
          addFlock(`Batch #${flockNum || idx} (Brahma)`, 'Chicken', 'Brahma', totalQty, qStr);
        }
      }
    } else if (typeof qtyRaw === 'number') {
      if (qtyRaw > 0) {
        addFlock(`Batch #${flockNum || idx} (Brahma)`, 'Chicken', 'Brahma', qtyRaw, '');
      }
    } else if (qStr) {
      const numMatch = qStr.match(/(\d+)/);
      const q = numMatch ? parseInt(numMatch[1], 10) : 0;
      if (q > 0) {
        const isTurkey = qStr.toUpperCase().includes('TURKEY');
        addFlock(`Batch #${flockNum || idx} ${isTurkey ? '(Turkey)' : '(Brahma)'}`, isTurkey ? 'Turkey' : 'Chicken', isTurkey ? 'Turkey' : 'Brahma', q, qStr);
      }
    }
  });

  return flocks;
}

const seededFlocks = parseExcelFlocks();

const initialDb = {
  users: [],
  clients: [],
  incubator_records: [],
  flocks: seededFlocks,
  feed_records: [],
  poultry_sales: [],
  mortality: [],
  expenses: [],
  cage_transfers: [],
  cages: [...DEFAULT_CAGES],
  cage_allocations: [],
  daily_egg_collections: []
};

fs.writeFileSync(DB_FILE, JSON.stringify(initialDb, null, 2), 'utf-8');
console.log('Successfully seeded db.json with', seededFlocks.length, 'flocks and', DEFAULT_CAGES.length, 'cages!');
