const fs = require('fs');
const XLSX = require('xlsx');

const workbook = XLSX.readFile('./POULTRY RECORDS.xlsx');
const sheet = workbook.Sheets[workbook.SheetNames[0]];
const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });

console.log('Total raw rows:', data.length);

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
const cagesMap = new Map();

data.slice(2).forEach((row, idx) => {
  if (!row || row.length === 0) return;
  const blockRaw = String(row[0] || '').trim().toUpperCase();
  const cageRaw = String(row[1] || '').trim().toUpperCase();
  const flockNum = row[2];
  const qtyRaw = row[3];
  const ageRaw = row[4];

  if (!cageRaw && !qtyRaw) return;

  const blockName = blockRaw ? (blockRaw.startsWith('BLOCK') ? blockRaw : `BLOCK ${blockRaw.replace(/\D/g, '')}`) : 'BLOCK 0';
  const cageName = cageRaw;

  if (cageName) {
    cagesMap.set(cageName, blockName);
  }

  const { ageWeeks, dateAdded } = parseDateOrAge(ageRaw);

  const qStr = String(qtyRaw || '').trim();

  const addFlock = (name, species, breed, qty) => {
    if (qty <= 0) return;
    flocks.push({
      id: `flock-excel-${idx}-${species}-${flocks.length}`,
      name,
      species,
      breed,
      quantity: qty,
      ageWeeks,
      dateAdded,
      initialAgeWeeks: ageWeeks,
      notes: cageName
    });
  };

  if (qStr.includes('+')) {
    const parts = qStr.split('+');
    parts.forEach(part => {
      const p = part.trim().toUpperCase();
      const numMatch = p.match(/(\d+)/);
      const q = numMatch ? parseInt(numMatch[1], 10) : 0;
      if (q <= 0) return;

      if (p.includes('TURKEY') || p.includes('TKY')) {
        addFlock(`Batch #${flockNum || idx} (Turkey)`, 'Turkey', 'Turkey', q);
      } else if (p.includes('PURE BREED') || p.includes('PUREBREED')) {
        addFlock(`Batch #${flockNum || idx} (Pure Breed Brahma)`, 'Chicken', 'Pure Breed', q);
      } else if (p.includes('BRAHMA')) {
        addFlock(`Batch #${flockNum || idx} (Brahma)`, 'Chicken', 'Brahma', q);
      } else {
        addFlock(`Batch #${flockNum || idx} (Brahma)`, 'Chicken', 'Brahma', q);
      }
    });
  } else if (typeof qtyRaw === 'number') {
    if (qtyRaw > 0) {
      addFlock(`Batch #${flockNum || idx} (Brahma)`, 'Chicken', 'Brahma', qtyRaw);
    }
  } else if (qStr) {
    const numMatch = qStr.match(/(\d+)/);
    const q = numMatch ? parseInt(numMatch[1], 10) : 0;
    if (q > 0) {
      const isTurkey = qStr.toUpperCase().includes('TURKEY');
      addFlock(`Batch #${flockNum || idx} ${isTurkey ? '(Turkey)' : '(Brahma)'}`, isTurkey ? 'Turkey' : 'Chicken', isTurkey ? 'Turkey' : 'Brahma', q);
    }
  }
});

console.log('Total Cages Found:', cagesMap.size);
console.log('Total Flocks Parsed:', flocks.length);
console.log('Total Chickens:', flocks.filter(f => f.species === 'Chicken').reduce((a, b) => a + b.quantity, 0));
console.log('Total Turkeys:', flocks.filter(f => f.species === 'Turkey').reduce((a, b) => a + b.quantity, 0));

console.log('\n--- ALL PARSED FLOCKS ---');
flocks.forEach(f => {
  console.log(`[${f.notes}] ${f.name} | ${f.species} | ${f.breed} | Qty: ${f.quantity} | Age: ${f.ageWeeks} wks | Date: ${f.dateAdded}`);
});
