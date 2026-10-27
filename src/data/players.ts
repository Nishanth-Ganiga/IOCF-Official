import { store } from './store';

/**
 * Player records for the IOCF Player Directory.
 *
 * Records are imported from the live dataset (store.ts). Every player belongs to exactly one board (`boardId` = the board's slug from boards.ts) and has a
 * stable, unique `id`. Manual corrections go in `overrides` below; to change one,
 * edit its record (found by id) — the directory, player list and profile all read from this data.
 *
 * Missing statistics are simply left out (undefined). The UI shows "—" for them, never a zero.
 *
 * Migration path: `loadPlayers()` is async on purpose. Swap its body for a fetch to an API / database
 * and nothing in the UI has to change.
 */

export const BATTING_FIELDS = [
  { key: 'matches', label: 'Matches' },
  { key: 'innings', label: 'Innings' },
  { key: 'runs', label: 'Runs' },
  { key: 'highestScore', label: 'Highest score' },
  { key: 'average', label: 'Batting average' },
  { key: 'strikeRate', label: 'Strike rate' },
  { key: 'centuries', label: 'Centuries' },
  { key: 'halfCenturies', label: 'Half-centuries' },
] as const;

export const BOWLING_FIELDS = [
  { key: 'matches', label: 'Matches' },
  { key: 'innings', label: 'Innings' },
  { key: 'overs', label: 'Overs' },
  { key: 'wickets', label: 'Wickets' },
  { key: 'bestFigures', label: 'Best bowling figures' },
  { key: 'average', label: 'Bowling average' },
  { key: 'economy', label: 'Economy rate' },
  { key: 'strikeRate', label: 'Strike rate' },
  { key: 'fiveWickets', label: 'Five-wicket hauls' },
] as const;

export const FORMATS = [
  { id: 't10', label: 'T10' },
  { id: 't20', label: 'T20' },
  { id: 'hundred', label: '100-ball' },
  { id: 'odi', label: 'ODI' },
  { id: 'test', label: 'Test' },
  { id: 'club', label: 'Club cricket' },
] as const;

export type BattingKey = (typeof BATTING_FIELDS)[number]['key'];
export type BowlingKey = (typeof BOWLING_FIELDS)[number]['key'];
export type FormatId = (typeof FORMATS)[number]['id'];

export type StatValue = string | number;
export type BattingStats = Partial<Record<BattingKey, StatValue>>;
export type BowlingStats = Partial<Record<BowlingKey, StatValue>>;

/** One line in a list section (recent performance, tournament, achievement, ranking, highlight). */
export type Entry = { title: string; date?: string; detail?: string };

export type Player = {
  id: string;
  boardId: string;
  name: string;
  photo?: string;
  batting?: BattingStats;
  bowling?: BowlingStats;
  formats?: Partial<Record<FormatId, { batting?: BattingStats; bowling?: BowlingStats }>>;
  recentPerformances?: Entry[];
  tournaments?: Entry[];
  achievements?: Entry[];
  rankings?: Entry[];
  highlights?: Entry[];
};

/** Explicit records that replace placeholders, keyed by player id. Add real data here. */
const overrides: Record<string, Partial<Omit<Player, 'id' | 'boardId'>>> = {};

const players: Player[] = store.players.map((p) => ({ ...p, ...overrides[p.id] }));

export async function loadPlayers(): Promise<Player[]> {
  return players;
}
