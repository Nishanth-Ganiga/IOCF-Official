// Builds src/data/tournamentStats.json from the STUMPS scorer exports in
// "All Assests/All 2026 Major Tournaments Stats" (one CSV per Major Tournament).
// Usage: npm run tournament-stats
import { existsSync, writeFileSync } from 'node:fs';
import { FIELD_NAMES, readScorerCsv } from './lib/scorer-csv.mjs';

const DIR = 'All Assests/All 2026 Major Tournaments Stats';
const OUT = 'src/data/tournamentStats.json';

// tournament id (see scripts/sync/tournaments.mjs) -> CSV file
const FILES = {
  't20-world-cup': 'T20 World Cup 2026.csv',
  'euro-cup': 'Euro Cup 2026.csv',
  'oceania-cup': 'Oceania Cup 2026.csv',
  'asia-cup': 'ASIA CUP 2026.csv',
  'associate-nations-cup': 'Associate Nations Cup 2026.csv',
  'odi-world-cup': 'ODI World Cup_.csv',
  'world-test-championship': 'World Test championship 2026.csv',
  'emerging-talents-league': 'Emerging Talents league 2026.csv',
  'womens-global-league': 'Women_s Global League_.csv',
  'lone-warrior': 'Lone Warrior 2026.csv',
  'origins-championship': 'Origins Championship 2026.csv', // used once this export is added to the stats folder
};

// Tournaments where only players who scored runs or took wickets are kept (the others are just squad members).
const ONLY_RUNS_OR_WICKETS = new Set(['lone-warrior']);
const RUNS = FIELD_NAMES.indexOf('runs');
const WICKETS = FIELD_NAMES.indexOf('wickets');

const out = { fields: FIELD_NAMES, tournaments: {} };
let total = 0;
for (const [id, file] of Object.entries(FILES)) {
  if (!existsSync(`${DIR}/${file}`)) {
    console.log(`${id}: no export yet (${file}) — skipped`);
    continue;
  }
  const t = readScorerCsv(`${DIR}/${file}`);
  if (ONLY_RUNS_OR_WICKETS.has(id)) t.rows = t.rows.filter((r) => (r[RUNS] ?? 0) > 0 || (r[WICKETS] ?? 0) > 0);
  out.tournaments[id] = t;
  total += t.rows.length;
  console.log(`${id}: ${t.rows.length} players (${t.title}, ${t.tour})`);
}
writeFileSync(OUT, JSON.stringify(out));
console.log(`wrote ${OUT} — ${total} player rows`);
