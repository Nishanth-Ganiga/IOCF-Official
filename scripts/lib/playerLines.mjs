// The logic of `npm run player`: which statistics lines a player gets, and which similar-named lines are not counted for him.
import { buildAliasIndex, resolveAlias } from '../../src/data/commandCenter/aliases.mjs';
import { norm, selectLines, sumLines } from '../../src/data/careerStats.mjs';

const slug = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const dec = (fields, row) => Object.fromEntries(fields.map((f, i) => [f, row[i]]));

/** input: what loadRankingInput returns. Returns { roster, counted: [{ source, id, line }], totals, similar }. */
export function explainPlayer(input, name) {
  const aliases = buildAliasIndex(input.aliases);
  const roster = input.dataset.players.filter((p) => norm(p.name) === norm(name) || resolveAlias(aliases, name, p.boardId)?.name === p.name);
  const me = roster[0] ?? { name, boardId: '' };
  const lines = [];
  const tournaments = { ...(input.tournamentStats?.tournaments ?? {}), ...Object.fromEntries(Object.entries(input.tournamentOverrides ?? {})) };
  for (const [id, t] of Object.entries(tournaments)) for (const r of t.rows) lines.push({ source: 'tournament', id, line: dec(t.fields ?? input.tournamentStats.fields, r) });
  for (const s of input.seriesStats ?? []) for (const r of s.rows) lines.push({ source: 'series', id: s.key, line: dec(s.fields, r) });
  for (const [id, l] of Object.entries(input.leagueStats?.leagues ?? {})) for (const r of l.rows) lines.push({ source: 'franchise', id, line: dec(input.leagueStats.fields, r) });
  const all = lines.map((l) => ({ ...l, name: l.line.name, boardSlug: slug(String(l.line.team).replace(/\s+(EMERGING|W)$/i, '')) }));
  const board = selectLines(all.filter((l) => l.source !== 'franchise'), { name: me.name, boardSlug: me.boardId }, aliases);
  const franchise = all.filter((l) => l.source === 'franchise' && norm(l.name) === norm(me.name));
  const counted = [...board, ...franchise];
  const set = new Set(counted.map((l) => l.line)); // (the lines themselves: selectLines hands back copies of the wrappers)
  const t = (ls) => {
    const x = sumLines(ls.map((l) => l.line));
    return { lines: ls.length, matches: x.matches, runs: x.runs, wickets: x.wickets };
  };
  const of = (src) => counted.filter((l) => l.source === src);
  const words = String(name).toLowerCase().split(/\s+/).filter((w) => w.length >= 4);
  const similar = all.filter((l) => !set.has(l.line) && words.some((w) => String(l.name).toLowerCase().includes(w.slice(0, Math.max(4, w.length - 2)))));
  return { roster, counted, similar, totals: { tournament: t(of('tournament')), series: t(of('series')), board: t([...of('tournament'), ...of('series')]), franchise: t(of('franchise')), overall: t(counted) } };
}
