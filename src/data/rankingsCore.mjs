// The Rankings profile: how players, boards and series are ranked. Plain code with no imports other than the shared helpers, so it
// is tested by the self-test. Everything is computed from the live data each time, so the rankings are always current.
import { resolveAlias } from './commandCenter/aliases.mjs';
import { formatKey, norm, sumLines } from './careerStats.mjs';

const words = (s) => (String(s ?? '').toLowerCase().match(/[a-z0-9]+/g) ?? []).length;

/**
 * Groups statistics lines into players. A name of two or more words is one person on every board (as on the profiles); a single
 * name only on its own board; a known alias ("Mohammad Noor") goes to the roster name. `rosterBoard(name)` gives the board of a
 * player's roster entry, which becomes his board (`boardNameOf(slug)` names it when none of his statistics were played for it, e.g. after a
 * transfer); otherwise the board he played most matches for.
 * lines: [{ name, boardSlug, boardName, line, ... }]. Returns [{ key, name, boardSlug, boardName, lines }].
 */
export function groupPlayers(lines, { aliases, rosterBoard, boardNameOf } = {}) {
  const people = new Map();
  for (const l of lines) {
    const hit = aliases ? resolveAlias(aliases, l.name, l.boardSlug) : null;
    const name = hit ? hit.name : l.name;
    const board = hit ? hit.board : l.boardSlug;
    const key = hit || words(name) >= 2 ? norm(name) : `${norm(name)}|${board}`;
    if (!people.has(key)) people.set(key, { key, name, lines: [], boards: new Map(), fixedBoard: hit ? hit.board : null });
    const p = people.get(key);
    p.lines.push(l);
    p.boards.set(l.boardSlug, { name: l.boardName, matches: (p.boards.get(l.boardSlug)?.matches ?? 0) + (Number(l.line?.matches) || 0) });
  }
  return [...people.values()].map((p) => {
    const rosterSlug = rosterBoard?.(p.name) ?? p.fixedBoard;
    const best = [...p.boards.entries()].sort((a, b) => b[1].matches - a[1].matches)[0];
    const boardSlug = rosterSlug ?? best[0];
    const boardName = p.boards.get(boardSlug)?.name ?? lines.find((l) => l.boardSlug === boardSlug)?.boardName ?? boardNameOf?.(boardSlug) ?? best[1].name;
    return { key: p.key, name: p.name, boardSlug, boardName, lines: p.lines };
  });
}

const dec = (n, d = 1) => (Number.isFinite(n) ? n.toFixed(d) : '—');

/** Ranking categories. `get` is the number ranked; `show` (optional) formats it; `low` means smaller is better; `ok` is the qualification. */
export const CATEGORIES = {
  batting: [
    { id: 'runs', label: 'Most runs', get: (t) => t.runs, ok: (t) => t.batInn > 0 },
    { id: 'avg', label: 'Batting average', get: (t) => t.avg, show: (t) => dec(t.avg), ok: (t) => t.batInn >= 3 && t.batInn - t.notOuts >= 1, note: 'At least 3 innings.' },
    { id: 'sr', label: 'Strike rate', get: (t) => t.sr, show: (t) => dec(t.sr), ok: (t) => t.balls >= 50, note: 'At least 50 balls faced.' },
    { id: 'sixes', label: 'Most sixes', get: (t) => t.sixes, ok: (t) => t.sixes > 0 },
    { id: 'fours', label: 'Most fours', get: (t) => t.fours, ok: (t) => t.fours > 0 },
    { id: 'fifties', label: 'Most fifties', get: (t) => t.fifties, ok: (t) => t.fifties > 0 },
    { id: 'hundreds', label: 'Most hundreds', get: (t) => t.hundreds, ok: (t) => t.hundreds > 0 },
    { id: 'hs', label: 'Highest score', get: (t) => t.hs ?? 0, show: (t) => `${t.hs}${t.hsNotOut ? '*' : ''}`, ok: (t) => t.hs !== null && t.hs > 0 },
  ],
  bowling: [
    { id: 'wickets', label: 'Most wickets', get: (t) => t.wickets, ok: (t) => t.wickets > 0 },
    { id: 'economy', label: 'Economy rate', get: (t) => t.economy, show: (t) => dec(t.economy), low: true, ok: (t) => t.ballsBowled >= 60, note: 'At least 10 overs bowled.' },
    { id: 'bowlAvg', label: 'Bowling average', get: (t) => t.bowlAvg, show: (t) => dec(t.bowlAvg), low: true, ok: (t) => t.wickets >= 3, note: 'At least 3 wickets.' },
    { id: 'bowlSr', label: 'Bowling strike rate', get: (t) => t.bowlSr, show: (t) => dec(t.bowlSr), low: true, ok: (t) => t.wickets >= 3, note: 'At least 3 wickets.' },
    { id: 'best', label: 'Best figures', get: (t) => bestScore(t.best), show: (t) => t.best, ok: (t) => bestScore(t.best) > 0 },
    { id: 'fiveW', label: 'Five-wicket hauls', get: (t) => t.fiveW, ok: (t) => t.fiveW > 0 },
    { id: 'threeW', label: 'Three-wicket hauls', get: (t) => t.threeW, ok: (t) => t.threeW > 0 },
    { id: 'maidens', label: 'Most maidens', get: (t) => t.maidens, ok: (t) => t.maidens > 0 },
    { id: 'dots', label: 'Most dot balls', get: (t) => t.dots, ok: (t) => t.dots > 0 },
  ],
  fielding: [
    { id: 'dismissals', label: 'Most dismissals', get: (t) => t.catches + t.stumpings + t.runOuts, ok: (t) => t.catches + t.stumpings + t.runOuts > 0 },
    { id: 'catches', label: 'Most catches', get: (t) => t.catches, ok: (t) => t.catches > 0 },
    { id: 'stumpings', label: 'Most stumpings', get: (t) => t.stumpings, ok: (t) => t.stumpings > 0 },
    { id: 'runOuts', label: 'Most run outs', get: (t) => t.runOuts, ok: (t) => t.runOuts > 0 },
  ],
  awards: [
    { id: 'pom', label: 'Player of the Match awards', get: (t) => t.pom, ok: (t) => t.pom > 0 },
    { id: 'matches', label: 'Most matches played', get: (t) => t.matches, ok: (t) => t.matches > 0 },
  ],
};

/** "4-54" → a number that grows with better figures (more wickets, then fewer runs). */
function bestScore(best) {
  const m = /^(\d+)-(\d+)$/.exec(best ?? '');
  return m ? Number(m[1]) * 10000 - Number(m[2]) : 0;
}

/** Competition ranking: equal values share a rank (1, 1, 3). */
export function rankRows(rows, value, low = false) {
  const sorted = [...rows].sort((a, b) => (low ? value(a) - value(b) : value(b) - value(a)) || a.name.localeCompare(b.name));
  let rank = 0;
  return sorted.map((r, i) => {
    if (i === 0 || value(r) !== value(sorted[i - 1])) rank = i + 1;
    return { ...r, rank };
  });
}

/**
 * Ranks players in one category. people: groupPlayers() output; `format` is 'all' or a format id (only for lines that have one);
 * returns [{ rank, name, boardName, boardSlug, totals, display }].
 */
export function rankPlayers(people, category, format = 'all') {
  const rows = [];
  for (const p of people) {
    const lines = p.lines.filter((l) => format === 'all' || l.format === format).map((l) => l.line);
    if (!lines.length) continue;
    const totals = sumLines(lines);
    if (!category.ok(totals)) continue;
    rows.push({ key: p.key, name: p.name, boardName: p.boardName, boardSlug: p.boardSlug, totals, display: category.show ? category.show(totals) : String(category.get(totals)), value: category.get(totals) });
  }
  return rankRows(rows, (r) => r.value, Boolean(category.low));
}

/** Series won / lost per board. Each series: { boards: [slugs], winner: slug|null, drawn?, format }. */
export function seriesTable(series, { format = 'all' } = {}) {
  const rows = new Map();
  for (const s of series) {
    if (format !== 'all' && formatKey(s.format) !== format) continue;
    for (const b of s.boards) {
      if (!b) continue;
      const r = rows.get(b) ?? { slug: b, played: 0, won: 0, lost: 0, drawn: 0 };
      r.played += 1;
      if (s.winner === b) r.won += 1;
      else if (s.winner) r.lost += 1;
      else r.drawn += 1;
      rows.set(b, r);
    }
  }
  return [...rows.values()].map((r) => ({ ...r, winPct: r.played ? Math.round((r.won / r.played) * 1000) / 10 : 0 }));
}

/** The boards named in a text such as "Scotland", "England & Scotland" or "Diljith Das (England)". */
export function boardsIn(text, boardNames) {
  const t = String(text ?? '').toLowerCase();
  return boardNames.filter((n) => new RegExp(`(^|[^a-z])${n.toLowerCase().replace(/[^a-z ]/g, '')}([^a-z]|$)`).test(t));
}
