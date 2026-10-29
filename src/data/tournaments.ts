import { store } from './store';

/**
 * Major Tournaments (T20 World Cup, Euro Cup, …), read from their tabs of the IOCF workbook by the sync job
 * (scripts/sync/tournaments.mjs). Each tab is kept as the titled tables it contains — squads, schedules and results,
 * awards, fantasy and prediction contests, board credits — so that every cell of the sheet shows on the site.
 */

export type TournamentSection = {
  /** Heading line(s) above the table, e.g. "Group A Matches". */
  titles: string[];
  /** Column headings; empty when the table has none (numbered lists). */
  columns: string[];
  rows: string[][];
};

export type TournamentEdition = {
  year: number;
  /** The sheet's own headline, e.g. "T20 WORLD CUP 2026 HOSTED BY AUSTRALIA". */
  heading?: string;
  host?: string;
  champions?: string;
  runnersUp?: string;
  sections: TournamentSection[];
};

export type MajorTournament = {
  id: string;
  name: string;
  kind: string;
  sheet: string;
  editions: TournamentEdition[];
};

export const majorTournaments = (): MajorTournament[] => store.majorTournaments ?? [];

/** A few plain sentences about one edition, built only from what the sheet records. */
export function describeEdition(t: MajorTournament, e: TournamentEdition): string[] {
  const out = [`The ${e.year} ${t.name} is an IOCF ${t.kind.toLowerCase()}${e.host ? `, hosted by ${e.host}` : ''}.`];
  if (e.champions) out.push(`${e.champions} won the title${e.runnersUp ? `, with ${e.runnersUp} as runners-up` : ''}.`);
  const tables = e.sections.filter((s) => s.rows.length > 0);
  const rows = tables.reduce((n, s) => n + s.rows.length, 0);
  out.push(`The ${e.year} page below holds ${tables.length} ${tables.length === 1 ? 'table' : 'tables'} from the official workbook (${rows.toLocaleString('en-US')} rows) — everything recorded for this tournament.`);
  return out;
}
