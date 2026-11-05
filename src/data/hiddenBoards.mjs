// Boards that have been dismantled: nothing about them is shown on the site (no board page, roster, ranking, series, tournament table or
// statistics line). Their statistics are kept in the data files and keep counting for the players and boards they were played against.
// To bring a board back, remove it here and sync. Used by the sync (scripts/sync), the server and the site.
export const HIDDEN_BOARDS = ['Kenya'];

const key = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
const hiddenKeys = new Set(HIDDEN_BOARDS.map(key));

/** Is this board (a name such as "Kenya", or a slug) hidden? A youth or women's squad ("KENYA EMERGING", "KENYA W") counts as the board. */
export const isHiddenBoard = (nameOrSlug) => {
  const k = key(nameOrSlug);
  return hiddenKeys.has(k) || hiddenKeys.has(k.replace(/(emerging|w)$/, ''));
};

/** Does any text of this value (a table section, a row…) mention a hidden board? */
export const mentionsHiddenBoard = (value) => {
  const text = JSON.stringify(value) ?? '';
  return HIDDEN_BOARDS.some((b) => new RegExp(`\\b${b}\\b`, 'i').test(text));
};

/** Board ranks (`{ board: { format: rank } }`) without the hidden boards; the ranks below a removed board close up. */
export function closeUpRanks(ranks) {
  const out = {};
  for (const [board, byFormat] of Object.entries(ranks ?? {})) if (!isHiddenBoard(board)) out[board] = { ...byFormat };
  for (const [board, byFormat] of Object.entries(ranks ?? {})) {
    if (!isHiddenBoard(board)) continue;
    for (const [format, rank] of Object.entries(byFormat)) {
      for (const mine of Object.values(out)) if (typeof mine[format] === 'number' && mine[format] > rank) mine[format] -= 1;
    }
  }
  return out;
}
