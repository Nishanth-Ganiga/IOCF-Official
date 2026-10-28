import type { Board } from './boards';
import type { Entry, Player } from './players';
import type { League, LeagueAward } from './leagues';
import { getCouncils, getHallOfFame, getTournaments } from './iocfInfo';
import { store } from './store';

/**
 * Everything the Board profile derives from the live dataset: credits, win rates, councils, sponsors,
 * tournament honours, Hall of Fame cards and league footprint. Nothing here is typed in by hand.
 */

export const FORMAT_ORDER = ['Overall', 'T10', 'T20', 'Club', 'ODI', 'Test', 'Limited 4 Innings'];

export const rankIn = (b: Board, format = 'Overall') => b.rankings?.find((r) => r.format === format);
export const overallRank = (b: Board) => rankIn(b)?.rank;

export const creditsOf = (b: Board): number | undefined => {
  const v = b.facts?.find((f) => /credits/i.test(f.label))?.value;
  const n = v ? Number(v.replace(/[^0-9.]/g, '')) : NaN;
  return Number.isFinite(n) ? n : undefined;
};

export const winRate = (r?: { played: number | null; won: number | null }) => (r && r.played && r.won != null ? r.won / r.played : undefined);

/** The board's strongest format: best (lowest) rank, ties broken by points. */
export const bestFormat = (b: Board) =>
  (b.rankings ?? []).filter((r) => r.format !== 'Overall').sort((a, c) => a.rank - c.rank || c.points - a.points)[0];

export const sponsorsOf = (b: Board) =>
  (b.sponsors ?? []).map((s) => {
    const i = s.indexOf(':');
    return i < 0 ? { role: 'Sponsor', name: s.trim() } : { role: s.slice(0, i).trim(), name: s.slice(i + 1).trim() };
  });

export type CouncilGroup = { name: string; members: string[] };

/** Councils from the sheet's council list, plus any board whose facts name a council. */
export function councilGroups(boards: Board[]): CouncilGroup[] {
  const groups = getCouncils().map((c) => ({ name: c.name, members: [...c.members] }));
  for (const b of boards) {
    const v = b.facts?.find((f) => /council/i.test(f.label))?.value;
    if (!v) continue;
    const name = /^council/i.test(v) ? v : `Council of ${v}`;
    const g = groups.find((x) => x.name.toLowerCase() === name.toLowerCase());
    if (g) {
      if (!g.members.includes(b.name)) g.members.push(b.name);
    } else groups.push({ name, members: [b.name] });
  }
  return groups;
}
export const councilOf = (b: Board, groups: CouncilGroup[]) => groups.find((g) => g.members.includes(b.name))?.name;

const tokens = (s?: string) => (s ?? '').split(/\s*[&,/]\s*/).map((t) => t.trim()).filter(Boolean);

export type Honour = { tournament: string; kind: string; result: 'Champions' | 'Runners-up' | 'Fair play' };
export const honoursOf = (b: Board): Honour[] =>
  getTournaments().flatMap((t) => [
    ...(tokens(t.champions).includes(b.name) ? [{ tournament: t.name, kind: t.kind, result: 'Champions' as const }] : []),
    ...(tokens(t.runnersUp).includes(b.name) ? [{ tournament: t.name, kind: t.kind, result: 'Runners-up' as const }] : []),
    ...(tokens(t.fairPlay).includes(b.name) ? [{ tournament: t.name, kind: t.kind, result: 'Fair play' as const }] : []),
  ]);

export const titlesOf = (b: Board) => honoursOf(b).filter((h) => h.result === 'Champions').length;

const boardOfPerson = (s?: string) => /\(([^)]+)\)\s*$/.exec(s ?? '')?.[1]?.trim();
export const hallOfFameOf = (b: Board) =>
  getHallOfFame().flatMap((c) => [
    ...(boardOfPerson(c.batsman) === b.name ? [{ card: c.card, period: c.period, role: 'Best batsman', player: c.batsman!.replace(/\s*\([^)]*\)\s*$/, '') }] : []),
    ...(boardOfPerson(c.bowler) === b.name ? [{ card: c.card, period: c.period, role: 'Best bowler', player: c.bowler!.replace(/\s*\([^)]*\)\s*$/, '') }] : []),
  ]);

export type Footprint = { league: League; players: number };
export const leagueFootprint = (b: Board): Footprint[] =>
  store.leagues
    .map((league) => ({ league, players: league.teams.reduce((n, t) => n + t.players.filter((p) => p.board === b.name).length, 0) }))
    .filter((f) => f.players > 0)
    .sort((a, c) => c.players - a.players);

export const leagueAwardsOf = (b: Board): (LeagueAward & { league: string })[] =>
  store.leagues.flatMap((l) => l.awards.filter((a) => a.board === b.name).map((a) => ({ ...a, league: l.shortName })));
export const leagueAwardCredits = (b: Board) => leagueAwardsOf(b).reduce((n, a) => n + (a.credits ?? 0), 0);

const tournamentOfAward = (e: Entry) => (e.detail ?? '').split(' · ')[0].trim() || 'Other awards';
/** Award counts per tournament across a board's squad. */
export function squadAwardsByTournament(players: Player[]) {
  const m = new Map<string, number>();
  for (const p of players) for (const e of p.achievements ?? []) m.set(tournamentOfAward(e), (m.get(tournamentOfAward(e)) ?? 0) + 1);
  return [...m.entries()].map(([tournament, awards]) => ({ tournament, awards })).sort((a, c) => c.awards - a.awards);
}

export const topAchievers = (players: Player[], n = 5) =>
  [...players].filter((p) => p.achievements?.length).sort((a, c) => (c.achievements?.length ?? 0) - (a.achievements?.length ?? 0) || a.name.localeCompare(c.name)).slice(0, n);

/** Rank 1 -> 100%, last rank -> small but visible. */
export const strength = (rank: number, total: number) => Math.max(4, ((total - rank + 1) / total) * 100);
