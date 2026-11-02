import { resolveAlias } from './commandCenter/aliases.mjs';

// How a player's board statistics are put together on the Players profile. Plain code (no imports), tested by the self-test.
//
//   • Board statistics = the Major Tournaments + the series played for a board, split by FORMAT.
//   • Franchise league statistics are kept completely separate (they are never added to the board statistics).
//   • A tournament has a fixed format (TOURNAMENT_FORMAT); a series has the format given when it was announced, or set by the
//     administrator for an earlier series. A series without a format is counted in "all formats" only.
//   • A player is found by his exact name. A name of two or more words that appears under other boards is the same person, so his
//     profile also shows what he did for those boards; a single name ("Abhishek") is only ever matched on his own board.

export const FORMAT_ORDER = ['odi', 'test', 't20', 't10', 'club', 'l4i'];
export const FORMAT_LABEL = { odi: 'ODI', test: 'Test', t20: 'T20', t10: 'T10', club: 'Club', l4i: 'L4I' };

/** The format of each Major Tournament. (The Origins Championship has none yet: it only counts in "all formats".) */
export const TOURNAMENT_FORMAT = {
  'asia-cup': 'odi',
  'oceania-cup': 'odi',
  'euro-cup': 'odi',
  'odi-world-cup': 'odi',
  'world-test-championship': 'test',
  'associate-nations-cup': 'test',
  'emerging-talents-league': 'club',
  'womens-global-league': 'club',
  'lone-warrior': 'club',
  't20-world-cup': 't20',
};

/** "ODI", "T20", "Test", "L4I", "Club · 6 overs 6 wickets", "7 overs 7 wickets" → odi / t20 / test / l4i / club; anything else → null. */
export function formatKey(text) {
  const t = String(text ?? '').trim().toLowerCase();
  if (!t) return null;
  if (/^club\b/.test(t) || /\d+\s*(overs?|o)\s*\d+\s*(wickets?|w)\b/.test(t)) return 'club';
  const k = t.replace(/[^a-z0-9]/g, '');
  return { odi: 'odi', t20: 't20', t10: 't10', test: 'test', l4i: 'l4i' }[k] ?? null;
}

export const norm = (s) => String(s ?? '').toLowerCase().replace(/&/g, '').replace(/[^a-z0-9]/g, '');
const words = (s) => (String(s ?? '').toLowerCase().match(/[a-z0-9]+/g) ?? []).length;

/**
 * lines: [{ name, boardSlug, ... }] from every source. Returns the ones that are this player: his exact name on his own board,
 * and — for a name of two or more words — on other boards too (flagged own: false).
 */
export function selectLines(lines, { name, boardSlug }, aliases) {
  const me = norm(name);
  const multi = words(name) >= 2;
  const out = [];
  for (const l of lines) {
    // a name the statistics use for a known player ("Mohammad Noor" for "Muhammad Noor") belongs to that player, on any board
    const hit = aliases ? resolveAlias(aliases, l.name, l.boardSlug) : null;
    if (hit) {
      if (hit.board === boardSlug && norm(hit.name) === me) out.push({ ...l, own: l.boardSlug === boardSlug });
      continue;
    }
    if (norm(l.name) !== me) continue;
    if (l.boardSlug === boardSlug) out.push({ ...l, own: true });
    else if (multi) out.push({ ...l, own: false });
  }
  return out;
}

const SUM = ['matches', 'pom', 'batInn', 'runs', 'balls', 'fours', 'sixes', 'thirties', 'fifties', 'hundreds', 'notOuts', 'bowlInn', 'wickets', 'runsConceded', 'maidens', 'ballsBowled', 'dots', 'threeW', 'fiveW', 'catches', 'stumpings', 'runOuts'];
const r1 = (n) => Math.round(n * 10) / 10;

const betterBest = (a, b) => {
  const pa = /^(\d+)-(\d+)$/.exec(a ?? '');
  const pb = /^(\d+)-(\d+)$/.exec(b ?? '');
  if (!pa) return pb ? b : null;
  if (!pb) return a;
  return Number(pb[1]) > Number(pa[1]) || (Number(pb[1]) === Number(pa[1]) && Number(pb[2]) < Number(pa[2])) ? b : a;
};

/** Totals of several statistics lines (the same fields as a scorer-export player), with the averages worked out from the totals. */
export function sumLines(lines) {
  const t = { hs: null, hsNotOut: false, best: null, most6: 0, most4: 0, fast50: null, fast100: null };
  for (const f of SUM) t[f] = 0;
  for (const l of lines) {
    for (const f of SUM) t[f] += Number(l[f]) || 0;
    if (typeof l.hs === 'number' && (t.hs === null || l.hs > t.hs || (l.hs === t.hs && l.hsNotOut))) [t.hs, t.hsNotOut] = [l.hs, Boolean(l.hsNotOut)];
    t.best = betterBest(t.best, l.best ?? null);
    t.most6 = Math.max(t.most6, Number(l.most6) || 0);
    t.most4 = Math.max(t.most4, Number(l.most4) || 0);
    for (const f of ['fast50', 'fast100']) if (typeof l[f] === 'number' && (t[f] === null || l[f] < t[f])) t[f] = l[f];
  }
  const outs = t.batInn - t.notOuts;
  t.avg = outs > 0 ? r1(t.runs / outs) : t.runs;
  t.sr = t.balls > 0 ? r1((t.runs / t.balls) * 100) : 0;
  t.bowlAvg = t.wickets > 0 ? r1(t.runsConceded / t.wickets) : 0;
  t.bowlSr = t.wickets > 0 ? r1(t.ballsBowled / t.wickets) : 0;
  t.economy = t.ballsBowled > 0 ? r1((t.runsConceded / t.ballsBowled) * 6) : 0;
  return t;
}

/** The formats that have data among these entries, in the usual order. */
export const formatsIn = (entries) => FORMAT_ORDER.filter((f) => entries.some((e) => e.format === f));
