import { useCallback, useEffect, useState } from 'react';
import { api, ApiError, type AdminStadiums as Data, type StadiumRequest } from '../../data/commandApi';
import { themeOf } from '../../data/commandCenter/boardConfig';
import { BoardFlag } from './Mascot';
import { rupees, sheetCreditsOf, stamp } from './CreditsPanel';

type Nav = (...parts: string[]) => void;
const GOLD = '#c9a24b';

/** Administrator: the stadium requests boards have sent. Accepting takes the cost from the board's credits and adds the stadium to its list. */
export default function AdminStadiums({ nav }: { nav: Nav }) {
  const [data, setData] = useState<Data | null>(null);
  const [pending, setPending] = useState<Record<string, number>>({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [flash, setFlash] = useState<{ ok: boolean; text: string } | null>(null);
  const [declining, setDeclining] = useState<string | null>(null);
  const [reason, setReason] = useState('');

  const load = useCallback(async () => {
    try {
      const [d, c] = await Promise.all([api.adminStadiums(), api.adminCredits().catch(() => null)]);
      setData(d);
      setPending(Object.fromEntries((c?.boards ?? []).map((b) => [b.slug, b.pending])));
      setError('');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Something went wrong.');
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const run = async (key: string, action: () => Promise<unknown>, done: string) => {
    setBusy(key);
    setFlash(null);
    try {
      await action();
      setDeclining(null);
      setReason('');
      await load();
      setFlash({ ok: true, text: done });
    } catch (e) {
      setFlash({ ok: false, text: e instanceof ApiError ? e.message : 'Something went wrong.' });
      await load();
    }
    setBusy('');
  };

  const balanceOf = (r: StadiumRequest) => {
    const sheet = sheetCreditsOf(r.boardName);
    return sheet === null ? null : sheet + (pending[r.board] ?? 0);
  };
  const card = 'rounded-2xl border border-white/10 bg-ink-2';

  return (
    <div className="gutter pb-20 pt-28">
      <button type="button" onClick={() => nav()} className="text-xs font-semibold tracking-[0.2em] text-mist transition hover:text-bone">
        ← BACK TO ADMIN DASHBOARD
      </button>
      <header className="mt-6">
        <p className="text-[11px] font-semibold tracking-[0.3em]" style={{ color: GOLD }}>MASTER ADMINISTRATOR</p>
        <h1 className="mt-1 font-display text-[clamp(2.2rem,6vw,4.5rem)] leading-[0.9] tracking-wide text-bone">STADIUM REQUESTS</h1>
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-mist">
          Boards ask to build a new stadium (always level 3). <b className="text-bone">Accept</b> adds the stadium to the board&apos;s list. The system does not touch the credits: deduct {rupees(data?.cost ?? 30000)} from the board in the sheet yourself. <b className="text-bone">Decline</b> removes the request and tells the board it was not accepted.
        </p>
      </header>

      {error && <p role="alert" className="mt-6 rounded-xl border border-crimson/40 bg-ink-2 px-5 py-4 text-sm text-mist">{error}</p>}
      <p role="status" aria-live="polite" className={`mt-4 min-h-[1.25rem] text-sm ${flash ? (flash.ok ? 'text-[#6fcf8e]' : 'text-crimson-2') : ''}`}>{flash?.text}</p>

      <h2 className="mt-4 text-[11px] font-semibold tracking-[0.24em]" style={{ color: GOLD }}>WAITING FOR A DECISION ({data?.pending.length ?? '…'})</h2>
      {!data ? (
        <p className="mt-3 text-sm text-smoke" aria-busy="true">Loading…</p>
      ) : !data.pending.length ? (
        <p className={`${card} mt-3 px-5 py-10 text-center text-sm text-mist`}>No request is waiting.</p>
      ) : (
        <ul className="mt-3 grid gap-4 lg:grid-cols-2">
          {data.pending.map((r) => {
            const theme = themeOf(r.board);
            const bal = balanceOf(r);
            return (
              <li key={r.id} className={`${card} p-5`}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="flex items-center gap-2 text-[11px] font-semibold tracking-[0.2em]" style={{ color: GOLD }}>
                      {theme && <BoardFlag theme={theme} className="text-xl" />}
                      {r.boardName.toUpperCase()}
                    </p>
                    <p className="mt-1 font-display text-2xl tracking-wide text-bone">{r.name.toUpperCase()}</p>
                  </div>
                  <span className="shrink-0 rounded-full border border-white/20 px-2.5 py-0.5 text-[10px] font-semibold tracking-[0.16em] text-mist">LEVEL {r.level}</span>
                </div>
                <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-5 gap-y-1 text-sm">
                  <dt className="text-[11px] font-semibold tracking-[0.16em] text-smoke">VENUE</dt>
                  <dd className="text-bone">{r.venue}</dd>
                  <dt className="text-[11px] font-semibold tracking-[0.16em] text-smoke">COST</dt>
                  <dd className="text-bone">{rupees(r.cost)}</dd>
                  <dt className="text-[11px] font-semibold tracking-[0.16em] text-smoke">BALANCE</dt>
                  <dd className="text-bone">
                    {bal === null ? 'not listed in the sheet' : `${rupees(bal)} → ${rupees(bal - r.cost)} once you deduct it`}
                    {bal !== null && bal - r.cost < 0 && <b className="text-crimson-2"> (below zero)</b>}
                  </dd>
                  <dt className="text-[11px] font-semibold tracking-[0.16em] text-smoke">SENT</dt>
                  <dd className="text-bone">{stamp(r.requestedAt)}{r.requestedBy ? ` · ${r.requestedBy}` : ''}</dd>
                </dl>
                {declining === r.id ? (
                  <div className="mt-4">
                    <label className="block text-[11px] font-semibold tracking-[0.16em] text-smoke">
                      REASON (OPTIONAL, THE BOARD SEES IT)
                      <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} className="mt-1 w-full rounded-lg border border-white/15 bg-ink px-3 py-2 text-sm text-bone outline-none focus:border-[#c9a24b]" />
                    </label>
                    <div className="mt-3 flex flex-wrap gap-3">
                      <button type="button" disabled={busy !== ''} onClick={() => void run(`n-${r.id}`, () => api.declineStadium(r.id, reason), `The request for ${r.name} was declined. ${r.boardName} will be told.`)} className="rounded-lg border border-crimson/60 px-5 py-2 text-xs font-bold tracking-[0.18em] text-crimson-2 transition hover:bg-crimson/10 disabled:opacity-50">
                        CONFIRM DECLINE
                      </button>
                      <button type="button" onClick={() => { setDeclining(null); setReason(''); }} className="text-xs font-semibold tracking-[0.16em] text-mist hover:text-bone">CANCEL</button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-4 flex flex-wrap gap-3">
                    <button type="button" disabled={busy !== ''} onClick={() => void run(`y-${r.id}`, () => api.acceptStadium(r.id), `${r.name} was added to ${r.boardName}. Now deduct ${rupees(r.cost)} from ${r.boardName} in the sheet.`)} className="rounded-lg px-5 py-2 text-xs font-bold tracking-[0.18em] text-ink transition hover:brightness-110 disabled:opacity-50" style={{ background: GOLD }}>
                      {busy === `y-${r.id}` ? 'ACCEPTING…' : 'ACCEPT'}
                    </button>
                    <button type="button" disabled={busy !== ''} onClick={() => setDeclining(r.id)} className="rounded-lg border border-white/25 px-5 py-2 text-xs font-bold tracking-[0.18em] text-bone transition hover:border-crimson/60 hover:text-crimson-2 disabled:opacity-50">
                      DECLINE
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <h2 className="mt-10 text-[11px] font-semibold tracking-[0.24em]" style={{ color: GOLD }}>RECENT DECISIONS</h2>
      {!data?.recent.length ? (
        <p className="mt-3 text-sm text-smoke">Nothing decided yet.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {data.recent.map((r) => (
            <li key={r.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 rounded-xl border border-white/10 bg-ink-2 px-4 py-3">
              <span>
                <span className="block text-sm text-bone">{r.name} · {r.boardName}</span>
                <span className="text-xs text-smoke">
                  {r.venue} · {r.decidedAt ? stamp(r.decidedAt) : ''}{r.decidedBy ? ` · ${r.decidedBy}` : ''}{r.status === 'declined' && r.declineReason ? ` · ${r.declineReason}` : ''}
                </span>
              </span>
              <span className="text-[11px] font-semibold tracking-[0.18em]" style={{ color: r.status === 'accepted' ? '#6fcf8e' : '#e07a7a' }}>
                {r.status === 'accepted' ? `ACCEPTED · DEDUCT ${rupees(r.cost)} IN THE SHEET` : 'DECLINED'}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
