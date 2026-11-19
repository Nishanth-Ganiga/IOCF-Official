import { useEffect, useState } from 'react';
import { api, type PspRequest, type PspRequestDetail } from '../../data/commandApi';
import { CATEGORIES, categoryLabel, monthLabel, REQUEST_STATUSES } from '../../data/commandCenter/psp.mjs';
import { Badge, Confirm, CouncilTag, GOLD, Note, Panel, Tile, btn, btnGhost, btnGold, cr, errText, field, stamp, td, th, useLoad } from './Iocf2Ui';

type Nav = (...parts: string[]) => void;

/* ---------------- salary requests ---------------- */

export function AdminRequests({ id, nav }: { id?: string; nav: Nav }) {
  return id ? <RequestDetail id={id} nav={nav} /> : <RequestList nav={nav} />;
}

function RequestList({ nav }: { nav: Nav }) {
  const [month, setMonth] = useState('');
  const [status, setStatus] = useState('');
  const { data, error } = useLoad<PspRequest[]>(() => api.pspRequests({ month: month || undefined, status: status || undefined }), [month, status]);
  const months = useLoad(() => api.pspMonths(), []);
  return (
    <>
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-[11px] font-semibold tracking-[0.16em] text-mist">MONTH
          <select value={month} onChange={(e) => setMonth(e.target.value)} className={`${field} mt-1 w-48`}><option value="">All months</option>{(months.data?.months ?? []).filter((m) => m.requests > 0).map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}</select>
        </label>
        <label className="text-[11px] font-semibold tracking-[0.16em] text-mist">STATUS
          <select value={status} onChange={(e) => setStatus(e.target.value)} className={`${field} mt-1 w-44`}><option value="">All</option>{REQUEST_STATUSES.filter((s) => s.id !== 'draft').map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select>
        </label>
      </div>
      {error && <Note tone="error">{error}</Note>}
      {!data && !error && <p className="text-sm text-smoke" aria-busy="true">Loading…</p>}
      {data && (
        <Panel title={`SALARY REQUESTS (${data.length})`}>
          {!data.length ? <p className="text-sm text-mist">No board has submitted a salary request{month || status ? ' for this filter' : ' yet'}.</p> : (
            <div className="overflow-x-auto"><table className="min-w-full"><thead><tr><th className={th}>BOARD</th><th className={th}>MONTH</th><th className={th}>COUNCIL</th><th className={th}>RANK</th><th className={`${th} text-right`}>ALLOCATED</th><th className={th}>PLAYERS</th><th className={`${th} text-right`}>SUBMITTED</th><th className={`${th} text-right`}>REMAINING</th><th className={th}>DATE</th><th className={th}>STATUS</th></tr></thead>
              <tbody className="divide-y divide-white/5">
                {data.map((r) => (
                  <tr key={r.id} tabIndex={0} onClick={() => nav('iocf2', 'requests', r.id)} onKeyDown={(e) => e.key === 'Enter' && nav('iocf2', 'requests', r.id)} className="cursor-pointer hover:bg-white/5">
                    <td className={td}>{r.boardName}{r.version > 1 && <span className="ml-1 text-[10px] text-smoke">v{r.version}</span>}</td><td className={td}>{r.monthLabel}</td><td className={td}>{r.council && <CouncilTag id={r.council} />}</td><td className={td}>{r.rank}</td><td className={`${td} text-right`}>{cr(r.allocation)}</td><td className={td}>{r.players}</td><td className={`${td} text-right`}>{cr(r.total)}</td><td className={`${td} text-right`}>{cr(r.remaining)}</td><td className={td}>{stamp(r.submittedAt)}{r.late && <b className="ml-1 text-[10px] text-[#d99a2b]">LATE</b>}</td><td className={td}><Badge status={r.status} /></td>
                  </tr>
                ))}
              </tbody></table></div>
          )}
        </Panel>
      )}
    </>
  );
}

function RequestDetail({ id, nav }: { id: string; nav: Nav }) {
  const { data, error, reload } = useLoad<PspRequestDetail>(() => api.pspRequest(id), [id]);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState('');
  const [mode, setMode] = useState<'' | 'approve' | 'decline'>('');
  const [reason, setReason] = useState('');
  // opening a request that was just submitted starts its review
  useEffect(() => {
    if (data?.status === 'submitted') void api.pspReview(id).then(() => reload(), () => undefined);
  }, [data?.status, id]); // eslint-disable-line react-hooks/exhaustive-deps
  const run = async (key: string, fn: () => Promise<unknown>, ok: string) => {
    setBusy(key);
    setMsg(null);
    try {
      await fn();
      setMode('');
      setReason('');
      await reload();
      setMsg({ ok: true, text: ok });
    } catch (e) {
      setMsg({ ok: false, text: errText(e) });
    }
    setBusy('');
  };
  if (error) return <Note tone="error">{error}</Note>;
  if (!data) return <p className="text-sm text-smoke" aria-busy="true">Loading…</p>;
  const decidable = data.status === 'submitted' || data.status === 'under_review';
  const c = data.checks;
  const yn = (ok: boolean) => <b style={{ color: ok ? '#6fcf8e' : '#e07a7a' }}>{ok ? 'Yes' : 'No'}</b>;
  return (
    <>
      <button type="button" onClick={() => nav('iocf2', 'requests')} className="text-xs font-semibold tracking-[0.2em] text-mist hover:text-bone">← ALL SALARY REQUESTS</button>
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="font-display text-3xl tracking-wide text-bone">{data.boardName?.toUpperCase()} · {data.monthLabel.toUpperCase()}</h2>
        <Badge status={data.status} />
        {data.council && <CouncilTag id={data.council} />}
        {data.late && <span className="text-xs font-semibold text-[#d99a2b]">SUBMITTED AFTER THE DEADLINE</span>}
      </div>
      <p role="status" aria-live="polite" className={`min-h-[1.25rem] text-sm ${msg ? (msg.ok ? 'text-[#6fcf8e]' : 'text-crimson-2') : ''}`}>{msg?.text}</p>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tile label="Monthly rank" value={data.rank ?? '—'} />
        <Tile label="Total allocated budget" value={cr(data.allocation)} color={GOLD} />
        <Tile label="Total proposed salaries" value={cr(data.total)} />
        <Tile label="Remaining credits" value={cr(data.remaining)} color={data.remaining === 0 ? '#2f9e6b' : '#d9534f'} />
      </div>
      <Panel title={`PLAYER SALARY DISTRIBUTION (${data.lines.length} PLAYERS)`}>
        <div className="overflow-x-auto"><table className="min-w-full"><thead><tr><th className={th}>CATEGORY</th><th className={th}>PLAYER</th><th className={`${th} text-right`}>MONTHLY SALARY</th></tr></thead>
          <tbody className="divide-y divide-white/5">
            {CATEGORIES.flatMap((cat) => data.lines.filter((l) => l.category === cat.id).map((l, i) => (
              <tr key={l.key}><td className={td}>{i === 0 ? <b>{cat.label}</b> : <span className="text-smoke">{cat.label}</span>}</td><td className={td}>{l.name}{l.designation && <span className="ml-2 rounded-full border border-[#c9a24b]/60 px-2 py-0.5 text-[10px] text-[#c9a24b]">{l.designation.toUpperCase()}</span>}{l.umpire && <span className="ml-2 rounded-full border border-white/25 px-2 py-0.5 text-[10px] text-mist">UMPIRE</span>}</td><td className={`${td} text-right`}>{cr(l.salary)}</td></tr>
            )))}
          </tbody>
          <tfoot><tr><td className={td} colSpan={2}><b>Total</b></td><td className={`${td} text-right`}><b>{cr(data.total)}</b></td></tr></tfoot></table></div>
      </Panel>
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="VERIFICATION">
          <dl className="grid grid-cols-[1fr_auto] gap-x-6 gap-y-1.5 text-sm">
            <dt className="text-mist">Special Contract player is an active IOCF umpire</dt><dd>{yn(c.specialContractUmpire)}</dd>
            <dt className="text-mist">At least one Elite player is an active IOCF umpire</dt><dd>{yn(c.eliteHasUmpire)}</dd>
            <dt className="text-mist">Every player is registered with this board</dt><dd>{yn(c.allRegistered)}</dd>
            <dt className="text-mist">Every salary is a multiple of 100</dt><dd>{yn(c.multiplesOf100)}</dd>
            <dt className="text-mist">Total equals the full allocation</dt><dd>{yn(c.totalMatchesAllocation)}</dd>
            <dt className="text-mist">Category eligibility and limits</dt><dd>{yn(c.problems.length === 0)}</dd>
          </dl>
          {c.problems.length > 0 && <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-crimson-2">{c.problems.map((p) => <li key={p}>{p}</li>)}</ul>}
          {c.officials.length > 0 && <p className="mt-3 text-sm text-mist">Chairman / CEO inside the player positions: {c.officials.map((o) => `${o.name} (${o.designation}, ${o.category})`).join(' · ')}</p>}
          <p className="mt-3 text-xs text-smoke">Umpires checked: {c.umpireVerification.map((u) => `${u.name} (${u.category}) ${u.umpire ? '✓' : '✗'}`).join(' · ') || '—'}</p>
        </Panel>
        <Panel title="HOW THE SALARIES WERE CALCULATED">
          <div className="overflow-x-auto"><table className="min-w-full"><thead><tr><th className={th}>CATEGORY</th><th className={`${th} text-right`}>SHARE</th><th className={`${th} text-right`}>PART OF BUDGET</th><th className={th}>PLAYERS</th><th className={`${th} text-right`}>EACH</th></tr></thead>
            <tbody className="divide-y divide-white/5">
              {data.breakdown.map((b) => <tr key={b.category}><td className={td}>{categoryLabel(b.category)}</td><td className={`${td} text-right`}>{(b.weightBp / 100).toFixed(2)}%</td><td className={`${td} text-right`}>{cr(b.pool)}</td><td className={td}>{b.players}</td><td className={`${td} text-right`}>{cr(b.share)}</td></tr>)}
            </tbody></table></div>
          <p className="mt-2 text-xs text-smoke">Players share their category's part equally in multiples of 100. What is left (rounding, and the part of any empty category) is added to the Special Contract salary, so the full allocation is used.</p>
        </Panel>
      </div>
      {data.versions.length > 1 && (
        <Panel title="VERSIONS">
          <ul className="space-y-1 text-sm">{data.versions.map((v) => <li key={v.id} className="text-mist">Version {v.version}: <Badge status={v.status} />{v.reason ? ` · ${v.reason}` : ''}{v.submittedAt ? ` · submitted ${stamp(v.submittedAt)}` : ''}</li>)}</ul>
        </Panel>
      )}
      {data.reason && <Note tone="warn">Declined: {data.reason}</Note>}
      {data.status === 'credited' && <Note tone="ok">Credited {stamp(data.creditedAt)}. The verified salary records and credit transactions are in Salary Records.</Note>}
      {decidable && (
        <Panel title="DECISION">
          {mode === '' && (
            <div className="flex flex-wrap gap-3">
              <button type="button" onClick={() => setMode('approve')} className={btn} style={btnGold}>APPROVE SALARY</button>
              <button type="button" onClick={() => setMode('decline')} className={btnGhost}>DECLINE SALARY</button>
            </div>
          )}
          {mode === 'approve' && <Confirm text={`Approve ${data.boardName}'s ${data.monthLabel} salaries? ${cr(data.total)} Credits are credited to ${data.lines.length} players, once. The distribution is then locked.`} yes="YES, APPROVE AND CREDIT" busy={busy === 'approve'} onYes={() => void run('approve', () => api.pspApprove(id), 'Approved. The salaries are credited and the records updated.')} onNo={() => setMode('')} />}
          {mode === 'decline' && (
            <div>
              <label className="block text-[11px] font-semibold tracking-[0.16em] text-smoke">REASON FOR DECLINING (THE BOARD SEES IT)
                <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} maxLength={400} className={`${field} mt-1`} />
              </label>
              <div className="mt-3 flex flex-wrap gap-3">
                <button type="button" disabled={busy === 'decline' || reason.trim().length < 3} onClick={() => void run('decline', () => api.pspDecline(id, reason), 'Declined. The board can correct it and resubmit.')} className={btn} style={{ background: '#d9534f', color: '#fff' }}>{busy === 'decline' ? 'WORKING…' : 'CONFIRM DECLINE'}</button>
                <button type="button" onClick={() => setMode('')} className="text-xs font-semibold tracking-[0.16em] text-mist hover:text-bone">CANCEL</button>
              </div>
            </div>
          )}
        </Panel>
      )}
    </>
  );
}

/* ---------------- salary records ---------------- */

export function AdminRecords() {
  const [f, setF] = useState({ year: '', month: '', board: '', q: '' });
  const { data, error } = useLoad(() => api.pspRecords(f), [f.year, f.month, f.board, f.q]);
  const boards = useLoad(() => api.pspCouncils(), []);
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-[11px] font-semibold tracking-[0.16em] text-mist">YEAR<input value={f.year} onChange={(e) => setF({ ...f, year: e.target.value })} inputMode="numeric" placeholder="2027" className={`${field} mt-1`} /></label>
        <label className="text-[11px] font-semibold tracking-[0.16em] text-mist">MONTH
          <select value={f.month} onChange={(e) => setF({ ...f, month: e.target.value })} className={`${field} mt-1`}><option value="">All</option>{Array.from({ length: 12 }, (_, i) => `${f.year || '2027'}-${String(i + 1).padStart(2, '0')}`).map((k) => <option key={k} value={k}>{monthLabel(k)}</option>)}</select>
        </label>
        <label className="text-[11px] font-semibold tracking-[0.16em] text-mist">BOARD
          <select value={f.board} onChange={(e) => setF({ ...f, board: e.target.value })} className={`${field} mt-1`}><option value="">All boards</option>{(boards.data?.boards ?? []).map((b) => <option key={b.slug} value={b.slug}>{b.name}</option>)}</select>
        </label>
        <label className="text-[11px] font-semibold tracking-[0.16em] text-mist">PLAYER<input value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} placeholder="Search a player" className={`${field} mt-1`} /></label>
      </div>
      {error && <Note tone="error">{error}</Note>}
      {!data && !error && <p className="text-sm text-smoke" aria-busy="true">Loading…</p>}
      {data && (
        <Panel title={`VERIFIED SALARY RECORDS (${data.total})`}>
          {!data.records.length ? <p className="text-sm text-mist">No verified salary record yet. A record is made only when a salary request is approved and credited.</p> : (
            <div className="overflow-x-auto"><table className="min-w-full"><thead><tr><th className={th}>MONTH</th><th className={th}>BOARD</th><th className={th}>PLAYER</th><th className={th}>CATEGORY</th><th className={`${th} text-right`}>SALARY</th><th className={th}>CREDITED</th><th className={th}>REFERENCE</th></tr></thead>
              <tbody className="divide-y divide-white/5">
                {data.records.map((r) => <tr key={r.id}><td className={td}>{r.monthLabel}</td><td className={td}>{r.boardName}</td><td className={td}>{r.player}{r.designation && <span className="ml-2 text-[10px] text-[#c9a24b]">{r.designation.toUpperCase()}</span>}</td><td className={td}>{r.categoryLabel}</td><td className={`${td} text-right`}>{cr(r.salary)}</td><td className={td}>{stamp(r.creditedAt)}</td><td className={`${td} font-mono text-xs text-mist`}>{r.reference}</td></tr>)}
              </tbody></table></div>
          )}
          {data.total > data.records.length && <p className="mt-2 text-xs text-smoke">Showing the latest {data.records.length}. Narrow the filters to see the rest.</p>}
        </Panel>
      )}
    </>
  );
}

/* ---------------- salary settings ---------------- */

export function AdminSettings() {
  const { data, error, reload } = useLoad(() => api.pspSettings(), []);
  const [vals, setVals] = useState<Record<string, string> | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (data) setVals(Object.fromEntries(CATEGORIES.map((c) => [c.id, data.percent ? String(data.percent[c.id]) : ''])));
  }, [data]);
  if (error) return <Note tone="error">{error}</Note>;
  if (!data || !vals) return <p className="text-sm text-smoke" aria-busy="true">Loading…</p>;
  const total = CATEGORIES.reduce((n, c) => n + (Number(vals[c.id]) || 0), 0);
  const ok = Math.abs(total - 100) < 0.0001 && CATEGORIES.every((c) => vals[c.id] !== '' && Number(vals[c.id]) >= 0);
  const save = async () => {
    setBusy(true);
    setMsg(null);
    try {
      await api.pspSaveSettings(vals);
      await reload();
      setMsg({ ok: true, text: 'The salary distribution is saved. Boards can now calculate and submit salaries.' });
    } catch (e) {
      setMsg({ ok: false, text: errText(e) });
    }
    setBusy(false);
  };
  return (
    <>
      <Note tone={data.complete ? 'ok' : 'warn'}>{data.complete ? 'The salary distribution is configured. Changing it affects drafts and new submissions only; requests already submitted keep the percentages they were calculated with.' : `The salary distribution is not configured yet: ${data.problem ?? ''} Boards cannot submit salaries until it is complete.`}</Note>
      <Panel title="CATEGORY SALARY DISTRIBUTION">
        <p className="mb-4 text-sm text-mist">IOCF has not set a fixed salary for each category, so none is invented here. Instead, enter what share of a board's monthly allocation each category receives. The shares must total exactly 100%. The players of a category share its part equally in multiples of 100; whatever is left (rounding, or the part of a category with no players) is added to the Special Contract player so the whole allocation is distributed.</p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {CATEGORIES.map((c) => (
            <label key={c.id} className="block text-[11px] font-semibold tracking-[0.16em] text-smoke">{c.label.toUpperCase()}{c.max ? ` · UP TO ${c.max}` : ' · ALL REMAINING'}
              <span className="mt-1 flex items-center gap-2"><input value={vals[c.id]} onChange={(e) => setVals({ ...vals, [c.id]: e.target.value })} inputMode="decimal" className={field} /><span className="text-sm text-mist">%</span></span>
            </label>
          ))}
        </div>
        <p className="mt-4 text-sm" style={{ color: ok ? '#6fcf8e' : '#e07a7a' }}>Total: {Number.isFinite(total) ? total.toFixed(2) : '—'}% {ok ? '✓' : '(must be 100%)'}</p>
        <button type="button" disabled={!ok || busy} onClick={() => void save()} className={`${btn} mt-3`} style={btnGold}>{busy ? 'SAVING…' : 'SAVE SALARY DISTRIBUTION'}</button>
        <p role="status" aria-live="polite" className={`mt-2 min-h-[1.2rem] text-sm ${msg ? (msg.ok ? 'text-[#6fcf8e]' : 'text-crimson-2') : ''}`}>{msg?.text}</p>
      </Panel>
      <Panel title="OFFICIAL COUNCIL FUNDING (FIXED)">
        <div className="overflow-x-auto"><table className="min-w-full"><thead><tr><th className={th}>COUNCIL</th><th className={`${th} text-right`}>MONTHLY FUNDING</th></tr></thead>
          <tbody className="divide-y divide-white/5">{data.councilFunding.map((c) => <tr key={c.id}><td className={td}>{c.name}</td><td className={`${td} text-right`}>{cr(c.monthly)}</td></tr>)}
            <tr><td className={td}><b>Total per month</b></td><td className={`${td} text-right`}><b>{cr(data.monthlyFunding)}</b></td></tr>
            <tr><td className={td}><b>Total per year</b></td><td className={`${td} text-right`}><b>{cr(data.annualFunding)}</b></td></tr></tbody></table></div>
        <p className="mt-2 text-xs text-smoke">Credits are whole numbers. The funding of each rank is fixed in the system (the official table) and cannot be edited here or by a board.</p>
      </Panel>
    </>
  );
}
