import { decodePlayers, type PlayerStats } from './leagueStats';
import { store } from './store';
import type { TournamentEdition } from './tournaments';

/**
 * Player statistics of the Major Tournaments, from the STUMPS scorer exports
 * (All Assests/All 2026 Major Tournaments Stats → `npm run tournament-stats` → tournamentStats.json).
 * Same columns as the franchise-league exports; here the "team" of a player is the board he plays for.
 */

export type TournamentStats = { title: string; tour: string; players: PlayerStats[] };
export type AllTournamentStats = Record<string, TournamentStats>;

type Raw = { fields: string[]; tournaments: Record<string, { title: string; tour: string; rows: (string | number | null)[][] }> };

let cache: Promise<AllTournamentStats> | null = null;

/** Loads and decodes the stats (a separate chunk, fetched when a tournament's 2026 page is opened). */
export function loadTournamentStats(): Promise<AllTournamentStats> {
  cache ??= import('./tournamentStats.json').then((m) => {
    const raw = m.default as unknown as Raw;
    const out: AllTournamentStats = {};
    for (const [id, t] of Object.entries(raw.tournaments)) out[id] = { title: t.title, tour: t.tour, players: decodePlayers(raw.fields, t.rows) };
    return out;
  });
  return cache;
}

const norm = (s: string) => s.toLowerCase().replace(/&/g, '').replace(/[^a-z0-9]/g, '');
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
export const boardSlug = slug;
const title = (s: string) => s.toLowerCase().replace(/(^|[^a-z'])([a-z])/g, (_, p, c) => p + c.toUpperCase());

/**
 * Team names in the exports that are not simply a board's name. `<tournament id>/<name in the export>` → board.
 * ("ZZDISMANTLED SA" is South Africa under the name the scorer was left with.)
 */
const TEAM_FIXES: Record<string, string> = {
  'ZZDISMANTLED SA': 'South Africa',
};

export type BoardGroup = {
  /** URL id of the board, e.g. "new-zealand". */
  slug: string;
  /** The board's official name. */
  name: string;
  /** "Emerging" / "Women's" when the squad is that board's youth or women's side. */
  squad?: string;
  players: PlayerStats[];
};

/** The board a scorer team name stands for, and the kind of squad if it is a youth or women's side. */
export function boardOf(team: string): { name: string; squad?: string } {
  const fixed = TEAM_FIXES[team];
  let squad: string | undefined;
  let base = fixed ?? team;
  if (!fixed) {
    if (/\s+EMERGING$/i.test(base)) squad = 'Emerging';
    else if (/\s+W$/i.test(base)) squad = "Women's";
    base = base.replace(/\s+(EMERGING|W)$/i, '');
  }
  const official = store.boards.find((b) => norm(b.name) === norm(base))?.name;
  return { name: official ?? title(base), squad };
}

/** The boards of a tournament, in the order the export lists them, each with its players. */
export function groupsOf(stats: TournamentStats | undefined): BoardGroup[] {
  const out = new Map<string, BoardGroup>();
  for (const p of stats?.players ?? []) {
    const { name, squad } = boardOf(p.team);
    const key = slug(name);
    if (!out.has(key)) out.set(key, { slug: key, name, squad, players: [] });
    out.get(key)!.players.push(p);
  }
  return [...out.values()];
}

export const groupTotals = (players: PlayerStats[]) => ({
  runs: players.reduce((n, p) => n + p.runs, 0),
  wickets: players.reduce((n, p) => n + p.wickets, 0),
  sixes: players.reduce((n, p) => n + p.sixes, 0),
  fours: players.reduce((n, p) => n + p.fours, 0),
  hundreds: players.reduce((n, p) => n + p.hundreds, 0),
  fifties: players.reduce((n, p) => n + p.fifties, 0),
});

export type PlayerAward = { award: string; detail?: string; credits?: string };

const words = (s: string) => (s.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter((w) => w.length > 1);

/**
 * The awards a player received, read from the tournament's own awards tables. A winner is matched by exact name; a shorter
 * spelling there ("Chappy" for "Chappy Mk") also counts when the table names the player's board and the words fit that
 * one player of the board only. A cell may name several winners ("A & B").
 */
export function awardsFor(edition: TournamentEdition, player: PlayerStats, all: TournamentStats | undefined): PlayerAward[] {
  const me = norm(player.name);
  const myBoard = norm(boardOf(player.team).name);
  const mates = (all?.players ?? []).filter((p) => norm(boardOf(p.team).name) === myBoard);
  const unique = (all?.players.filter((p) => norm(p.name) === me).length ?? 0) <= 1;
  const out: PlayerAward[] = [];
  for (const s of edition.sections) {
    const cols = s.columns.map((c) => norm(c));
    const col = (re: RegExp) => cols.findIndex((c) => re.test(c));
    const winner = col(/^awardwinner$/);
    const nameCol = winner >= 0 ? winner : col(/^player$/);
    if (nameCol < 0) continue;
    const boardCol = col(/board$/);
    const awardCol = col(/^awardname$/);
    const detailCol = col(/^achi/);
    const creditCol = col(/credit/);
    for (const row of s.rows) {
      const names = (row[nameCol] ?? '').split(/\s*(?:&|\band\b)\s*/i).map((n) => n.replace(/^\d+\s*[.)]\s*/, '').replace(/\((?:c|vc|wk)\)/gi, '').trim());
      const boards = boardCol >= 0 ? (row[boardCol] ?? '').split(/\s*&\s*/).map(norm).filter(Boolean) : [];
      const boardOk = !boards.length || boards.includes(myBoard);
      const hit = names.some((n) => {
        if (norm(n) === me) return boardOk || unique;
        // a shorter spelling: only with the board named, and only if it fits this one player of the board
        if (!boards.includes(myBoard) || !words(n).length) return false;
        if (mates.some((p) => norm(p.name) === norm(n))) return false;
        const fits = mates.filter((p) => words(n).every((w) => words(p.name).includes(w)));
        return fits.length === 1 && fits[0] === player;
      });
      if (!hit) continue;
      out.push({
        award: awardCol >= 0 ? row[awardCol] : (s.titles[s.titles.length - 1] ?? 'Award'),
        detail: detailCol >= 0 && row[detailCol] && row[detailCol] !== '-' ? row[detailCol] : undefined,
        credits: creditCol >= 0 && row[creditCol] ? row[creditCol] : undefined,
      });
    }
  }
  return out;
}

/** The same player (exact name) in the other tournaments. */
export function otherTournaments(all: AllTournamentStats, current: { tournamentId: string; name: string }) {
  const me = norm(current.name);
  const out: { tournamentId: string; p: PlayerStats; board: string }[] = [];
  for (const [id, t] of Object.entries(all)) {
    if (id === current.tournamentId) continue;
    const p = t.players.find((x) => norm(x.name) === me);
    if (p) out.push({ tournamentId: id, p, board: boardOf(p.team).name });
  }
  return out;
}
