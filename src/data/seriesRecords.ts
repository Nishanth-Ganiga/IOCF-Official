import { store } from './store';

/**
 * The series announced and played before the Command Center, kept in the IOCF sheet's "Series Matches" tab
 * (read by scripts/sync/series.mjs). They are shown next to the series announced on the site.
 */
export type RecordBoard = { name: string; slug: string | null };
export type SeriesRecord = {
  name: string;
  /** The month banner it sits under in the sheet (completed series only). */
  month: string | null;
  host: RecordBoard;
  opponents: RecordBoard[];
  /** As typed in the sheet, e.g. "6th - 10th Jan". */
  dates: string | null;
  winner: RecordBoard | null;
  runnerUp: RecordBoard | null;
  /** A score such as "2-1" (host first), or a note such as "1 Match Only". */
  result: string | null;
  /** The match-by-match breakdown of a tri- or quadrilateral series. */
  resultLines: string[] | null;
  bet: number | null;
  format: string | null;
};
export type SeriesRecords = { completed: SeriesRecord[]; upcoming: SeriesRecord[] };

export const seriesRecords = (): SeriesRecords => store.seriesRecords ?? { completed: [], upcoming: [] };

export const boardsOf = (r: SeriesRecord) => [r.host, ...r.opponents];
export const involves = (r: SeriesRecord, slug: string) => boardsOf(r).some((b) => b.slug === slug);

const key = (name: string, host: string) => `${name}|${host}`.toLowerCase().replace(/[^a-z0-9|]/g, '');
/** The records, minus any that were also announced on the site (the site's own entry is the one that counts). */
export function withoutSiteDuplicates(list: SeriesRecord[], site: { name: string; host: { name: string } }[]): SeriesRecord[] {
  const seen = new Set(site.map((s) => key(s.name, s.host.name)));
  return list.filter((r) => !seen.has(key(r.name, r.host.name)));
}

/** The wording for a result: a score read host-first, or the sheet's own note. */
export function resultText(r: SeriesRecord): string | null {
  if (!r.result) return null;
  return /^\d+-\d+$/.test(r.result) ? `${r.host.name} ${r.result.split('-')[0]} – ${r.result.split('-')[1]} ${r.opponents.length === 1 ? r.opponents[0].name : 'opponents'}` : r.result;
}

const slugNorm = (x: string) => x.toLowerCase().replace(/&/g, '').replace(/[^a-z0-9]/g, '');
/** The key under which an earlier series' format and statistics are stored. Must match server/command/seriesStats.mjs. */
export const recordKey = (name: string, host: string) => `rec-${slugNorm(name)}-${slugNorm(host)}`;
