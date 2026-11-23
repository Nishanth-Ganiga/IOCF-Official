export type SquadLimits = { min: number; max: number };
export function squadLimits(format: string | undefined | null, clubFormat?: string | null): SquadLimits | null;
export function limitsText(l: SquadLimits | null): string;
export function squadProblem(keys: string[] | undefined, roster: { key: string; name: string }[], limits: SquadLimits | null): string | null;
