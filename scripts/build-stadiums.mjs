#!/usr/bin/env node
// Builds src/data/commandCenter/stadiums.json (the stadiums each board can host a match in) from the stadium sheet:
//   node scripts/build-stadiums.mjs        (or: npm run stadiums)
// The sheet has one column per board. Its second "England" column is India's. Fix the sheet and run this again to update the site.
import fs from 'node:fs';

const SRC = 'All Assests/All Stadiums/IOCF Stadiums - Sheet1.csv';
const OUT = 'src/data/commandCenter/stadiums.json';
const boards = JSON.parse(fs.readFileSync('src/data/commandCenter/boards.json', 'utf8'));
const norm = (x) => String(x).toLowerCase().replace(/[^a-z0-9]/g, '');
const ALIAS = { png: 'papuanewguinea' };

function parseCsv(text) {
  const rows = [];
  let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"') (text[i + 1] === '"' ? ((cell += '"'), i++) : (q = false));
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') (row.push(cell), (cell = ''));
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  if (cell || row.length) (row.push(cell), rows.push(row));
  return rows;
}

const rows = parseCsv(fs.readFileSync(SRC, 'utf8').replace(/^﻿/, ''));
const header = rows[0].map((h) => h.trim());
const out = Object.fromEntries(boards.map((b) => [b.slug, []]));
const seenEngland = [];
header.forEach((name, col) => {
  let n = ALIAS[norm(name)] ?? norm(name);
  if (n === 'england') {
    seenEngland.push(col);
    if (seenEngland.length === 2) n = 'india'; // the sheet's second England column
  }
  const board = boards.find((b) => norm(b.name) === n);
  if (!board) {
    console.error(`No board matches the column "${name}"`);
    process.exitCode = 1;
    return;
  }
  for (const r of rows.slice(1)) {
    const v = (r[col] ?? '').replace(/^\s*\d+\s*[.)]\s*/, '').replace(/\s+/g, ' ').trim();
    if (v && !out[board.slug].includes(v)) out[board.slug].push(v);
  }
});
fs.writeFileSync(OUT, JSON.stringify(out, null, 1) + '\n');
for (const b of boards) console.log(`${b.name.padEnd(18)} ${out[b.slug].length}`);
