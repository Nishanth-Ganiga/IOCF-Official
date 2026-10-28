import { visions } from './chairmanContent';
import { store } from './store';

/** The 26 IOCF boards, in directory order. Chairman details are filled in here once confirmed. */
export type Achievement = {
  title: string;
  /** Free-form, e.g. "March 2026" or "2025". */
  date?: string;
  description?: string;
  /** Short qualifier, e.g. the tournament an award came from. */
  detail?: string;
  /** Optional supporting image URL. */
  image?: string;
};

export type Board = {
  name: string;
  /** Flag emoji; West Indies has no national flag emoji, so it is omitted and a badge is shown instead. */
  flag?: string;
  /** A board counts as "Available" once its chairman's name is entered. */
  chairman?: string;
  /** Defaults to /chairmen/<slug>.webp (see scripts/build-chairmen.mjs). */
  portrait?: string;
  ceo?: string;
  sponsors?: string[];
  /** Board statistics shown on the chairman card, e.g. available credits and council. */
  facts?: { label: string; value: string }[];
  /** Board ranking per format (rank among boards with points). */
  rankings?: { format: string; rank: number; points: number; played: number | null; won: number | null }[];
  /** Contributions & achievements — add as many as needed. */
  achievements?: Achievement[];
  /** Short statement from the chairman. */
  vision?: string;
};

export const isAvailable = (b: Board) => Boolean(b.chairman);

/** URL-safe id used for the board's detail route, e.g. "papua-new-guinea". */
export const boardSlug = (b: Board) => b.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');

const baseBoards: Board[] = [
  { name: 'Bangladesh', flag: '🇧🇩' },
  { name: 'England', flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿' },
  { name: 'New Zealand', flag: '🇳🇿' },
  { name: 'West Indies' },
  { name: 'Qatar', flag: '🇶🇦' },
  { name: 'Netherlands', flag: '🇳🇱' },
  { name: 'Australia', flag: '🇦🇺' },
  { name: 'South Africa', flag: '🇿🇦' },
  { name: 'India', flag: '🇮🇳' },
  { name: 'Italy', flag: '🇮🇹' },
  { name: 'Pakistan', flag: '🇵🇰' },
  { name: 'Scotland', flag: '🏴󠁧󠁢󠁳󠁣󠁴󠁿' },
  { name: 'Sri Lanka', flag: '🇱🇰' },
  { name: 'UAE', flag: '🇦🇪' },
  { name: 'Canada', flag: '🇨🇦' },
  { name: 'Zimbabwe', flag: '🇿🇼' },
  { name: 'Ireland', flag: '🇮🇪' },
  { name: 'Uganda', flag: '🇺🇬' },
  { name: 'USA', flag: '🇺🇸' },
  { name: 'Papua New Guinea', flag: '🇵🇬' },
  { name: 'Nepal', flag: '🇳🇵' },
  { name: 'Portugal', flag: '🇵🇹' },
  { name: 'Japan', flag: '🇯🇵' },
  { name: 'Kenya', flag: '🇰🇪' },
  { name: 'Afghanistan', flag: '🇦🇫' },
  { name: 'Spain', flag: '🇪🇸' },
];

/** Base list merged with data imported from the live dataset (see store.ts). Manual edits can go in the base list. */
export const boards: Board[] = baseBoards
  .map((b) => {
    const i = store.boards.find((x) => x.name === b.name);
    return i ? { ...b, chairman: b.chairman ?? i.chairman, ceo: i.ceo, sponsors: i.sponsors, facts: i.facts, rankings: i.rankings, achievements: b.achievements ?? i.achievements } : b;
  })
  .map((b) => ({ ...b, vision: b.vision ?? visions[boardSlug(b)], portrait: b.portrait ?? `/chairmen/${boardSlug(b)}.webp` }));
