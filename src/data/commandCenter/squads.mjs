// Squad Announcement: how many players a board names for a series, by format. Plain code with no imports, used by the server (which decides),
// by the browser (to show the limits and enable the buttons) and by the self-test.
//
//   Club 4 overs 4 wickets, 5 overs 5 wickets          7 to 8 players
//   Club 6 overs 6 wickets, 7 / 8 overs                9 to 10 players
//   T10                                                11 to 12 players
//   T20 and 100                                        13 to 15 players
//   ODI                                                15 to 18 players
//   Test and L4I                                       15 to 20 players
// (9 overs 9 wickets is retired for new series; one already announced with it uses the 9 to 10 of the other larger club formats, as IOCF
//  has not set a size for it.)

const CLUB = { '4-4': [7, 8], '5-5': [7, 8], '6-6': [9, 10], '7-7': [9, 10], '8-8': [9, 10], '9-9': [9, 10] };
const BY_FORMAT = { T10: [11, 12], T20: [13, 15], 100: [13, 15], '100-BALL': [13, 15], ODI: [15, 18], TEST: [15, 20], L4I: [15, 20] };

/** { min, max } for a series format (and, for Club, its club format id such as "6-6"), or null while the format is not (fully) chosen. */
export function squadLimits(format, clubFormat) {
  const f = String(format ?? '').trim().toUpperCase();
  if (f === 'CLUB') {
    const c = CLUB[String(clubFormat ?? '').trim()];
    return c ? { min: c[0], max: c[1] } : null;
  }
  const r = BY_FORMAT[f];
  return r ? { min: r[0], max: r[1] } : null;
}

/** "11 to 12 players" */
export const limitsText = (l) => (l ? `${l.min} to ${l.max} players` : '');

/**
 * Checks a squad: `keys` are the chosen players' keys, `roster` the board's registered players ([{ key, name }]).
 * Returns a sentence about the first problem, or null when the squad is complete.
 */
export function squadProblem(keys, roster, limits) {
  if (!limits) return 'Choose the format first: the squad size depends on it.';
  const list = Array.isArray(keys) ? keys : [];
  if (new Set(list).size !== list.length) return 'A player can be in the squad only once.';
  const known = new Set(roster.map((p) => p.key));
  if (list.some((k) => !known.has(k))) return 'Every squad player must be one of your board\'s registered players.';
  if (roster.length < limits.min) return `Your board has only ${roster.length} registered players, fewer than the ${limits.min} this format needs.`;
  if (list.length < limits.min) return `Add ${limits.min - list.length} more player${limits.min - list.length === 1 ? '' : 's'}: the squad needs ${limitsText(limits)}.`;
  if (list.length > limits.max) return `Remove ${list.length - limits.max} player${list.length - limits.max === 1 ? '' : 's'}: the squad can have at most ${limits.max}.`;
  return null;
}
