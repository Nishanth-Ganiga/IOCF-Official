export const teamKey: (name: string) => string;
export const cleanSquadText: (s: string) => string;
export function linkSquad(leagueId: string, scorerTeam: string, scorer: string[], squad: string[]): Map<number, number>;
