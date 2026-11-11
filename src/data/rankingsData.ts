import { api } from './commandApi';
import { buildAliasIndex } from './commandCenter/aliases.mjs';
import aliasList from './commandCenter/playerAliases.json';
import { formatKey, norm } from './careerStats.mjs';
import { loadLeagueStats, playersOf } from './leagueStats';
import { loadCareerLines } from './playerCareer';
import { groupPlayers, type Person } from './rankingsCore.mjs';
import { isHiddenBoard } from './hiddenBoards.mjs';
import { allSeriesRecords, keyOf } from './seriesRecords';
import { store } from './store';

const ALIASES = buildAliasIndex(aliasList as never);
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** Where each player's roster entry is (his board). */
function rosterBoard(name: string) {
  const k = norm(name);
  return store.players.find((p) => norm(p.name) === k)?.boardId;
}

const boardNameOf = (boardSlug: string) => store.boards.find((b) => slug(b.name) === boardSlug)?.name;

const group = (lines: unknown[]): Person[] =>
  groupPlayers(lines as never[], { aliases: ALIASES, rosterBoard, boardNameOf }).map((p: Person) => (isHiddenBoard(p.boardSlug) ? { ...p, boardSlug: '', boardName: '—' } : p));

/** The franchise league lines (no formats: the franchise leagues are ranked on their own). */
async function franchiseLines() {
  const all = await loadLeagueStats();
  return store.leagues.flatMap((league) =>
    league.teams.flatMap((team) =>
      playersOf(all, league, team).map((p) => {
        const board = p.squad?.board ?? '';
        return { name: p.name, boardSlug: board ? slug(board) : '', boardName: board || '—', source: 'franchise', id: league.id, label: league.name, format: null, line: p };
      }),
    ),
  );
}

/** Where a ranking's statistics come from. Kept apart so a wrong number can be traced to its source. */
export type PlayerScope = 'overall' | 'board' | 'tournament' | 'series' | 'franchise';
export const PLAYER_SCOPES: { id: PlayerScope; label: string; note: string }[] = [
  { id: 'overall', label: 'Overall', note: 'Board cricket and franchise leagues together' },
  { id: 'board', label: 'Board cricket', note: 'Major tournaments and series together' },
  { id: 'tournament', label: 'Major tournaments', note: 'Major tournaments only' },
  { id: 'series', label: 'International series', note: 'Series only' },
  { id: 'franchise', label: 'Franchise leagues', note: 'All franchise leagues combined' },
];

/** Players with the lines of one scope (tournament and series lines carry their format). */
export async function loadPeople(scope: PlayerScope): Promise<Person[]> {
  if (scope === 'franchise') return group(await franchiseLines());
  const lines = await loadCareerLines();
  if (scope === 'overall') return group([...lines, ...(await franchiseLines())]);
  if (scope === 'board') return group(lines);
  return group(lines.filter((l) => l.source === scope));
}

/** Players with their major-tournament and series lines, each with its format. */
export const loadBoardPeople = () => loadPeople('board');

export type SeriesResult = { boards: (string | null)[]; winner: string | null; format: string | null };

/** Every finished series: the earlier ones from the IOCF records and the ones announced on the site. */
export async function loadSeriesResults(): Promise<SeriesResult[]> {
  let site: Awaited<ReturnType<typeof api.seriesResults>> = { series: [], meta: {} };
  try {
    site = await api.seriesResults();
  } catch {
    /* the Command Center service is not reachable here (for example in the apps): the records alone are used */
  }
  const out: SeriesResult[] = allSeriesRecords().completed.map((r) => ({
    boards: [r.host.slug, ...r.opponents.map((o) => o.slug)],
    winner: r.winner?.slug ?? null,
    format: site.meta[keyOf(r)] ?? r.format,
  }));
  for (const s of site.series) out.push({ boards: [s.host, ...s.opponents], winner: s.winner, format: s.format });
  return out;
}
export { formatKey };
