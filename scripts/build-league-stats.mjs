// Builds src/data/leagueStats.json from the STUMPS scorer exports in
// "All Assests/All  Season 1 Franchise League Stats" (one CSV per franchise league).
// Usage: npm run league-stats
import { readFileSync, writeFileSync } from 'node:fs';

const DIR = 'All Assests/All  Season 1 Franchise League Stats';
const OUT = 'src/data/leagueStats.json';

// league id (as in the IOCF dataset) -> CSV file
const FILES = {
  psl: 'Pakistan Super League.csv',
  bbl: 'Big Bash League.csv',
  bpl: 'Bangladesh Premier League.csv',
  ipl: 'Indian Premier League_.csv',
  cpl: 'Caribbean Premier League_.csv',
  spl: 'Scottish Premier League_.csv',
  kcl: 'Kiwi Crown League.csv',
  qecl: 'Qatar Elite Cricket League_.csv',
  hundred: 'The Hundred.csv',
};

// Column order of the export, and how each is read: s = text, n = number (blank -> null)
const FIELDS = [
  ['no', 's'], ['name', 's'], ['team', 's'], ['matches', 'n'], ['pom', 'n'], ['batInn', 'n'], ['runs', 'n'], ['avg', 'n'], ['sr', 'n'],
  ['thirties', 'n'], ['fifties', 'n'], ['hundreds', 'n'], ['hs', 's'], ['sixes', 'n'], ['fours', 'n'], ['balls', 'n'], ['notOuts', 'n'],
  ['most6', 'n'], ['most4', 'n'], ['fast50', 's'], ['fast100', 's'], ['bowlInn', 'n'], ['wickets', 'n'], ['runsConceded', 'n'], ['maidens', 'n'],
  ['bowlAvg', 'n'], ['bowlSr', 'n'], ['economy', 'n'], ['threeW', 'n'], ['fiveW', 'n'], ['best', 's'], ['ballsBowled', 'n'], ['dots', 'n'],
  ['catches', 'n'], ['stumpings', 'n'], ['runOuts', 'n'],
];

function parseCsv(text) {
  const rows = [];
  let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

const out = { fields: FIELDS.map(([f]) => f).filter((f) => f !== 'no'), leagues: {} };
let total = 0;
for (const [id, file] of Object.entries(FILES)) {
  const rows = parseCsv(readFileSync(`${DIR}/${file}`, 'utf8').replace(/^﻿/, ''));
  // the first rows are a header block (scorer name, league title, tour id); the column names start with "No."
  const head = rows.findIndex((r) => r[0] === 'No.');
  if (head < 0) throw new Error(`${file}: column header not found`);
  const title = rows[1]?.[1]?.trim() ?? '';
  const tour = rows[2]?.[1]?.replace(/^Tour ID:\s*/, '').trim() ?? '';
  const names = rows[head];
  if (names.length !== FIELDS.length) throw new Error(`${file}: expected ${FIELDS.length} columns, found ${names.length}`);
  const data = [];
  for (const r of rows.slice(head + 1)) {
    if (r.length < FIELDS.length || !r[1]?.trim()) continue;
    data.push(
      FIELDS.slice(1).map(([, kind], i) => {
        const v = r[i + 1].trim().replace(/\s+/g, ' ');
        if (kind === 'n') return v === '' ? null : Number(v);
        return v;
      }),
    );
  }
  out.leagues[id] = { title, tour, rows: data };
  total += data.length;
  console.log(`${id}: ${data.length} players (${title}, ${tour})`);
}
writeFileSync(OUT, JSON.stringify(out));
console.log(`wrote ${OUT} — ${total} player rows`);
