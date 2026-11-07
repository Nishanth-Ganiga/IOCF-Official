export const HIDDEN_BOARDS: string[];
export const DISMANTLED_LABEL: string;
export function scrubText(text: string): string;
export function isHiddenBoard(nameOrSlug: string | null | undefined): boolean;
export function mentionsHiddenBoard(value: unknown): boolean;
export function closeUpRanks(ranks: Record<string, Record<string, number>>): Record<string, Record<string, number>>;
