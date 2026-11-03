// The ids of the rankings of the Rankings profile. Shared by the server (which keeps the rank movement of each ranking) and the browser
// (which asks for the movement of the ranking it is showing).
export const rankingId = {
  boards: (format) => `boards.${format}`,
  credits: () => 'credits',
  series: (format = 'all') => `series.${format}`,
  players: (scope, kind, cat, format = 'all') => `players.${scope}.${kind}.${cat}.${format}`,
  umpires: () => 'umpires',
  league: (id) => `league.${id}`,
  majors: () => 'majors',
};
