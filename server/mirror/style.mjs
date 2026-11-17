// Colours and formatting for the mirror sheet. Pure functions (no network): they turn a tab into the Google Sheets formatting requests.
//
//   • each board's tab has its own colour family, taken from the board's flag colours (src/data/commandCenter/boards.json), the same way
//     the IOCF workbook gives each board tab its own colour: a dark banner, a mid-tone section bar, a light table header and pale rows
//   • the tabs that hold every board together use the workbook's purple family (#8E7CC3 / #20124D / #D9D2E9 / #F3F3F3)
const hex = (h) => {
  const s = String(h).replace('#', '');
  return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)];
};
const toHex = (rgb) => `#${rgb.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')}`;
/** `a` mixed with `b`: t = 0 gives a, t = 1 gives b. */
export const mix = (a, b, t) => toHex(hex(a).map((v, i) => v + (hex(b)[i] - v) * t));
export function luminance(h) {
  const f = (v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const [r, g, b] = hex(h).map(f);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
/** White or near-black text, whichever reads better on this background. */
export const textOn = (bg) => (luminance(bg) > 0.4 ? '#1a1a1a' : '#ffffff');
const rgb = (h) => {
  const [r, g, b] = hex(h);
  return { red: r / 255, green: g / 255, blue: b / 255 };
};

/** The IOCF workbook's own purple family, for the tabs that are not one board's. */
export const PURPLE = { banner: '#20124D', bar: '#8E7CC3', head: '#D9D2E9', pale: '#F3F3F3', label: '#D9D2E9', tab: '#8E7CC3', stripe: '#8E7CC3' };

/**
 * The colour family of a board, from its theme colours (primary / secondary): a dark banner, a mid-tone section bar (the board's main colour,
 * pulled toward the middle when it is almost white or almost black so text stays readable), a light table header, pale rows, and a stripe in the
 * board's second colour.
 */
export function boardPalette(theme) {
  const base = theme?.colors?.primary ?? '#6d6c75';
  const lum = luminance(base);
  const main = lum > 0.5 ? mix(base, '#000000', 0.5) : lum < 0.02 ? mix(base, '#ffffff', 0.3) : base;
  return { banner: mix(main, '#000000', 0.4), bar: main, head: mix(main, '#ffffff', 0.78), pale: mix(main, '#ffffff', 0.92), label: mix(main, '#ffffff', 0.84), tab: main, stripe: theme?.colors?.secondary ?? main };
}

const range = (sheetId, r0, r1, c0, c1) => ({ sheetId, startRowIndex: r0, endRowIndex: r1, startColumnIndex: c0, endColumnIndex: c1 });

/** One formatting instruction as a Sheets request. f: { r0, r1, c0, c1, bg?, fg?, bold?, italic?, size?, align?, wrap?, border? } (rows and columns from 0, end exclusive). */
export function formatRequest(sheetId, f) {
  const fmt = {};
  const fields = [];
  if (f.bg) { fmt.backgroundColor = rgb(f.bg); fields.push('userEnteredFormat.backgroundColor'); }
  const text = {};
  if (f.fg) text.foregroundColor = rgb(f.fg);
  if (f.bold !== undefined) text.bold = f.bold;
  if (f.italic !== undefined) text.italic = f.italic;
  if (f.size) text.fontSize = f.size;
  if (Object.keys(text).length) { fmt.textFormat = text; fields.push('userEnteredFormat.textFormat'); }
  if (f.align) { fmt.horizontalAlignment = f.align; fields.push('userEnteredFormat.horizontalAlignment'); }
  fmt.verticalAlignment = 'MIDDLE';
  fields.push('userEnteredFormat.verticalAlignment');
  if (f.wrap) { fmt.wrapStrategy = 'WRAP'; fields.push('userEnteredFormat.wrapStrategy'); }
  return { repeatCell: { range: range(sheetId, f.r0, f.r1, f.c0, f.c1), cell: { userEnteredFormat: fmt }, fields: fields.join(',') } };
}

/** About how wide (in pixels) a column needs to be for what it holds. */
export function widthOf(values, col) {
  let longest = 0;
  for (let r = 0; r < Math.min(values.length, 300); r++) {
    const v = values[r]?.[col];
    const len = v === '' || v === undefined || v === null ? 0 : String(v).length;
    if (len > longest) longest = len;
  }
  return Math.max(70, Math.min(360, longest * 7 + 24));
}

/** Everything that colours and shapes one tab, as Sheets requests (call after the values are written). */
export function styleRequests(tab, sheetId, values) {
  const out = [];
  const cols = Math.max(1, ...values.map((r) => r.length));
  if (tab.layout) {
    const L = tab.layout;
    (L.widths ?? []).forEach((w, c) => out.push({ updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: c, endIndex: c + 1 }, properties: { pixelSize: w }, fields: 'pixelSize' } }));
    for (const m of L.merges ?? []) out.push({ mergeCells: { range: range(sheetId, m.r0, m.r1, m.c0, m.c1), mergeType: 'MERGE_ALL' } });
    for (const f of L.formats ?? []) out.push(formatRequest(sheetId, f));
    const p = tab.palette ?? PURPLE;
    for (const b of L.bands ?? []) out.push({ addBanding: { bandedRange: { range: range(sheetId, b.r0, b.r1, b.c0, b.c1), rowProperties: { headerColor: rgb(p.head), firstBandColor: rgb('#ffffff'), secondBandColor: rgb(p.pale) } } } });
    for (const h of L.heights ?? []) out.push({ updateDimensionProperties: { range: { sheetId, dimension: 'ROWS', startIndex: h.row, endIndex: h.row + 1 }, properties: { pixelSize: h.px }, fields: 'pixelSize' } });
    return out;
  }
  // a plain table: coloured header, alternating rows, columns as wide as their content
  const p = tab.palette ?? PURPLE;
  out.push({ addBanding: { bandedRange: { range: range(sheetId, 0, values.length, 0, cols), rowProperties: { headerColor: rgb(p.banner), firstBandColor: rgb('#ffffff'), secondBandColor: rgb(p.pale) } } } });
  out.push(formatRequest(sheetId, { r0: 0, r1: 1, c0: 0, c1: cols, fg: '#ffffff', bold: true }));
  for (let c = 0; c < cols; c++) out.push({ updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: c, endIndex: c + 1 }, properties: { pixelSize: widthOf(values, c) }, fields: 'pixelSize' } });
  return out;
}

/** Clears every format, merge and banding a tab had, so a changed layout never leaves old colours behind. */
export function resetRequests(sheetId, bandedIds = []) {
  return [
    ...bandedIds.map((id) => ({ deleteBanding: { bandedRangeId: id } })),
    { unmergeCells: { range: { sheetId } } },
    { repeatCell: { range: { sheetId }, cell: {}, fields: 'userEnteredFormat' } },
  ];
}

export { rgb };
