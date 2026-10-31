// Board Credits: what each finished series is worth, and every board's balance.
//
// Balances are never stored: they are worked out from the series results the administrator has recorded, plus the manual
// adjustments (a ledger table). So correcting or clearing a result, or deleting a series, fixes the balances by itself.
//
// Settlement of a finished series (a drawn series changes nothing):
//   • the stake is the series' bet amount; when the HOST board wins, the stake is doubled (bet ₹5,000, host wins → ₹10,000)
//   • every other board in the series pays the winner that stake, so a bilateral series moves the stake from loser to winner,
//     and in a trilateral / quadrilateral series the winner collects it from each of the others
//   • balances may go below zero
const clean = (v) => String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
export const MAX_ADJUSTMENT = 1_000_000_000;
export const OPENING_REASON = 'Opening balance from the IOCF sheet';

/** The money moves of one finished series: [{ board, delta, summary }] (empty for a draw or an unfinished series). */
export function settleSeries(s, boards) {
  if (s.status !== 'accepted' || !s.result_winner || s.result_winner === 'draw') return [];
  const nameOf = (slug) => boards.find((b) => b.slug === slug)?.name ?? slug;
  const all = [s.host, ...s.opponents];
  const winner = s.result_winner;
  const home = winner === s.host;
  const stake = s.bet * (home ? 2 : 1);
  const losers = all.filter((b) => b !== winner);
  const how = home ? `home win, bet doubled from ₹${s.bet.toLocaleString('en-IN')}` : `away win, bet ₹${s.bet.toLocaleString('en-IN')}`;
  return [
    { board: winner, delta: stake * losers.length, summary: `Won ₹${(stake * losers.length).toLocaleString('en-IN')} vs ${losers.map(nameOf).join(', ')} (${how})` },
    ...losers.map((b) => ({ board: b, delta: -stake, summary: `Lost ₹${stake.toLocaleString('en-IN')} to ${nameOf(winner)} (${winner === s.host ? 'home win for them, bet doubled' : 'away win for them'})` })),
  ];
}

/** Every ledger line for every board, newest first: from finished series and from manual adjustments. */
export function ledger(seriesList, adjustments, boards) {
  const lines = [];
  for (const s of seriesList) {
    for (const m of settleSeries(s, boards)) lines.push({ kind: 'series', board: m.board, at: s.result_at ?? s.updated_at ?? 0, delta: m.delta, text: m.summary, series: s.name, seriesId: s.id });
  }
  for (const a of adjustments) lines.push({ kind: 'adjustment', id: a.id, board: a.board, at: a.created_at, delta: a.amount, text: a.reason, by: a.created_by ?? null });
  return lines.sort((x, y) => y.at - x.at);
}

export const balanceOf = (lines, slug) => lines.filter((l) => l.board === slug).reduce((n, l) => n + l.delta, 0);

/** Checks an administrator's adjustment. Returns { value } or { error }. */
export function validateAdjustment(input, boards) {
  const i = input && typeof input === 'object' ? input : {};
  if (!boards.some((b) => b.slug === i.board)) return { error: 'Choose a board.' };
  const amount = Number(i.amount);
  if (!Number.isInteger(amount) || amount === 0 || Math.abs(amount) > MAX_ADJUSTMENT) return { error: 'Enter a whole amount other than zero (up to ₹100 crore).' };
  const reason = clean(i.reason);
  if (reason.length < 3 || reason.length > 120) return { error: 'Give a reason (3 to 120 characters).' };
  return { value: { board: i.board, amount, reason } };
}

/** Checks the opening balances the administrator loads from the IOCF sheet: { <board slug>: whole amount ≥ 0 }. */
export function validateOpening(input, boards) {
  const map = input && typeof input === 'object' && input.balances && typeof input.balances === 'object' ? input.balances : null;
  if (!map) return { error: 'No balances were sent.' };
  const out = [];
  for (const [slug, v] of Object.entries(map)) {
    const n = Number(v);
    if (!boards.some((b) => b.slug === slug)) return { error: `Unknown board: ${slug}.` };
    if (!Number.isInteger(n) || n < 0 || n > MAX_ADJUSTMENT) return { error: `The balance for ${slug} is not a valid amount.` };
    out.push({ board: slug, amount: n });
  }
  return { value: out };
}
