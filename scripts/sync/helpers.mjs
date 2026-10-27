// Shared helpers for reading the IOCF workbook (ExcelJS) and normalising text.

/** Normalise an ExcelJS cell value: formulas -> cached result, rich text -> string, errors -> string. */
export function cellValue(v) {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v;
  if (typeof v === 'object') {
    if ('result' in v) return cellValue(v.result);
    if (Array.isArray(v.richText)) return v.richText.map((t) => t.text).join('');
    if ('error' in v) return String(v.error);
    if ('text' in v) return cellValue(v.text);
    return null;
  }
  return v;
}

/** Thin 1-based accessor over an ExcelJS worksheet. */
export class Sheet {
  constructor(ws) {
    this.ws = ws;
    this.maxRow = ws.rowCount;
    this.maxCol = ws.columnCount;
  }
  get(r, c) {
    if (r < 1 || c < 1) return null;
    const cell = this.ws.getCell(r, c);
    // ExcelJS repeats a merged range's value in every cell; spreadsheets only hold it in the top-left one.
    if (cell.isMerged && cell.master && cell.master.address !== cell.address) return null;
    return cellValue(cell.value);
  }
}

export class Book {
  constructor(wb) {
    this.wb = wb;
    this.cache = new Map();
  }
  sheet(name) {
    if (!this.cache.has(name)) {
      const ws = this.wb.getWorksheet(name);
      if (!ws) throw new Error(`Sheet "${name}" was not found in the workbook`);
      this.cache.set(name, new Sheet(ws));
    }
    return this.cache.get(name);
  }
  has(name) {
    return Boolean(this.wb.getWorksheet(name));
  }
}

/** Collapse whitespace; null for empty/null. */
export function s(v) {
  if (v === null || v === undefined) return null;
  const t = String(v).replace(/\s+/g, ' ').trim();
  return t === '' ? null : t;
}
export const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
export const norm = (x) => String(x ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
export const slug = (n) => n.toLowerCase().replace(/[^a-z0-9]+/g, '-');
export const stripEmoji = (x) => String(x ?? '').replace(/[\u{1F000}-\u{1FFFF}☀-➿️]/gu, '').trim();
export const trimChars = (t, chars) => {
  let a = 0;
  let b = t.length;
  while (a < b && chars.includes(t[a])) a++;
  while (b > a && chars.includes(t[b - 1])) b--;
  return t.slice(a, b);
};
export const titleCase = (t) => t.toLowerCase().replace(/(^|[^a-z'])([a-z])/g, (_, p, c) => p + c.toUpperCase());
export const cleanName = (v) => trimChars((s(v) ?? '').replace(/^\d+\s*[.)]\s*/, ''), ' .');
export const fmtn = (x) => (typeof x === 'number' && Number.isInteger(x) ? x : x);
export const round2 = (x) => (Number.isInteger(x) ? x : Math.round(x * 100) / 100);

export const BOARD_SHEETS = {
  Bangladesh: 'Bangladesh',
  England: 'England',
  Newzealand: 'New Zealand',
  WestIndies: 'West Indies',
  Qatar: 'Qatar',
  Netherlands: 'Netherlands',
  Australia: 'Australia',
  SA: 'South Africa',
  India: 'India',
  Italy: 'Italy',
  Pakistan: 'Pakistan',
  Scotland: 'Scotland',
  Srilanka: 'Sri Lanka',
  UAE: 'UAE',
  Canada: 'Canada',
  Zimbabwe: 'Zimbabwe',
  Ireland: 'Ireland',
  Uganda: 'Uganda',
  USA: 'USA',
  PNG: 'Papua New Guinea',
  Nepal: 'Nepal',
  Portugal: 'Portugal',
  Japan: 'Japan',
  Kenya: 'Kenya',
  Afghanistan: 'Afghanistan',
  Spain: 'Spain',
};

const ALIASES = { newzealand: 'New Zealand', srilanka: 'Sri Lanka', westindies: 'West Indies', southafrica: 'South Africa', sa: 'South Africa', png: 'Papua New Guinea', papuanewguinea: 'Papua New Guinea' };
export function boardName(x) {
  const k = String(x ?? '').toLowerCase().replace(/[^a-z]/g, '');
  if (ALIASES[k]) return ALIASES[k];
  for (const v of Object.values(BOARD_SHEETS)) if (v.toLowerCase().replace(/[^a-z]/g, '') === k) return v;
  return null;
}
