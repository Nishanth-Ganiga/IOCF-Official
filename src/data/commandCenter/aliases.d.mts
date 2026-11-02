export type AliasPerson = { name: string; board: string; aliases: { name: string; boards?: string[] }[] };
export type AliasIndex = { byAlias: Map<string, { person: AliasPerson; boards: string[] | null }[]>; list: AliasPerson[] };
export function buildAliasIndex(list: AliasPerson[]): AliasIndex;
export function resolveAlias(index: AliasIndex | undefined, name: string, boardSlug: string): { name: string; board: string } | null;
export function aliasesOf(index: AliasIndex | undefined, name: string, boardSlug: string): { name: string; boards?: string[] }[];
export const aliasNorm: (s: string) => string;
export const slugOf: (s: string) => string;
