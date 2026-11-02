// Reads the "Series Matches" tab: the series announced and played before the Command Center existed (completed series, listed
// month by month, and the "Upcoming Series" block). They are shown on the site next to the series announced in the Command Center.
//
// The tab is read by its headings, not by fixed positions: a "Completed Series" / "Upcoming Series" banner, a month banner
// (January …), then a table whose header row names its columns (Series Name, Hosting Board, Opponents, Dates, Winners, Runners,
// Series Result, Bet Amount, Format). Rows of other blocks (World Test Championship, Major Tournaments, Franchise Leagues) are ignored.
import { boardName, norm, s, slug } from './helpers.mjs';

const SHEET = 'Series Matches';
const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
// spellings found in the sheet that are not the official board name
const FIXES = { bangaldesh: 'Bangladesh', netherland: 'Netherlands', netherlands: 'Netherlands', uk: 'England' };
const FORMATS = { odi: 'ODI', t20: 'T20', t10: 'T10', l4i: 'L4I', test: 'TEST', club: 'Club' };

/** A board named in the sheet as { name, slug } (slug is null for a team that is not one of the 26 boards, e.g. Argentina). */
export function resolveBoard(x) {
  const t = s(x);
  if (!t) return null;
  const k = norm(t);
  const name = FIXES[k] ?? boardName(t) ?? t;
  return { name, slug: boardName(name) ? slug(name) : null };
}

const splitBoards = (x) =>
  (s(x) ?? '')
    .split(/,|&|\band\b/i)
    .map((p) => resolveBoard(p))
    .filter(Boolean);

/** "7o 7w" / "5overs 5wickets" → "7 overs 7 wickets"; "L4i" → "L4I"; anything else is kept as written. */
export function normalFormat(x) {
  const t = s(x);
  if (!t) return null;
  const m = /^(\d+)\s*o(?:vers?)?\s*(\d+)\s*w(?:ickets?)?$/i.exec(t);
  if (m) return `${m[1]} overs ${m[2]} wickets`;
  return FORMATS[norm(t)] ?? t;
}

/** A score typed as "1-2" is turned into a date by the spreadsheet (1 Feb, "2026-01-02"…): month-day is host-away. */
function readResult(v) {
  if (v instanceof Date) return { text: `${v.getUTCMonth() + 1}-${v.getUTCDate()}`, lines: null };
  const t = s(v);
  if (!t || t === '-') return { text: null, lines: null };
  const lines = String(v).split(/\r?\n/).map((l) => s(l)).filter(Boolean);
  if (lines.length > 1) return { text: null, lines };
  return { text: t.replace(/\s*-\s*/g, '-'), lines: null };
}

const LABELS = {
  name: /^(series|test) name$/,
  host: /^host(ing)? board$/,
  opponents: /^opponents?$/,
  dates: /^dates?$/,
  winner: /^winners?$/,
  runnerUp: /^runners?(\s*up)?$/,
  result: /^series result$/,
  bet: /^bet amount$/,
  format: /^format$/,
};

/**
 * Teams that changed hands. Qatar took over the old Afghanistan team (same team and statistics), and a NEW Afghanistan team,
 * with no connection to it, started with "The Golden Cup". So in the series before that one, "Afghanistan" was the team that is
 * now Qatar: those series belong to Qatar (marked "then Afghanistan"), and Afghanistan's own history starts at The Golden Cup.
 */
export const RENAMES = [{ from: 'Afghanistan', to: 'Qatar', until: 'The Golden Cup' }];

/** Applies RENAMES to { completed, upcoming } (in the order of the sheet). Safe to apply twice. */
export function applyRenames(rec) {
  for (const ren of RENAMES) {
    const cut = rec.completed.findIndex((r) => norm(r.name) === norm(ren.until));
    if (cut < 0) continue;
    const from = resolveBoard(ren.from);
    const to = resolveBoard(ren.to);
    const swap = (b) => (b && b.name === from.name ? { ...to, was: from.name } : b);
    for (const r of rec.completed.slice(0, cut)) {
      const boards = [r.host, ...r.opponents];
      if (!boards.some((b) => b.name === from.name)) continue;
      if (boards.some((b) => b.name === to.name)) continue; // both teams in one series: they cannot be told apart, so it is left as written
      r.keyHost ??= r.host.name; // its statistics and format are filed under the name in the sheet, so a later rule change never loses them
      r.host = swap(r.host);
      r.opponents = r.opponents.map(swap);
      r.winner = swap(r.winner);
      r.runnerUp = swap(r.runnerUp);
    }
  }
  return rec;
}

export function buildSeriesRecords(book) {
  if (!book.has(SHEET)) return null;
  const sh = book.sheet(SHEET);
  const completed = [];
  const upcoming = [];
  let mode = null;
  let month = null;
  let cols = null;
  for (let r = 1; r <= sh.maxRow; r++) {
    const cells = Array.from({ length: Math.min(sh.maxCol, 14) }, (_, i) => sh.get(r, i + 1));
    const filled = cells.filter((c) => c !== null && c !== undefined && String(c).trim() !== '');
    if (!filled.length) continue;
    const first = s(cells[0]);
    // a banner: one cell, or the same text repeated across the row
    if (first && new Set(filled.map((c) => s(c))).size === 1) {
      const t = first.toLowerCase();
      if (t === 'completed series') [mode, month, cols] = ['completed', null, null];
      else if (t === 'upcoming series') [mode, month, cols] = ['upcoming', null, null];
      else if (MONTHS.includes(t)) month = first;
      else [mode, cols] = [null, null]; // another block (World Test Championship, Major Tournaments, Franchise Leagues)
      continue;
    }
    const labels = cells.map((c) => (s(c) ?? '').toLowerCase());
    if (labels[0] && LABELS.name.test(labels[0])) {
      cols = {};
      for (const [key, re] of Object.entries(LABELS)) {
        const i = labels.findIndex((l) => re.test(l));
        if (i >= 0) cols[key] = i;
      }
      continue;
    }
    if (!mode || !cols || cols.name === undefined || !first) continue;
    const at = (key) => (cols[key] === undefined ? null : cells[cols[key]]);
    const host = resolveBoard(at('host'));
    const opponents = splitBoards(at('opponents'));
    if (!host || !opponents.length) continue;
    const winner = resolveBoard(at('winner'));
    const runnerUp = resolveBoard(at('runnerUp'));
    const res = readResult(at('result'));
    const bet = at('bet');
    const rec = {
      name: first,
      month: mode === 'completed' ? month : null,
      host,
      opponents,
      dates: s(at('dates')),
      winner: winner && winner.name !== '-' ? winner : null,
      runnerUp: runnerUp && runnerUp.name !== '-' ? runnerUp : null,
      result: res.text,
      resultLines: res.lines,
      bet: typeof bet === 'number' && Number.isFinite(bet) ? bet : null,
      format: normalFormat(at('format')),
    };
    (mode === 'completed' ? completed : upcoming).push(rec);
  }
  return applyRenames({ completed, upcoming });
}
