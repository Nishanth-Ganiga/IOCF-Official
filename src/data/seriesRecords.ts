import { store } from './store';

/**
 * The series announced and played before the Command Center, kept in the IOCF sheet's "Series Matches" tab
 * (read by scripts/sync/series.mjs). They are shown next to the series announced on the site.
 */
export type RecordBoard = { name: string; slug: string | null; /** The name the team had at the time (Qatar took over the old Afghanistan team). */ was?: string };
/** A board's name as shown in a record: "Qatar (then Afghanistan)" for the team that used to be Afghanistan. */
export const boardLabel = (b: RecordBoard) => (b.was ? `${b.name} (then ${b.was})` : b.name);
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
  /** The host's name in the sheet when it has been renamed (see the sync's RENAMES); statistics are filed under it. */
  keyHost?: string;
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
/** The key of a record: from the host's name in the sheet. */
export const keyOf = (r: SeriesRecord) => recordKey(r.name, r.keyHost ?? r.host.name);

/** The ODI World Cup warm-up games were scored as one file ("ODI WC Warmup all matches.csv"), stored under this key. */
export const WARMUP_KEY = 'rec-odi-wc-warmup-games';
/**
 * The ODI World Cup warm-up games: the ones named "… Warmup n", and the other warm-up games the sheet lists under their own
 * names (all in September). All of them are in the one combined statistics file. Add a name here when another turns up.
 */
const WARMUP_GAMES = ['Zubeen Garg Tribute Trophy', 'Kingstown Cup', 'Last Of the Summer', 'The Stars & Tigers series', 'The Gulf Cup', 'Rhino - Bear Cup', 'Sammy Warne', 'Rhino - Owl Cup', 'Crown & Pearl', 'Waugh Lara', 'The Indo-Emirates Cup', 'Rhino - Lion Cup', 'The Emirates Royal Cup'].map(slugNorm);
export const isWarmup = (r: SeriesRecord) => /warm-?up/i.test(r.name) || (r.month === 'September' && WARMUP_GAMES.includes(slugNorm(r.name)));
/** Where a record's player statistics are stored: its own key, or the combined warm-up file for a warm-up game. */
export const statsKeyOf = (r: SeriesRecord) => (isWarmup(r) ? WARMUP_KEY : keyOf(r));
