/**
 * Hand-written content for the Chairman profile. The sheet has no tab for this yet, so it lives here.
 *
 * - `visions`: a chairman's own message, keyed by board slug (e.g. "england", "papua-new-guinea").
 *   Only enter words the chairman actually provided.
 * - `announcements`: governance news. Give `board` (slug) for a board-specific item, or leave it out to
 *   show the item on every board's page (federation-wide). `date` is ISO, e.g. "2026-10-28".
 *
 * Migration path: replace these with a sheet tab in scripts/sync once one exists.
 */

export type Announcement = {
  id: string;
  title: string;
  date: string;
  body?: string;
  link?: string;
  /** Board slug; omit for a federation-wide announcement. */
  board?: string;
};

export const visions: Record<string, string> = {};

/** Public contact links per board slug. Only add what the chairman has agreed to share. */
export type Contact = { email?: string; linkedin?: string; instagram?: string; website?: string };
export const contacts: Record<string, Contact> = {};

/** Date the current chairman took office, per board slug (ISO, e.g. "2026-03-01"). Shown as "Chairman since …". */
export const appointedOn: Record<string, string> = {};

export const announcements: Announcement[] = [];

/** Newest first: this board's items plus federation-wide ones. */
export const announcementsFor = (slug: string) =>
  announcements.filter((a) => !a.board || a.board === slug).sort((a, b) => b.date.localeCompare(a.date));
