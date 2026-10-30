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

/** The stadiums a match may be played at: the host's for a bilateral series, either team's otherwise. */
export const stadiumBoards = (type, fixture, host) => (type === 'bilateral' ? [host] : fixture.teams);
