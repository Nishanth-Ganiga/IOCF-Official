export const MOVE_DAYS: number;
export const DAY_MS: number;
export type RankState = { at: number; entries: Record<string, { r: number; p: number | null; t: number }> };
export function updateState(prev: RankState | null | undefined, ranks: { key: string; rank: number }[], now: number): { state: RankState; changed: boolean };
export function movesOf(state: RankState | null | undefined, now: number): Record<string, { by: number; isNew: boolean }>;
