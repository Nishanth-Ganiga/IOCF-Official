// Series announcements: the rules, in one place. Used by the API (handler.mjs) and by the self-test.
//   • a board announces a series (bilateral / trilateral / quadrilateral) and the opponents must each accept it
//   • the deadline is 11:59 PM IST on the day of the announcement; an unaccepted series after that is treated as declined and is never shown
//   • the host can edit a series until the first opponent accepts; after that it is locked
//   • a board can be in at most 2 series at a time
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

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
/** Accepted, or still waiting and within its deadline. Anything else is declined and invisible. */
export const isLive = (s, t) => s.status === 'accepted' || (s.status === 'pending' && t <= s.deadline_at);
const involves = (s, slug) => s.host === slug || s.opponents.includes(slug);

/** How many series this board is in: accepted ones, ones it hosts that are still open, and ones it has accepted. */
export function activeCount(all, slug, t, exceptId) {
  return all.filter((s) => s.id !== exceptId && isLive(s, t) && involves(s, slug) && (s.status === 'accepted' || s.host === slug || s.accepted.includes(slug))).length;
}

const clean = (v) => String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();

/** Checks the form a chairman sent. Returns { value } (the series fields) or { error }. */
export function validateSeries(input, host, boards) {
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
  if (!SERIES_CFG.matches.includes(matches)) return { error: `Choose how many matches: ${SERIES_CFG.matches.join(', ')}.` };
  const available = STADIUMS[host] ?? [];
  if (!available.length) return { error: 'No stadium is registered for your board yet, so a series cannot be announced. Contact the IOCF administrator.' };
  const stadiums = Array.isArray(i.stadiums) ? i.stadiums.map(String) : [];
  if (stadiums.length !== matches || stadiums.some((s) => !available.includes(s))) return { error: matches === 1 ? 'Choose the stadium for the match.' : `Choose a stadium for each of the ${matches} matches.` };
  const bet = Number(i.bet);
  if (!SERIES_CFG.bets.includes(bet)) return { error: 'Choose the bet amount from the list.' };
  if (!SERIES_CFG.formats.includes(i.format)) return { error: 'Choose the format.' };
  let clubFormat = null;
  if (i.format === 'Club') {
    clubFormat = SERIES_CFG.clubFormats.find((c) => c.id === i.clubFormat)?.id;
    if (!clubFormat) return { error: 'Choose the club format (overs and wickets).' };
  }
  return { value: { name, series_type: type.id, opponents, matches, stadiums, bet, format: i.format, club_format: clubFormat } };
}

export function newSeries(fields, host, t) {
  return { id: randomUUID(), host, accepted: [], status: 'pending', deadline_at: deadlineFor(t), created_at: t, updated_at: t, accepted_at: null, ...fields };
}

/** The series as the browser sees it. */
export function toApi(s, boards, t) {
  const nameOf = (slug) => boards.find((b) => b.slug === slug)?.name ?? slug;
  return {
    id: s.id,
    name: s.name,
    type: s.series_type,
    host: { slug: s.host, name: nameOf(s.host) },
    opponents: s.opponents.map((slug) => ({ slug, name: nameOf(slug), accepted: s.accepted.includes(slug) })),
    matches: s.matches,
    stadiums: s.stadiums,
    bet: s.bet,
    format: s.format,
    clubFormat: s.club_format ? (SERIES_CFG.clubFormats.find((c) => c.id === s.club_format)?.label ?? s.club_format) : null,
    status: s.status,
    deadlineAt: s.deadline_at,
    createdAt: s.created_at,
    acceptedAt: s.accepted_at,
    editable: s.status === 'pending' && s.accepted.length === 0 && t <= s.deadline_at,
  };
}
