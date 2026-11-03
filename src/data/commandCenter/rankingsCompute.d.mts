export const TOP: number;
export { rankingId } from './rankingIds.mjs';
export function decodeRow(fields: string[], row: (string | number | null)[]): Record<string, any>;
export function boardOfTeam(team: string, boardNames: string[]): { name: string; slug: string };
export function computeAllRankings(input: Record<string, any>): Record<string, { key: string; rank: number }[]>;
