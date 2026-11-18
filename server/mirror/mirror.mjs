// Writes the website's data to the private mirror sheet. `buildMirror` makes the tabs; `runMirror` writes them.
// Used by the command line (scripts/mirror-to-sheet.mjs), by the scheduled job (.github/workflows/mirror.yml) and by the
// administrator's "Update the backup sheet" button (POST /admin/mirror).
import { SheetsClient, parseServiceAccount, sheetIdOf } from './google.mjs';
import { boardTab, overviewLayout } from './boardTabs.mjs';
import { PURPLE } from './style.mjs';
import { applyCorrections } from '../../src/data/commandCenter/statCorrections.mjs';
import { commandTabs, datasetTabs, statTabs } from './tabs.mjs';

/** Is the mirror set up here (a service account key and the sheet's id)? */
export function mirrorConfigured(env = process.env) {
  return Boolean(env.GOOGLE_SERVICE_ACCOUNT_JSON && env.MIRROR_SHEET_ID);
}

/**
 * input: { dataset, leagueStats, store, boards, baseStadiums, now }. `store` is the Command Center store; a part of it that cannot be
 * read (a table not created yet) is left out and reported in `warnings`, so one missing table never stops the rest.
 */
export async function buildMirror({ dataset: given, rankHistory = null, leagueStats = null, store = null, boards, baseStadiums = {}, now = () => Date.now() }) {
  // the live sheet read has no rank history of its own: the one kept with the last sync is used
  const dataset = given.rankHistory ? given : { ...given, rankHistory: rankHistory ?? [] };
  const warnings = [];
  const read = async (what, fn, fallback = []) => {
    if (!store) return fallback;
    try {
      return await fn();
    } catch (e) {
      warnings.push(`${what}: ${e?.message ?? 'could not be read'}`);
      return fallback;
    }
  };
  const [series, stadiumRows, credits, accounts, stats, meta, audit] = await Promise.all([
    read('series', () => store.seriesList()),
    read('stadium requests', () => store.stadiumList()),
    read('credits', () => store.creditsList()),
    read('accounts', () => store.list()),
    read('statistics', () => store.statsList()),
    read('series formats', () => store.metaList()),
    read('activity log', () => store.listAudit(500)),
  ]);
  const all = [
    ...datasetTabs(dataset),
    ...commandTabs({ boards, series, stadiumRows, baseStadiums, credits, accounts, stats, meta, audit }),
    ...statTabs({ seriesStats: stats.filter((e) => e.kind !== 'tournament'), tournamentStats: stats.filter((e) => e.kind === 'tournament').map((e) => ({ ...e, rows: applyCorrections(e.key.replace(/^tour-/, ''), e.fields, e.rows) })), leagueStats }),
  ].map((t) => ({ ...t, tabColor: PURPLE.tab, palette: PURPLE }));
  // one tab per board, in the board's own colours, right after the Overview; then every detail of every board together
  const boardTabs = [...dataset.boards].sort((a, b) => a.name.localeCompare(b.name)).map((b) => boardTab(b, { dataset, boards, series, stadiumRows, baseStadiums, credits, accounts, now }));
  const rest = all.filter((t) => !boardTabs.some((bt) => bt.name === t.name));
  const clash = all.filter((t) => boardTabs.some((bt) => bt.name === t.name)).map((t) => ({ ...t, name: `${t.name} (all)` }));
  const tabs = [...boardTabs, ...clash, ...rest];
  const overview = overviewLayout({ at: new Date(now()).toISOString().slice(0, 16).replace('T', ' ') + ' UTC', dataset, tabs, boardTabNames: boardTabs.map((t) => t.name), warnings });
  return { tabs: [overview, ...tabs], warnings };
}

/** Builds the tabs and writes them. Returns { tabs: number, rows: number, cells: number, warnings }. */
export async function runMirror({ env = process.env, fetchImpl = fetch, sleep, ...input }) {
  const client = new SheetsClient({ account: parseServiceAccount(env.GOOGLE_SERVICE_ACCOUNT_JSON), sheetId: sheetIdOf(env.MIRROR_SHEET_ID), fetchImpl, sleep });
  const { tabs, warnings } = await buildMirror(input);
  await client.prepare(tabs);
  await client.writeAll(tabs);
  await client.format(tabs);
  return { tabs: tabs.length, rows: tabs.reduce((n, t) => n + t.rows.length, 0), cells: tabs.reduce((n, t) => n + (t.rows.length + 1) * t.header.length, 0), warnings };
}
