// The "How to play online cricket" mini-game on the IOCF Main profile — just for fun, nothing is saved or counted.
//
// An over is six digits, each from 0 to 6 (the runs of that ball). The batsman's digits and the bowler's digits are compared
// place by place: the first place where they are equal is the ball the batsman is out on. The runs are the digits the batsman
// played before that ball (all six if he is never out).
//   bowler 123652, batsman 634251 → the 5th digits match → out on ball 5 → 6 + 3 + 4 + 2 = 15 runs
// Plain code with no imports, so it is used by the page and tested by the self-test.

/** Six random digits from 0 to 6. `rng` returns a number in [0, 1). */
export function randomDigits(rng = Math.random) {
  return Array.from({ length: 6 }, () => Math.floor(rng() * 7));
}

/** The six digits typed by a visitor: exactly six characters, each 0–6 (spaces are ignored). Returns the digits or null. */
export function parseDigits(text) {
  const t = String(text ?? '').replace(/\s+/g, '');
  return /^[0-6]{6}$/.test(t) ? [...t].map(Number) : null;
}

/** { outOn: 1–6 or null (not out), runs, scored: the digits that counted } for one over. */
export function playOver(bat, bowl) {
  const hit = bat.findIndex((d, i) => d === bowl[i]);
  const scored = hit === -1 ? bat : bat.slice(0, hit);
  return { outOn: hit === -1 ? null : hit + 1, runs: scored.reduce((n, d) => n + d, 0), scored };
}

const ordinal = (n) => ['', '1st', '2nd', '3rd', '4th', '5th', '6th'][n];
export { ordinal };

/** "6 + 3 + 4 + 2 = 15" (or "0" when nothing was scored). */
export const sumText = (digits) => (digits.length ? `${digits.join(' + ')} = ${digits.reduce((n, d) => n + d, 0)}` : '0');
