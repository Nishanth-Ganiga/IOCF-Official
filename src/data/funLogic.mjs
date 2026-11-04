// The games of the "Unlimited Fun" profile: everything that is decided by rules rather than by the screen. Plain code with no imports,
// tested by the self-test. Everything is made from the live IOCF data, so the games are always about the current federation.

/** A small deterministic random number generator (so every visitor gets the same daily quiz on the same day). */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function seedFrom(text) {
  let h = 2166136261;
  for (const ch of String(text)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
}
/** Today's date in India (YYYY-MM-DD): the daily quiz changes at midnight IST. */
export const dayKey = (t = Date.now()) => new Date(t + 330 * 60000).toISOString().slice(0, 10);
export const norm = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

export function shuffle(arr, rng) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
const pickN = (arr, n, rng, except = []) => shuffle(arr.filter((x) => !except.includes(x)), rng).slice(0, n);

/** Four options with the right one at a random place: { options, answer }. null if there are not enough distinct wrong answers. */
function choices(right, wrong, rng) {
  const w = [...new Set(wrong.filter((x) => x && x !== right))];
  if (w.length < 3) return null;
  const options = shuffle([right, ...pickN(w, 3, rng)], rng);
  return { options, answer: options.indexOf(right) };
}

/**
 * The daily quiz: 5 questions about the IOCF, the same for everyone on the same day.
 * data = { boards: [{ name, overallRank?, credits?, chairman? }], runs: [names, best first], wickets: [names, best first],
 *          titles: [board names, most titles first], series: [{ name, host, opponents: [names], winner: name|null }] }
 */
export function makeQuiz(day, data) {
  const rng = mulberry32(seedFrom(`iocf-quiz-${day}`));
  const names = data.boards.map((b) => b.name);
  const makers = {
    rankOne: () => {
      const first = [...data.boards].filter((b) => b.overallRank).sort((a, b) => a.overallRank - b.overallRank)[0];
      const c = first && choices(first.name, names, rng);
      return c && { kind: 'rankOne', q: 'Which board is ranked number one in the IOCF Overall rankings?', ...c, why: `${first.name} leads the Overall rankings.` };
    },
    credits: () => {
      const first = [...data.boards].filter((b) => b.credits).sort((a, b) => b.credits - a.credits)[0];
      const c = first && choices(first.name, names, rng);
      return c && { kind: 'credits', q: 'Which board holds the most credits?', ...c, why: `${first.name} holds ${first.credits.toLocaleString('en-IN')} credits.` };
    },
    mostRuns: () => {
      const top = data.runs.slice(0, 12);
      const c = top.length >= 4 && choices(top[0], top.slice(1), rng);
      return c && { kind: 'mostRuns', q: 'Who has scored the most runs in IOCF board cricket?', ...c, why: `${top[0]} is the leading run-scorer.` };
    },
    mostWickets: () => {
      const top = data.wickets.slice(0, 12);
      const c = top.length >= 4 && choices(top[0], top.slice(1), rng);
      return c && { kind: 'mostWickets', q: 'Who has taken the most wickets in IOCF board cricket?', ...c, why: `${top[0]} is the leading wicket-taker.` };
    },
    chairman: () => {
      const withChair = data.boards.filter((b) => b.chairman);
      if (withChair.length < 4) return null;
      const b = withChair[Math.floor(rng() * withChair.length)];
      const c = choices(b.chairman, withChair.map((x) => x.chairman), rng);
      return c && { kind: 'chairman', q: `Who is the chairman of the ${b.name} board?`, ...c, why: `${b.chairman} chairs the ${b.name} board.` };
    },
    titles: () => {
      const t = data.titles ?? [];
      const c = t.length >= 1 && choices(t[0], names, rng);
      return c && { kind: 'titles', q: 'Which board has won the most Major Tournament titles?', ...c, why: `${t[0]} has the most titles.` };
    },
    seriesWinner: () => {
      const two = data.series.filter((s) => s.winner && s.opponents.length === 1 && [s.host, ...s.opponents].includes(s.winner));
      if (!two.length) return null;
      const s = two[Math.floor(rng() * two.length)];
      const other = s.winner === s.host ? s.opponents[0] : s.host;
      const c = choices(s.winner, [other, ...names], rng);
      return c && { kind: 'seriesWinner', q: `Who won the series “${s.name}” between ${s.host} and ${s.opponents[0]}?`, ...c, why: `${s.winner} won “${s.name}”.` };
    },
  };
  // five different kinds of question, chosen by the day's seed; if one cannot be made, the next kind fills its place
  const order = shuffle(Object.keys(makers), rng);
  const out = [];
  for (const k of order) {
    if (out.length === 5) break;
    const q = makers[k]();
    if (q) out.push(q);
  }
  return out;
}

/** Clues for "Guess the player", from vague to specific. `p` = { name, boardName, matches, runs, wickets, hs, best, pom, fifties, hundreds, formats: [labels] }. */
export function cluesFor(p) {
  const clues = [];
  clues.push(`He has played ${p.matches} match${p.matches === 1 ? '' : 'es'} in IOCF board cricket.`);
  clues.push(p.runs || p.wickets ? `He has scored ${p.runs} runs and taken ${p.wickets} wicket${p.wickets === 1 ? '' : 's'}.` : 'He has not scored a run or taken a wicket yet.');
  if (p.hs) clues.push(`His highest score is ${p.hs}${p.best ? ` and his best bowling is ${p.best}` : ''}.`);
  else if (p.best) clues.push(`His best bowling is ${p.best}.`);
  const awards = [p.pom ? `${p.pom} Player of the Match award${p.pom === 1 ? '' : 's'}` : '', p.hundreds ? `${p.hundreds} hundred${p.hundreds === 1 ? '' : 's'}` : '', p.fifties ? `${p.fifties} fifties` : ''].filter(Boolean);
  if (awards.length) clues.push(`He has ${awards.join(', ')}.`);
  if (p.formats?.length) clues.push(`He has played ${p.formats.join(', ')}.`);
  clues.push(`He plays for the ${p.boardName} board.`);
  const parts = p.name.split(/\s+/);
  clues.push(`His name has ${parts.length} word${parts.length === 1 ? '' : 's'}, and starts with “${p.name[0].toUpperCase()}”.`);
  return clues;
}
/** Points for guessing with `shown` clues showing (1 to clues.length): the fewer the clues, the more the points. */
export const guessPoints = (shown, total) => Math.max(1, total - shown + 1);

/** Is the guess right? Case, spaces and punctuation do not matter. */
export const isGuess = (guess, name) => norm(guess).length > 0 && norm(guess) === norm(name);

/** Higher or Lower: two different players for a stat. Returns { a, b } with different values, or null. */
export function pairFor(players, stat, rng) {
  const pool = players.filter((p) => p[stat] > 0);
  if (pool.length < 2) return null;
  for (let tries = 0; tries < 40; tries++) {
    const a = pool[Math.floor(rng() * pool.length)];
    const b = pool[Math.floor(rng() * pool.length)];
    if (a !== b && a[stat] !== b[stat]) return { a, b };
  }
  return null;
}
/** Did the visitor guess right? `higher` = he thinks b has more than a. */
export const higherLowerRight = (a, b, higher) => (higher ? b > a : b < a);

/** One over of the Super Over: 3 overs, 2 wickets. state = { runs, wickets, over } → the state after this over. */
export function superOverStep(state, over) {
  const wickets = state.wickets + (over.outOn ? 1 : 0);
  const next = { runs: state.runs + over.runs, wickets, over: state.over + 1 };
  return { ...next, done: next.over >= 3 || wickets >= 2 };
}
