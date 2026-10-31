// Reads the Major Tournaments sheets (T20 World Cup, Euro Cup, …) into titled tables.
//
// The sheets are free-form: squads, pools, schedules with results, award lists, fantasy and prediction contests,
// board credits. Rather than hand-code each layout, every sheet is cut into the blocks of filled cells it is made of,
// and each block into sections (a heading line, then a table), so that every cell shows up exactly as laid out.
import { norm, s } from './helpers.mjs';

/**
 * The tournaments in the order they are shown. `sheet` is the tab's usual name; if it is not found, the first tab whose
 * name matches `match` is used (tabs get renamed: "IOCF ASIA CUP" → "Asia Cup 2026"). A tournament with no tab is left out.
 */
export const MAJOR_TOURNAMENTS = [
  { id: 't20-world-cup', name: 'T20 World Cup', sheet: 'T20 World Cup 2026', match: /t20.*world.?cup/, kind: 'World tournament' },
  { id: 'euro-cup', name: 'Euro Cup', sheet: 'IOCF EURO CUP', match: /euro.?cup/, kind: 'Continental cup' },
  { id: 'oceania-cup', name: 'Oceania Cup', sheet: 'IOCF OCEANIA CUP', match: /oceania/, kind: 'Continental cup' },
  { id: 'asia-cup', name: 'Asia Cup', sheet: 'IOCF ASIA CUP', match: /asia.?cup/, kind: 'Continental cup' },
  { id: 'associate-nations-cup', name: 'Associate Nations Cup', sheet: 'IOCF Associate Nations Cup', match: /associate/, kind: 'Associate nations' },
  { id: 'odi-world-cup', name: 'ODI World Cup', sheet: 'IOCF ODI WORLD CUP', match: /odi.*world.?cup/, kind: 'World tournament' },
  { id: 'world-test-championship', name: 'World Test Championship', sheet: 'WTC Matches', match: /wtc|world.?test|test.?championship/, kind: 'Test championship' },
  { id: 'emerging-talents-league', name: 'Emerging Talents League', sheet: 'Emerging Talent League', match: /emerging/, kind: 'Talent league' },
  { id: 'womens-global-league', name: "Women's Global League", sheet: 'Womens Global League', match: /wom[ae]ns?.*league/, kind: "Women's league" },
  { id: 'origins-championship', name: 'IOCF Origins Championship', sheet: 'IOCF Origins Championship', match: /origins?/, kind: 'Major tournament' },
  { id: 'lone-warrior', name: 'IOCF Lone Warrior', sheet: 'IOCF Lone Warrior', match: /lone.?warrior/, kind: 'Individual tournament' },
];

const YEAR = 2026;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const pad = (n) => String(n).padStart(2, '0');

/** A cell as the text the sheet shows: dates as dates, time-of-day values as "20:00", whole numbers with separators. */
function text(v) {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) {
    if (v.getUTCFullYear() < 1910) return `${pad(v.getUTCHours())}:${pad(v.getUTCMinutes())}`;
    return `${v.getUTCDate()} ${MONTHS[v.getUTCMonth()]} ${v.getUTCFullYear()}`;
  }
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) return null;
    if (Number.isInteger(v)) return Math.abs(v) >= 1000 && !(v >= 1900 && v <= 2100) ? v.toLocaleString('en-US') : String(v);
    return String(Math.round(v * 100) / 100);
  }
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  return s(v);
}

/** Filled cells joined into blocks: neighbouring cells (up, down, left, right) belong to the same block. */
function blocks(grid, rows, cols) {
  const seen = new Set();
  const id = (r, c) => r * 1000 + c;
  const out = [];
  for (let r = 1; r <= rows; r++) {
    for (let c = 1; c <= cols; c++) {
      if (grid[r][c] === null || seen.has(id(r, c))) continue;
      const cells = [];
      const stack = [[r, c]];
      seen.add(id(r, c));
      while (stack.length) {
        const [y, x] = stack.pop();
        cells.push([y, x]);
        for (const [dy, dx] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const ny = y + dy;
          const nx = x + dx;
          if (ny < 1 || nx < 1 || ny > rows || nx > cols || grid[ny][nx] === null || seen.has(id(ny, nx))) continue;
          seen.add(id(ny, nx));
          stack.push([ny, nx]);
        }
      }
      out.push(cells);
    }
  }
  // a stray cell or two that sits inside another block's extent (e.g. a "Winner" header one blank column away) belongs to it
  const box = (cells) => ({ r0: Math.min(...cells.map((p) => p[0])), r1: Math.max(...cells.map((p) => p[0])), c0: Math.min(...cells.map((p) => p[1])), c1: Math.max(...cells.map((p) => p[1])) });
  const big = out.filter((b) => b.length > 3);
  const kept = [];
  for (const b of out) {
    const host = b.length <= 3 ? big.find((o) => { const x = box(o); return b.every(([y, c]) => y >= x.r0 && y <= x.r1 && c >= x.c0 && c <= x.c1); }) : undefined;
    if (host) host.push(...b);
    else kept.push(b);
  }
  // reading order: top to bottom, then left to right
  return kept.sort((a, b) => Math.min(...a.map((p) => p[0])) - Math.min(...b.map((p) => p[0])) || Math.min(...a.map((p) => p[1])) - Math.min(...b.map((p) => p[1])));
}

const NUMBERED = /^\d+\s*[.)]\s/;

/** Cuts one block into sections: heading lines followed by a table (the first row is its header unless it is a numbered list). */
export function parseSheet(sheet) {
  let rows = 0;
  let cols = 0;
  const grid = [];
  for (let r = 0; r <= sheet.maxRow; r++) grid.push([]);
  for (let r = 1; r <= sheet.maxRow; r++) {
    for (let c = 1; c <= sheet.maxCol; c++) {
      const t = text(sheet.get(r, c));
      grid[r][c] = t;
      if (t !== null) {
        rows = Math.max(rows, r);
        cols = Math.max(cols, c);
      }
    }
  }

  const result = [];
  /** Header rows seen so far, by sheet position, so that header-less lists can borrow their column labels. */
  const headers = [];
  for (const cells of blocks(grid, rows, cols)) {
    const byRow = new Map();
    for (const [r, c] of cells.sort((a, b) => a[0] - b[0] || a[1] - b[1])) {
      if (!byRow.has(r)) byRow.set(r, []);
      byRow.get(r).push(c);
    }
    const rowNums = [...byRow.keys()].sort((a, b) => a - b);
    const at = (r) => byRow.get(r).map((c) => ({ c, v: grid[r][c] }));
    // a row is a heading when all its cells say the same thing (a merged title, or one repeated across columns),
    // or when it is a lone cell sitting above a table or a numbered list
    const heading = rowNums.map((r, i) => {
      const cs = at(r);
      if (new Set(cs.map((x) => x.v)).size !== 1) return false;
      if (cs.length > 1) return true;
      if (NUMBERED.test(cs[0].v)) return false; // a list entry, not a heading
      if (i + 1 < rowNums.length && NUMBERED.test(at(rowNums[i + 1])[0].v)) return true;
      for (let j = i + 1; j < rowNums.length; j++) {
        const next = at(rowNums[j]);
        if (next.length >= 2) return true;
        if (new Set(next.map((x) => x.v)).size !== 1) break;
      }
      return false;
    });

    let i = 0;
    while (i < rowNums.length) {
      const titles = [];
      while (i < rowNums.length && heading[i]) titles.push(at(rowNums[i++])[0].v);
      const body = [];
      while (i < rowNums.length && !heading[i]) body.push(rowNums[i++]);
      const top = body.length ? body[0] : rowNums[i - 1];
      if (!body.length) {
        if (titles.length) result.push({ titles, columns: [], rows: [], top, bottom: top });
        continue;
      }
      const used = [...new Set(body.flatMap((r) => byRow.get(r)))].sort((a, b) => a - b);
      const table = body.map((r) => used.map((c) => (byRow.get(r).includes(c) ? grid[r][c] : '')));
      const first = table[0];
      const filled = first.filter(Boolean);
      const isHeader = body.length > 1 && filled.length >= 1 && !filled.some((v) => NUMBERED.test(v));
      let columns = isHeader ? first : [];
      if (isHeader) headers.push({ row: body[0], labels: new Map(used.map((c, k) => [c, first[k]])) });
      else if (filled.length && filled.every((v) => NUMBERED.test(v))) {
        // a numbered list under no header of its own ("Replacement" lists sit under the squads): use the labels above it
        const above = [...headers].reverse().find((h) => h.row < body[0] && used.every((c) => h.labels.get(c)));
        if (above) columns = used.map((c) => above.labels.get(c));
      }
      result.push({ titles, columns, rows: isHeader ? table.slice(1) : table, top: body[0], bottom: body[body.length - 1] });
    }
  }
  // a table with no heading of its own that sits beside a headed one (same rows) is the second half of it
  result.forEach((sec, k) => {
    if (sec.titles.length || sec.columns.length < 2) return;
    const prev = result[k - 1];
    if (prev && prev.titles.length && sec.top <= prev.bottom && sec.bottom >= prev.top) sec.titles = [`${prev.titles[prev.titles.length - 1]} (continued)`];
  });
  return result.map(({ titles, columns, rows }) => ({ titles, columns, rows }));
}


/** First non-numeric value to the right of a labelled row, e.g. the board next to "Champions". */
function labelled(parts, re) {
  for (const p of parts) {
    for (const row of p.rows) {
      if (re.test(row[0] ?? '')) {
        const v = row.slice(1).find((x) => x && !/^[\d,.]+$/.test(x));
        if (v) return v;
      }
    }
  }
  return undefined;
}

/** `boardNames` lets spellings such as "Newzealand" or "Srilanka" in a summary line show as the board's own name. */
/** The tab holding a tournament: its usual name, else the first tab whose name matches its pattern. */
export function findTab(book, def, taken = new Set()) {
  if (book.has(def.sheet) && !taken.has(def.sheet)) return def.sheet;
  return book.names().find((n) => !taken.has(n) && def.match.test(n.toLowerCase())) ?? null;
}

export function buildMajorTournaments(book, boardNames = [], missing = undefined) {
  const tidy = (n) => (n.length > 4 && n === n.toUpperCase() ? n.toLowerCase().replace(/(^|\s)([a-z])/g, (_, a, c) => a + c.toUpperCase()) : n);
  const board = (name) => (name ? (boardNames.find((b) => norm(b) === norm(name)) ?? tidy(name)) : name);
  const out = [];
  const taken = new Set();
  for (const t of MAJOR_TOURNAMENTS) {
    const tab = findTab(book, t, taken);
    if (!tab) {
      missing?.push(t.name);
      continue;
    }
    taken.add(tab);
    const parts = parseSheet(book.sheet(tab));
    if (!parts.length) {
      missing?.push(t.name);
      continue;
    }
    const heading = parts[0].titles.find((x) => /hosted by|season|world cup|championship/i.test(x) && !/^(squads|participating)/i.test(x));
    let host = /hosted by\s+(.+)$/i.exec(heading ?? '')?.[1];
    if (host) host = host.replace(/\s+/g, ' ').trim();
    if (!host) {
      for (const p of parts) {
        for (const row of [p.columns, ...p.rows]) {
          for (const cell of row) {
            const m = /^(?:\d+\s*[.)]\s*)?(.+?)\s*\(\s*host\s*\)\s*$/i.exec(cell ?? '');
            if (m && !host) host = m[1].trim();
          }
        }
      }
    }
    out.push({
      id: t.id,
      name: t.name,
      kind: t.kind,
      sheet: tab,
      // every tournament is a 2026 edition; further editions get their own entry here
      editions: [
        {
          year: YEAR,
          heading: heading ?? undefined,
          host: board(host),
          champions: board(labelled(parts, /^champions?$/i)),
          runnersUp: board(labelled(parts, /^runners?[\s-]*up$/i)),
          sections: parts,
        },
      ],
    });
  }
  return out;
}
