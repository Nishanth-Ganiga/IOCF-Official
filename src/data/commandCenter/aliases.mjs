// Players known under more than one name in the statistics ("Mohammad Noor" and "Muhammad Noor"; a player who moved boards and
// is listed under his old name). playerAliases.json holds each such player under the name on his board's roster, with the other
// names the statistics use; this module turns that list into lookups. Plain code, shared by the server and the browser.

const norm = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
const slugOf = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** list: [{ name, board, aliases: [{ name, boards? }] }] → a lookup from an alias to the player it belongs to. */
export function buildAliasIndex(list) {
  const byAlias = new Map();
  for (const person of list ?? []) {
    for (const a of person.aliases ?? []) {
      const k = norm(a.name);
      byAlias.set(k, [...(byAlias.get(k) ?? []), { person, boards: a.boards ?? null }]);
    }
  }
  return { byAlias, list: list ?? [] };
}

/** The player a statistics name belongs to, as { name, board } (his roster name and board), or null when it is nobody's alias. */
export function resolveAlias(index, name, boardSlug) {
  const hits = (index?.byAlias.get(norm(name)) ?? []).filter((h) => !h.boards || h.boards.includes(boardSlug));
  return hits.length === 1 ? { name: hits[0].person.name, board: hits[0].person.board } : null;
}

/** The other names of one player ({ name, boards|null }), for matching his squad entries in the franchise leagues. */
export function aliasesOf(index, name, boardSlug) {
  const p = index?.list.find((x) => x.board === boardSlug && norm(x.name) === norm(name));
  return p?.aliases ?? [];
}
/**
 * Franchise squad entries that are this player under a spelling the squads use ("Ahmed" in a Big Bash squad, "Mahsoof -17000" in an IPL one):
 * [{ league, team, name }]. Listed one by one because such a name alone (a plain "Ahmed") could be anybody.
 */
export function squadEntriesOf(index, name, boardSlug) {
  const p = index?.list.find((x) => x.board === boardSlug && norm(x.name) === norm(name));
  return p?.squadEntries ?? [];
}
export { norm as aliasNorm, slugOf };
