import type { LeagueAwardEntry, LeaguePlayer, League, LeagueTeam } from './leagues';
import type { Player } from './players';
import { store } from './store';

/** A squad name without the notes the sheet adds to it: "Ans Sheikh: 600000", "Harsh 1500", "Ashiqui Ashi (C)". */
export const cleanSquadName = (name: string) => name.split(/[:(]/)[0].replace(/[\s-]*\d+\s*$/, '').trim().toLowerCase();

export type FranchiseStint = { league: League; team: LeagueTeam; entry: LeaguePlayer; honours: LeagueAwardEntry[] };

/**
 * Franchise-league squads a national-board player appears in. Matched by exact name; a squad entry that names a
 * board must match the player's board, and one that names none counts for the league's host board, or when this is
 * the only player on any roster with that exact name.
 */
export function franchiseHistory(player: Player, boardName: string): FranchiseStint[] {
  const name = cleanSquadName(player.name);
  const sole = store.players.filter((p) => cleanSquadName(p.name) === name).length === 1;
  const out: FranchiseStint[] = [];
  for (const league of store.leagues)
    for (const team of league.teams)
      for (const entry of team.players)
        if (cleanSquadName(entry.name) === name && (entry.board ? entry.board === boardName : league.host === boardName || sole))
          out.push({ league, team, entry, honours: entry.honours ?? [] });
  return out;
}
