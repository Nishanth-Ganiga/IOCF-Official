export type Fixture = { no: number; teams: [string, string] | null; final: boolean };
export function buildFixtures(type: string, teams: string[], matches: number): Fixture[];
export function stadiumBoards(type: string, fixture: Fixture, host: string): string[];
