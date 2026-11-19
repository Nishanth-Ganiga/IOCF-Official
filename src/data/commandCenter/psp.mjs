// IOCF 2.0 – Official Player Salary Program (PSP 2027): the rules, in one place. Plain code with no imports, used by the server (which
// decides everything), by the browser (to show the same calculation straight away) and by the self-test.
//
//   • four councils, each with a fixed number of ranks and the official monthly funding of each rank (in lakh credits)
//   • six salary categories in priority order, each with a limit on the number of players
//   • the salary calculation: the board's monthly budget is split between the categories by the administrator's configured weights; the
//     players of a category share its part equally in multiples of 100; whatever is left (rounding, or the part of an empty category) goes
//     to the Special Contract player, so the whole budget is always distributed
//   • no fixed salary amounts are invented here: the weights are a setting the administrator must complete (they must total 100%)

export const COUNCILS = [
  { id: 'champions', name: 'Council of Champions', short: 'Champions', ranks: 7, color: '#8b1e3f' },
  { id: 'established', name: 'Council of Established', short: 'Established', ranks: 6, color: '#1f7a4d' },
  { id: 'challengers', name: 'Council of Challengers', short: 'Challengers', ranks: 6, color: '#6b3fa0' },
  { id: 'origins', name: 'Council of Origins', short: 'Origins', ranks: 6, color: '#c9a24b' },
];

/** The official monthly funding of each rank, in lakh IOCF credits (1 lakh = 1,00,000). Index 0 is rank 1. */
export const FUNDING_LAKH = {
  champions: [12, 10, 8.5, 7, 6, 5, 4],
  established: [8, 7, 6, 5, 4, 3],
  challengers: [5, 4.5, 4, 3.5, 3, 2.5],
  origins: [3, 2.5, 2, 1.8, 1.5, 1.2],
};

/** Whole credits for a council and rank (rank from 1), or null when there is no such rank. */
export function fundingFor(council, rank) {
  const lakh = FUNDING_LAKH[council]?.[rank - 1];
  return lakh === undefined ? null : Math.round(lakh * 100000);
}

/** The monthly funding of a council, and of all four, in whole credits. */
export const councilFunding = (council) => (FUNDING_LAKH[council] ?? []).reduce((n, l) => n + Math.round(l * 100000), 0);
export const MONTHLY_FUNDING = COUNCILS.reduce((n, c) => n + councilFunding(c.id), 0);
export const ANNUAL_FUNDING = MONTHLY_FUNDING * 12;

/** The salary categories, in the order salaries are allocated (the official priority). `max` null = all remaining players. */
export const CATEGORIES = [
  { id: 'special_contract', label: 'Special Contract', max: 1 },
  { id: 'elite', label: 'Elite', max: 2 },
  { id: 'international', label: 'International', max: 4 },
  { id: 'professional', label: 'Professional', max: 4 },
  { id: 'developing', label: 'Developing', max: 8 },
  { id: 'emerging', label: 'Emerging', max: null },
];
export const CATEGORY_IDS = CATEGORIES.map((c) => c.id);
export const categoryLabel = (id) => CATEGORIES.find((c) => c.id === id)?.label ?? id;

/** Month states, in the order an administrator moves a month through. */
export const MONTH_STATUSES = [
  { id: 'not_started', label: 'Not Started' },
  { id: 'active', label: 'Active' },
  { id: 'submission_open', label: 'Submission Open' },
  { id: 'under_review', label: 'Under Review' },
  { id: 'approved', label: 'Approved' },
  { id: 'completed', label: 'Completed' },
  { id: 'closed', label: 'Closed' },
];
export const monthStatusLabel = (id) => MONTH_STATUSES.find((s) => s.id === id)?.label ?? id;
/** A board can start a salary submission only while the month is in one of these states. */
export const SUBMISSION_STATUSES = ['active', 'submission_open'];
/** …and can correct and resubmit a rejected one also while the month is under review. */
export const CORRECTION_STATUSES = ['active', 'submission_open', 'under_review'];

/** A salary request's states. */
export const REQUEST_STATUSES = [
  { id: 'draft', label: 'Draft' },
  { id: 'submitted', label: 'Submitted' },
  { id: 'under_review', label: 'Under Review' },
  { id: 'approved', label: 'Approved' },
  { id: 'rejected', label: 'Rejected' },
  { id: 'credited', label: 'Credited' },
];
export const requestStatusLabel = (id) => REQUEST_STATUSES.find((s) => s.id === id)?.label ?? id;

export const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const monthKey = (year, month) => `${year}-${String(month).padStart(2, '0')}`;
export const parseMonthKey = (key) => {
  const m = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(String(key ?? ''));
  return m ? { year: Number(m[1]), month: Number(m[2]) } : null;
};
export const monthLabel = (key) => {
  const p = parseMonthKey(key);
  return p ? `${MONTH_NAMES[p.month - 1]} ${p.year}` : String(key);
};

/**
 * The monthly cycle: the 1st rankings and funds are announced, the 2nd–3rd the chairmen submit, the 4th–5th IOCF verifies. Dates are
 * YYYY-MM-DD; `deadlineAt` is the end of the 3rd (IST) unless the administrator moved it.
 */
export function schedule(key, deadlineOverride = null) {
  const p = parseMonthKey(key);
  if (!p) return null;
  const day = (d) => `${key}-${String(d).padStart(2, '0')}`;
  const IST = 330 * 60 * 1000;
  const endOf3rd = Date.UTC(p.year, p.month - 1, 3, 23, 59, 59, 999) - IST;
  return { announce: day(1), submitFrom: day(2), submitUntil: day(3), verifyFrom: day(4), verifyUntil: day(5), deadlineAt: deadlineOverride ?? endOf3rd };
}

const norm = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
/** The key a player is known by in salary records: his normalised name. */
export const playerKey = (name) => norm(name);

/** Indian-style digit grouping: 1200000 → "12,00,000". */
export const inr = (n) => Number(n ?? 0).toLocaleString('en-IN');
export const credits = (n) => `${inr(n)} Credits`;

/* ---------- the salary weights (the administrator's setting) ---------- */

/** Weights are stored in hundredths of a percent (basis points): 10000 = 100%. */
export const WEIGHT_TOTAL = 10000;

/** Is a weights setting complete: a whole number of basis points for every category, none negative, totalling exactly 100%? */
export function weightsProblem(weights) {
  if (!weights || typeof weights !== 'object') return 'The salary distribution has not been configured yet.';
  let sum = 0;
  for (const id of CATEGORY_IDS) {
    const w = weights[id];
    if (!Number.isInteger(w) || w < 0) return `Enter a percentage for ${categoryLabel(id)}.`;
    sum += w;
  }
  if (sum !== WEIGHT_TOTAL) return `The category percentages total ${(sum / 100).toFixed(2)}%; they must total 100%.`;
  if (!(weights.special_contract > 0)) return 'Special Contract needs a percentage above zero (it also receives the rounding balance).';
  return null;
}

/** "12.5" or 12.5 → 1250 basis points (null if it is not a percentage with at most two decimals). */
export function percentToBp(p) {
  const n = Number(String(p).trim());
  if (!Number.isFinite(n) || n < 0 || n > 100) return null;
  const bp = Math.round(n * 100);
  return Math.abs(bp - n * 100) < 1e-6 ? bp : null;
}

/* ---------- choosing the players ---------- */

/**
 * Checks a salary selection. `lines`: [{ category, key }] (key = the player's key). `roster`: [{ key, name, umpire, designation }] — the
 * board's registered players. With `complete`, the whole submission rules apply (a Special Contract player, an umpire among the Elite…);
 * without it (a draft) only the rules that can never be broken apply. Returns a list of problems (empty = fine).
 */
export function selectionProblems(lines, roster, { complete = false } = {}) {
  const out = [];
  const byKey = new Map(roster.map((p) => [p.key, p]));
  const seen = new Set();
  const per = Object.fromEntries(CATEGORY_IDS.map((c) => [c, []]));
  for (const l of lines ?? []) {
    if (!CATEGORY_IDS.includes(l.category)) {
      out.push(`“${l.category}” is not a salary category.`);
      continue;
    }
    const p = byKey.get(l.key);
    if (!p) {
      out.push(`${l.name ?? l.key ?? 'A player'} is not one of this board's registered players.`);
      continue;
    }
    if (seen.has(l.key)) {
      out.push(`${p.name} is selected more than once.`);
      continue;
    }
    seen.add(l.key);
    per[l.category].push(p);
  }
  for (const c of CATEGORIES) if (c.max !== null && per[c.id].length > c.max) out.push(`${c.label} allows at most ${c.max} player${c.max === 1 ? '' : 's'}.`);
  if (per.special_contract.some((p) => !p.umpire)) out.push(`The Special Contract player must be an active IOCF umpire (${per.special_contract.find((p) => !p.umpire).name} is not).`);
  if (complete) {
    if (per.special_contract.length !== 1) out.push('Choose the Special Contract player.');
    if (!per.elite.length) out.push('Choose at least one Elite player.');
    else if (!per.elite.some((p) => p.umpire)) out.push('At least one Elite player must be an active IOCF umpire.');
  }
  return out;
}

/* ---------- the salary calculation ---------- */

/**
 * Works out every selected player's monthly salary.
 *   budget: the board's allocated credits for the month (a multiple of 100)
 *   weights: { special_contract: bp, elite: bp, … } (must be complete)
 *   lines: [{ category, key, … }]
 * Steps, in the official priority order: each category's part of the budget is floor(budget × weight); its players share it equally, each
 * getting a multiple of 100 (rounded down); what remains of the whole budget (rounding, the part of a category with no players) is added to
 * the Special Contract player, so the total is exactly the budget. Returns { ok, error?, lines, breakdown, total, remainder, remaining }.
 */
export function calculate({ budget, weights, lines }) {
  if (!Number.isInteger(budget) || budget <= 0 || budget % 100 !== 0) return { ok: false, error: 'The monthly allocation is not a whole multiple of 100 credits.' };
  const problem = weightsProblem(weights);
  if (problem) return { ok: false, error: problem };
  const by = Object.fromEntries(CATEGORY_IDS.map((c) => [c, []]));
  for (const l of lines ?? []) if (by[l.category]) by[l.category].push(l);
  if (by.special_contract.length !== 1) return { ok: false, error: 'Choose the Special Contract player: the rounding balance is added to that salary.' };
  const breakdown = [];
  const salaries = new Map();
  let distributed = 0;
  for (const c of CATEGORIES) {
    const pool = Math.floor((budget * weights[c.id]) / WEIGHT_TOTAL);
    const n = by[c.id].length;
    const share = n ? Math.floor(pool / n / 100) * 100 : 0;
    for (const l of by[c.id]) salaries.set(l, share);
    distributed += share * n;
    breakdown.push({ category: c.id, weightBp: weights[c.id], pool, players: n, share, leftover: pool - share * n });
  }
  const remainder = budget - distributed;
  const special = by.special_contract[0];
  salaries.set(special, salaries.get(special) + remainder);
  const out = (lines ?? []).filter((l) => salaries.has(l)).map((l) => ({ ...l, salary: salaries.get(l) }));
  const total = out.reduce((n, l) => n + l.salary, 0);
  return { ok: true, lines: out, breakdown, total, remainder, remaining: budget - total };
}

/** Totals per category of calculated lines: [{ category, players, total }]. */
export const categoryTotals = (lines) => CATEGORIES.map((c) => ({ category: c.id, players: lines.filter((l) => l.category === c.id).length, total: lines.filter((l) => l.category === c.id).reduce((n, l) => n + l.salary, 0) }));

/** Salary rule 2: every salary is a multiple of 100 and a positive whole number. */
export const salaryOk = (n) => Number.isInteger(n) && n > 0 && n % 100 === 0;

/**
 * The longest run of consecutive months with a verified (credited) salary record, counting back from the latest one: how far a player
 * is toward the three consecutive verified months of the IOCF Top Class pathway. months: ['2027-01', …] (any order, duplicates fine).
 */
export function consecutiveMonths(months) {
  const set = new Set(months);
  const sorted = [...set].sort();
  let best = 0;
  let run = 0;
  let prev = null;
  const next = (k) => {
    const { year, month } = parseMonthKey(k);
    return month === 12 ? monthKey(year + 1, 1) : monthKey(year, month + 1);
  };
  for (const k of sorted) {
    run = prev && next(prev) === k ? run + 1 : 1;
    best = Math.max(best, run);
    prev = k;
  }
  // the streak that is running now: back from the latest month
  let current = 0;
  if (sorted.length) {
    current = 1;
    for (let i = sorted.length - 1; i > 0; i--) {
      if (next(sorted[i - 1]) === sorted[i]) current++;
      else break;
    }
  }
  return { best, current };
}
export const TOP_CLASS_MONTHS = 3;
