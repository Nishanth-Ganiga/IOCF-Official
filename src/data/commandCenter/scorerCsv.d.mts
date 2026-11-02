export const FIELDS: [string, 's' | 'n'][];
export const FIELD_NAMES: string[];
export function parseCsv(text: string): string[][];
export function parseScorerText(text: string, label?: string): { title: string; tour: string; rows: (string | number | null)[][] };
