import { isHiddenBoard } from '../../data/hiddenBoards.mjs';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, ApiError, type AdminCredits as Data, type CreditsInfo } from '../../data/commandApi';
import { themeOf } from '../../data/commandCenter/boardConfig';
import { BoardFlag } from './Mascot';
import { rupees, sheetCreditsOf, signed, stamp } from './CreditsPanel';

type Nav = (...parts: string[]) => void;

/** Administrator: every board's balance, each board's history, and manual credit adjustments. */
export default function AdminCredits({ nav }: { nav: Nav }) {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState('');
  const [history, setHistory] = useState<CreditsInfo | null>(null);
  const [form, setForm] = useState<{ board: string; sign: 1 | -1; amount: string; reason: string } | null>(null);
  const [busy, setBusy] = useState('');
  const [flash, setFlash] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await api.adminCredits());
      setError('');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Something went wrong.');
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const show = async (slug: string) => {
    if (open === slug) return setOpen('');
    setOpen(slug);
    setHistory(null);
    try {
      setHistory(await api.credits(slug));
    } catch (e) {
      setFlash({ ok: false, text: e instanceof ApiError ? e.message : 'Something went wrong.' });
    }
  };
  const refresh = async (slug: string) => {
    await load();
    if (open === slug) setHistory(await api.credits(slug));
  };

  const save = async () => {
    if (!form) return;
    setBusy('save');
    setFlash(null);
    try {
      await api.adjustCredit({ board: form.board, amount: form.sign * Math.round(Number(form.amount)), reason: form.reason });
      const slug = form.board;
      setForm(null);
      await refresh(slug);
      setFlash({ ok: true, text: 'Credit adjustment saved.' });
    } catch (e) {
      setFlash({ ok: false, text: e instanceof ApiError ? e.message : 'Something went wrong.' });
    }
    setBusy('');
  };
  const remove = async (id: string, slug: string) => {
    setBusy(id);
    setFlash(null);
    try {
      await api.removeAdjustment(id);
      await refresh(slug);
      setFlash({ ok: true, text: 'Adjustment removed.' });
    } catch (e) {
      setFlash({ ok: false, text: e instanceof ApiError ? e.message : 'Something went wrong.' });
    }
    setBusy('');
  };

  const enter = async (what: { seriesId?: string; adjustmentId?: string; all?: boolean; entered: boolean }, slug?: string) => {
    setBusy(what.seriesId ?? what.adjustmentId ?? 'all');
    setFlash(null);
    try {
      const r = await api.markEntered(what);
      if (slug) await refresh(slug);
      else await load();
      if (!slug && open) setHistory(await api.credits(open));
      setFlash({ ok: true, text: what.all ? `${r.updated} change${r.updated === 1 ? '' : 's'} marked as ${what.entered ? 'entered in' : 'not in'} the sheet.` : what.entered ? 'Marked as entered in the sheet.' : 'Marked as not in the sheet.' });
    } catch (e) {
      setFlash({ ok: false, text: e instanceof ApiError ? e.message : 'Something went wrong.' });
    }
    setBusy('');
  };
  const waiting = (data?.settlements ?? []).filter((x) => !x.entered);

  const rows = useMemo(() => (data?.boards ?? []).filter((b) => !isHiddenBoard(b.slug)).filter((b) => !query.trim() || b.name.toLowerCase().includes(query.trim().toLowerCase())), [data, query]);
  const field = 'mt-1 w-full rounded-lg border border-white/15 bg-ink px-3 py-2.5 text-sm text-bone outline-none placeholder:text-smoke focus:border-[#c9a24b]';

  return (
    <div className="gutter pb-20 pt-28">
      <button type="button" onClick={() => nav()} className="text-xs font-semibold tracking-[0.2em] text-mist transition hover:text-bone">
        ← BACK TO ADMIN DASHBOARD
      </button>
      <header className="mt-6">
        <p className="text-[11px] font-semibold tracking-[0.3em] text-[#c9a24b]">MASTER ADMINISTRATOR</p>
        <h1 className="mt-1 font-display text-[clamp(2.2rem,6vw,4.5rem)] leading-[0.9] tracking-wide text-bone">BOARD CREDITS</h1>
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-mist">
          The IOCF sheet is the master: each board&apos;s credits are read from it live. On top of that, every series result you record is settled automatically (winner gains the bet, loser loses it; <b className="text-bone">a home win doubles the bet</b>; in trilateral and quadrilateral series every other board pays the winner) and counted as pending until you enter it in the sheet.
        </p>
      </header>

      {error && (
        <p role="alert" className="mt-6 rounded-xl border border-crimson/40 bg-ink-2 px-5 py-4 text-sm text-mist">
          {error}{' '}
          <button type="button" onClick={() => void load()} className="font-semibold text-[#c9a24b] hover:underline">
            Try again
          </button>
        </p>
      )}

      {data && (
        <section aria-label="Changes not yet in the sheet" className="mt-6 rounded-2xl border border-white/10 bg-ink-2 p-5">
          <h2 className="text-[11px] font-semibold tracking-[0.24em] text-[#c9a24b]">SETTLEMENTS TO ENTER IN THE SHEET</h2>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-mist">
            A board&apos;s balance below is its <b className="text-bone">Available credits in the IOCF sheet</b> (read live) plus the changes listed here, which the sheet does not include yet. After you add a change to the sheet, press <b className="text-bone">Mark entered</b> so it stops being counted twice.
          </p>
          {!waiting.length ? (
            <p className="mt-3 text-sm text-mist">Nothing is waiting: every recorded series result is already in the sheet.</p>
          ) : (
            <ul className="mt-3 divide-y divide-white/5">
              {waiting.map((x) => (
                <li key={x.seriesId} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-2.5">
                  <span className="text-sm text-bone">
                    {x.name}
                    <span className="block text-xs text-mist">{x.moves.map((m) => `${m.boardName} ${signed(m.delta)}`).join(' · ')}</span>
                  </span>
                  <button type="button" onClick={() => void enter({ seriesId: x.seriesId, entered: true })} disabled={busy === x.seriesId} className="rounded-lg border border-[#c9a24b] px-4 py-1.5 text-xs font-bold tracking-[0.16em] text-[#c9a24b] transition hover:bg-[#c9a24b]/10 disabled:opacity-50">
                    MARK ENTERED
                  </button>
                </li>
              ))}
            </ul>
          )}
          {(waiting.length > 0 || data.recentAdjustments.some((a) => !a.entered)) && (
            <button type="button" onClick={() => void enter({ all: true, entered: true })} disabled={busy === 'all'} className="mt-3 rounded-lg bg-[#c9a24b] px-5 py-2.5 text-xs font-bold tracking-[0.2em] text-ink transition hover:brightness-110 disabled:opacity-50">
              {busy === 'all' ? 'MARKING…' : 'MARK EVERYTHING AS ENTERED IN THE SHEET'}
            </button>
          )}
        </section>
      )}

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search a board" aria-label="Search a board" className="w-full rounded-lg border border-white/15 bg-ink px-3 py-2 text-sm text-bone outline-none placeholder:text-smoke focus:border-[#c9a24b] sm:w-64" />
        <button type="button" onClick={() => setForm({ board: rows[0]?.slug ?? '', sign: 1, amount: '', reason: '' })} className="rounded-lg border border-[#c9a24b] px-4 py-2 text-xs font-bold tracking-[0.18em] text-[#c9a24b] transition hover:bg-[#c9a24b]/10">
          + ADJUST A BOARD’S CREDIT
        </button>
      </div>
      <p role="status" aria-live="polite" className={`mt-3 min-h-[1.2rem] text-sm ${flash ? (flash.ok ? 'text-[#6fcf8e]' : 'text-crimson-2') : ''}`}>
        {flash?.text}
      </p>

      {form && data && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
          className="mt-2 grid gap-3 rounded-2xl border border-[#c9a24b]/50 bg-ink-2 p-5 sm:grid-cols-2 lg:grid-cols-[1fr_9rem_1fr_2fr]"
        >
          <label className="block text-[11px] font-semibold tracking-[0.18em] text-mist">
            BOARD
            <select value={form.board} onChange={(e) => setForm({ ...form, board: e.target.value })} className={field}>
              {data.boards.filter((b) => !isHiddenBoard(b.slug)).map((b) => (
                <option key={b.slug} value={b.slug}>
                  {b.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-[11px] font-semibold tracking-[0.18em] text-mist">
            ACTION
            <select value={form.sign} onChange={(e) => setForm({ ...form, sign: Number(e.target.value) as 1 | -1 })} className={field}>
              <option value={1}>Add credit</option>
              <option value={-1}>Deduct credit</option>
            </select>
          </label>
          <label className="block text-[11px] font-semibold tracking-[0.18em] text-mist">
            AMOUNT (₹)
            <input inputMode="numeric" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value.replace(/[^\d]/g, '') })} placeholder="e.g. 5000" className={field} />
          </label>
          <label className="block text-[11px] font-semibold tracking-[0.18em] text-mist">
            REASON
            <input value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} maxLength={120} placeholder="e.g. Correction agreed with the board" className={field} />
          </label>
          <div className="flex items-center gap-3 sm:col-span-2 lg:col-span-4">
            <button type="submit" disabled={busy === 'save' || !form.board || !Number(form.amount) || form.reason.trim().length < 3} className="rounded-lg bg-[#c9a24b] px-5 py-2.5 text-xs font-bold tracking-[0.2em] text-ink transition hover:brightness-110 disabled:opacity-40">
              {busy === 'save' ? 'SAVING…' : 'SAVE ADJUSTMENT'}
            </button>
            <button type="button" onClick={() => setForm(null)} className="text-xs font-semibold tracking-[0.18em] text-mist hover:text-bone">
              CANCEL
            </button>
          </div>
        </form>
      )}

      {!data ? (
        !error && <p className="mt-6 text-sm text-smoke">Loading balances…</p>
      ) : (
        <ul className="mt-4 space-y-2">
          {rows.map((b) => {
            const theme = themeOf(b.slug)!;
            return (
              <li key={b.slug} className="rounded-xl border border-white/10 bg-ink-2">
                <div className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <BoardFlag theme={theme} className="text-2xl" />
                  <span className="min-w-[8rem] flex-1 font-display text-lg tracking-wide text-bone">{b.name.toUpperCase()}</span>
                  {(() => {
                    const sheet = sheetCreditsOf(b.name);
                    const total = (sheet ?? 0) + b.pending;
                    return (
                      <span className="text-right">
                        <span className={`block font-display text-2xl ${total < 0 ? 'text-crimson-2' : 'text-bone'}`}>{rupees(total)}</span>
                        <span className="block text-[11px] text-smoke">
                          sheet {sheet === null ? '—' : rupees(sheet)} · pending {b.pending === 0 ? '—' : signed(b.pending)}
                        </span>
                      </span>
                    );
                  })()}
                  <button type="button" onClick={() => void show(b.slug)} aria-expanded={open === b.slug} className="text-xs font-semibold tracking-[0.18em] text-[#c9a24b] hover:underline">
                    {open === b.slug ? 'HIDE HISTORY' : 'HISTORY'}
                  </button>
                  <button type="button" onClick={() => setForm({ board: b.slug, sign: 1, amount: '', reason: '' })} className="text-xs font-semibold tracking-[0.18em] text-mist hover:text-bone">
                    ADJUST
                  </button>
                </div>
                {open === b.slug && (
                  <div className="border-t border-white/10 px-4 py-3">
                    {!history ? (
                      <p className="text-sm text-smoke">Loading…</p>
                    ) : !history.entries.length ? (
                      <p className="text-sm text-mist">No credits yet.</p>
                    ) : (
                      <ul className="divide-y divide-white/5">
                        {history.entries.map((e, i) => (
                          <li key={`${e.at}-${i}`} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2 text-sm">
                            <span className="text-bone">
                              {e.kind === 'series' ? e.text : `Adjustment: ${e.text}`}
                              <span className="text-smoke">
                                {' '}
                                · {e.series ? `${e.series} · ` : ''}
                                {stamp(e.at)}
                              </span>
                            </span>
                            <span className="flex items-center gap-3">
                              <span style={{ color: e.delta < 0 ? '#e07a7a' : '#6fcf8e' }} className="font-semibold">
                                {signed(e.delta)}
                              </span>
                              <span className="text-[10px] font-semibold tracking-[0.14em]" style={{ color: e.entered ? '#6fcf8e' : '#c9a24b' }}>
                                {e.entered ? 'IN THE SHEET' : 'PENDING'}
                              </span>
                              {e.id && (
                                <>
                                  <button type="button" onClick={() => void enter({ adjustmentId: e.id!, entered: !e.entered }, b.slug)} disabled={busy === e.id} className="text-[11px] font-semibold tracking-[0.16em] text-[#c9a24b] hover:underline disabled:opacity-50">
                                    {e.entered ? 'UNDO' : 'MARK ENTERED'}
                                  </button>
                                  <button type="button" onClick={() => void remove(e.id!, b.slug)} disabled={busy === e.id} className="text-[11px] font-semibold tracking-[0.16em] text-mist hover:text-crimson-2 disabled:opacity-50">
                                    REMOVE
                                  </button>
                                </>
                              )}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
