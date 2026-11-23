export type Fixture = { no: number; teams: [string, string] | null; final: boolean };
export function buildFixtures(type: string, teams: string[], matches: number): Fixture[];
export function stadiumBoards(type: string, fixture: Fixture, host: string): string[];
export const PER_DAY_CHOICES: Record<string, number[]>;
export function perDayChoices(type: string): number[];
export function matchDays<T>(scheduled: T[], perDay?: number): T[][];
export function dateProblem(scheduled: Fixture[], dates: string[], perDay?: number): string | null;
