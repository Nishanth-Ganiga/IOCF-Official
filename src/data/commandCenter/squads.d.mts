export type SquadLimits = { min: number; max: number };
export function squadLimits(format: string | undefined | null, clubFormat?: string | null): SquadLimits | null;
export function limitsText(l: SquadLimits | null): string;
export function leadersProblem(keys: string[] | undefined, captain?: string | null, viceCaptain?: string | null): string | null;
export function squadEntries(keys: string[] | undefined, names: Map<string, string>, captain?: string | null, viceCaptain?: string | null): { key: string; name: string; role?: 'captain' | 'vice-captain' }[];
export function squadProblem(keys: string[] | undefined, roster: { key: string; name: string }[], limits: SquadLimits | null): string | null;
