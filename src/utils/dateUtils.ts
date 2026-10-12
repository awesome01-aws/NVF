// Helper utility to format any date into DD/MM/YYYY format for UI display
export function formatDateDDMMYYYY(dateVal: string | number | Date | null | undefined): string {
  if (dateVal === null || dateVal === undefined || dateVal === '') return '-';
  const str = String(dateVal).trim();
  if (!str) return '-';

  // If already in DD/MM/YYYY format
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(str)) {
    return str;
  }

  // If in YYYY-MM-DD or YYYY-MM-DDTHH:mm:ss...
  if (/^\d{4}-\d{1,2}-\d{1,2}/.test(str)) {
    const clean = str.split('T')[0];
    const parts = clean.split('-');
    if (parts.length === 3) {
      const year = parts[0];
      const month = parts[1].padStart(2, '0');
      const day = parts[2].padStart(2, '0');
      return `${day}/${month}/${year}`;
    }
  }

  // Handle D/M/YYYY or D-M-YYYY
  const parts = str.replace(/[\.-]/g, '/').split('/');
  if (parts.length === 3) {
    if (parts[0].length === 4) {
      // YYYY/MM/DD
      return `${parts[2].padStart(2, '0')}/${parts[1].padStart(2, '0')}/${parts[0]}`;
    } else if (parts[2].length === 4) {
      // DD/MM/YYYY or D/M/YYYY
      return `${parts[0].padStart(2, '0')}/${parts[1].padStart(2, '0')}/${parts[2]}`;
    }
  }

  // Fallback via Date object
  const d = new Date(str);
  if (!isNaN(d.getTime())) {
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
  }

  return str;
}

/**
 * Convert any date value (ISO YYYY-MM-DD, DD/MM/YYYY, DD-MM-YYYY, Date) to ISO string YYYY-MM-DD
 */
export function parseDateToISO(val: any): string {
  if (val === null || val === undefined || val === '') {
    return getCameroonTodayISO();
  }

  if (val instanceof Date || Object.prototype.toString.call(val) === '[object Date]') {
    const d = val as Date;
    if (!isNaN(d.getTime())) {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    }
  }

  const str = String(val).trim();

  // YYYY-MM-DD or YYYY/MM/DD or YYYY.MM.DD
  const isoMatch = str.match(/^(\d{4})[\/\.-](\d{1,2})[\/\.-](\d{1,2})/);
  if (isoMatch) {
    const y = isoMatch[1];
    const m = isoMatch[2].padStart(2, '0');
    const d = isoMatch[3].padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  // DD/MM/YYYY or DD-MM-YYYY or DD.MM.YYYY
  const dmy4Match = str.match(/^(\d{1,2})[\/\.-](\d{1,2})[\/\.-](\d{4})$/);
  if (dmy4Match) {
    const p1 = Number(dmy4Match[1]);
    const p2 = Number(dmy4Match[2]);
    const year = dmy4Match[3];
    let day = p1;
    let month = p2;
    if (p2 > 12 && p1 <= 12) {
      day = p2;
      month = p1;
    }
    const mStr = String(month).padStart(2, '0');
    const dStr = String(day).padStart(2, '0');
    return `${year}-${mStr}-${dStr}`;
  }

  // Fallback via Date
  const d = new Date(str);
  if (!isNaN(d.getTime())) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  return getCameroonTodayISO();
}

export function getCameroonTodayISO(dateObj: Date = new Date()): string {
  try {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Africa/Douala',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
    const parts = Object.fromEntries(formatter.formatToParts(dateObj).map(part => [part.type, part.value]));
    return `${parts.year}-${parts.month}-${parts.day}`;
  } catch (e) {
    const d = new Date(dateObj.getTime() + 3600000);
    return d.toISOString().split('T')[0];
  }
}

/**
 * Calculates current or target age of a fowl flock in weeks based on Date Added.
 * - dateAdded: The date the flock was added or hatched.
 * - initialAgeWeeks: Age of the flock at dateAdded (0 if added as day-old chicks).
 * - targetDate: Date to compute age for (defaults to today in Cameroon).
 */
export function calculateCurrentAgeWeeks(
  dateAdded?: string,
  initialAgeWeeks?: number | null,
  targetDate: string = getCameroonTodayISO()
): number {
  let baseAge = Number(initialAgeWeeks) || 0;
  if (baseAge % 1 !== 0) baseAge = 0;
  if (!dateAdded) return baseAge;

  const isoAdded = parseDateToISO(dateAdded);
  const isoTarget = parseDateToISO(targetDate);

  const [aY, aM, aD] = isoAdded.split('-').map(Number);
  const [tY, tM, tD] = isoTarget.split('-').map(Number);

  const addedMs = Date.UTC(aY, aM - 1, aD);
  const targetMs = Date.UTC(tY, tM - 1, tD);

  if (isNaN(addedMs) || isNaN(targetMs) || targetMs < addedMs) {
    return baseAge;
  }

  const elapsedDays = Math.floor((targetMs - addedMs) / (1000 * 60 * 60 * 24));
  const elapsedWeeks = elapsedDays / 7;
  const total = baseAge + elapsedWeeks;
  return Math.round(total * 10) / 10;
}

export interface FlockAgeInfo {
  weeks: number;
  days: number;
  totalDays: number;
  formatted: string; // e.g. "1 weeks, 6 days"
  formattedShort: string; // e.g. "1w, 6d"
}

export function calculateFlockAge(
  dateAdded?: string,
  initialAgeWeeks?: number | null,
  targetDate: string = getCameroonTodayISO()
): FlockAgeInfo {
  let initialWeeksNum = Number(initialAgeWeeks) || 0;
  if (initialWeeksNum % 1 !== 0) {
    initialWeeksNum = 0;
  }
  const initialDays = Math.round(initialWeeksNum * 7);

  if (!dateAdded) {
    const w = Math.floor(initialDays / 7);
    const d = initialDays % 7;
    return {
      weeks: w,
      days: d,
      totalDays: initialDays,
      formatted: `${w} weeks, ${d} days`,
      formattedShort: `${w}w, ${d}d`
    };
  }

  const isoAdded = parseDateToISO(dateAdded);
  const isoTarget = parseDateToISO(targetDate);

  const [aY, aM, aD] = isoAdded.split('-').map(Number);
  const [tY, tM, tD] = isoTarget.split('-').map(Number);

  const addedMs = Date.UTC(aY, aM - 1, aD);
  const targetMs = Date.UTC(tY, tM - 1, tD);

  let elapsedDays = 0;
  if (!isNaN(addedMs) && !isNaN(targetMs) && targetMs >= addedMs) {
    elapsedDays = Math.floor((targetMs - addedMs) / (1000 * 60 * 60 * 24));
  }

  const totalDays = initialDays + elapsedDays;
  const weeks = Math.floor(totalDays / 7);
  const days = totalDays % 7;

  return {
    weeks,
    days,
    totalDays,
    formatted: `${weeks} weeks, ${days} days`,
    formattedShort: `${weeks}w, ${days}d`
  };
}

export function formatFlockAge(
  dateAdded?: string,
  initialAgeWeeks?: number | null,
  targetDate?: string
): string {
  return calculateFlockAge(dateAdded, initialAgeWeeks, targetDate).formatted;
}

/**
 * Formats any age value (string or number or null) into "X weeks, Y days" string.
 */
export function formatAgeDisplay(val: any, dateAdded?: string, initialAgeWeeks?: number | null): string {
  if (dateAdded) {
    return formatFlockAge(dateAdded, initialAgeWeeks);
  }
  if (val === null || val === undefined || val === '') return '-';
  const str = String(val).trim();
  if (str.includes('weeks') || str.includes('days') || str.includes('wks')) {
    return str;
  }
  const num = Number(str);
  if (!isNaN(num)) {
    const totalDays = Math.round(num * 7);
    const w = Math.floor(totalDays / 7);
    const d = totalDays % 7;
    return `${w} weeks, ${d} days`;
  }
  return str;
}

// Helper to format short month day like DD/MM
export function formatDateShortDDMM(dateVal: string | number | Date | null | undefined): string {
  const formatted = formatDateDDMMYYYY(dateVal);
  if (formatted && formatted.includes('/')) {
    const parts = formatted.split('/');
    return `${parts[0]}/${parts[1]}`;
  }
  return formatted;
}

/**
 * Safely parses any age value (number, numeric string, or "X weeks, Y days" formatted string)
 * into a single numeric weeks value (e.g. 2.5).
 */
export function parseNumericAgeWeeks(
  val: any,
  dateAdded?: string,
  initialAgeWeeks?: number | null,
  targetDate?: string
): number {
  if (typeof val === 'number') {
    return isNaN(val) ? 0 : Math.max(0, val);
  }

  if (dateAdded) {
    const computed = calculateCurrentAgeWeeks(dateAdded, initialAgeWeeks ?? 0, targetDate);
    if (!isNaN(computed) && computed >= 0) return computed;
  }

  if (val === null || val === undefined || val === '') return 0;

  const str = String(val).trim();
  const direct = Number(str);
  if (!isNaN(direct)) return Math.max(0, direct);

  const weeksMatch = str.match(/(\d+(?:\.\d+)?)\s*(?:weeks|week|wks|wk|w)/i);
  const daysMatch = str.match(/(\d+(?:\.\d+)?)\s*(?:days|day|d)/i);

  let weeks = weeksMatch ? parseFloat(weeksMatch[1]) : 0;
  let days = daysMatch ? parseFloat(daysMatch[1]) : 0;

  if (weeksMatch || daysMatch) {
    const totalWeeks = weeks + (days / 7);
    return Math.round(totalWeeks * 10) / 10;
  }

  const numMatch = str.match(/(\d+(?:\.\d+)?)/);
  if (numMatch) {
    return parseFloat(numMatch[1]);
  }

  return 0;
}
