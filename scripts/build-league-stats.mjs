// Builds src/data/leagueStats.json from the STUMPS scorer exports in
// "All Assests/All  Season 1 Franchise League Stats" (one CSV per franchise league).
// Usage: npm run league-stats
import { writeFileSync } from 'node:fs';
import { FIELD_NAMES, readScorerCsv } from './lib/scorer-csv.mjs';

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

const out = { fields: FIELD_NAMES, leagues: {} };
let total = 0;
for (const [id, file] of Object.entries(FILES)) {
  const league = readScorerCsv(`${DIR}/${file}`);
  out.leagues[id] = league;
  total += league.rows.length;
  console.log(`${id}: ${league.rows.length} players (${league.title}, ${league.tour})`);
}
writeFileSync(OUT, JSON.stringify(out));
console.log(`wrote ${OUT} — ${total} player rows`);
