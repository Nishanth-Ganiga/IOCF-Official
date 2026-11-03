// Turns the IOCF workbook (an ExcelJS workbook) into the JSON dataset the site reads.
import fs from 'node:fs';
import ExcelJS from 'exceljs';
import { Book } from './helpers.mjs';
import { buildInfo } from './info.mjs';
import { buildLeagues } from './leagues.mjs';
import { buildLedger } from './ledger.mjs';
import { buildSeriesRecords } from './series.mjs';
import { buildMajorTournaments } from './tournaments.mjs';

export async function readWorkbook(source) {
  const wb = new ExcelJS.Workbook();
  if (typeof source === 'string') await wb.xlsx.readFile(source);
  else await wb.xlsx.load(source);
  return new Book(wb);
}

export function buildDataset(book, meta = {}) {
  const ledger = buildLedger(book);
  const { leagues, unmatched } = buildLeagues(book);
  const missingTournaments = [];
  const dataset = {
    generatedAt: new Date().toISOString(),
    source: meta.source ?? null,
    boards: ledger.boards,
    players: ledger.players,
    umpires: ledger.umpires,
    umpireOrder: ledger.umpireOrder,
    leagues,
    majorTournaments: buildMajorTournaments(book, ledger.boards.map((b) => b.name), missingTournaments),
    // the series played before the Command Center (the "Series Matches" tab); absent if the tab is missing
    seriesRecords: buildSeriesRecords(book) ?? undefined,
    info: buildInfo(ledger.fed),
  };
  validate(dataset);
  // a spelling link (playerAliases.json) names the player as he is on his board's roster; if the sheet has changed that name the link no
  // longer fits, and — worse — would hide his statistics, so say so
  let staleAliases = 'none';
  try {
    const links = JSON.parse(fs.readFileSync(new URL('../../src/data/commandCenter/playerAliases.json', import.meta.url), 'utf8'));
    const stale = links.filter((a) => !dataset.players.some((p) => p.boardId === a.board && p.name === a.name)).map((a) => `${a.name} (${a.board})`);
    if (stale.length) staleAliases = `FIX playerAliases.json: ${stale.join(', ')}`;
  } catch {
    /* no link file: nothing to check */
  }
  return { dataset, report: { staleAliases, boards: dataset.boards.length, players: dataset.players.length, umpires: dataset.umpires.length, leagues: leagues.length, majorTournaments: dataset.majorTournaments.length, seriesRecords: dataset.seriesRecords ? `${dataset.seriesRecords.completed.length} completed, ${dataset.seriesRecords.upcoming.length} upcoming` : 'no Series Matches tab', tournamentsWithoutATab: missingTournaments.join(', ') || 'none', leaguePlayers: leagues.reduce((n, l) => n + l.teams.reduce((m, t) => m + t.players.length, 0), 0), matches: leagues.reduce((n, l) => n + l.matches.length, 0), unmatchedNames: ledger.unmatched + unmatched } };
}

/** Refuse to publish a dataset that is obviously broken (e.g. someone renamed a sheet or deleted a tab). */
export function validate(d) {
  const problems = [];
  if (d.boards.length !== 26) problems.push(`expected 26 boards, found ${d.boards.length}`);
  if (d.boards.some((b) => !b.chairman)) problems.push(`boards without a chairman: ${d.boards.filter((b) => !b.chairman).map((b) => b.name).join(', ')}`);
  if (d.players.length < 100) problems.push(`only ${d.players.length} players found`);
  if (d.leagues.length < 5) problems.push(`only ${d.leagues.length} leagues found`);
  if (problems.length) throw new Error(`The sheet does not look right: ${problems.join('; ')}`);
}
