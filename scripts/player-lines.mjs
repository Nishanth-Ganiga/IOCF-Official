#!/usr/bin/env node
// Shows exactly which statistics lines a player gets on the site, and which lines with a SIMILAR name do not count for him.
//   npm run player -- "Hizbullah Sahito"
// It lists every counted line, the totals per scope (the same scopes as the Rankings: overall, board cricket, major tournaments, series,
// franchise leagues) and, the useful part when a total looks too low, every line whose name shares a word with his but is NOT counted
// for him (a different spelling, a short name, a typo).
import { loadEnvFile, homeDir } from './command-center/lib.mjs';
import { productionStoreFromEnv } from '../server/command/loginTable.mjs';
import { loadRankingInput } from '../server/command/rankInput.mjs';
import { explainPlayer } from './lib/playerLines.mjs';

loadEnvFile(homeDir());
const name = process.argv.slice(2).join(' ').trim();
if (!name) {
  console.error('Usage: npm run player -- "Player Name"');
  process.exit(1);
}
try {
  const store = productionStoreFromEnv();
  if (!store) throw new Error('No database configured (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in ~/.iocf-command-center/env).');
  const r = explainPlayer(await loadRankingInput({ store }), name);
  const row = (l) => `${l.source.padEnd(10)} ${String(l.id).padEnd(34)} ${String(l.line.name).padEnd(24)} ${String(l.line.team).padEnd(24)} m${String(l.line.matches ?? '').padEnd(3)} runs ${String(l.line.runs ?? '').padEnd(5)} wkts ${l.line.wickets ?? ''}`;
  const tot = (x) => `${x.lines} lines · matches ${x.matches} · runs ${x.runs} · wickets ${x.wickets}`;
  console.log(`\nRoster: ${r.roster.length ? r.roster.map((p) => `${p.name} (${p.boardId}, ${p.id})`).join('; ') : 'not on any board list'}`);
  console.log('\nCOUNTED FOR HIM');
  for (const l of r.counted) console.log('  ' + row(l));
  console.log('\nTOTALS BY SCOPE');
  for (const [label, key] of [['Major tournaments', 'tournament'], ['Series', 'series'], ['Board cricket', 'board'], ['Franchise leagues', 'franchise'], ['Overall', 'overall']]) console.log(`  ${label.padEnd(18)}: ${tot(r.totals[key])}`);
  console.log(`\nSIMILAR NAMES THAT ARE NOT COUNTED FOR HIM (${r.similar.length})${r.similar.length ? ' — if any of these is him, tell me the name and the board:' : ''}`);
  for (const l of r.similar) console.log('  ' + row(l));
  if (!r.similar.length) console.log('  none');
} catch (err) {
  console.error('✗', err instanceof Error ? err.message : err);
  process.exit(1);
}
