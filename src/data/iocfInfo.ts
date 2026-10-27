/**
 * Descriptive (text) content for the IOCF Main page. The introductions and rules are written here;
 * tournaments, Hall of Fame cards and councils are read from the live dataset (see store.ts) and the
 * values below are only the fallback used when the dataset has none. No statistics live in this file.
 */
import { store } from './store';

export const aboutIntro = [
  'The International Online Cricket Federation (IOCF) is the global governing body of online cricket. It brings national boards, players, umpires and competitions together under one federation, with shared rules, official rankings and international tournaments.',
  'Every board is led by a Chairman and a CEO, manages its own squad of players, stadiums and officials, and takes part in IOCF series, world tournaments and franchise leagues.',
];

export const howItWorks = [
  {
    title: 'Boards & leadership',
    text: 'Each member board is run by a Chairman, usually supported by a CEO, and may have title, kit and media sponsors. Boards keep their own squad, stadiums and franchise teams.',
  },
  {
    title: 'Players',
    text: 'Players represent their board in international series and tournaments, and earn individual awards such as Best Batsman, Best Bowler and Man of the Match.',
  },
  {
    title: 'Umpires & commentators',
    text: 'Officials are drawn from the member boards. Umpires are credited for the series and tournaments they officiate, and commentators are recognised for league coverage.',
  },
  {
    title: 'Credits & stadiums',
    text: 'Every board maintains a credits ledger covering stadiums, international series, player trades, tournament entries, awards and umpire credits. Stadiums are graded in three levels.',
  },
];

export const formats = ['T10', 'T20', 'Club', 'ODI', '100-ball', 'Test', 'Limited 4 innings'];

export const councils = [
  { name: 'Council of Champions', members: ['Scotland', 'England', 'Qatar', 'Australia'] },
  { name: 'Council of Established', members: [] as string[] },
  { name: 'Council of Challengers', members: [] as string[] },
  { name: 'Council of Origins', members: [] as string[] },
];

export const councilNote =
  'IOCF 2.0 groups boards into four councils. Membership of the Council of Champions has been recorded; the other councils will be listed here once their members are confirmed.';

export type Tournament = { name: string; kind: string; champions?: string; runnersUp?: string; fairPlay?: string; note?: string };

export const tournaments: Tournament[] = [
  { name: 'T20 World Cup 2026', kind: 'World tournament', champions: 'Scotland', runnersUp: 'England', note: 'Played in groups followed by a Super 6 stage.' },
  { name: 'ODI World Cup 2026', kind: 'World tournament', champions: 'Scotland', runnersUp: 'South Africa' },
  { name: 'Asia Cup 2026', kind: 'Continental cup', champions: 'Qatar', runnersUp: 'Bangladesh', fairPlay: 'UAE' },
  { name: 'Euro Cup 2026', kind: 'Continental cup', champions: 'England', runnersUp: 'Italy', fairPlay: 'Scotland' },
  { name: 'Oceania Cup 2026', kind: 'Continental cup', champions: 'Australia', runnersUp: 'New Zealand', fairPlay: 'New Zealand' },
  { name: 'Associate Nations Cup 2026', kind: 'Associate nations', champions: 'Ireland', runnersUp: 'Canada' },
  { name: 'Emerging Talents League 2026', kind: 'Talent league', champions: 'Scotland', runnersUp: 'England', fairPlay: 'England & Scotland', note: 'Includes a Best Talent Discovery Board award, shared by all four participating boards.' },
  { name: "Women's Global League 2026", kind: "Women's league", champions: 'Bangladesh', runnersUp: 'Italy' },
  { name: 'IOCF Lone Warrior 2026 (Season One)', kind: 'Individual tournament', champions: 'Diljith Das (England)', runnersUp: 'Shamroz (Pakistan)', note: 'Played between individual players from twelve boards; the semi-finalists were Abhi (Scotland) and Anshad (India).' },
];

export const tournamentAwards = [
  'Man of the Tournament', 'Best Batsman', 'Best Bowler', 'Best Captain', 'Highest Individual Score', 'Fastest Century', 'Fastest Fifty', 'Most Sixes', 'Most Fours',
  'Best Bowling Figure', 'Best Economy', 'Best Batting Average', 'Most Maidens', 'Most Dot Balls', 'Fastest Umpire', 'World Cup Operations Excellence',
];

export const otherCompetitions = [
  'IOCF World Test Championship',
  'International series between boards (home and away)',
  'Franchise leagues: Pakistan Super League, Big Bash League, Kiwi Crown League, Bangladesh Premier League, Indian Premier League, Caribbean Premier League, Scottish Premier League and Qatar Elite Crown League',
  '100-ball tournament (100 2026) and the Champions League',
];

export const rankingIntro =
  'IOCF publishes official board rankings for every format: T10, T20, Club, ODI, 100-ball, Test and Limited 4 Innings, plus an overall ranking. A board’s score combines how it performs in matches with how it performs in tournaments.';

export const rankingRules = [
  { title: 'Weighting', text: 'Match performance counts for 60% and tournament performance for 40%.' },
  { title: 'League score', text: 'Win percentage × 6. For example, a board that wins 4 of 5 matches (80%) scores 480 points.' },
  { title: 'Major tournaments', text: 'Champion = 100 points, Runner-up = 50 points.' },
  { title: 'Minor tournaments', text: 'Champion = 50 points, Runner-up = 25 points.' },
  { title: 'Tournament score', text: '(Major champions × 100) + (Major runners-up × 50) + (Minor champions × 50) + (Minor runners-up × 25).' },
  { title: 'Final score', text: 'League score + tournament score = final ranking score.' },
];

export const playersIntro = [
  'Each board registers its own squad. Players are recognised for performances in series, tournaments and franchise leagues, and may also hold leadership roles on their board.',
  'Individual awards include Best Batsman, Best Bowler, Man of the Match, Most Sixes, Most Dot Balls, Economical Bowler, Emerging Player and Team of the Tournament selections.',
];

export const hallOfFame = [
  { card: 'Ice in Their Veins', period: 'January – March 2026', batsman: 'Midhun Manilal (West Indies)', bowler: 'Yasin Iqbal (Bangladesh)' },
  { card: 'Ring of Fire', period: 'April – June 2026', batsman: 'Molly Steephan (England)', bowler: 'Jyothish S (England)' },
  { card: 'Sword & Sorcery', period: 'July – September 2026', batsman: 'Sunaif (England)', bowler: 'Arnab Sarkar (Australia)' },
];

/** Live values (from the Google Sheet) when present, otherwise the fallbacks above. */
export const getTournaments = () => (store.info.tournaments.length ? store.info.tournaments : tournaments);
export const getTournamentAwards = () => (store.info.tournamentAwards.length ? store.info.tournamentAwards : tournamentAwards);
export const getHallOfFame = () => (store.info.hallOfFame.length ? store.info.hallOfFame : hallOfFame);
export const getCouncils = () => (store.info.councils.length ? store.info.councils : councils);
