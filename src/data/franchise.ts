import type { LeagueAwardEntry, LeaguePlayer, League, LeagueTeam } from './leagues';
import type { Player } from './players';
import { store } from './store';

export type FranchiseStint = { league: League; team: LeagueTeam; entry: LeaguePlayer; honours: LeagueAwardEntry[] };

/**
 * Franchise-league squads a national-board player appears in. Matched by name; a squad entry that names a
 * board must match the player's board, and one that names none counts only for the league's host board.
 */
export function franchiseHistory(player: Player, boardName: string): FranchiseStint[] {
  const name = player.name.trim().toLowerCase();
  const out: FranchiseStint[] = [];
  for (const league of store.leagues)
    for (const team of league.teams)
      for (const entry of team.players)
        if (entry.name.trim().toLowerCase() === name && (entry.board ? entry.board === boardName : league.host === boardName))
          out.push({ league, team, entry, honours: entry.honours ?? [] });
  return out;
}
