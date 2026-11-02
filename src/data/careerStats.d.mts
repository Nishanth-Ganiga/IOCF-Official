export const FORMAT_ORDER: string[];
export const FORMAT_LABEL: Record<string, string>;
export const TOURNAMENT_FORMAT: Record<string, string>;
export function formatKey(text: string | null | undefined): string | null;
export const norm: (s: string) => string;
import type { AliasIndex } from './commandCenter/aliases.mjs';
export function selectLines<T extends { name: string; boardSlug: string }>(lines: T[], who: { name: string; boardSlug: string }, aliases?: AliasIndex): (T & { own: boolean })[];
export function sumLines(lines: Record<string, unknown>[]): Record<string, number | string | boolean | null> & { runs: number; wickets: number };
export function formatsIn(entries: { format: string | null }[]): string[];
