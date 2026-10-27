import type { Board } from './boards';
import type { League } from './leagues';
import type { Entry, Player } from './players';
import type { Tournament } from './iocfInfo';
import type { Umpire } from './umpires';

/**
 * The live IOCF dataset. It is produced from the Google Sheet by the sync job (scripts/sync-sheet.mjs)
 * and published as /iocf-data.json. The site loads it once at start-up (see main.tsx); if it cannot be
 * fetched, the bundled snapshot (snapshot.json, from the last local sync) is used instead.
 */

export type ImportedBoard = {
  name: string;
  chairman?: string;
  ceo?: string;
  sponsors?: string[];
  facts: { label: string; value: string }[];
  rankings: NonNullable<Board['rankings']>;
  achievements: Entry[];
};

export type Info = {
  tournaments: Tournament[];
  tournamentAwards: string[];
  hallOfFame: { card: string; period: string; batsman?: string; bowler?: string }[];
  councils: { name: string; members: string[] }[];
};

export type Dataset = {
  generatedAt?: string;
  source?: string | null;
  boards: ImportedBoard[];
  players: Player[];
  umpires: Umpire[];
  umpireOrder: string[];
  leagues: League[];
  info: Info;
};

export const store: Dataset = {
  boards: [],
  players: [],
  umpires: [],
  umpireOrder: [],
  leagues: [],
  info: { tournaments: [], tournamentAwards: [], hallOfFame: [], councils: [] },
};

export const dataState: { origin: 'live' | 'snapshot' | 'none' } = { origin: 'none' };

const looksValid = (d: unknown): d is Dataset => !!d && typeof d === 'object' && Array.isArray((d as Dataset).boards) && (d as Dataset).boards.length > 0 && Array.isArray((d as Dataset).leagues);

/** Load the dataset into `store`. Never throws; the app renders with whatever could be loaded. */
export async function initData(): Promise<void> {
  try {
    const ctl = new AbortController();
    const timer = window.setTimeout(() => ctl.abort(), 10000);
    const res = await fetch('/iocf-data.json', { cache: 'no-cache', signal: ctl.signal });
    window.clearTimeout(timer);
    if (res.ok) {
      const json: unknown = await res.json();
      if (looksValid(json)) {
        Object.assign(store, json);
        dataState.origin = 'live';
        return;
      }
    }
  } catch {
    /* fall through to the bundled snapshot */
  }
  try {
    const snap = (await import('./snapshot.json')).default as unknown;
    if (looksValid(snap)) {
      Object.assign(store, snap);
      dataState.origin = 'snapshot';
    }
  } catch {
    /* no data available; pages show their empty/error states */
  }
}
