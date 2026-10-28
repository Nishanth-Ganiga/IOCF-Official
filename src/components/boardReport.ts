import type { Board } from '../data/boards';
import { bestFormat, creditsOf, overallRank, rankIn, regionOf, titlesOf, winRate } from '../data/boardInsights';

/** Draws a shareable 1200×630 "season report" card for a board and downloads it as a PNG. */
export function downloadBoardReport(board: Board, extra: { players: number; awardWinners: number; council?: string }) {
  const W = 1200;
  const H = 630;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  if (!g) return;

  const bg = g.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, '#0b0b10');
  bg.addColorStop(1, '#2a0d18');
  g.fillStyle = bg;
  g.fillRect(0, 0, W, H);
  g.strokeStyle = '#c9a24b';
  g.lineWidth = 3;
  g.strokeRect(24, 24, W - 48, H - 48);

  const gold = '#c9a24b';
  const bone = '#f2efe9';
  const mist = '#a8a7b0';
  g.textBaseline = 'alphabetic';
  g.fillStyle = gold;
  g.font = '600 22px system-ui, sans-serif';
  g.fillText('IOCF · SEASON REPORT 2026', 64, 82);

  g.fillStyle = bone;
  g.font = '700 96px Impact, "Arial Narrow", sans-serif';
  g.fillText(`${board.flag ? `${board.flag} ` : ''}${board.name.toUpperCase()}`, 64, 190);

  g.fillStyle = mist;
  g.font = '400 26px system-ui, sans-serif';
  const sub = [regionOf(board), extra.council, board.chairman ? `Chairman: ${board.chairman}` : undefined].filter(Boolean).join('  ·  ');
  g.fillText(sub, 64, 235);

  const best = bestFormat(board);
  const overall = rankIn(board);
  const w = winRate(overall);
  const credits = creditsOf(board);
  const stats: [string, string][] = [
    ['OVERALL RANK', overallRank(board) !== undefined ? `#${overallRank(board)}` : '—'],
    ['POINTS', overall ? String(overall.points) : '—'],
    ['WIN RATE', w !== undefined ? `${Math.round(w * 100)}%` : '—'],
    ['BEST FORMAT', best ? `${best.format} #${best.rank}` : '—'],
    ['TITLES', String(titlesOf(board))],
    ['CREDITS', credits !== undefined ? credits.toLocaleString('en-US') : '—'],
    ['PLAYERS', String(extra.players)],
    ['AWARD WINNERS', String(extra.awardWinners)],
  ];
  stats.forEach(([label, value], i) => {
    const x = 64 + (i % 4) * 280;
    const y = 340 + Math.floor(i / 4) * 140;
    g.fillStyle = mist;
    g.font = '600 18px system-ui, sans-serif';
    g.fillText(label, x, y);
    g.fillStyle = bone;
    g.font = '700 52px Impact, "Arial Narrow", sans-serif';
    g.fillText(value, x, y + 56);
  });

  g.fillStyle = mist;
  g.font = '400 18px system-ui, sans-serif';
  g.fillText('International Online Cricket Federation', 64, H - 52);

  c.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `iocf-${board.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-report.png`;
    a.click();
    URL.revokeObjectURL(url);
  }, 'image/png');
}
