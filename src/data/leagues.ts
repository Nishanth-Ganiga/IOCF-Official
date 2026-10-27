import { store } from './store';

/**
 * Franchise leagues of the IOCF 2026 season, loaded from the live dataset (store.ts).
 *
 * - A league has teams; a team has players; every player has a stable id (`<league>-<team>-<nn>`).
 * - "Stats" for a franchise player are the match-award tallies recorded in the workbook
 *   (Man of the Match, Best Batsman, Best Bowler) plus league honours — the sheets do not hold runs or wickets.
 * - Corrections go in `overrides` below, keyed by league id.
 *
 * Migration path: `loadLeagues()` is async on purpose — swap its body for an API/database fetch.
 */

export type LeagueAwardEntry = { title: string; credits?: number };

export type LeaguePlayer = {
  id: string;
  name: string;
  /** Captain / Marquee / DS as recorded in the squad sheet. */
  role?: string;
  /** National board the player represents. */
  board?: string;
  /** Auction / purchase price in credits. */
  price?: number;
  note?: string;
  mom?: number;
  bat?: number;
  bowl?: number;
  honours?: LeagueAwardEntry[];
};

export type LeagueTeam = { id: string; name: string; notes?: string[]; players: LeaguePlayer[] };

export type LeagueMatch = {
  teams: [string, string];
  stage?: string;
  date?: string;
  venue?: string;
  umpire?: string;
  winner?: string;
  mom?: string;
  bat?: string;
  bowl?: string;
};

export type LeagueAward = { award: string; winner?: string; team?: string; board?: string; credits?: number };

export type League = {
  id: string;
  name: string;
  shortName: string;
  host?: string;
  status: string;
  champions?: string;
  runnersUp?: string;
  fairPlay?: string;
  teams: LeagueTeam[];
  matches: LeagueMatch[];
  awards: LeagueAward[];
};

const overrides: Record<string, Partial<League>> = {};

const leagues: League[] = store.leagues.map((l) => ({ ...l, ...overrides[l.id] }));

export async function loadLeagues(): Promise<League[]> {
  return leagues;
}

/** League-stage table derived from the recorded results (playoff matches carry a `stage` and are excluded). */
export function standings(league: League) {
  const rows = new Map(league.teams.map((t) => [t.name, { team: t.name, id: t.id, played: 0, won: 0, lost: 0, other: 0 }]));
  for (const m of league.matches) {
    if (m.stage) continue;
    for (const name of m.teams) {
      const r = rows.get(name);
      if (!r) continue;
      r.played += 1;
      if (m.winner === name) r.won += 1;
      else if (m.winner && m.teams.includes(m.winner)) r.lost += 1;
      else r.other += 1;
    }
  }
  return [...rows.values()].sort((a, b) => b.won - a.won || a.lost - b.lost || a.team.localeCompare(b.team));
}
