// Player statistics of a series: the STUMPS scorer export uploaded by the administrator when a series is finished (or for an
// earlier series from the IOCF records), and the totals worked out from every uploaded series.
//
// A series is identified by a key: `site-<id>` for a series announced on the site, `rec-<name>-<host>` for an earlier series from
// the IOCF records (see recordKey). A new upload for the same series replaces the old one, so a corrected export is easy.
// Players are counted by exact name + board; two similar names are two people.
import { FIELD_NAMES, parseScorerText } from '../../src/data/commandCenter/scorerCsv.mjs';
import { SERIES_CFG } from './series.mjs';
import { readFileSync } from 'node:fs';
import { buildAliasIndex, resolveAlias } from '../../src/data/commandCenter/aliases.mjs';

// players known under more than one name (src/data/commandCenter/playerAliases.json): their lines are added up together
const ALIASES = buildAliasIndex(JSON.parse(readFileSync(new URL('../../src/data/commandCenter/playerAliases.json', import.meta.url), 'utf8')));

export const MAX_ROWS = 2000;
export const MAX_CSV = 900_000;
const norm = (x) => String(x ?? '').toLowerCase().replace(/&/g, '').replace(/[^a-z0-9]/g, '');
export const KEY_RE = /^(site|rec|tour)-[a-z0-9-]{3,220}$/;
/** The Major Tournaments whose player statistics the administrator can replace (key `tour-<id>`). */
export const TOURNAMENT_IDS = ['t20-world-cup', 'euro-cup', 'oceania-cup', 'asia-cup', 'associate-nations-cup', 'odi-world-cup', 'world-test-championship', 'emerging-talents-league', 'womens-global-league', 'origins-championship', 'lone-warrior'];

/** The key of an earlier series from the IOCF records. Must match the one the browser builds (src/data/seriesRecords.ts). */
export const recordKey = (name, host) => `rec-${norm(name)}-${norm(host)}`;

/** The formats the administrator can give an earlier series. */
export const FORMAT_CHOICES = [...SERIES_CFG.formats.filter((f) => f !== 'Club'), ...SERIES_CFG.clubFormats.map((c) => `Club · ${c.label}`)];

const TEAM_FIXES = { zzdismantledsa: 'south-africa' };
/** The board (slug) a scorer team name stands for; "… EMERGING" and "… W" are that board's youth and women's sides. */
export function boardForTeam(team, boards) {
  const base = String(team ?? '').replace(/\s+(EMERGING|W)$/i, '');
  const k = norm(base);
  if (TEAM_FIXES[norm(team)]) return TEAM_FIXES[norm(team)];
  return boards.find((b) => norm(b.name) === k || b.slug.replace(/-/g, '') === k)?.slug ?? null;
}

/** Checks an uploaded export. Returns { value: { title, tour, fields, rows, players, warnings } } or { error }. */
export function parseUpload(csv, boards) {
  if (typeof csv !== 'string' || !csv.trim()) return { error: 'Choose the statistics CSV file to upload.' };
  if (csv.length > MAX_CSV) return { error: 'That file is too large for a statistics export.' };
  let parsed;
  try {
    parsed = parseScorerText(csv, 'This file');
  } catch (e) {
    return { error: `${e.message}. Upload the scorer's player statistics export (the same kind of file as the tournament statistics).` };
  }
  if (!parsed.rows.length) return { error: 'The file has no player rows.' };
  if (parsed.rows.length > MAX_ROWS) return { error: `The file has more than ${MAX_ROWS} players.` };
  const ti = FIELD_NAMES.indexOf('team');
  const ni = FIELD_NAMES.indexOf('name');
  const warnings = [];
  const unknown = [...new Set(parsed.rows.map((r) => String(r[ti])).filter((t) => !boardForTeam(t, boards)))];
  if (unknown.length) warnings.push(`These team names are not one of the 27 boards, so their players are kept but not linked to a board: ${unknown.join(', ')}.`);
  const seen = new Set();
  const dup = new Set();
  for (const r of parsed.rows) {
    const k = `${norm(r[ti])}|${norm(r[ni])}`;
    if (seen.has(k)) dup.add(String(r[ni]));
    seen.add(k);
  }
  if (dup.size) warnings.push(`The same player appears twice in one team: ${[...dup].join(', ')}. Both rows are counted.`);
  return { value: { title: parsed.title, tour: parsed.tour, fields: FIELD_NAMES, rows: parsed.rows, players: parsed.rows.length, warnings } };
}

const asObject = (fields, row) => Object.fromEntries(fields.map((f, i) => [f, row[i]]));
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const round1 = (n) => Math.round(n * 10) / 10;

/** The rows of one stored upload as players with their board (slug and name). */
export function decodeStats(entry, boards) {
  return entry.rows.map((row) => {
    const o = asObject(entry.fields, row);
    const slug = boardForTeam(o.team, boards);
    return { ...o, board: slug, boardName: boards.find((b) => b.slug === slug)?.name ?? String(o.team) };
  });
}

const bestOf = (a, b) => {
  const pa = /^(\d+)-(\d+)$/.exec(a ?? '');
  const pb = /^(\d+)-(\d+)$/.exec(b ?? '');
  if (!pa) return pb ? b : null;
  if (!pb) return a;
  return Number(pb[1]) > Number(pa[1]) || (Number(pb[1]) === Number(pa[1]) && Number(pb[2]) < Number(pa[2])) ? b : a;
};

const SUM = ['matches', 'pom', 'batInn', 'runs', 'balls', 'fours', 'sixes', 'thirties', 'fifties', 'hundreds', 'notOuts', 'bowlInn', 'wickets', 'runsConceded', 'maidens', 'ballsBowled', 'dots', 'threeW', 'fiveW', 'catches', 'stumpings', 'runOuts'];

/** Totals per player (exact name + board) over every uploaded series. Sorted by runs, then wickets. */
export function aggregate(entries, boards) {
  const map = new Map();
  for (const entry of entries) {
    for (let p of decodeStats(entry, boards)) {
      const hit = resolveAlias(ALIASES, p.name, p.board ?? '');
      if (hit) p = { ...p, name: hit.name, board: hit.board, boardName: boards.find((b) => b.slug === hit.board)?.name ?? p.boardName };
      const key = `${norm(p.name)}|${p.board ?? norm(p.team)}`;
      let t = map.get(key);
      if (!t) {
        t = { name: p.name, board: p.board, boardName: p.boardName, series: 0, hs: null, hsNotOut: false, best: null };
        for (const f of SUM) t[f] = 0;
        map.set(key, t);
      }
      t.series += 1;
      for (const f of SUM) t[f] += num(p[f]);
      const hsRaw = String(p.hs ?? '');
      const hs = hsRaw ? parseInt(hsRaw, 10) : NaN;
      if (Number.isFinite(hs) && (t.hs === null || hs > t.hs || (hs === t.hs && hsRaw.endsWith('*')))) [t.hs, t.hsNotOut] = [hs, hsRaw.endsWith('*')];
      t.best = bestOf(t.best, String(p.best ?? '').trim() || null);
    }
  }
  return [...map.values()]
    .map((t) => {
      const outs = t.batInn - t.notOuts;
      return {
        ...t,
        avg: outs > 0 ? round1(t.runs / outs) : t.runs > 0 ? t.runs : 0,
        sr: t.balls > 0 ? round1((t.runs / t.balls) * 100) : 0,
        bowlAvg: t.wickets > 0 ? round1(t.runsConceded / t.wickets) : 0,
        economy: t.ballsBowled > 0 ? round1((t.runsConceded / t.ballsBowled) * 6) : 0,
      };
    })
    .sort((a, b) => b.runs - a.runs || b.wickets - a.wickets || a.name.localeCompare(b.name));
}
