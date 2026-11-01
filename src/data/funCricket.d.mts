export function randomDigits(rng?: () => number): number[];
export function parseDigits(text: string): number[] | null;
export function playOver(bat: number[], bowl: number[]): { outOn: number | null; runs: number; scored: number[] };
export function ordinal(n: number): string;
export const sumText: (digits: number[]) => string;
