import { useEffect, useMemo, useState } from 'react';
import { api, type PspBoardMonth, type PspRequest } from '../../data/commandApi';
import { paletteOf, type BoardTheme } from '../../data/commandCenter/boardConfig';
import { CATEGORIES, TOP_CLASS_MONTHS, calculate, categoryLabel, selectionProblems, type SalaryLine } from '../../data/commandCenter/psp.mjs';
import { Badge, CouncilTag, Confirm, Note, btn, cr, day, errText, field, stamp, td, th, useLoad } from './Iocf2Ui';

const TABS = [
  { id: 'salary', label: 'Players Salary' },
  { id: 'history', label: 'Monthly Salary History' },
  { id: 'records', label: 'Player Salary Records' },
];

/** IOCF 2.0 inside a board's Command Center: the chairman prepares and submits the monthly player salaries. */
export default function BoardIocf2({ theme, sub, go }: { theme: BoardTheme; sub?: string; go: (next?: string) => void }) {
  const pal = paletteOf(theme);
  const tab = TABS.some((t) => t.id === sub) ? (sub as string) : 'salary';
  const list = useLoad(() => api.pspBoard(theme.slug), [theme.slug]);
  const [month, setMonth] = useState('');
  const months = list.data?.months ?? [];
  // the first month the administrator enabled (or January 2027) is shown to begin with
  useEffect(() => {
    if (!month && months.length) setMonth((months.find((m) => m.enabled && m.rankingsPublished) ?? months.find((m) => m.enabled) ?? months[0]).key);
  }, [months, month]);
  const link = `rounded-full border px-4 py-2 text-xs font-semibold tracking-[0.12em] transition`;
  return (
    <div className="mt-8">
      <nav aria-label="IOCF 2.0 sections" className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button key={t.id} type="button" aria-current={tab === t.id ? 'page' : undefined} onClick={() => go(t.id)} className={link} style={tab === t.id ? { background: pal.highlight, borderColor: pal.highlight, color: '#0b0b0f' } : { borderColor: 'rgba(255,255,255,0.18)', color: '#b9b8c0' }}>
            {t.label.toUpperCase()}
          </button>
        ))}
      </nav>
      {list.error && <div className="mt-6"><Note tone="error">{list.error}</Note></div>}
      {!list.data && !list.error && <p className="mt-6 text-sm text-smoke" aria-busy="true">Loading…</p>}
      {list.data && tab === 'salary' && <Salary theme={theme} month={month} setMonth={setMonth} months={months} reloadList={list.reload} configProblem={list.data.configProblem} />}
      {list.data && tab === 'history' && <History theme={theme} months={months} open={(k) => { setMonth(k); go('salary'); }} />}
      {list.data && tab === 'records' && <Records theme={theme} />}
    </div>
  );
}

/* ---------------- players salary ---------------- */

function Salary({ theme, month, setMonth, months, reloadList, configProblem }: { theme: BoardTheme; month: string; setMonth: (k: string) => void; months: { key: string; label: string; enabled: boolean }[]; reloadList: () => Promise<void>; configProblem: string | null }) {
  const pal = paletteOf(theme);
  const { data, error, reload } = useLoad<PspBoardMonth>(() => (month ? api.pspBoardMonth(theme.slug, month) : Promise.reject(new Error('none'))), [theme.slug, month]);
  const [editing, setEditing] = useState(false);
  useEffect(() => setEditing(false), [month]);
  return (
    <div className="mt-6 space-y-6">
      <label className="block max-w-sm text-[11px] font-semibold tracking-[0.18em]" style={{ color: pal.highlight }}>SELECT SALARY MONTH
        <select value={month} onChange={(e) => setMonth(e.target.value)} className={`${field} mt-1`}>
          {months.map((m) => <option key={m.key} value={m.key}>{m.label}{m.enabled ? '' : ' — not enabled yet'}</option>)}
        </select>
      </label>
      {error && month && <Note tone="error">{error}</Note>}
      {!data && !error && <p className="text-sm text-smoke" aria-busy="true">Loading…</p>}
      {data && !editing && <MonthView theme={theme} d={data} onEdit={() => setEditing(true)} />}
      {data && editing && <Editor theme={theme} d={data} onDone={async () => { setEditing(false); await reload(); await reloadList(); }} />}
      {configProblem && <p className="hidden">{configProblem}</p>}
    </div>
  );
}

const Box = ({ children, theme }: { children: React.ReactNode; theme: BoardTheme }) => <section className="rounded-2xl border bg-black/60 p-5 backdrop-blur-sm" style={{ borderColor: `${paletteOf(theme).highlight}55` }}>{children}</section>;

function MonthView({ theme, d, onEdit }: { theme: BoardTheme; d: PspBoardMonth; onEdit: () => void }) {
  const pal = paletteOf(theme);
  const r = d.request;
  const s = d.month.schedule;
  const total = r?.total ?? 0;
  const label = d.state.canEdit ? (!r ? 'SUBMIT PLAYER SALARY' : r.status === 'rejected' ? 'REJECTED – CORRECT AND RESUBMIT' : 'CONTINUE DRAFT') : null;
  const status = r ? r.status : d.month.enabled ? 'not_submitted' : 'not_started';
  return (
    <>
      <Box theme={theme}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-[11px] font-semibold tracking-[0.24em]" style={{ color: pal.highlight }}>{theme.name.toUpperCase()} BOARD · {d.month.label.toUpperCase()}</p>
          <Badge status={d.month.status} label={d.month.statusLabel} />
        </div>
        <dl className="mt-4 grid gap-x-8 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
          {[
            ['Council', d.council ?? 'Not assigned yet'],
            ['Monthly rank', d.rank ?? '—'],
            ['Monthly allocated credits', d.allocation === null ? '—' : cr(d.allocation)],
            ['Submission deadline', stamp(d.month.deadlineAt)],
            ['Salary request', r ? <Badge key="b" status={r.status} /> : <span key="n" className="text-mist">{d.month.enabled ? 'Not submitted' : 'Not enabled'}</span>],
            ['Remaining available credits', d.allocation === null ? '—' : cr(d.allocation - total)],
          ].map(([k, v]) => <div key={String(k)}><dt className="text-[10px] font-semibold tracking-[0.18em] text-smoke">{String(k).toUpperCase()}</dt><dd className="mt-0.5 text-bone">{v}</dd></div>)}
        </dl>
        <p className="mt-4 text-xs leading-relaxed text-mist">Monthly cycle: <b className="text-bone">{day(s.announce)}</b> rankings and funds announced · <b className="text-bone">{day(s.submitFrom)}–{day(s.submitUntil)}</b> chairmen submit salaries · <b className="text-bone">{day(s.verifyFrom)}–{day(s.verifyUntil)}</b> IOCF verifies, then salaries are credited after approval.</p>
        {d.month.note && <p className="mt-2 text-xs" style={{ color: '#e9b44c' }}>Note from IOCF: {d.month.note}</p>}
      </Box>
      {d.allocation !== null && d.council && <div className="flex items-center gap-3 text-xs text-mist">Your allocation comes from IOCF's published ranking and cannot be changed by the board. <CouncilTag id={(d.request?.council ?? '') || (d.council.replace('Council of ', '').toLowerCase())} /></div>}
      {!d.state.canEdit && d.state.message && !r && <Note tone="info">{d.state.message}</Note>}
      {!d.configComplete && d.allocation !== null && <Note tone="warn">{d.configProblem ?? 'The salary distribution has not been configured by IOCF Administration yet.'} You can submit once it is complete.</Note>}
      {r?.status === 'rejected' && r.reason && <Note tone="error"><b>IOCF declined this salary request:</b> {r.reason} Correct the distribution and resubmit.</Note>}
      {r && (r.status === 'submitted' || r.status === 'under_review') && <Note tone="info">Submitted {stamp(r.submittedAt)}{r.late ? ' (after the deadline)' : ''}. It is locked and with IOCF Administration for review{r.status === 'under_review' ? ' (under review now)' : ''}.</Note>}
      {r && (r.status === 'approved' || r.status === 'credited') && <Note tone="ok">{r.status === 'credited' ? `Salary credited ${stamp(r.creditedAt)}.` : 'Approved.'} The verified salary records are in Player Salary Records.</Note>}
      {label && (
        <button type="button" onClick={onEdit} className={btn} style={{ background: pal.highlight, color: '#0b0b0f' }}>{label}</button>
      )}
      {!label && !r && !d.state.canEdit && <p className="text-xs text-smoke">{status === 'not_started' ? 'Player Salary submission is not yet enabled by IOCF Administration.' : ''}</p>}
      {r && r.lines.length > 0 && <Summary theme={theme} r={r} />}
      {d.previous.length > 0 && (
        <Box theme={theme}>
          <p className="text-[11px] font-semibold tracking-[0.24em]" style={{ color: pal.highlight }}>EARLIER VERSIONS</p>
          <ul className="mt-2 space-y-1 text-sm text-mist">{d.previous.map((p) => <li key={p.id}>Version {p.version}: <Badge status={p.status} />{p.reason ? ` · ${p.reason}` : ''}{p.decidedAt ? ` · ${stamp(p.decidedAt)}` : ''}</li>)}</ul>
        </Box>
      )}
    </>
  );
}

function Summary({ theme, r }: { theme: BoardTheme; r: PspRequest }) {
  const pal = paletteOf(theme);
  const priced = r.lines.every((l) => l.salary !== null);
  return (
    <Box theme={theme}>
      <p className="text-[11px] font-semibold tracking-[0.24em]" style={{ color: pal.highlight }}>SALARY DISTRIBUTION · VERSION {r.version}</p>
      <div className="mt-3 overflow-x-auto"><table className="min-w-full"><thead><tr><th className={th}>CATEGORY</th><th className={th}>PLAYER</th><th className={`${th} text-right`}>MONTHLY SALARY</th></tr></thead>
        <tbody className="divide-y divide-white/5">
          {CATEGORIES.flatMap((c) => r.lines.filter((l) => l.category === c.id).map((l, i) => <tr key={l.key}><td className={td}>{i === 0 ? <b>{c.label}</b> : <span className="text-smoke">{c.label}</span>}</td><td className={td}>{l.name}{l.designation && <span className="ml-2 text-[10px]" style={{ color: pal.highlight }}>{l.designation.toUpperCase()}</span>}</td><td className={`${td} text-right`}>{priced ? cr(l.salary) : '—'}</td></tr>))}
        </tbody>
        <tfoot><tr><td className={td} colSpan={2}><b>Total distributed</b></td><td className={`${td} text-right`}><b>{cr(r.total)}</b></td></tr></tfoot></table></div>
    </Box>
  );
}

/* ---------------- the salary editor ---------------- */

type Picks = Record<string, string[]>;

function Editor({ theme, d, onDone }: { theme: BoardTheme; d: PspBoardMonth; onDone: () => Promise<void> }) {
  const pal = paletteOf(theme);
  const slots = (max: number | null, have: number) => (max === null ? Math.max(have, 1) : max);
  const initial = useMemo<Picks>(() => {
    const p: Picks = {};
    for (const c of CATEGORIES) {
      const chosen = (d.request?.lines ?? []).filter((l) => l.category === c.id).map((l) => l.key);
      p[c.id] = [...chosen, ...Array(Math.max(0, slots(c.max, chosen.length) - chosen.length)).fill('')];
    }
    return p;
  }, [d.request?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const [picks, setPicks] = useState<Picks>(initial);
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [review, setReview] = useState(false);
  const roster = d.roster;
  const byKey = new Map(roster.map((p) => [p.key, p]));
  const lines: SalaryLine[] = CATEGORIES.flatMap((c) => picks[c.id].filter(Boolean).map((key) => ({ category: c.id, key, name: byKey.get(key)?.name, designation: byKey.get(key)?.designation ?? null }))) as SalaryLine[];
  const taken = new Set(lines.map((l) => l.key));
  const problems = selectionProblems(lines, roster, { complete: true });
  const budget = d.allocation ?? 0;
  const calc = calculate({ budget, weights: d.weights, lines });
  const salary = new Map(calc.ok ? calc.lines.map((l) => [l.key, l.salary]) : []);
  const ready = calc.ok && problems.length === 0;
  const set = (cat: string, i: number, key: string) => setPicks({ ...picks, [cat]: picks[cat].map((v, k) => (k === i ? key : v)) });
  const tag = (p: { designation: string | null; umpire: boolean }) => `${p.designation ? ` — ${p.designation}` : ''}${p.umpire ? ' · Umpire' : ''}`;

  const save = async (final: boolean) => {
    setBusy(final ? 'submit' : 'draft');
    setMsg(null);
    const body = lines.map((l) => ({ category: l.category, key: l.key }));
    try {
      if (final) await api.pspSubmit(theme.slug, d.month.key, body);
      else await api.pspSaveDraft(theme.slug, d.month.key, body);
      if (final) {
        await onDone();
        return;
      }
      setMsg({ ok: true, text: 'Draft saved. Nothing has been sent to IOCF yet.' });
    } catch (e) {
      setMsg({ ok: false, text: errText(e) });
      setReview(false);
    }
    setBusy('');
  };

  return (
    <div className="space-y-5">
      <Box theme={theme}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-[11px] font-semibold tracking-[0.24em]" style={{ color: pal.highlight }}>SUBMIT PLAYER SALARY · {d.month.label.toUpperCase()}</p>
          <button type="button" onClick={() => void onDone()} className="text-xs font-semibold tracking-[0.16em] text-mist hover:text-bone">← BACK</button>
        </div>
        <dl className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
          {[['Monthly allocation', cr(budget)], ['Total distributed', calc.ok ? cr(calc.total) : '—'], ['Remaining balance', calc.ok ? cr(calc.remaining) : cr(budget)], ['Players chosen', lines.length]].map(([k, v]) => <div key={String(k)}><dt className="text-[10px] font-semibold tracking-[0.18em] text-smoke">{String(k).toUpperCase()}</dt><dd className="mt-0.5 font-display text-2xl text-bone">{v}</dd></div>)}
        </dl>
        <p className="mt-3 text-xs text-mist">Choose players from your registered list. Salaries are calculated for you from your allocation and IOCF's salary distribution, in multiples of 100; the Special Contract salary also receives any rounding balance, so your whole allocation is used. The Chairman and CEO are ordinary players: they take a normal place in a category.</p>
      </Box>

      {CATEGORIES.map((c) => (
        <Box key={c.id} theme={theme}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-display text-xl tracking-wide text-bone">{c.label.toUpperCase()}</p>
            <p className="text-xs text-smoke">{c.max === null ? 'All remaining players' : `Up to ${c.max} player${c.max === 1 ? '' : 's'}`}{c.id === 'special_contract' ? ' · must be an active IOCF umpire' : c.id === 'elite' ? ' · at least one must be an active IOCF umpire' : ''}</p>
          </div>
          <ul className="mt-3 space-y-2">
            {picks[c.id].map((key, i) => {
              const options = roster.filter((p) => (key === p.key || !taken.has(p.key)) && (c.id !== 'special_contract' || p.umpire));
              return (
                <li key={`${c.id}-${i}`} className="grid grid-cols-[1fr_auto] items-center gap-3 sm:grid-cols-[1fr_9rem_auto]">
                  <select aria-label={`${c.label} player ${i + 1}`} value={key} onChange={(e) => set(c.id, i, e.target.value)} className={field}>
                    <option value="">— choose a player —</option>
                    {options.map((p) => <option key={p.key} value={p.key}>{p.name}{tag(p)}</option>)}
                  </select>
                  <span className="hidden text-right text-sm text-bone sm:block">{key && salary.has(key) ? `${cr(salary.get(key))} Credits` : '—'}</span>
                  {c.max === null ? <button type="button" onClick={() => setPicks({ ...picks, [c.id]: picks[c.id].filter((_, k) => k !== i).concat(picks[c.id].length === 1 ? [''] : []) })} className="text-xs font-semibold text-mist hover:text-crimson-2" aria-label="Remove this player">✕</button> : <span />}
                  {key && salary.has(key) && <span className="col-span-2 text-right text-xs text-mist sm:hidden">{cr(salary.get(key))} Credits</span>}
                </li>
              );
            })}
          </ul>
          {c.max === null && <button type="button" onClick={() => setPicks({ ...picks, [c.id]: [...picks[c.id], ''] })} className="mt-3 text-xs font-semibold tracking-[0.14em]" style={{ color: pal.highlight }}>+ ADD ANOTHER EMERGING PLAYER</button>}
        </Box>
      ))}

      <Box theme={theme}>
        <p className="text-[11px] font-semibold tracking-[0.24em]" style={{ color: pal.highlight }}>SALARY SUMMARY</p>
        {calc.ok ? (
          <div className="mt-3 overflow-x-auto"><table className="min-w-full"><thead><tr><th className={th}>DESCRIPTION</th><th className={`${th} text-right`}>CREDITS</th></tr></thead>
            <tbody className="divide-y divide-white/5">
              <tr><td className={td}>Monthly board allocation</td><td className={`${td} text-right`}>{cr(budget)}</td></tr>
              {CATEGORIES.map((c) => <tr key={c.id}><td className={td}>{c.label} salar{c.id === 'special_contract' ? 'y' : 'ies'}</td><td className={`${td} text-right`}>{cr(calc.lines.filter((l) => l.category === c.id).reduce((n, l) => n + l.salary, 0))}</td></tr>)}
              <tr><td className={td}><b>Total distributed salary</b></td><td className={`${td} text-right`}><b>{cr(calc.total)}</b></td></tr>
              <tr><td className={td}>Remaining balance</td><td className={`${td} text-right`}>{cr(calc.remaining)}</td></tr>
            </tbody></table></div>
        ) : <p className="mt-2 text-sm text-mist">{calc.error}</p>}
        <details className="mt-3 text-xs text-mist"><summary className="cursor-pointer font-semibold tracking-[0.14em]" style={{ color: pal.highlight }}>HOW THE SALARIES ARE CALCULATED</summary>
          {calc.ok && (
            <div className="mt-2 overflow-x-auto"><table className="min-w-full"><thead><tr><th className={th}>CATEGORY</th><th className={`${th} text-right`}>SHARE</th><th className={`${th} text-right`}>PART OF BUDGET</th><th className={th}>PLAYERS</th><th className={`${th} text-right`}>EACH</th></tr></thead>
              <tbody className="divide-y divide-white/5">{calc.breakdown.map((b) => <tr key={b.category}><td className={td}>{categoryLabel(b.category)}</td><td className={`${td} text-right`}>{(b.weightBp / 100).toFixed(2)}%</td><td className={`${td} text-right`}>{cr(b.pool)}</td><td className={td}>{b.players}</td><td className={`${td} text-right`}>{cr(b.share)}</td></tr>)}</tbody></table>
              <p className="mt-2">Added to the Special Contract salary as the rounding balance: {cr(calc.remainder)} Credits.</p></div>
          )}
        </details>
        {problems.length > 0 && <ul className="mt-3 list-disc space-y-1 pl-5 text-sm" style={{ color: '#e9a0a0' }}>{problems.map((p) => <li key={p}>{p}</li>)}</ul>}
        <p role="status" aria-live="polite" className={`mt-3 min-h-[1.2rem] text-sm ${msg ? (msg.ok ? 'text-[#6fcf8e]' : 'text-crimson-2') : ''}`}>{msg?.text}</p>
        {!review ? (
          <div className="mt-2 flex flex-wrap gap-3">
            <button type="button" disabled={busy !== ''} onClick={() => void save(false)} className="rounded-lg border border-white/25 px-5 py-2.5 text-xs font-bold tracking-[0.18em] text-bone hover:border-white/60 disabled:opacity-50">{busy === 'draft' ? 'SAVING…' : 'SAVE DRAFT'}</button>
            <button type="button" disabled={!ready || busy !== ''} onClick={() => setReview(true)} className={btn} style={{ background: pal.highlight, color: '#0b0b0f' }}>REVIEW AND SUBMIT</button>
          </div>
        ) : (
          <Confirm text={`Submit ${cr(calc.ok ? calc.total : 0)} Credits for ${lines.length} players to IOCF Administration for ${d.month.label}? Once submitted this version is locked; you can only change it if IOCF declines it.`} yes="SUBMIT TO IOCF ADMINISTRATION" busy={busy === 'submit'} onYes={() => void save(true)} onNo={() => setReview(false)} />
        )}
      </Box>
    </div>
  );
}

/* ---------------- monthly salary history ---------------- */

function History({ theme, months, open }: { theme: BoardTheme; months: Awaited<ReturnType<typeof api.pspBoard>>['months']; open: (key: string) => void }) {
  const pal = paletteOf(theme);
  const shown = months.filter((m) => m.enabled || m.request);
  return (
    <div className="mt-6">
      <Box theme={theme}>
        <p className="text-[11px] font-semibold tracking-[0.24em]" style={{ color: pal.highlight }}>MONTHLY SALARY HISTORY</p>
        {!shown.length ? <p className="mt-3 text-sm text-mist">No salary month has been enabled by IOCF Administration yet. January 2027 is the first.</p> : (
          <div className="mt-3 overflow-x-auto"><table className="min-w-full"><thead><tr><th className={th}>MONTH</th><th className={th}>COUNCIL</th><th className={th}>RANK</th><th className={`${th} text-right`}>ALLOCATED</th><th className={`${th} text-right`}>SALARIES</th><th className={th}>STATUS</th><th className={th} /></tr></thead>
            <tbody className="divide-y divide-white/5">
              {shown.map((m) => (
                <tr key={m.key}><td className={td}>{m.label}</td><td className={td}>{m.council ?? '—'}</td><td className={td}>{m.rank ?? '—'}</td><td className={`${td} text-right`}>{cr(m.allocation)}</td><td className={`${td} text-right`}>{m.request ? cr(m.request.total) : '—'}</td><td className={td}>{m.request ? <Badge status={m.request.status} /> : <Badge status={m.enabled ? 'not_submitted' : 'not_started'} label={m.enabled ? 'Not submitted' : 'Not enabled'} />}</td><td className={td}><button type="button" onClick={() => open(m.key)} className="text-xs font-semibold tracking-[0.12em]" style={{ color: pal.highlight }}>OPEN →</button></td></tr>
              ))}
            </tbody></table></div>
        )}
      </Box>
    </div>
  );
}

/* ---------------- player salary records ---------------- */

function Records({ theme }: { theme: BoardTheme }) {
  const pal = paletteOf(theme);
  const { data, error } = useLoad(() => api.pspBoardRecords(theme.slug), [theme.slug]);
  if (error) return <div className="mt-6"><Note tone="error">{error}</Note></div>;
  if (!data) return <p className="mt-6 text-sm text-smoke" aria-busy="true">Loading…</p>;
  return (
    <div className="mt-6 space-y-5">
      <Box theme={theme}>
        <p className="text-[11px] font-semibold tracking-[0.24em]" style={{ color: pal.highlight }}>PLAYER SALARY RECORDS</p>
        <p className="mt-2 text-sm text-mist">Only salaries that IOCF approved and credited are verified records. {TOP_CLASS_MONTHS} consecutive verified months is the first step of the IOCF Top Class pathway; IOCF Administration makes the final decision, so no status is granted here.</p>
      </Box>
      {!data.players.length ? <Note tone="info">No salary has been credited to your players yet.</Note> : data.players.map((p) => (
        <Box key={p.key} theme={theme}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="font-display text-xl tracking-wide text-bone">{p.name.toUpperCase()}{p.designation && <span className="ml-3 text-[10px] tracking-[0.16em]" style={{ color: pal.highlight }}>{p.designation.toUpperCase()}</span>}</p>
            <p className="text-xs text-mist">{p.verifiedMonths} verified month{p.verifiedMonths === 1 ? '' : 's'} · {p.consecutive} in a row now · best run {p.best} of {data.topClassMonths}{p.topClassReady ? ' — ready for IOCF Top Class review' : ''}</p>
          </div>
          <div className="mt-2 overflow-x-auto"><table className="min-w-full"><thead><tr><th className={th}>MONTH</th><th className={th}>CATEGORY</th><th className={`${th} text-right`}>SALARY</th><th className={th}>CREDITED</th><th className={th}>REFERENCE</th></tr></thead>
            <tbody className="divide-y divide-white/5">{p.records.map((r) => <tr key={r.id}><td className={td}>{r.monthLabel}</td><td className={td}>{r.categoryLabel}</td><td className={`${td} text-right`}>{cr(r.salary)}</td><td className={td}>{stamp(r.creditedAt)}</td><td className={`${td} font-mono text-xs text-mist`}>{r.reference}</td></tr>)}</tbody></table></div>
        </Box>
      ))}
    </div>
  );
}
