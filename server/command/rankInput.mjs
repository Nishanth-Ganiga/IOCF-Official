// Loads everything the rankings are worked out from, on the server: the sheet's dataset (read live, like /api/iocf-data), the bundled
// statistics, the statistics the administrator uploaded, and the finished series announced on the site.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SERIES_CFG } from './series.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export async function loadRankingInput({ store, root = ROOT }) {
  const { buildFromSource, loadConfig } = await import('../../scripts/sync/sheet.mjs'); // only loaded when the rankings are refreshed
  const cfg = loadConfig(root);
  const { dataset } = await buildFromSource({ sheetUrl: cfg.sheetUrl, sheetFile: '' });
  const read = (rel) => JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'));

  const entries = await store.statsList();
  const [series, metaRows] = await Promise.all([store.seriesList().catch(() => []), store.metaList().catch(() => [])]);
  const meta = Object.fromEntries(metaRows.map((m) => [m.key, m.format]));
  const formatOf = (key) => {
    if (key.startsWith('site-')) {
      const s = series.find((x) => x.id === key.slice(5));
      return s ? (s.club_format ? `Club · ${SERIES_CFG.clubFormats.find((f) => f.id === s.club_format)?.label ?? s.club_format}` : s.format) : '';
    }
    return meta[key] ?? '';
  };
  return {
    dataset,
    tournamentStats: read('src/data/tournamentStats.json'),
    leagueStats: read('src/data/leagueStats.json'),
    aliases: read('src/data/commandCenter/playerAliases.json'),
    tournamentOverrides: Object.fromEntries(entries.filter((e) => e.kind === 'tournament').map((e) => [e.key.slice(5), { fields: e.fields, rows: e.rows }])),
    seriesStats: entries.filter((e) => e.kind !== 'tournament').map((e) => ({ key: e.key, fields: e.fields, rows: e.rows, format: formatOf(e.key) })),
    seriesResults: series
      .filter((x) => x.status === 'accepted' && x.result_winner)
      .map((x) => ({ boards: [x.host, ...x.opponents], winner: x.result_winner === 'draw' ? null : x.result_winner, format: x.club_format ? `Club · ${SERIES_CFG.clubFormats.find((f) => f.id === x.club_format)?.label ?? x.club_format}` : x.format })),
    meta,
  };
}
