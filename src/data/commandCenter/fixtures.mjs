// The match schedule of a series, from its type, its teams and its number of matches. Plain code with no Node-only imports, so the
// server (series.mjs) and the browser (SeriesAnnouncement.tsx) build exactly the same list.
//
//   bilateral      Match 1…N: host vs opponent, played at one of the host's stadiums
//   trilateral     4 matches = 3 league matches (each pair once) + the final;  7 = 6 league matches (each pair twice) + the final
//   quadrilateral  7 matches = 6 league matches (each pair once) + the final;  13 = 12 league matches (each pair twice) + the final
// The final is never scheduled: its teams are only known after the league matches.

// pairs of team positions, in the order the league matches are played
const PAIRS = {
  trilateral: [[0, 1], [0, 2], [1, 2]],
  quadrilateral: [[0, 1], [2, 3], [0, 2], [1, 3], [0, 3], [1, 2]],
};

/** teams: the host first, then the opponents in the order chosen. Returns [{ no, teams, final }]; `teams` is null for the final. */
export function buildFixtures(type, teams, matches) {
  const out = [];
  if (type === 'bilateral') {
    for (let no = 1; no <= matches; no++) out.push({ no, teams: [teams[0], teams[1]], final: false });
    return out;
  }
  const pairs = PAIRS[type];
  for (let no = 1; no < matches; no++) {
    const [x, y] = pairs[(no - 1) % pairs.length];
    out.push({ no, teams: [teams[x], teams[y]], final: false });
  }
  out.push({ no: matches, teams: null, final: true });
  return out;
}

/**
 * How many matches of a series may be played on one day. Every series plays one a day; a quadrilateral series may also play two a day,
 * which is always two matches between four different teams (the league matches come in such pairs: 1 & 2, 3 & 4, 5 & 6 …).
 */
export const PER_DAY_CHOICES = { quadrilateral: [1, 2] };
export const perDayChoices = (type) => PER_DAY_CHOICES[type] ?? [1];

/** The scheduled (league) matches grouped into match days: [[fixture, …], …]. */
export function matchDays(scheduled, perDay = 1) {
  const days = [];
  for (let i = 0; i < scheduled.length; i += perDay) days.push(scheduled.slice(i, i + perDay));
  return days;
}

/**
 * Checks the dates of the scheduled matches (one date per match, in match order). Returns the problem as a sentence, or null when fine.
 *   one match a day  : every match has its own date, each later than the one before
 *   two matches a day: the two matches of a day have the same date, each day is later than the one before, and no team plays twice on a day
 */
export function dateProblem(scheduled, dates, perDay = 1) {
  if (perDay === 1) {
    if (dates.some((d, k) => k > 0 && d === dates[k - 1])) return 'Two matches of the same series cannot be on the same date. Give each match its own date.';
    if (dates.some((d, k) => k > 0 && d < dates[k - 1])) return 'Match dates must be in order: a match cannot be earlier than the one before it.';
    return null;
  }
  const days = matchDays(scheduled, perDay);
  let i = 0;
  let previous = null;
  for (const day of days) {
    const ds = day.map((_, k) => dates[i + k]);
    if (ds.some((d) => d !== ds[0])) return `Matches ${day.map((f) => f.no).join(' and ')} are played on the same day: give them the same date.`;
    if (previous !== null && !(ds[0] > previous)) return 'Each match day must be later than the one before it: the days must be in order and cannot share a date.';
    const seen = new Set();
    for (const f of day) for (const t of f.teams ?? []) {
      if (seen.has(t)) return 'A team cannot play two matches on the same day. Choose a different schedule.';
      seen.add(t);
    }
    previous = ds[0];
    i += day.length;
  }
  return null;
}

/** The stadiums a match may be played at: the host's for a bilateral series, either team's otherwise. */
export const stadiumBoards = (type, fixture, host) => (type === 'bilateral' ? [host] : fixture.teams);
