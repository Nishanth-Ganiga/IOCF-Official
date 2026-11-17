// Build a Stadium: the rules, in one place. Used by the API (handler.mjs) and by the self-test.
//   • a board asks to build a stadium: a name and a place in its home country. The level is always 3 and costs ₹30,000;
//     neither can be chosen or changed by the board (whatever the browser sends is ignored)
//   • the administrator accepts or declines the request. Accepting adds the stadium to the board's list; the cost is NOT taken
//     by the system: the administrator deducts it from the board's credits in the sheet by hand. Declining removes the
//     request from the administrator's queue and tells the board it was not accepted
//   • the stadiums that existed before this feature come from stadiums.json (the old stadium sheet); every new one is a row in
//     the command_stadiums table. A board's stadium list is both together.
import { STADIUMS } from './series.mjs';

export const STADIUM_LEVEL = 3;
export const STADIUM_COST = 30000;
/** A board can have this many requests waiting at once. */
export const MAX_PENDING = 3;
/** A declined request is shown to the board for this long unless the board dismisses it. */
export const DECLINE_VISIBLE_MS = 14 * 86400000;

const clean = (v) => String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
const norm = (s) => String(s ?? '').toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]/g, '');
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The home country shown for a board (a board's name is its country; the West Indies are a region). */
export const countryOf = (board) => board.name;

/** Every stadium name in use, in any board's list or in any request that is waiting or accepted (a name is used once). */
export function takenNames(rows, base = STADIUMS) {
  const out = new Set();
  for (const list of Object.values(base)) for (const n of list) out.add(norm(n));
  for (const r of rows) if (r.status === 'pending' || r.status === 'accepted') out.add(norm(r.name));
  return out;
}

/**
 * Checks what a chairman sent. Returns { value: { name, place, venue, level, cost } } or { error }.
 * Only the name and the place are read from the input: the level and the cost are fixed here.
 */
export function validateRequest(input, board, boards, taken) {
  const i = input && typeof input === 'object' ? input : {};
  const name = clean(i.name);
  if (name.length < 3 || name.length > 60) return { error: 'Enter the stadium name (3 to 60 characters).' };
  if (!/^[\p{L}\p{N} .,'’&()/-]+$/u.test(name) || !/\p{L}/u.test(name)) return { error: 'A stadium name uses letters, numbers and simple punctuation only.' };
  if (taken.has(norm(name))) return { error: 'A stadium with that name already exists or has been requested. Choose another name.' };
  const country = countryOf(board);
  let place = clean(i.place ?? i.venue);
  // the country is added for them: "Mumbai, India" and "Mumbai" are the same place
  place = place.replace(new RegExp(`[,\\s-]*${escapeRe(country)}\\s*$`, 'i'), '').replace(/[,\s-]+$/, '').trim();
  if (place.length < 2 || place.length > 60) return { error: `Enter the place of the stadium: a city or town in ${country} (2 to 60 characters).` };
  if (!/^[\p{L}\p{N} .,'’&()/-]+$/u.test(place) || !/\p{L}/u.test(place)) return { error: 'The place uses letters, numbers and simple punctuation only.' };
  // a place that names another board's country is not in this board's home country
  const other = boards.find((b) => b.slug !== board.slug && new RegExp(`(^|[^a-z])${escapeRe(b.name.toLowerCase())}([^a-z]|$)`).test(place.toLowerCase()));
  if (other) return { error: `The stadium must be in ${country}, your home country. “${place}” names ${other.name}.` };
  return { value: { name, place, venue: `${place}, ${country}`, level: STADIUM_LEVEL, cost: STADIUM_COST } };
}

/** A new request row (status pending). */
export function newRequest(value, board, who, id, t) {
  return {
    key: id,
    board: board.slug,
    name: value.name,
    place: value.place,
    venue: value.venue,
    country: countryOf(board),
    level: STADIUM_LEVEL,
    cost: STADIUM_COST,
    status: 'pending',
    requested_by: who.username,
    requested_at: t,
    decided_by: null,
    decided_at: null,
    decline_reason: null,
    adjustment_id: null,
    acknowledged_at: null,
  };
}

/** The stadium lists the series rules use: the old list plus every accepted stadium, in the order they were accepted. */
export function stadiumLists(rows, base = STADIUMS) {
  const out = Object.fromEntries(Object.entries(base).map(([k, v]) => [k, [...v]]));
  for (const r of [...rows].filter((x) => x.status === 'accepted').sort((a, b) => (a.decided_at ?? 0) - (b.decided_at ?? 0))) {
    const list = (out[r.board] ??= []);
    if (!list.includes(r.name)) list.push(r.name);
  }
  return out;
}

/** What the API shows of a request. */
export const toApi = (r, boards) => ({
  id: r.key,
  board: r.board,
  boardName: boards.find((b) => b.slug === r.board)?.name ?? r.board,
  name: r.name,
  place: r.place,
  venue: r.venue,
  level: r.level,
  cost: r.cost,
  status: r.status,
  requestedBy: r.requested_by,
  requestedAt: r.requested_at,
  decidedBy: r.decided_by ?? null,
  decidedAt: r.decided_at ?? null,
  declineReason: r.decline_reason ?? null,
});

/** A declined request the board has not dismissed and that is still recent: the board is told it was not accepted. */
export const noticeFor = (r, slug, t) => r.status === 'declined' && r.board === slug && !r.acknowledged_at && t - (r.decided_at ?? 0) <= DECLINE_VISIBLE_MS;
