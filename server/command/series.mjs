// Series announcements: the rules, in one place. Used by the API (handler.mjs) and by the self-test.
//   • a board announces a series (bilateral / trilateral / quadrilateral) and the opponents must each accept it
//   • the deadline is 11:59 PM IST on the day of the announcement; an unaccepted series after that is treated as declined and is never shown
//   • an invited board can also decline right away; the host then sees "Declined by <board>" for a few days and can announce again
//   • the host can edit a series until the first opponent accepts; after that it is locked
//   • a board can be in at most 2 series at a time
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { buildFixtures, stadiumBoards } from '../../src/data/commandCenter/fixtures.mjs';

const read = (rel) => JSON.parse(readFileSync(new URL(rel, import.meta.url), 'utf8'));
export const SERIES_CFG = read('../../src/data/commandCenter/series.json');
export const STADIUMS = read('../../src/data/commandCenter/stadiums.json');

const IST_MS = 330 * 60 * 1000;
/** 11:59 PM IST (to the last millisecond of that minute) on the IST calendar day of `t`. */
export function deadlineFor(t) {
  const d = new Date(t + IST_MS);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 23, 59, 59, 999) - IST_MS;
}

export const isExpired = (s, t) => s.status === 'pending' && t > s.deadline_at;
export const DECLINE_VISIBLE_MS = 3 * 86400000;
/** A series the opponent declined stays visible to its host for a few days, so the host sees who said no. */
export const declinedVisibleTo = (s, slug, t) => s.status === 'declined' && s.host === slug && t - (s.declined_at ?? 0) <= DECLINE_VISIBLE_MS;
/** Accepted, or still waiting and within its deadline. Anything else is declined and invisible. */
export const isLive = (s, t) => s.status === 'accepted' || (s.status === 'pending' && t <= s.deadline_at);
const involves = (s, slug) => s.host === slug || s.opponents.includes(slug);

/** The series this board is in: accepted ones, ones it hosts that are still open, and ones it has accepted; not the finished ones. */
const counts = (s, slug, t, exceptId) => s.id !== exceptId && isLive(s, t) && involves(s, slug) && !s.result_winner && (s.status === 'accepted' || s.host === slug || s.accepted.includes(slug));

/** First and last match date of a series ({ from, to }, as YYYY-MM-DD), or null for an old series without dates. */
export function rangeOf(dates) {
  const d = (dates ?? []).filter(Boolean).sort();
  return d.length ? { from: d[0], to: d[d.length - 1] } : null;
}

/** How many series this board is in that have not ended yet (shown to the chairman). A series ends after its last match date. */
export function activeCount(all, slug, t, exceptId) {
  const today = istDay(t);
  return all.filter((s) => counts(s, slug, t, exceptId) && !(rangeOf(s.dates) && rangeOf(s.dates).to < today)).length;
}

/**
 * How many of this board's series are on at the same time as `range` (a series of its dates). A board can be in 2 series at a time, so a new
 * series is refused only when 2 others overlap it: one can be accepted on the LAST DAY of a current series, if it starts the next day or later.
 * A series without dates (announced before dates existed) is counted as overlapping.
 */
export function busyOn(all, slug, t, range, exceptId) {
  return all.filter((s) => {
    if (!counts(s, slug, t, exceptId)) return false;
    const r = rangeOf(s.dates);
    return !r || !range || (r.from <= range.to && range.from <= r.to);
  }).length;
}

const clean = (v) => String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();

/** Checks the form a chairman sent. Returns { value } (the series fields) or { error }. */
const istDay = (t) => new Date(t + IST_MS).toISOString().slice(0, 10);
const validDay = (d) => /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(`${d}T00:00:00Z`)) && new Date(`${d}T00:00:00Z`).toISOString().slice(0, 10) === d;

export function validateSeries(input, host, boards, t = Date.now()) {
  const i = input && typeof input === 'object' ? input : {};
  const name = clean(i.name);
  if (name.length < 3 || name.length > 60) return { error: 'Enter the name of the series (3 to 60 characters).' };
  const type = SERIES_CFG.types.find((t) => t.id === i.type);
  if (!type) return { error: 'Choose the series type: bilateral, trilateral or quadrilateral.' };
  const opponents = Array.isArray(i.opponents) ? i.opponents.map(String) : [];
  if (opponents.length !== type.opponents) return { error: `A ${type.label.toLowerCase()} series needs ${type.opponents} opponent board${type.opponents > 1 ? 's' : ''}.` };
  if (new Set(opponents).size !== opponents.length) return { error: 'Each opponent board can only be chosen once.' };
  if (opponents.some((o) => o === host)) return { error: 'You cannot play a series against your own board.' };
  if (opponents.some((o) => !boards.some((b) => b.slug === o))) return { error: 'Choose opponent boards from the list.' };
  const matches = Number(i.matches);
  if (!type.matchOptions.includes(matches)) return { error: `Choose how many matches: ${type.matchOptions.join(' or ')}.` };
  // every scheduled match needs a stadium of one of the boards allowed to host it (the final is not scheduled)
  const fixtures = buildFixtures(type.id, [host, ...opponents], matches).filter((f) => !f.final);
  const stadiums = Array.isArray(i.stadiums) ? i.stadiums.map(String) : [];
  if (!(STADIUMS[host] ?? []).length && type.id === 'bilateral') return { error: 'No stadium is registered for your board yet, so a series cannot be announced. Contact the IOCF administrator.' };
  if (fixtures.some((f) => !stadiumBoards(type.id, f, host).some((b) => (STADIUMS[b] ?? []).length))) return { error: 'No stadium is registered for the boards in one of the matches. Contact the IOCF administrator.' };
  if (stadiums.length !== fixtures.length || fixtures.some((f, k) => !stadiumBoards(type.id, f, host).some((b) => (STADIUMS[b] ?? []).includes(stadiums[k])))) {
    return { error: fixtures.length === 1 ? 'Choose the stadium for the match.' : `Choose a stadium for each of the ${fixtures.length} scheduled matches.` };
  }
  // every scheduled match also has a date: after the day the series is announced (a series cannot start on that day), within a year, and
  // every match on a later date than the one before it (two matches of one series are never on the same date)
  const dates = Array.isArray(i.dates) ? i.dates.map(String) : [];
  const today = istDay(t);
  const last = istDay(t + 366 * 86400000);
  if (dates.length !== fixtures.length || dates.some((d) => !validDay(d))) return { error: fixtures.length === 1 ? 'Choose the date of the match.' : `Choose a date for each of the ${fixtures.length} scheduled matches.` };
  if (dates.some((d) => d < today)) return { error: 'A match date cannot be in the past.' };
  if (dates.some((d) => d === today)) return { error: 'A series cannot start on the day it is announced. Choose a later date for the first match.' };
  if (dates.some((d) => d > last)) return { error: 'A match date cannot be more than a year away.' };
  if (dates.some((d, k) => k > 0 && d === dates[k - 1])) return { error: 'Two matches of the same series cannot be on the same date. Give each match its own date.' };
  if (dates.some((d, k) => k > 0 && d < dates[k - 1])) return { error: 'Match dates must be in order: a match cannot be earlier than the one before it.' };
  const bet = Number(i.bet);
  if (!SERIES_CFG.bets.includes(bet)) return { error: 'Choose the bet amount from the list.' };
  if (!SERIES_CFG.formats.includes(i.format)) return { error: 'Choose the format.' };
  let clubFormat = null;
  if (i.format === 'Club') {
    clubFormat = SERIES_CFG.clubFormats.find((c) => c.id === i.clubFormat)?.id;
    if (!clubFormat) return { error: 'Choose the club format (overs and wickets).' };
  }
  return { value: { name, series_type: type.id, opponents, matches, stadiums, dates, bet, format: i.format, club_format: clubFormat } };
}

export function newSeries(fields, host, t) {
  return { id: randomUUID(), host, accepted: [], status: 'pending', deadline_at: deadlineFor(t), created_at: t, updated_at: t, accepted_at: null, ...fields };
}

/** The series as the browser sees it. */
export function toApi(s, boards, t) {
  const nameOf = (slug) => boards.find((b) => b.slug === slug)?.name ?? slug;
  const fixtures = buildFixtures(s.series_type, [s.host, ...s.opponents], s.matches).map((f) => ({ no: f.no, final: f.final, teams: f.teams ? f.teams.map(nameOf) : null, stadium: f.final ? null : s.stadiums[f.no - 1], date: f.final ? null : (s.dates?.[f.no - 1] ?? null) }));
  return {
    id: s.id,
    name: s.name,
    type: s.series_type,
    host: { slug: s.host, name: nameOf(s.host) },
    opponents: s.opponents.map((slug) => ({ slug, name: nameOf(slug), accepted: s.accepted.includes(slug) })),
    matches: s.matches,
    stadiums: s.stadiums,
    fixtures,
    bet: s.bet,
    format: s.format,
    clubFormat: s.club_format ? (SERIES_CFG.clubFormats.find((c) => c.id === s.club_format)?.label ?? s.club_format) : null,
    status: s.status,
    declinedBy: s.status === 'declined' && s.declined_by ? { slug: s.declined_by, name: nameOf(s.declined_by) } : null,
    declinedAt: s.declined_at ?? null,
    result: s.result_winner
      ? { winner: s.result_winner === 'draw' ? null : { slug: s.result_winner, name: nameOf(s.result_winner) }, note: s.result_note ?? null, at: s.result_at ?? null }
      : null,
    deadlineAt: s.deadline_at,
    createdAt: s.created_at,
    acceptedAt: s.accepted_at,
    editable: s.status === 'pending' && s.accepted.length === 0 && t <= s.deadline_at,
  };
}

/** For the administrator: every series, including the ones declined at their deadline; a series with a recorded result is 'completed'. */
export const adminView = (s, boards, t) => ({ ...toApi(s, boards, t), status: isExpired(s, t) ? 'declined' : s.status === 'accepted' && s.result_winner ? 'completed' : s.status, editable: false });

/** Every match of a confirmed series as a calendar entry (the final has no date yet). `teams` are board slugs. */
export function calendarEntries(s, boards) {
  const nameOf = (slug) => boards.find((b) => b.slug === slug)?.name ?? slug;
  const label = s.club_format ? `Club · ${SERIES_CFG.clubFormats.find((c) => c.id === s.club_format)?.label ?? s.club_format}` : s.format;
  return buildFixtures(s.series_type, [s.host, ...s.opponents], s.matches).map((f) => ({
    seriesId: s.id,
    series: s.name,
    type: s.series_type,
    no: f.no,
    of: s.matches,
    final: f.final,
    teams: f.teams,
    teamNames: f.teams ? f.teams.map(nameOf) : null,
    boards: [s.host, ...s.opponents],
    stadium: f.final ? null : (s.stadiums[f.no - 1] ?? null),
    date: f.final ? null : (s.dates?.[f.no - 1] ?? null),
    format: label,
    bet: s.bet,
    winner: s.result_winner ? (s.result_winner === 'draw' ? 'Series drawn' : nameOf(s.result_winner)) : null,
  }));
}
export const todayIst = (t) => istDay(t);

/** Checks the administrator's result for a series: the winner is one of its boards, or "draw". Returns { value } or { error }. */
export function validateResult(input, s) {
  const i = input && typeof input === 'object' ? input : {};
  const winner = String(i.winner ?? '');
  if (winner !== 'draw' && ![s.host, ...s.opponents].includes(winner)) return { error: 'Choose the winning board, or "Series drawn".' };
  const note = clean(i.note);
  if (note.length > 120) return { error: 'The result note can be at most 120 characters.' };
  return { value: { winner, note: note || null } };
}
