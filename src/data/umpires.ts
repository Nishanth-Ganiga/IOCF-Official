import { store } from './store';
import type { Entry, StatValue } from './players';

/**
 * Umpire records for the IOCF Umpire Centre.
 *
 * - Records come from the live dataset (store.ts). One list of umpires (`umpires`). Board umpires carry a `boardId` (the board's slug from boards.ts);
 *   the 30 ranking placeholders have no board until real people are entered.
 * - The Top 30 is a separate dataset (`ranking`): position -> umpireId. To rank a real umpire, point a
 *   position at an existing umpire id; the same record then appears in the board list and the ranking
 *   with no duplicate identity.
 * - Missing values are left undefined; the UI shows "—". Nothing here is a real statistic.
 *
 * Migration path: `loadUmpires()` is async on purpose — replace its body with an API/database fetch.
 */

export const RANKING_SIZE = 30;

export const CAREER_FIELDS = [
  { key: 'total', label: 'Total matches officiated' },
  { key: 'odi', label: 'ODI matches' },
  { key: 't20', label: 'T20 matches' },
  { key: 't10', label: 'T10 matches' },
  { key: 'hundred', label: '100-ball matches' },
  { key: 'test', label: 'Test matches' },
  { key: 'club', label: 'Club matches' },
] as const;

export const PERFORMANCE_FIELDS = [
  { key: 'decisions', label: 'Decisions recorded' },
  { key: 'accuracy', label: 'Decision accuracy' },
  { key: 'reviews', label: 'Reviews / appeals handled' },
  { key: 'points', label: 'Points' },
  { key: 'credits', label: 'Total credits earned' },
  { key: 'rating', label: 'Official performance rating' },
] as const;

export type CareerKey = (typeof CAREER_FIELDS)[number]['key'];
export type PerformanceKey = (typeof PERFORMANCE_FIELDS)[number]['key'];

export type Umpire = {
  id: string;
  /** Board slug; absent for ranking placeholders not yet tied to a board. */
  boardId?: string;
  name: string;
  photo?: string;
  /** e.g. "Active". Defaults to "Awaiting Details" for placeholders. */
  status?: string;
  career?: Partial<Record<CareerKey, StatValue>>;
  performance?: Partial<Record<PerformanceKey, StatValue>>;
  awards?: Entry[];
  assignments?: Entry[];
  matchRecords?: Entry[];
  recentMatches?: Entry[];
  milestones?: Entry[];
};

export const DEFAULT_STATUS = 'Awaiting Details';

/** Real data goes here, keyed by umpire id (e.g. "india-01" or "top-01"). */
const overrides: Record<string, Partial<Omit<Umpire, 'id'>>> = {};

const boardUmpires: Umpire[] = store.umpires.map((u) => ({ ...u, ...overrides[u.id] }));

/** Only used if fewer than RANKING_SIZE umpires have points; keeps every Top 30 position visible. */
const missing = Math.max(0, RANKING_SIZE - store.umpireOrder.length);
const rankingPlaceholders: Umpire[] = Array.from({ length: missing }, (_, i) => {
  const id = `top-${String(i + 1).padStart(2, '0')}`;
  return { id, name: 'Umpire', ...overrides[id] };
});

export const umpires: Umpire[] = [...boardUmpires, ...rankingPlaceholders];

/**
 * Top 30: position -> umpire id. Ordered by points from the IOCF workbook (highest first); this is a
 * points-based ordering, not an official IOCF ranking. Replace with official rankings when available.
 */
export const ranking: { position: number; umpireId: string }[] = [...store.umpireOrder, ...rankingPlaceholders.map((u) => u.id)]
  .slice(0, RANKING_SIZE)
  .map((umpireId, i) => ({ position: i + 1, umpireId }));

export async function loadUmpires(): Promise<Umpire[]> {
  return umpires;
}
