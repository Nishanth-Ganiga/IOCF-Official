// Builds the descriptive "info" block (tournaments, Hall of Fame, councils) for the IOCF Main page.
import { norm, titleCase } from './helpers.mjs';

// Tournament descriptions that are not recorded in the sheet. Unknown tournaments fall back to a generic kind.
const KIND = {
  t20worldcup2026: { kind: 'World tournament', note: 'Played in groups followed by a Super 6 stage.' },
  odiworldcup2026: { kind: 'World tournament' },
  asiacup2026: { kind: 'Continental cup' },
  eurocup2026: { kind: 'Continental cup' },
  oceaniacup2026: { kind: 'Continental cup' },
  associatenationscup2026: { kind: 'Associate nations' },
  emergingtalentsleague2026: { kind: 'Talent league', note: 'Includes a Best Talent Discovery Board award, shared by all four participating boards.' },
  womensgloballeague2026: { kind: "Women's league" },
  lonewarrior2026: { kind: 'Individual tournament', note: 'Played between individual players from twelve boards.' },
};

const pretty = (t) => (t === t.toUpperCase() || /CUP/.test(t) ? titleCase(t).replace(/Women'S/, "Women's") : t);
const who = (r) => (r.winner && r.board ? `${r.winner} (${r.board})` : (r.winner ?? r.board ?? undefined));

export function buildInfo(fed) {
  const groups = new Map();
  for (const t of fed.tawards) {
    if (!groups.has(t.tournament)) groups.set(t.tournament, []);
    groups.get(t.tournament).push(t);
  }
  const tournaments = [];
  let tournamentAwards = [];
  for (const [name, rows] of groups) {
    const find = (re) => rows.find((r) => re.test(r.award ?? ''));
    const champ = find(/^champion/i);
    const run = find(/^runner/i);
    const fair = rows.find((r) => /^fair\s*play/i.test(r.award ?? '') && who(r) && norm(who(r)) !== 'fairplay');
    const semi = find(/^semi/i);
    if (!champ && !run) continue;
    const meta = KIND[norm(name)] ?? { kind: 'International tournament' };
    const T = { name: pretty(name), kind: meta.kind, champions: champ ? who(champ) : undefined, runnersUp: run ? who(run) : undefined };
    if (fair) T.fairPlay = who(fair);
    const notes = [meta.note, semi ? `The semi-finalists were ${semi.winner} (${semi.board}).` : null].filter(Boolean);
    if (notes.length) T.note = notes.join(' ');
    tournaments.push(T);
    if (!tournamentAwards.length && /world cup/i.test(name)) {
      tournamentAwards = rows.map((r) => r.award).filter((a) => a && !/^(champion|runner|semi|fair)/i.test(a));
    }
  }
  const cards = new Map();
  for (const h of fed.hof) {
    if (!cards.has(h.card)) cards.set(h.card, { card: titleCase(h.card), period: (h.period ?? '').replace(/^best players in iocf from\s*/i, '').replace(/\s*-\s*/, ' – ') });
    const c = cards.get(h.card);
    const label = `${h.player} (${h.board})`;
    if (/batsman/i.test(h.award ?? '')) c.batsman = label;
    else if (/bowler/i.test(h.award ?? '')) c.bowler = label;
  }
  const councils = fed.councilNames.map((name) => ({ name, members: Object.entries(fed.council).filter(([, c]) => c === name).map(([b]) => b) }));
  return { tournaments, tournamentAwards, hallOfFame: [...cards.values()], councils };
}
