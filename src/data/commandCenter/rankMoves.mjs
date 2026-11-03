// Rank movement for every ranking. The server keeps, for each ranking, where every entry stood the last time its rank changed:
//   state = { at, entries: { <key>: { r: current rank, p: the rank before its last change (null if new), t: when it last changed } } }
// A move is shown for MOVE_DAYS days after the change and then disappears (the entry stays where it is, without an arrow).
// The first time a ranking is seen it is only a baseline: nothing has moved yet (t = 0).
export const MOVE_DAYS = 10;
export const DAY_MS = 86_400_000;

/** The new state of one ranking after its latest ranks ([{ key, rank }]) were worked out. Returns { state, changed }. */
export function updateState(prev, ranks, now) {
  const entries = {};
  let changed = !prev;
  for (const { key, rank } of ranks) {
    const old = prev?.entries?.[key];
    if (!prev) entries[key] = { r: rank, p: null, t: 0 }; // first sight: a baseline, nothing has moved
    else if (!old) {
      entries[key] = { r: rank, p: null, t: now }; // joined the ranking later: new
      changed = true;
    } else if (old.r !== rank) {
      entries[key] = { r: rank, p: old.r, t: now }; // its rank changed: this is the move
      changed = true;
    } else entries[key] = old;
  }
  if (prev && Object.keys(prev.entries ?? {}).some((k) => !(k in entries))) changed = true; // someone dropped out of the list
  return { state: { at: now, entries }, changed };
}

/**
 * What to show next to each entry of a ranking: { <key>: { by, isNew } } for the ones that moved in the last MOVE_DAYS days.
 * `by` is positive for up, negative for down; `isNew` marks an entry that joined the ranking.
 */
export function movesOf(state, now) {
  const out = {};
  for (const [key, e] of Object.entries(state?.entries ?? {})) {
    if (!e.t || now - e.t >= MOVE_DAYS * DAY_MS) continue;
    if (e.p === null) out[key] = { by: 0, isNew: true };
    else if (e.p !== e.r) out[key] = { by: e.p - e.r, isNew: false };
  }
  return out;
}
