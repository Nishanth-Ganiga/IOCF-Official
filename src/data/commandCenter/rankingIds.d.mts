export const rankingId: {
  boards: (format: string) => string;
  credits: () => string;
  series: (format?: string) => string;
  players: (scope: string, kind: string, cat: string, format?: string) => string;
  umpires: () => string;
  league: (id: string) => string;
  majors: () => string;
};
