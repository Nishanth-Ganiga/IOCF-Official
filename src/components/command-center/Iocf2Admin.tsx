import { useState } from 'react';
import { api, type PspOverview } from '../../data/commandApi';
import { MONTHLY_FUNDING, ANNUAL_FUNDING, monthLabel } from '../../data/commandCenter/psp.mjs';
import { Badge, Confirm, CouncilTag, GOLD, Note, Panel, Tile, btn, btnGhost, btnGold, cr, day, errText, field, stamp, td, th, useLoad } from './Iocf2Ui';
import { AdminRequests, AdminRecords, AdminSettings } from './Iocf2Review';

type Nav = (...parts: string[]) => void;
const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'salary', label: 'Players Salary' },
  { id: 'councils', label: 'Council & Board Assignment' },
  { id: 'rankings', label: 'Monthly Rankings' },
  { id: 'requests', label: 'Salary Requests' },
  { id: 'records', label: 'Salary Records' },
  { id: 'settings', label: 'Salary Settings' },
];

/** Administrator: IOCF 2.0 – Player Salary Program. */
export default function AdminIocf2({ nav, tab, param }: { nav: Nav; tab?: string; param?: string }) {
  const current = TABS.some((t) => t.id === tab) ? (tab as string) : 'overview';
  return (
    <div className="gutter pb-20 pt-28">
      <button type="button" onClick={() => nav()} className="text-xs font-semibold tracking-[0.2em] text-mist transition hover:text-bone">← BACK TO ADMIN DASHBOARD</button>
      <header className="mt-6">
        <p className="text-[11px] font-semibold tracking-[0.3em]" style={{ color: GOLD }}>MASTER ADMINISTRATOR</p>
        <h1 className="mt-1 font-display text-[clamp(2.2rem,6vw,4.5rem)] leading-[0.9] tracking-wide text-bone">IOCF 2.0</h1>
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-mist">Official Player Salary Program (PSP 2027): council funding, monthly rankings, player salary requests and verified salary records. Starting month: January 2027.</p>
      </header>
      <nav aria-label="IOCF 2.0 sections" className="mt-6 flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button key={t.id} type="button" aria-current={current === t.id ? 'page' : undefined} onClick={() => nav('iocf2', t.id)} className={`rounded-full border px-4 py-2 text-xs font-semibold tracking-[0.12em] transition ${current === t.id ? 'border-[#c9a24b] bg-[#c9a24b] text-ink' : 'border-white/15 text-mist hover:border-white/40 hover:text-bone'}`}>
            {t.label.toUpperCase()}
          </button>
        ))}
      </nav>
      <div className="mt-6 space-y-6">
        {current === 'overview' && <Overview nav={nav} />}
        {current === 'salary' && <Months />}
        {current === 'councils' && <Councils />}
        {current === 'rankings' && <Rankings month={param} nav={nav} />}
        {current === 'requests' && <AdminRequests id={param} nav={nav} />}
        {current === 'records' && <AdminRecords />}
        {current === 'settings' && <AdminSettings />}
      </div>
    </div>
  );
}

/* ---------------- overview ---------------- */

function Overview({ nav }: { nav: Nav }) {
  const [year, setYear] = useState<number | undefined>(undefined);
  const [month, setMonth] = useState('');
  const { data, error } = useLoad<PspOverview>(() => api.pspOverview(year, month || undefined), [year, month]);
  if (error) return <Note tone="error">{error}</Note>;
  if (!data) return <p className="text-sm text-smoke" aria-busy="true">Loading…</p>;
  const months = Array.from({ length: 12 }, (_, i) => `${data.year}-${String(i + 1).padStart(2, '0')}`);
  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-[11px] font-semibold tracking-[0.16em] text-mist">YEAR
          <select value={data.year} onChange={(e) => { setYear(Number(e.target.value)); setMonth(''); }} className={`${field} mt-1 w-32`}>{data.years.map((y) => <option key={y}>{y}</option>)}</select>
        </label>
        <label className="text-[11px] font-semibold tracking-[0.16em] text-mist">MONTH
          <select value={month} onChange={(e) => setMonth(e.target.value)} className={`${field} mt-1 w-44`}>
            <option value="">Whole year</option>
            {months.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
          </select>
        </label>
      </div>
      {!data.configComplete && <Note tone="warn">The salary distribution settings are not complete, so boards cannot submit salaries yet. Complete them in <button type="button" className="font-semibold underline" onClick={() => nav('iocf2', 'settings')}>Salary Settings</button>.</Note>}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
        <Tile label="Total monthly funding" value={`${cr(MONTHLY_FUNDING)}`} sub="1.20 Crore Credits" color={GOLD} />
        <Tile label="Total annual funding" value={`${cr(ANNUAL_FUNDING)}`} sub="14.40 Crore Credits" color={GOLD} />
        <Tile label="Boards assigned to councils" value={`${data.assignedBoards} / ${data.totalBoards}`} />
        <Tile label="Boards with published rankings" value={data.boardsWithRankings} />
        <Tile label="Awaiting salary submission" value={data.awaiting} color="#d99a2b" />
        <Tile label="Submitted requests" value={data.submitted} color="#d99a2b" />
        <Tile label="Under review" value={data.underReview} color="#d99a2b" />
        <Tile label="Approved" value={data.approved} color="#3b7dd8" />
        <Tile label="Rejected" value={data.rejected} color="#d9534f" />
        <Tile label="Credited" value={data.credited} color="#2f9e6b" />
        <Tile label="Credits allocated" value={cr(data.totalAllocated)} sub="published rankings" />
        <Tile label="Credits distributed" value={cr(data.totalDistributed)} sub="verified salary records" color="#2f9e6b" />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {data.councils.map((c) => (
          <Panel key={c.id} title={c.name.toUpperCase()} accent={c.color}>
            <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-sm">
              <dt className="text-smoke">Boards assigned</dt><dd className="text-bone">{c.assigned} of {c.ranks} positions</dd>
              <dt className="text-smoke">Monthly funding</dt><dd className="text-bone">{cr(c.monthlyFunding)}</dd>
              <dt className="text-smoke">Allocated (published)</dt><dd className="text-bone">{cr(c.allocated)}</dd>
              <dt className="text-smoke">Distributed</dt><dd className="text-bone">{cr(c.distributed)}</dd>
              <dt className="text-smoke">Requests</dt><dd className="text-bone">{c.submitted} submitted · {c.credited} credited</dd>
            </dl>
          </Panel>
        ))}
      </div>
      <Panel title={`BOARDS (${data.boards.length})`}>
        {!data.boards.length ? (
          <p className="text-sm text-mist">No board has a published ranking in this period yet.</p>
        ) : (
          <div className="overflow-x-auto"><table className="min-w-full"><thead><tr><th className={th}>MONTH</th><th className={th}>BOARD</th><th className={th}>COUNCIL</th><th className={th}>RANK</th><th className={th}>MONTHLY FUNDING</th><th className={th}>SUBMITTED</th><th className={th}>STATUS</th></tr></thead>
            <tbody className="divide-y divide-white/5">
              {data.boards.map((b) => (
                <tr key={`${b.month}-${b.board}`}><td className={td}>{b.monthLabel}</td><td className={td}>{b.boardName}</td><td className={td}><CouncilTag id={b.councilId} /></td><td className={td}>{b.rank}</td><td className={td}>{cr(b.funding)}</td><td className={td}>{b.total ? cr(b.total) : '—'}{b.late && <span className="ml-2 text-[10px] text-[#d99a2b]">LATE</span>}</td><td className={td}><Badge status={b.status} label={b.statusLabel} /></td></tr>
              ))}
            </tbody></table></div>
        )}
      </Panel>
    </>
  );
}

/* ---------------- players salary: the months ---------------- */

function Months() {
  const [year, setYear] = useState<number | undefined>(undefined);
  const { data, error, reload } = useLoad(() => api.pspMonths(year), [year]);
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [newYear, setNewYear] = useState('');
  const act = async (key: string, fn: () => Promise<unknown>, ok: string) => {
    setBusy(key);
    setMsg(null);
    try {
      await fn();
      setConfirm('');
      await reload();
      setMsg({ ok: true, text: ok });
    } catch (e) {
      setMsg({ ok: false, text: errText(e) });
    }
    setBusy('');
  };
  if (error) return <Note tone="error">{error}</Note>;
  if (!data) return <p className="text-sm text-smoke" aria-busy="true">Loading…</p>;
  return (
    <>
      <div className="flex flex-wrap items-end gap-3">
        <div role="tablist" aria-label="Year" className="flex flex-wrap gap-2">
          {data.years.map((y) => <button key={y} role="tab" aria-selected={y === data.year} type="button" onClick={() => setYear(y)} className={`rounded-full border px-4 py-1.5 text-xs font-semibold ${y === data.year ? 'border-[#c9a24b] bg-[#c9a24b] text-ink' : 'border-white/15 text-mist hover:border-white/40'}`}>{y}</button>)}
        </div>
        <form className="flex items-end gap-2" onSubmit={(e) => { e.preventDefault(); void act('year', () => api.pspAddYear(Number(newYear)), `The year ${newYear} was added.`).then(() => setNewYear('')); }}>
          <label className="text-[11px] font-semibold tracking-[0.16em] text-mist">ADD A YEAR<input value={newYear} onChange={(e) => setNewYear(e.target.value)} inputMode="numeric" placeholder="e.g. 2028" className={`${field} mt-1 w-32`} /></label>
          <button type="submit" disabled={!newYear || busy === 'year'} className={btnGhost}>ADD</button>
        </form>
      </div>
      <p role="status" aria-live="polite" className={`min-h-[1.25rem] text-sm ${msg ? (msg.ok ? 'text-[#6fcf8e]' : 'text-crimson-2') : ''}`}>{msg?.text}</p>
      <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {data.months.map((m) => (
          <li key={m.key}><MonthCard m={m} statuses={data.statuses} confirm={confirm === m.key} setConfirm={(v) => setConfirm(v ? m.key : '')} busy={busy === m.key} act={act} /></li>
        ))}
      </ul>
    </>
  );
}

function MonthCard({ m, statuses, confirm, setConfirm, busy, act }: { m: Awaited<ReturnType<typeof api.pspMonths>>['months'][number]; statuses: { id: string; label: string }[]; confirm: boolean; setConfirm: (v: boolean) => void; busy: boolean; act: (key: string, fn: () => Promise<unknown>, ok: string) => Promise<void> }) {
  const [deadline, setDeadline] = useState('');
  const [note, setNote] = useState(m.note ?? '');
  const s = m.schedule;
  return (
    <div className="rounded-2xl border border-white/10 bg-ink-2 p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="font-display text-2xl tracking-wide text-bone">{m.label.toUpperCase()}</p>
        <Badge status={m.status} label={m.statusLabel} />
      </div>
      <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
        <dt className="text-smoke">1st</dt><dd className="text-mist">Rankings announced · {day(s.announce)}</dd>
        <dt className="text-smoke">2nd–3rd</dt><dd className="text-mist">Chairmen submit · {day(s.submitFrom)}–{day(s.submitUntil)}{m.deadlineMoved && <b className="text-[#d99a2b]"> (deadline moved)</b>}</dd>
        <dt className="text-smoke">4th–5th</dt><dd className="text-mist">IOCF verifies · {day(s.verifyFrom)}–{day(s.verifyUntil)}</dd>
        <dt className="text-smoke">Deadline</dt><dd className="text-mist">{stamp(m.deadlineAt)}</dd>
        {m.activatedAt && (<><dt className="text-smoke">Enabled</dt><dd className="text-mist">{stamp(m.activatedAt)} · {m.activatedBy}</dd></>)}
        <dt className="text-smoke">Rankings</dt><dd className="text-mist">{m.rankingsPublished ? `published ${stamp(m.rankingsPublishedAt)}` : 'not published'}</dd>
        {m.requests > 0 && (<><dt className="text-smoke">Requests</dt><dd className="text-mist">{m.requests} submitted · {m.credited} credited</dd></>)}
      </dl>
      {m.note && <p className="mt-2 text-xs text-[#d99a2b]">{m.note}</p>}
      {m.status === 'not_started' ? (
        confirm ? (
          <Confirm text={`Enable ${m.label} player salary? Board chairmen will be able to submit salaries for this month once the rankings are published. Nothing is approved by enabling it.`} yes={`YES, ENABLE ${m.label.toUpperCase()}`} busy={busy} onYes={() => void act(m.key, () => api.pspEnableMonth(m.key), `${m.label} is now Active.`)} onNo={() => setConfirm(false)} />
        ) : (
          <button type="button" onClick={() => setConfirm(true)} className={`${btn} mt-4 w-full`} style={btnGold}>ENABLE {m.label.toUpperCase()} PLAYER SALARY</button>
        )
      ) : (
        <div className="mt-4 space-y-3">
          <label className="block text-[11px] font-semibold tracking-[0.16em] text-smoke">MONTH STATUS
            <select value={m.status} disabled={busy} onChange={(e) => void act(m.key, () => api.pspSetMonth(m.key, { status: e.target.value }), `${m.label} is now ${statuses.find((x) => x.id === e.target.value)?.label}.`)} className={`${field} mt-1`}>{statuses.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}</select>
          </label>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="block text-[11px] font-semibold tracking-[0.16em] text-smoke">MOVE THE DEADLINE<input type="datetime-local" value={deadline} onChange={(e) => setDeadline(e.target.value)} className={`${field} mt-1`} /></label>
            <label className="block text-[11px] font-semibold tracking-[0.16em] text-smoke">NOTE (SHOWN TO BOARDS)<input value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} className={`${field} mt-1`} /></label>
          </div>
          <div className="flex flex-wrap gap-3">
            <button type="button" disabled={busy || (!deadline && note === (m.note ?? ''))} onClick={() => void act(m.key, () => api.pspSetMonth(m.key, { ...(deadline ? { deadlineAt: new Date(deadline).getTime() } : {}), note }), 'Saved.')} className={btnGhost}>SAVE</button>
            {m.deadlineMoved && <button type="button" disabled={busy} onClick={() => void act(m.key, () => api.pspSetMonth(m.key, { deadlineAt: null }), 'The deadline is back to the 3rd.')} className="text-xs font-semibold tracking-[0.16em] text-mist hover:text-bone">RESET DEADLINE</button>}
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------- council & board assignment ---------------- */

function Councils() {
  const { data, error, reload } = useLoad(() => api.pspCouncils(), []);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState('');
  const set = async (council: string, seat: number, board: string | null) => {
    setBusy(`${council}-${seat}`);
    setMsg(null);
    try {
      await api.pspSetSeat(council, seat, board);
      await reload();
      setMsg({ ok: true, text: board ? 'Saved.' : 'Position cleared.' });
    } catch (e) {
      setMsg({ ok: false, text: errText(e) });
    }
    setBusy('');
  };
  if (error) return <Note tone="error">{error}</Note>;
  if (!data) return <p className="text-sm text-smoke" aria-busy="true">Loading…</p>;
  const free = data.boards.filter((b) => !b.council);
  return (
    <>
      <Note>Boards are never placed in a council automatically. Choose each board yourself: a board holds one position in one council, and a position holds one board. Until a board is placed it gets no monthly ranking or funding. Every change is recorded.</Note>
      <p role="status" aria-live="polite" className={`min-h-[1.25rem] text-sm ${msg ? (msg.ok ? 'text-[#6fcf8e]' : 'text-crimson-2') : ''}`}>{msg?.text}</p>
      <div className="grid gap-4 lg:grid-cols-2">
        {data.councils.map((c) => {
          const assigned = c.seats.filter((s) => s.board).length;
          return (
            <Panel key={c.id} title={`${c.name.toUpperCase()} – ${c.ranks} RANKS`} accent={c.color} right={<span className="text-xs text-mist">{assigned} assigned · {c.ranks - assigned} open · {cr(c.monthlyFunding)} / month</span>}>
              <ul className="space-y-2">
                {c.seats.map((s) => (
                  <li key={s.seat} className="grid grid-cols-[3.5rem_1fr_auto] items-center gap-3">
                    <span className="font-display text-xl" style={{ color: c.color }}>#{s.seat}</span>
                    <select aria-label={`${c.name} position ${s.seat}`} value={s.board ?? ''} disabled={busy === `${c.id}-${s.seat}`} onChange={(e) => void set(c.id, s.seat, e.target.value || null)} className={field}>
                      <option value="">Unassigned</option>
                      {s.board && <option value={s.board}>{s.boardName}</option>}
                      {free.map((b) => <option key={b.slug} value={b.slug}>{b.name}</option>)}
                    </select>
                    {s.board ? <button type="button" onClick={() => void set(c.id, s.seat, null)} className="text-xs font-semibold tracking-[0.12em] text-mist hover:text-crimson-2">CLEAR</button> : <span />}
                  </li>
                ))}
              </ul>
            </Panel>
          );
        })}
      </div>
      <Panel title={`UNASSIGNED BOARDS (${free.length})`}>
        {free.length ? <ul className="flex flex-wrap gap-2">{free.map((b) => <li key={b.slug} className="rounded-full border border-white/15 px-3 py-1 text-xs text-bone">{b.name}</li>)}</ul> : <p className="text-sm text-mist">Every board has a council position.</p>}
      </Panel>
    </>
  );
}

/* ---------------- monthly rankings ---------------- */

function Rankings({ month, nav }: { month?: string; nav: Nav }) {
  const months = useLoad(() => api.pspMonths(), []);
  const key = month ?? '2027-01';
  const { data, error, reload } = useLoad(() => api.pspRankings(key), [key]);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState('');
  const [reason, setReason] = useState('');
  const [confirm, setConfirm] = useState(false);
  const set = async (council: string, rank: number, board: string | null) => {
    setBusy(`${council}-${rank}`);
    setMsg(null);
    try {
      await api.pspSetRank(key, council, rank, board, reason);
      await reload();
      setMsg({ ok: true, text: 'Saved.' });
    } catch (e) {
      setMsg({ ok: false, text: errText(e) });
    }
    setBusy('');
  };
  const publish = async () => {
    setBusy('publish');
    setMsg(null);
    try {
      await api.pspPublish(key);
      setConfirm(false);
      await reload();
      setMsg({ ok: true, text: `The rankings of ${monthLabel(key)} are published. Each board now sees its allocation.` });
    } catch (e) {
      setMsg({ ok: false, text: errText(e) });
    }
    setBusy('');
  };
  const list = months.data?.months ?? [];
  return (
    <>
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-[11px] font-semibold tracking-[0.16em] text-mist">MONTH
          <select value={key} onChange={(e) => nav('iocf2', 'rankings', e.target.value)} className={`${field} mt-1 w-52`}>
            {[...new Set([key, ...list.map((m) => m.key)])].sort().map((k) => <option key={k} value={k}>{monthLabel(k)}</option>)}
          </select>
        </label>
        {data && <Badge status={data.month.rankingsPublished ? 'credited' : 'draft'} label={data.month.rankingsPublished ? 'Published' : 'Not published'} />}
      </div>
      {error && <Note tone="error">{error}</Note>}
      {!data && !error && <p className="text-sm text-smoke" aria-busy="true">Loading…</p>}
      {data && (
        <>
          {data.month.rankingsPublished && (
            <Panel title="THIS MONTH'S RANKINGS ARE PUBLISHED">
              <p className="text-sm text-mist">Changing a rank now needs a reason (it is recorded), and is refused for a board whose salary request is already submitted or decided.</p>
              <label className="mt-3 block text-[11px] font-semibold tracking-[0.16em] text-smoke">REASON FOR CHANGES<input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} placeholder="Why is a published rank being changed?" className={`${field} mt-1`} /></label>
            </Panel>
          )}
          <p role="status" aria-live="polite" className={`min-h-[1.25rem] text-sm ${msg ? (msg.ok ? 'text-[#6fcf8e]' : 'text-crimson-2') : ''}`}>{msg?.text}</p>
          <div className="grid gap-4 lg:grid-cols-2">
            {data.councils.map((c) => {
              const takenHere = new Set(data.councils.flatMap((x) => x.ranks.map((r) => r.board).filter(Boolean) as string[]));
              return (
                <Panel key={c.id} title={`${c.name.toUpperCase()} – ${c.ranks.length} RANKS`} accent={c.color}>
                  {!c.boards.length && <p className="mb-2 text-xs text-[#d99a2b]">No board has been assigned to this council yet (Council &amp; Board Assignment).</p>}
                  <ul className="space-y-2">
                    {c.ranks.map((r) => (
                      <li key={r.rank} className="grid grid-cols-[3rem_1fr_6.5rem] items-center gap-3">
                        <span className="font-display text-xl" style={{ color: c.color }}>#{r.rank}</span>
                        <select aria-label={`${c.name} rank ${r.rank}`} value={r.board ?? ''} disabled={busy === `${c.id}-${r.rank}` || !c.boards.length} onChange={(e) => void set(c.id, r.rank, e.target.value || null)} className={field}>
                          <option value="">— choose a board —</option>
                          {c.boards.filter((b) => b.slug === r.board || !takenHere.has(b.slug)).map((b) => <option key={b.slug} value={b.slug}>{b.name}</option>)}
                        </select>
                        <span className="text-right text-sm text-bone">{cr(r.funding)}</span>
                      </li>
                    ))}
                  </ul>
                </Panel>
              );
            })}
          </div>
          <Panel title="REVIEW THE RANKING TABLE">
            <div className="overflow-x-auto"><table className="min-w-full"><thead><tr><th className={th}>COUNCIL</th><th className={th}>RANK</th><th className={th}>BOARD</th><th className={`${th} text-right`}>MONTHLY FUNDING</th></tr></thead>
              <tbody className="divide-y divide-white/5">
                {data.councils.flatMap((c) => c.ranks.map((r) => (
                  <tr key={`${c.id}${r.rank}`}><td className={td}><CouncilTag id={c.id} /></td><td className={td}>{r.rank}</td><td className={td}>{r.boardName ?? <span className="text-smoke">—</span>}</td><td className={`${td} text-right`}>{r.board ? cr(r.funding) : '—'}</td></tr>
                )))}
              </tbody></table></div>
            <p className="mt-3 text-sm text-mist">{data.rankedBoards} of {data.assignedBoards} assigned boards ranked · total {cr(data.totalFunding)} Credits{data.missing.length ? ` · ${data.missing.join('; ')}` : ''}</p>
            {!data.month.rankingsPublished && (confirm ? (
              <Confirm text={`Publish the rankings of ${monthLabel(key)}? Every board sees its council, rank and monthly allocation, and salary submission can begin once the month is enabled.`} yes="YES, PUBLISH" busy={busy === 'publish'} onYes={() => void publish()} onNo={() => setConfirm(false)} />
            ) : (
              <button type="button" disabled={!data.complete} onClick={() => setConfirm(true)} className={`${btn} mt-4`} style={btnGold}>SUBMIT AND PUBLISH RANKINGS</button>
            ))}
            {!data.complete && !data.month.rankingsPublished && <p className="mt-2 text-xs text-smoke">Every board in a council must have a rank before publishing{data.assignedBoards === 0 ? ' (no board is assigned to a council yet)' : ''}.</p>}
          </Panel>
        </>
      )}
    </>
  );
}

