import type { League, LeagueMatch } from './leagues';
import type { Umpire } from './umpires';
import { store } from './store';

/**
 * Links franchise-league matches to umpire records. The matches only hold the umpire's name as typed in the sheet
 * (sometimes two names, e.g. "Achuz & Diljith"), so matching is by name and flagged when a name is shared.
 */
const norm = (s: string) => s.trim().toLowerCase();
const tokens = (s: string) => s.split(/\s*[&/,]\s*/).map(norm).filter(Boolean);

export type Officiated = { league: League; match: LeagueMatch };

export function officiatedBy(umpire: Umpire, umpires: Umpire[]) {
  const mine = norm(umpire.name);
  const shared = umpires.filter((u) => norm(u.name) === mine && u.id !== umpire.id).length;
  const matches: Officiated[] = [];
  for (const league of store.leagues) for (const match of league.matches) if (match.umpire && tokens(match.umpire).includes(mine)) matches.push({ league, match });
  return { matches, shared };
}

/** Matches officiated per umpire id (names shared by several umpires are credited to each). */
export function officiatingCounts(umpires: Umpire[]) {
  const byName = new Map<string, Umpire[]>();
  umpires.forEach((u) => byName.set(norm(u.name), [...(byName.get(norm(u.name)) ?? []), u]));
  const counts = new Map<string, number>();
  for (const league of store.leagues)
    for (const m of league.matches)
      if (m.umpire) for (const t of new Set(tokens(m.umpire))) for (const u of byName.get(t) ?? []) counts.set(u.id, (counts.get(u.id) ?? 0) + 1);
  return counts;
}
