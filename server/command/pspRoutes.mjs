// IOCF 2.0 – Player Salary Program: the server side. Every rule is decided here; the browser only asks and shows.
//
//   Admin  : months (enable / status), council seats, monthly rankings (→ funding), salary settings, request review (approve / decline),
//            records and the overview
//   Board  : its own month list, its allocation, a salary draft, the submission, its history and its players' verified records
//
// State lives in the command_psp_* tables (psp.sql). Crediting is idempotent: a transaction's reference is its key, so approving twice
// can never credit a player twice, and a verified record is written once and never changed.
import {
  CATEGORIES, COUNCILS, CORRECTION_STATUSES, MONTH_STATUSES, SUBMISSION_STATUSES, WEIGHT_TOTAL, calculate, categoryLabel, categoryTotals, consecutiveMonths, fundingFor,
  councilFunding, MONTHLY_FUNDING, ANNUAL_FUNDING, monthKey, monthLabel, parseMonthKey, percentToBp, playerKey, requestStatusLabel, monthStatusLabel, salaryOk,
  schedule, selectionProblems, weightsProblem, CATEGORY_IDS, TOP_CLASS_MONTHS,
} from '../../src/data/commandCenter/psp.mjs';

const T = { months: 'months', seats: 'seats', rankings: 'rankings', config: 'config', submissions: 'submissions', records: 'records', transactions: 'transactions' };
const slugOf = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const clean = (v, max = 300) => String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
const YEARS = { min: 2027, max: 2100 };

/* ---------- the roster of a board, from the IOCF sheet's dataset ---------- */

/** The board's registered players with their designation (Chairman / CEO) and whether each is an active IOCF umpire. */
export function rosterOf(dataset, boardSlug) {
  const board = (dataset.boards ?? []).find((b) => slugOf(b.name) === boardSlug);
  const umpires = new Set((dataset.umpires ?? []).filter((u) => u.boardId === boardSlug).map((u) => playerKey(u.name)));
  const seen = new Set();
  const players = [];
  for (const p of (dataset.players ?? []).filter((x) => x.boardId === boardSlug)) {
    const key = playerKey(p.name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    // the dataset already marks the roster entries that are the board's Chairman or CEO ("Chairman", "CEO", "Chairman & CEO")
    players.push({ key, name: p.name, umpire: umpires.has(key), designation: p.official ?? null });
  }
  return { board: board?.name ?? boardSlug, players };
}

/* ---------- small readers ---------- */

const byKey = (rows) => new Map(rows.map((r) => [r.key, r]));
const weightsOf = async (store) => (await store.pspGet(T.config, 'salary-weights'))?.weights ?? null;

/** The month's row, or the default "Not Started" row when the administrator has not touched it. */
const monthRow = (rows, key) => rows.find((r) => r.key === key) ?? { key, ...parseMonthKey(key), status: 'not_started', activated_by: null, activated_at: null, deadline_at: null, note: null, rankings_published_at: null, rankings_published_by: null };

const monthApi = (m) => {
  const sch = schedule(m.key, m.deadline_at ?? null);
  return {
    key: m.key, label: monthLabel(m.key), year: m.year, month: m.month, status: m.status, statusLabel: monthStatusLabel(m.status), enabled: m.status !== 'not_started',
    submissionOpen: SUBMISSION_STATUSES.includes(m.status), activatedBy: m.activated_by ?? null, activatedAt: m.activated_at ?? null, deadlineAt: sch.deadlineAt, deadlineMoved: m.deadline_at != null,
    note: m.note ?? null, rankingsPublished: Boolean(m.rankings_published_at), rankingsPublishedAt: m.rankings_published_at ?? null, schedule: sch,
  };
};

/** The latest version of a board's request for a month (highest version), or null. */
const latestOf = (subs, key, board) => subs.filter((s) => s.month_key === key && s.board === board).sort((a, b) => b.version - a.version)[0] ?? null;

const linesApi = (lines) => (lines ?? []).map((l) => ({ category: l.category, categoryLabel: categoryLabel(l.category), key: l.key, name: l.name, designation: l.designation ?? null, umpire: Boolean(l.umpire), salary: l.salary ?? null }));

const subApi = (s, extra = {}) => ({
  id: s.key, month: s.month_key, monthLabel: monthLabel(s.month_key), board: s.board, version: s.version, status: s.status, statusLabel: requestStatusLabel(s.status), council: s.council, rank: s.rank,
  allocation: s.allocation, total: s.total, remaining: s.allocation - s.total, late: Boolean(s.late), players: (s.lines ?? []).length, lines: linesApi(s.lines),
  createdAt: s.created_at, submittedAt: s.submitted_at ?? null, submittedBy: s.submitted_by ?? null, reviewedAt: s.reviewed_at ?? null, decidedAt: s.decided_at ?? null, decidedBy: s.decided_by ?? null,
  reason: s.decision_reason ?? null, creditedAt: s.credited_at ?? null, ...extra,
});

/* ---------- ranking and allocation ---------- */

/** The board's allocation for a month, only once the month's rankings are published: { council, rank, credits } or null. */
const allocationFor = (month, rankings, board) => {
  if (!month.rankings_published_at) return null;
  const r = rankings.find((x) => x.month_key === month.key && x.board === board);
  return r ? { council: r.council, rank: r.rank, credits: r.credits } : null;
};

/** Seats → { board slug → { council, seat } }. */
const seatMap = (seats) => new Map(seats.map((s) => [s.board, { council: s.council, seat: s.seat }]));

/* ---------- the routes ---------- */

/**
 * Handles every /admin/psp/... and /boards/:slug/psp/... request. Returns a response, or null when the request is not for this module.
 * ctx: { req, who, store, BOARDS, loadDataset, json, fail, audit, now }
 */
export async function handlePsp(ctx) {
  const { req, who, store, BOARDS, loadDataset, json, fail, audit, now } = ctx;
  const [a, b, c, d, e, f] = req.path;
  const method = req.method;
  const isAdmin = who.role === 'admin';

  /* ===================== administrator ===================== */
  if (a === 'admin' && b === 'psp') {
    if (!isAdmin) return fail(403, 'forbidden', 'Administrator access is required.');
    const t = now();
    const boardName = (slug) => BOARDS.find((x) => x.slug === slug)?.name ?? slug;
    const monthParam = (k) => (parseMonthKey(k) ? k : null);

    // ---- months ----
    if (c === 'months' && !d && method === 'GET') {
      const rows = await store.pspList(T.months);
      const years = [...new Set([2027, ...rows.map((r) => r.year)])].sort();
      const year = Number(req.query?.year) || years[0];
      const subs = await store.pspList(T.submissions);
      const list = Array.from({ length: 12 }, (_, i) => {
        const m = monthApi(monthRow(rows, monthKey(year, i + 1)));
        const mine = subs.filter((s) => s.month_key === m.key);
        return { ...m, requests: mine.filter((s) => s.status !== 'draft').length, credited: mine.filter((s) => s.status === 'credited').length };
      });
      return json(200, { years: years.includes(year) ? years : [...years, year].sort(), year, statuses: MONTH_STATUSES, months: list });
    }
    if (c === 'years' && !d && method === 'POST') {
      const year = Number(req.body?.year);
      if (!Number.isInteger(year) || year < YEARS.min || year > YEARS.max) return fail(400, 'invalid', `Enter a year from ${YEARS.min} to ${YEARS.max}.`);
      const rows = await store.pspList(T.months);
      let added = 0;
      for (let i = 1; i <= 12; i++) {
        const key = monthKey(year, i);
        if (rows.some((r) => r.key === key)) continue;
        await store.pspPut(T.months, { key, year, month: i, status: 'not_started', activated_by: null, activated_at: null, deadline_at: null, note: null, rankings_published_at: null, rankings_published_by: null, updated_by: who.username, updated_at: t });
        added++;
      }
      await audit('psp_year_added', who, String(year), req, { added });
      return json(200, { ok: true, year, added });
    }
    if (c === 'months' && d && !e && method === 'PUT') {
      const key = monthParam(d);
      if (!key) return fail(404, 'not_found', 'Month not found.');
      const cur = monthRow(await store.pspList(T.months), key);
      const patch = {};
      if (req.body?.status !== undefined) {
        if (!MONTH_STATUSES.some((s) => s.id === req.body.status)) return fail(400, 'invalid', 'Choose a valid month status.');
        patch.status = req.body.status;
        if (cur.status === 'not_started' && patch.status !== 'not_started') Object.assign(patch, { activated_by: who.username, activated_at: t });
      }
      if (req.body?.deadlineAt !== undefined) {
        if (req.body.deadlineAt === null) patch.deadline_at = null;
        else {
          const ms = Number(req.body.deadlineAt);
          if (!Number.isFinite(ms) || ms < Date.UTC(2026, 0, 1) || ms > Date.UTC(2101, 0, 1)) return fail(400, 'invalid', 'Choose a valid deadline.');
          patch.deadline_at = Math.round(ms);
        }
      }
      if (req.body?.note !== undefined) patch.note = clean(req.body.note, 300) || null;
      if (!Object.keys(patch).length) return fail(400, 'invalid', 'Nothing to change.');
      const row = await store.pspPut(T.months, { ...cur, ...patch, updated_by: who.username, updated_at: t });
      await audit('psp_month_changed', who, key, req, { from: cur.status, to: row.status, deadlineMoved: patch.deadline_at !== undefined });
      return json(200, { month: monthApi(row) });
    }
    if (c === 'months' && d && e === 'enable' && method === 'POST') {
      const key = monthParam(d);
      if (!key) return fail(404, 'not_found', 'Month not found.');
      const cur = monthRow(await store.pspList(T.months), key);
      if (cur.status !== 'not_started') return fail(409, 'already', `${monthLabel(key)} is already ${monthStatusLabel(cur.status)}.`);
      const row = await store.pspPut(T.months, { ...cur, status: 'active', activated_by: who.username, activated_at: t, updated_by: who.username, updated_at: t });
      await audit('psp_month_enabled', who, key, req);
      return json(200, { month: monthApi(row) });
    }

    // ---- council seats ----
    if (c === 'councils' && !d && method === 'GET') {
      const seats = await store.pspList(T.seats);
      const map = seatMap(seats);
      return json(200, {
        councils: COUNCILS.map((co) => ({ id: co.id, name: co.name, color: co.color, ranks: co.ranks, monthlyFunding: councilFunding(co.id), seats: Array.from({ length: co.ranks }, (_, i) => { const s = seats.find((x) => x.council === co.id && x.seat === i + 1); return { seat: i + 1, board: s?.board ?? null, boardName: s ? boardName(s.board) : null }; }) })),
        boards: BOARDS.map((bd) => ({ slug: bd.slug, name: bd.name, council: map.get(bd.slug)?.council ?? null, seat: map.get(bd.slug)?.seat ?? null })),
        monthlyFunding: MONTHLY_FUNDING, annualFunding: ANNUAL_FUNDING,
      });
    }
    if (c === 'councils' && d && e && method === 'PUT') {
      const council = COUNCILS.find((x) => x.id === d);
      const seat = Number(e);
      if (!council || !Number.isInteger(seat) || seat < 1 || seat > council.ranks) return fail(404, 'not_found', 'That council position does not exist.');
      const slot = `${council.id}-${seat}`;
      const seats = await store.pspList(T.seats);
      const here = seats.find((x) => x.key === slot) ?? null;
      const board = req.body?.board ?? null;
      if (board === null || board === '') {
        if (!here) return json(200, { ok: true });
        await store.pspDelete(T.seats, slot);
        await audit('psp_seat_cleared', who, slot, req, { board: here.board });
        return json(200, { ok: true });
      }
      if (!BOARDS.some((x) => x.slug === board)) return fail(400, 'invalid', 'Choose a registered board.');
      const elsewhere = seats.find((x) => x.board === board && x.key !== slot);
      if (elsewhere) return fail(409, 'seated', `${boardName(board)} already holds ${COUNCILS.find((x) => x.id === elsewhere.council).short} position ${elsewhere.seat}. A board can belong to one council position only: clear that position first.`);
      if (here && here.board !== board) return fail(409, 'occupied', `${council.short} position ${seat} is held by ${boardName(here.board)}. Clear it first, or choose another position.`);
      if (here && here.board === board) return json(200, { ok: true });
      await store.pspPut(T.seats, { key: slot, council: council.id, seat, board, assigned_by: who.username, assigned_at: t });
      await audit('psp_seat_assigned', who, slot, req, { board });
      return json(200, { ok: true });
    }

    // ---- monthly rankings ----
    if (c === 'rankings' && d) {
      const key = monthParam(d);
      if (!key) return fail(404, 'not_found', 'Month not found.');
      const months = await store.pspList(T.months);
      const month = monthRow(months, key);
      const rankings = (await store.pspList(T.rankings)).filter((r) => r.month_key === key);
      const seats = await store.pspList(T.seats);
      const map = seatMap(seats);

      if (!e && method === 'GET') {
        const councils = COUNCILS.map((co) => {
          const seated = seats.filter((s) => s.council === co.id).sort((x, y) => x.seat - y.seat).map((s) => ({ slug: s.board, name: boardName(s.board) }));
          return { id: co.id, name: co.name, color: co.color, boards: seated, ranks: Array.from({ length: co.ranks }, (_, i) => { const r = rankings.find((x) => x.council === co.id && x.rank === i + 1); return { rank: i + 1, funding: fundingFor(co.id, i + 1), board: r?.board ?? null, boardName: r ? boardName(r.board) : null }; }) };
        });
        const missing = [];
        for (const s of seats) if (!rankings.some((r) => r.board === s.board && r.council === s.council)) missing.push(`${boardName(s.board)} (${COUNCILS.find((x) => x.id === s.council).short}) has no rank yet`);
        return json(200, { month: monthApi(month), councils, assignedBoards: seats.length, rankedBoards: rankings.length, missing, complete: seats.length > 0 && !missing.length, totalFunding: rankings.reduce((n, r) => n + r.credits, 0) });
      }
      if (e && f && method === 'PUT') {
        const council = COUNCILS.find((x) => x.id === e);
        const rank = Number(f);
        if (!council || !Number.isInteger(rank) || rank < 1 || rank > council.ranks) return fail(404, 'not_found', 'That rank does not exist.');
        if (month.status === 'closed') return fail(409, 'closed', `${monthLabel(key)} is closed.`);
        const slot = `${key}:${council.id}:${rank}`;
        const here = rankings.find((r) => r.key === slot) ?? null;
        const board = req.body?.board ?? null;
        const reason = clean(req.body?.reason, 200);
        const subs = (await store.pspList(T.submissions)).filter((s) => s.month_key === key);
        const locked = (slug) => subs.find((s) => s.board === slug && ['submitted', 'under_review', 'approved', 'credited'].includes(s.status));
        const published = Boolean(month.rankings_published_at);
        if (published && reason.length < 3) return fail(400, 'reason_required', `The rankings of ${monthLabel(key)} are published. Give a reason (3 characters or more) to change them; the change is recorded.`);
        if (board === null || board === '') {
          if (!here) return json(200, { ok: true });
          if (locked(here.board)) return fail(409, 'locked', `${boardName(here.board)} has a salary request for ${monthLabel(key)} that is already submitted or decided, so its rank cannot change.`);
          await store.pspDelete(T.rankings, slot);
          await audit('psp_rank_cleared', who, slot, req, { board: here.board, published, reason: reason || null });
          return json(200, { ok: true });
        }
        const seat = map.get(board);
        if (!BOARDS.some((x) => x.slug === board)) return fail(400, 'invalid', 'Choose a registered board.');
        if (!seat) return fail(409, 'unassigned', `${boardName(board)} has not been assigned to a council yet, so it cannot be ranked.`);
        if (seat.council !== council.id) return fail(409, 'wrong_council', `${boardName(board)} belongs to the ${COUNCILS.find((x) => x.id === seat.council).short} council, not ${council.short}.`);
        const dup = rankings.find((r) => r.board === board && r.key !== slot);
        if (dup) return fail(409, 'duplicate', `${boardName(board)} already holds rank ${dup.rank} in ${monthLabel(key)}. A board can have one rank a month.`);
        if (here && here.board !== board) return fail(409, 'occupied', `Rank ${rank} of ${council.short} is held by ${boardName(here.board)}. Clear it first.`);
        if (here && here.board === board) return json(200, { ok: true });
        if (published && (locked(board) || (here && locked(here.board)))) return fail(409, 'locked', 'A salary request for this month is already submitted or decided for one of these boards, so the rank cannot change.');
        await store.pspPut(T.rankings, { key: slot, month_key: key, council: council.id, rank, board, credits: fundingFor(council.id, rank), set_by: who.username, set_at: t });
        await audit('psp_rank_set', who, slot, req, { board, credits: fundingFor(council.id, rank), published, reason: reason || null });
        return json(200, { ok: true, credits: fundingFor(council.id, rank) });
      }
      if (e === 'publish' && method === 'POST') {
        const seats2 = seats;
        if (!seats2.length) return fail(409, 'no_boards', 'No board has been assigned to a council yet.');
        const missing = [];
        for (const s of seats2) if (!rankings.some((r) => r.board === s.board && r.council === s.council)) missing.push(boardName(s.board));
        if (missing.length) return fail(409, 'incomplete', `Every board in a council needs a rank before the rankings can be published. Missing: ${missing.join(', ')}.`);
        const stale = rankings.filter((r) => map.get(r.board)?.council !== r.council).map((r) => boardName(r.board));
        if (stale.length) return fail(409, 'stale', `These boards are no longer in the council they are ranked in: ${stale.join(', ')}. Correct their ranks first.`);
        if (month.rankings_published_at) return fail(409, 'published', `The rankings of ${monthLabel(key)} are already published.`);
        const row = await store.pspPut(T.months, { ...month, rankings_published_at: t, rankings_published_by: who.username, updated_by: who.username, updated_at: t });
        await audit('psp_rankings_published', who, key, req, { boards: rankings.length });
        return json(200, { month: monthApi(row) });
      }
    }

    // ---- salary settings ----
    if (c === 'settings' && !d && method === 'GET') {
      const w = await weightsOf(store);
      return json(200, { weights: w, percent: w ? Object.fromEntries(CATEGORY_IDS.map((id) => [id, (w[id] ?? 0) / 100])) : null, problem: weightsProblem(w), complete: !weightsProblem(w), categories: CATEGORIES, councilFunding: COUNCILS.map((co) => ({ id: co.id, name: co.short, monthly: councilFunding(co.id) })), monthlyFunding: MONTHLY_FUNDING, annualFunding: ANNUAL_FUNDING });
    }
    if (c === 'settings' && !d && method === 'PUT') {
      const input = req.body?.percent;
      if (!input || typeof input !== 'object') return fail(400, 'invalid', 'Send the percentage of each category.');
      const weights = {};
      for (const id of CATEGORY_IDS) {
        const bp = percentToBp(input[id]);
        if (bp === null) return fail(400, 'invalid', `${categoryLabel(id)}: enter a percentage from 0 to 100 with at most two decimals.`);
        weights[id] = bp;
      }
      const problem = weightsProblem(weights);
      if (problem) return fail(400, 'invalid', problem);
      const before = await weightsOf(store);
      await store.pspPut(T.config, { key: 'salary-weights', weights, updated_by: who.username, updated_at: t });
      await audit('psp_settings_changed', who, 'salary-weights', req, { before, after: weights });
      return json(200, { ok: true, weights });
    }

    // ---- salary requests ----
    if (c === 'requests' && !d && method === 'GET') {
      const month = req.query?.month ?? '';
      const subs = (await store.pspList(T.submissions)).filter((s) => s.status !== 'draft' && (!month || s.month_key === month) && (!req.query?.status || s.status === req.query.status));
      return json(200, { requests: subs.sort((x, y) => (y.submitted_at ?? 0) - (x.submitted_at ?? 0)).map((s) => subApi(s, { boardName: boardName(s.board), lines: undefined })) });
    }
    if (c === 'requests' && d) {
      const sub = await store.pspGet(T.submissions, d);
      if (!sub || sub.status === 'draft') return fail(404, 'not_found', 'Request not found.');
      const dataset = await loadDataset();
      const roster = rosterOf(dataset, sub.board);
      const detail = async () => {
        const lines = sub.lines ?? [];
        const rosterMap = new Map(roster.players.map((p) => [p.key, p]));
        const checks = selectionProblems(lines.map((l) => ({ category: l.category, key: l.key, name: l.name })), roster.players, { complete: true });
        const allSubs = (await store.pspList(T.submissions)).filter((s) => s.month_key === sub.month_key && s.board === sub.board).sort((x, y) => x.version - y.version);
        const elite = lines.filter((l) => l.category === 'elite');
        return subApi(sub, {
          boardName: boardName(sub.board),
          checks: {
            problems: checks,
            umpireVerification: lines.filter((l) => l.category === 'special_contract' || l.category === 'elite').map((l) => ({ name: l.name, category: categoryLabel(l.category), umpire: rosterMap.get(l.key)?.umpire ?? false })),
            specialContractUmpire: lines.filter((l) => l.category === 'special_contract').every((l) => rosterMap.get(l.key)?.umpire),
            eliteHasUmpire: elite.some((l) => rosterMap.get(l.key)?.umpire),
            officials: lines.filter((l) => rosterMap.get(l.key)?.designation).map((l) => ({ name: l.name, designation: rosterMap.get(l.key).designation, category: categoryLabel(l.category) })),
            multiplesOf100: lines.every((l) => salaryOk(l.salary)),
            totalMatchesAllocation: sub.total === sub.allocation,
            allRegistered: lines.every((l) => rosterMap.has(l.key)),
          },
          breakdown: calculate({ budget: sub.allocation, weights: sub.weights, lines: lines.map((l) => ({ category: l.category, key: l.key })) }).breakdown ?? [],
          categoryTotals: categoryTotals(lines.map((l) => ({ ...l, salary: l.salary }))).map((x) => ({ ...x, label: categoryLabel(x.category) })),
          versions: allSubs.map((s) => ({ id: s.key, version: s.version, status: s.status, statusLabel: requestStatusLabel(s.status), submittedAt: s.submitted_at ?? null, decidedAt: s.decided_at ?? null, reason: s.decision_reason ?? null })),
        });
      };
      if (!e && method === 'GET') return json(200, { request: await detail() });
      if (e === 'review' && method === 'POST') {
        if (sub.status !== 'submitted') return fail(409, 'state', `This request is ${requestStatusLabel(sub.status)}.`);
        await store.pspPut(T.submissions, { ...sub, status: 'under_review', reviewed_by: who.username, reviewed_at: t });
        await audit('psp_review_started', who, sub.key, req);
        return json(200, { ok: true });
      }
      if (e === 'approve' && method === 'POST') {
        // repeating the action never credits twice: an approved or credited request is only reported
        if (sub.status === 'approved' || sub.status === 'credited') {
          const done = await creditSubmission(store, sub, who, t); // finishes a half-done credit (idempotent), otherwise changes nothing
          return json(200, { request: subApi(done), already: true });
        }
        if (!['submitted', 'under_review'].includes(sub.status)) return fail(409, 'state', `A ${requestStatusLabel(sub.status).toLowerCase()} request cannot be approved.`);
        const problems = selectionProblems((sub.lines ?? []).map((l) => ({ category: l.category, key: l.key, name: l.name })), roster.players, { complete: true });
        if (problems.length) return fail(409, 'invalid_selection', `This request cannot be approved as it stands: ${problems.join(' ')} Decline it so the board can correct it.`);
        if (!(sub.lines ?? []).every((l) => salaryOk(l.salary)) || sub.total !== sub.allocation) return fail(409, 'invalid_salary', 'The salaries do not add up to the allocation in multiples of 100. Decline the request so the board can correct it.');
        const approved = await store.pspPut(T.submissions, { ...sub, status: 'approved', decided_by: who.username, decided_at: t, reviewed_by: sub.reviewed_by ?? who.username, reviewed_at: sub.reviewed_at ?? t });
        const done = await creditSubmission(store, approved, who, t);
        await audit('psp_request_approved', who, sub.key, req, { board: sub.board, month: sub.month_key, total: sub.total });
        return json(200, { request: subApi(done) });
      }
      if (e === 'decline' && method === 'POST') {
        if (!['submitted', 'under_review'].includes(sub.status)) return fail(409, 'state', `A ${requestStatusLabel(sub.status).toLowerCase()} request cannot be declined.`);
        const reason = clean(req.body?.reason, 400);
        if (reason.length < 3) return fail(400, 'reason_required', 'Enter the reason for declining (3 characters or more). The board sees it.');
        const row = await store.pspPut(T.submissions, { ...sub, status: 'rejected', decided_by: who.username, decided_at: t, decision_reason: reason });
        await audit('psp_request_declined', who, sub.key, req, { board: sub.board, month: sub.month_key, reason });
        return json(200, { request: subApi(row) });
      }
    }

    // ---- records ----
    if (c === 'records' && !d && method === 'GET') {
      const q = clean(req.query?.q, 60).toLowerCase();
      const rows = (await store.pspList(T.records)).filter((r) => (!req.query?.month || r.month_key === req.query.month) && (!req.query?.year || String(r.year) === String(req.query.year)) && (!req.query?.board || r.board === req.query.board) && (!q || r.player_name.toLowerCase().includes(q)));
      return json(200, { records: rows.sort((x, y) => y.month_key.localeCompare(x.month_key) || x.board.localeCompare(y.board) || x.player_name.localeCompare(y.player_name)).slice(0, 2000).map((r) => recordApi(r, boardName)), total: rows.length });
    }

    // ---- overview ----
    if (c === 'overview' && !d && method === 'GET') return json(200, await overview({ store, BOARDS, query: req.query ?? {} }));
    return fail(404, 'not_found', 'Not found.');
  }

  /* ===================== a board ===================== */
  if (a === 'boards' && b && c === 'psp') {
    const board = BOARDS.find((x) => x.slug === b);
    if (!board) return fail(404, 'not_found', 'Board not found.');
    const own = isAdmin || (who.role === 'board' && who.board_slug === board.slug);
    if (!own) return fail(403, 'forbidden', 'You do not have access to this board.');
    const t = now();
    const monthsRows = await store.pspList(T.months);
    const subs = (await store.pspList(T.submissions)).filter((s) => s.board === board.slug);
    const rankings = await store.pspList(T.rankings);
    const seats = await store.pspList(T.seats);
    const seat = seatMap(seats).get(board.slug) ?? null;
    const weights = await weightsOf(store);
    const configProblem = weightsProblem(weights);
    const councilName = (id) => COUNCILS.find((x) => x.id === id)?.name ?? null;

    if (!d && method === 'GET') {
      const years = [...new Set([2027, ...monthsRows.map((r) => r.year)])].sort();
      const months = years.flatMap((y) => Array.from({ length: 12 }, (_, i) => monthRow(monthsRows, monthKey(y, i + 1)))).map((m) => {
        const al = allocationFor(m, rankings, board.slug);
        const latest = latestOf(subs, m.key, board.slug);
        return { ...monthApi(m), council: al ? councilName(al.council) : null, rank: al?.rank ?? null, allocation: al?.credits ?? null, request: latest ? { id: latest.key, version: latest.version, status: latest.status, statusLabel: requestStatusLabel(latest.status), total: latest.total, reason: latest.decision_reason ?? null, submittedAt: latest.submitted_at ?? null, decidedAt: latest.decided_at ?? null } : null };
      });
      return json(200, { board: board.slug, boardName: board.name, council: seat ? councilName(seat.council) : null, configComplete: !configProblem, configProblem, canAct: true, months });
    }

    if (d === 'months' && e && !f && method === 'GET') {
      if (!parseMonthKey(e)) return fail(404, 'not_found', 'Month not found.');
      const m = monthRow(monthsRows, e);
      const al = allocationFor(m, rankings, board.slug);
      const latest = latestOf(subs, e, board.slug);
      const dataset = await loadDataset();
      const roster = rosterOf(dataset, board.slug);
      const state = boardState(m, al, latest, configProblem);
      return json(200, {
        month: monthApi(m), board: board.slug, boardName: board.name, council: al ? councilName(al.council) : seat ? councilName(seat.council) : null, rank: al?.rank ?? null, allocation: al?.credits ?? null,
        configComplete: !configProblem, configProblem, weights, state, roster: roster.players,
        categories: CATEGORIES.map((cat) => ({ id: cat.id, label: cat.label, max: cat.max })),
        request: latest ? subApi(latest) : null,
        previous: subs.filter((s) => s.month_key === e).sort((x, y) => y.version - x.version).slice(latest ? 1 : 0).filter((s) => s.status !== 'draft').map((s) => ({ id: s.key, version: s.version, status: s.status, statusLabel: requestStatusLabel(s.status), reason: s.decision_reason ?? null, decidedAt: s.decided_at ?? null })),
      });
    }

    if (d === 'months' && e && f && (f === 'draft' || f === 'submit') && (method === 'PUT' || method === 'POST')) {
      if (!parseMonthKey(e)) return fail(404, 'not_found', 'Month not found.');
      if ((f === 'draft') !== (method === 'PUT')) return fail(405, 'method', 'Use PUT for a draft and POST to submit.');
      const m = monthRow(monthsRows, e);
      const al = allocationFor(m, rankings, board.slug);
      const latest = latestOf(subs, e, board.slug);
      const state = boardState(m, al, latest, configProblem);
      if (!state.canEdit) return fail(409, state.code, state.message);
      const dataset = await loadDataset();
      const roster = rosterOf(dataset, board.slug);
      const given = Array.isArray(req.body?.lines) ? req.body.lines : [];
      if (given.length > 200) return fail(400, 'invalid', 'Too many players.');
      const byRoster = new Map(roster.players.map((p) => [p.key, p]));
      const lines = given.map((l) => ({ category: String(l?.category ?? ''), key: String(l?.key ?? '') })).map((l) => ({ ...l, name: byRoster.get(l.key)?.name, designation: byRoster.get(l.key)?.designation ?? null, umpire: byRoster.get(l.key)?.umpire ?? false }));
      const complete = f === 'submit';
      const problems = selectionProblems(lines, roster.players, { complete });
      if (problems.length) return fail(400, 'invalid_selection', problems.join(' '));
      const calc = calculate({ budget: al.credits, weights, lines });
      if (complete && !calc.ok) return fail(400, 'invalid', calc.error);
      if (complete && (!calc.lines.every((l) => salaryOk(l.salary)) || calc.total !== al.credits)) return fail(500, 'calculation', 'The salary calculation did not balance. Nothing was submitted.');
      const priced = calc.ok ? calc.lines : lines;
      // a draft: the latest draft is updated; after a rejection (or the first time) a new version starts
      const fresh = !latest || latest.status === 'rejected';
      const version = fresh ? (latest?.version ?? 0) + 1 : latest.version;
      const row = {
        ...(fresh ? {} : latest),
        key: `${e}:${board.slug}:v${version}`, month_key: e, board: board.slug, version, status: complete ? 'submitted' : 'draft', council: al.council, rank: al.rank, allocation: al.credits, weights, lines: priced,
        total: calc.ok ? calc.total : 0, late: complete ? t > schedule(e, m.deadline_at ?? null).deadlineAt : (latest?.late ?? false), created_by: fresh ? who.username : latest.created_by, created_at: fresh ? t : latest.created_at,
        submitted_by: complete ? who.username : null, submitted_at: complete ? t : null, reviewed_by: null, reviewed_at: null, decided_by: null, decided_at: null, decision_reason: null, credited_at: null,
      };
      const saved = await store.pspPut(T.submissions, row);
      if (complete) await audit('psp_salary_submitted', who, saved.key, req, { board: board.slug, month: e, total: saved.total, late: saved.late, byAdministrator: isAdmin && who.board_slug !== board.slug });
      return json(complete ? 201 : 200, { request: subApi(saved), calculation: calc.ok ? { breakdown: calc.breakdown, remainder: calc.remainder } : null });
    }

    if (d === 'records' && !e && method === 'GET') {
      const recs = (await store.pspList(T.records)).filter((r) => r.board === board.slug);
      const dataset = await loadDataset();
      const roster = rosterOf(dataset, board.slug);
      const all = await store.pspList(T.records);
      const players = roster.players.map((p) => {
        const mine = all.filter((r) => r.player_key === p.key);
        const months = mine.map((r) => r.month_key);
        const streak = consecutiveMonths(months);
        return { key: p.key, name: p.name, designation: p.designation, umpire: p.umpire, records: mine.sort((x, y) => y.month_key.localeCompare(x.month_key)).map((r) => recordApi(r, (s) => BOARDS.find((x) => x.slug === s)?.name ?? s)), verifiedMonths: new Set(months).size, consecutive: streak.current, best: streak.best, topClassReady: streak.best >= TOP_CLASS_MONTHS };
      }).filter((p) => p.records.length);
      return json(200, { board: board.slug, boardName: board.name, topClassMonths: TOP_CLASS_MONTHS, records: recs.length, players });
    }
    return fail(404, 'not_found', 'Not found.');
  }
  return null;
}

/** For the dashboards: how many things need attention. Board: months open for its salary submission (or rejected) · admin: requests waiting for a decision. */
export async function pspAttention(store, { board = null } = {}) {
  try {
    const subs = await store.pspList(T.submissions);
    if (!board) {
      const latest = subs.filter((s) => latestOf(subs, s.month_key, s.board)?.key === s.key);
      return latest.filter((s) => s.status === 'submitted' || s.status === 'under_review').length;
    }
    const [months, rankings, weights] = await Promise.all([store.pspList(T.months), store.pspList(T.rankings), weightsOf(store)]);
    const problem = weightsProblem(weights);
    return months.filter((m) => {
      const al = allocationFor(m, rankings, board);
      const latest = latestOf(subs.filter((s) => s.board === board), m.key, board);
      return boardState(m, al, latest, problem).canEdit;
    }).length;
  } catch {
    return 0; // the salary tables are not set up (yet): nothing to point at
  }
}

/* ---------- state of a board's month: what the board may do ---------- */

function boardState(month, allocation, latest, configProblem) {
  const status = latest?.status ?? null;
  const base = { status, canEdit: false, code: null, message: null };
  if (month.status === 'not_started') return { ...base, code: 'not_enabled', message: 'Player Salary submission is not yet enabled by IOCF Administration.' };
  if (!month.rankings_published_at) return { ...base, code: 'no_rankings', message: 'IOCF has not published the monthly rankings yet, so there is no allocation to distribute.' };
  if (!allocation) return { ...base, code: 'no_rank', message: 'Your board has no rank in this month\'s published rankings, so it has no salary allocation.' };
  if (configProblem) return { ...base, code: 'not_configured', message: 'The salary distribution has not been configured by IOCF Administration yet.' };
  if (status === 'submitted' || status === 'under_review') return { ...base, code: 'locked', message: 'Your salary request is with IOCF Administration.' };
  if (status === 'approved' || status === 'credited') return { ...base, code: 'locked', message: 'This month\'s salaries are approved.' };
  const correcting = status === 'rejected';
  if (SUBMISSION_STATUSES.includes(month.status) || (correcting && CORRECTION_STATUSES.includes(month.status)) || (status === 'draft' && CORRECTION_STATUSES.includes(month.status))) return { ...base, canEdit: true };
  return { ...base, code: 'month_closed', message: `Salary submission for this month is ${monthStatusLabel(month.status)}.` };
}

const recordApi = (r, nameOf) => ({ id: r.key, month: r.month_key, monthLabel: monthLabel(r.month_key), year: r.year, board: r.board, boardName: nameOf(r.board), playerKey: r.player_key, player: r.player_name, designation: r.designation ?? null, category: r.category, categoryLabel: categoryLabel(r.category), salary: r.salary, status: r.status, creditedAt: r.credited_at, reference: r.transaction_ref });

/**
 * Credits an approved request: one transaction and one verified record per player, each written once (the reference is the key), then the
 * request becomes Credited. Safe to repeat: whatever already exists is left as it is, and a half-finished credit is completed.
 */
export async function creditSubmission(store, sub, who, t) {
  const { year, month } = parseMonthKey(sub.month_key);
  const refOf = (l) => `PSP-${year}${String(month).padStart(2, '0')}-${sub.board}-${l.key}`;
  // insert-only, in one request each: a row that already exists is left exactly as it is, so repeating this can never credit twice
  await store.pspInsertMany(T.transactions, (sub.lines ?? []).map((l) => ({ key: refOf(l), month_key: sub.month_key, board: sub.board, player_key: l.key, player_name: l.name, amount: l.salary, kind: 'salary_credit', submission_key: sub.key, created_by: who.username, created_at: t })));
  await store.pspInsertMany(T.records, (sub.lines ?? []).map((l) => ({ key: `${sub.month_key}:${sub.board}:${l.key}`, month_key: sub.month_key, year, month, board: sub.board, player_key: l.key, player_name: l.name, designation: l.designation ?? null, category: l.category, salary: l.salary, status: 'credited', credited_at: t, transaction_ref: refOf(l), submission_key: sub.key })));
  if (sub.status === 'credited') return sub;
  return store.pspPut(T.submissions, { ...sub, status: 'credited', credited_at: t });
}

/* ---------- the administrator's overview ---------- */

async function overview({ store, BOARDS, query }) {
  const [monthsRows, seats, rankings, subs, records] = await Promise.all([store.pspList(T.months), store.pspList(T.seats), store.pspList(T.rankings), store.pspList(T.submissions), store.pspList(T.records)]);
  const years = [...new Set([2027, ...monthsRows.map((r) => r.year)])].sort();
  const year = Number(query.year) || years[0];
  const only = parseMonthKey(query.month) ? query.month : null;
  const keys = only ? [only] : Array.from({ length: 12 }, (_, i) => monthKey(year, i + 1));
  const inScope = (k) => keys.includes(k);
  const months = keys.map((k) => monthRow(monthsRows, k));
  const published = months.filter((m) => m.rankings_published_at);
  const rk = rankings.filter((r) => inScope(r.month_key) && months.find((m) => m.key === r.month_key)?.rankings_published_at);
  // each board's request for a month is its latest version (a rejected earlier version is history, not a request waiting)
  const sc = subs.filter((s) => inScope(s.month_key) && latestOf(subs, s.month_key, s.board)?.key === s.key);
  const live = sc.filter((s) => s.status !== 'draft');
  const count = (st) => live.filter((s) => s.status === st).length;
  const nameOf = (slug) => BOARDS.find((x) => x.slug === slug)?.name ?? slug;
  const seatOf = seatMap(seats);
  const latestFor = (k, board) => latestOf(sc, k, board);
  const rows = [];
  for (const r of rk) {
    const s = latestFor(r.month_key, r.board);
    rows.push({ month: r.month_key, monthLabel: monthLabel(r.month_key), board: r.board, boardName: nameOf(r.board), council: COUNCILS.find((x) => x.id === r.council)?.short, councilId: r.council, rank: r.rank, funding: r.credits, status: s ? s.status : 'not_submitted', statusLabel: s ? requestStatusLabel(s.status) : 'Not submitted', total: s?.total ?? 0, late: Boolean(s?.late) });
  }
  const awaiting = rows.filter((r) => r.status === 'not_submitted' || r.status === 'draft' || r.status === 'rejected').length;
  const creditedRows = records.filter((r) => inScope(r.month_key));
  return {
    year, month: only, years, monthlyFunding: MONTHLY_FUNDING, annualFunding: ANNUAL_FUNDING, assignedBoards: seats.length, totalBoards: BOARDS.length, publishedMonths: published.length,
    boardsWithRankings: new Set(rk.map((r) => r.board)).size, awaiting, submitted: count('submitted'), underReview: count('under_review'), approved: count('approved'), rejected: count('rejected'), credited: count('credited'), drafts: sc.filter((s) => s.status === 'draft').length,
    totalAllocated: rk.reduce((n, r) => n + r.credits, 0), totalDistributed: creditedRows.reduce((n, r) => n + r.salary, 0), configComplete: !weightsProblem(await weightsOf(store)),
    councils: COUNCILS.map((co) => {
      const mine = rows.filter((r) => r.councilId === co.id);
      return { id: co.id, name: co.short, color: co.color, assigned: seats.filter((s) => s.council === co.id).length, ranks: co.ranks, monthlyFunding: councilFunding(co.id), allocated: mine.reduce((n, r) => n + r.funding, 0), distributed: creditedRows.filter((r) => seatOf.get(r.board)?.council === co.id).reduce((n, r) => n + r.salary, 0), submitted: mine.filter((r) => ['submitted', 'under_review', 'approved', 'credited'].includes(r.status)).length, credited: mine.filter((r) => r.status === 'credited').length };
    }),
    boards: rows.sort((x, y) => x.month.localeCompare(y.month) || x.councilId.localeCompare(y.councilId) || x.rank - y.rank),
  };
}
