// Reads a STUMPS scorer export (one CSV per tournament) into compact rows. Shared by the franchise-league and the
// Major Tournaments stats builds.
import { readFileSync } from 'node:fs';

// Column order of the export, and how each is read: s = text, n = number (blank -> null)
export const FIELDS = [
  ['no', 's'], ['name', 's'], ['team', 's'], ['matches', 'n'], ['pom', 'n'], ['batInn', 'n'], ['runs', 'n'], ['avg', 'n'], ['sr', 'n'],
  ['thirties', 'n'], ['fifties', 'n'], ['hundreds', 'n'], ['hs', 's'], ['sixes', 'n'], ['fours', 'n'], ['balls', 'n'], ['notOuts', 'n'],
  ['most6', 'n'], ['most4', 'n'], ['fast50', 's'], ['fast100', 's'], ['bowlInn', 'n'], ['wickets', 'n'], ['runsConceded', 'n'], ['maidens', 'n'],
  ['bowlAvg', 'n'], ['bowlSr', 'n'], ['economy', 'n'], ['threeW', 'n'], ['fiveW', 'n'], ['best', 's'], ['ballsBowled', 'n'], ['dots', 'n'],
  ['catches', 'n'], ['stumpings', 'n'], ['runOuts', 'n'],
];

export const FIELD_NAMES = FIELDS.map(([f]) => f).filter((f) => f !== 'no');

export function parseCsv(text) {
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

/** One export file → { title, tour, rows } (rows without the "No." column). */
export function readScorerCsv(path) {
  const rows = parseCsv(readFileSync(path, 'utf8').replace(/^﻿/, ''));
  // the first rows are a header block (scorer name, tournament title, tour id); the column names start with "No."
  const head = rows.findIndex((r) => r[0] === 'No.');
  if (head < 0) throw new Error(`${path}: column header not found`);
  if (rows[head].length !== FIELDS.length) throw new Error(`${path}: expected ${FIELDS.length} columns, found ${rows[head].length}`);
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
  return {
    title: rows[1]?.[1]?.trim() ?? '',
    tour: rows[2]?.[1]?.replace(/^Tour ID:\s*/, '').trim() ?? '',
    rows: data,
  };
}
