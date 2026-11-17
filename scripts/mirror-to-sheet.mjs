#!/usr/bin/env node
// Writes everything on the website to the private mirror sheet (see README, "The private mirror sheet").
//   npm run mirror               read the live data, write the sheet
//   npm run mirror -- --dry-run  build the tabs and print their sizes; writes nothing and needs no Google key
//   npm run mirror -- --csv <folder>   also write every tab as a CSV file into that folder (to look at them)
// Needs (in the environment, or in ~/.iocf-command-center/env): GOOGLE_SERVICE_ACCOUNT_JSON, MIRROR_SHEET_ID, and for the
// Command Center data SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.
import fs from 'node:fs';
import path from 'node:path';
import { loadEnvFile, homeDir } from './command-center/lib.mjs';
import { buildMirror, mirrorConfigured, runMirror } from '../server/mirror/mirror.mjs';
import { valuesOf } from '../server/mirror/google.mjs';
import { productionStoreFromEnv } from '../server/command/loginTable.mjs';
import { loadRankingInput } from '../server/command/rankInput.mjs';
import { BOARDS } from '../server/command/handler.mjs';
import { STADIUMS } from '../server/command/series.mjs';

loadEnvFile(homeDir());
const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const opt = (n) => (args.includes(n) ? args[args.indexOf(n) + 1] : undefined);
const csv = (v) => (/[",\n\r]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));

try {
  const store = productionStoreFromEnv();
  if (!store) console.warn('No database configured (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY): the Command Center tabs will be empty.');
  let dataset;
  let liveInput = null;
  try {
    liveInput = store ? await loadRankingInput({ store }) : null;
    dataset = liveInput?.dataset;
    if (!dataset) {
      const { buildFromSource, loadConfig } = await import('./sync/sheet.mjs');
      dataset = (await buildFromSource({ sheetUrl: loadConfig(process.cwd()).sheetUrl, sheetFile: '' })).dataset;
    }
  } catch (e) {
    if (!flag('--dry-run') && !opt('--csv')) throw e;
    console.warn(`Could not read the live data (${e.message}); using the last synced copy, public/iocf-data.json.`);
    dataset = JSON.parse(fs.readFileSync('public/iocf-data.json', 'utf8'));
  }
  const leagueStats = JSON.parse(fs.readFileSync('src/data/leagueStats.json', 'utf8'));
  let rankHistory = [];
  try {
    rankHistory = JSON.parse(fs.readFileSync('public/iocf-data.json', 'utf8')).rankHistory ?? [];
  } catch {
    /* no synced copy here */
  }
  const job = { dataset, rankHistory, leagueStats, store, boards: BOARDS, baseStadiums: STADIUMS };
  if (flag('--dry-run') || opt('--csv')) {
    const { tabs, warnings } = await buildMirror(job);
    console.table(tabs.map((t) => ({ tab: t.name, columns: Math.max(...valuesOf(t).map((r) => r.length)), rows: valuesOf(t).length })));
    for (const w of warnings) console.warn('not read:', w);
    if (opt('--csv')) {
      const dir = path.resolve(opt('--csv'));
      fs.mkdirSync(dir, { recursive: true });
      for (const t of tabs) fs.writeFileSync(path.join(dir, `${t.name}.csv`), valuesOf(t).map((r) => r.map(csv).join(',')).join('\n'));
      console.log(`Wrote ${tabs.length} CSV files to ${dir}`);
    }
    if (flag('--dry-run')) process.exit(0);
  }
  if (!mirrorConfigured()) throw new Error('Set GOOGLE_SERVICE_ACCOUNT_JSON and MIRROR_SHEET_ID (see README → The private mirror sheet).');
  const r = await runMirror(job);
  console.log(`Mirror sheet updated: ${r.tabs} tabs, ${r.rows.toLocaleString()} rows.`);
  for (const w of r.warnings) console.warn('not written:', w);
} catch (err) {
  console.error('✗', err instanceof Error ? err.message : err);
  process.exit(1);
}
