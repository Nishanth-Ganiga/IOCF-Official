export type StatCorrection = { tournament: string; name: string; team?: string; add: Record<string, number> };
export const STAT_CORRECTIONS: StatCorrection[];
export function applyCorrections<T extends (string | number | null)[]>(id: string, fields: string[], rows: T[], list?: StatCorrection[]): T[];
