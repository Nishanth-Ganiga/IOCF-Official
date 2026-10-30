import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { api, ApiError, type Series, type SeriesInput, type SeriesOverview } from '../../data/commandApi';
import { BOARD_THEMES, paletteOf, type BoardTheme } from '../../data/commandCenter/boardConfig';
import cfg from '../../data/commandCenter/series.json';
import { buildFixtures, stadiumBoards } from '../../data/commandCenter/fixtures.mjs';

type Go = (sub?: string) => void;

const TYPES = cfg.types;
const money = (n: number) => `₹${n.toLocaleString('en-IN')}`;
const ist = (ms: number) => new Date(ms).toLocaleDateString('en-GB', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric' });
const typeLabel = (id: string) => TYPES.find((t) => t.id === id)?.label ?? id;
const formatLabel = (s: Series) => (s.clubFormat ? `Club · ${s.clubFormat}` : s.format);

const EMPTY: SeriesInput = { name: '', type: '', opponents: [], matches: 0, stadiums: [], bet: 0, format: '' };

/**
 * Series Announcement: three tiles — announce a series, accept the series, upcoming series. All rules (the 2-series limit, the
 * 11:59 PM IST deadline, editing until accepted) are enforced by the server; this screen only shows what it allows.
 */
export default function SeriesAnnouncement({ theme, sub, admin, go }: { theme: BoardTheme; sub?: string; admin: boolean; go: Go }) {
  const [data, setData] = useState<SeriesOverview | null>(null);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    try {
      setData(await api.series(theme.slug));
      setError('');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Something went wrong.');
    }
  }, [theme.slug]);
  useEffect(() => {
    setData(null);
    void load();
  }, [load]);

  const pal = paletteOf(theme);
  if (error)
    return (
      <p role="alert" className="mt-8 rounded-xl border border-crimson/40 bg-black/70 px-5 py-4 text-sm text-mist">
        {error}{' '}
        <button type="button" onClick={() => void load()} className="font-semibold underline" style={{ color: pal.highlight }}>
          Try again
        </button>
      </p>
    );
  if (!data) return <p className="mt-8 text-sm text-smoke" aria-busy="true">Loading…</p>;

  const page = sub === 'announce' || sub === 'accept' || sub === 'upcoming' ? sub : null;
  return (
    <div className="mt-8">
      {page && (
        <button type="button" onClick={() => go()} className="mb-5 text-xs font-semibold tracking-[0.2em] text-mist transition hover:text-bone">
          ← BACK TO SERIES ANNOUNCEMENT
        </button>
      )}
      {!page && <Hub theme={theme} data={data} go={go} />}
      {page === 'announce' && <Announce theme={theme} data={data} admin={admin} reload={load} />}
      {page === 'accept' && <Accept theme={theme} data={data} admin={admin} reload={load} />}
      {page === 'upcoming' && <Upcoming theme={theme} data={data} />}
    </div>
  );
}

export function Hub({ theme, data, go }: { theme: BoardTheme; data: SeriesOverview; go: Go }) {
  const pal = paletteOf(theme);
  const tiles = [
    { id: 'announce', title: 'Announce a Series', text: 'Set up a new series and send it to your opponent.', badge: `${data.announced.length} announced` },
    { id: 'accept', title: 'Accept the Series', text: 'Series other boards have announced to you.', badge: data.invitations.length ? `${data.invitations.length} waiting` : 'none waiting', hot: data.invitations.length > 0 },
    { id: 'upcoming', title: 'Upcoming Series', text: 'Every confirmed series across the federation.', badge: `${data.upcoming.length} confirmed` },
  ];
  return (
    <>
      <p className="mb-4 text-xs tracking-[0.12em] text-mist">
        SERIES IN PROGRESS: <span className="font-semibold text-bone">{data.active}</span> OF {data.limit} ALLOWED
      </p>
      <ul className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {tiles.map((t) => (
          <li key={t.id}>
            <button type="button" onClick={() => go(t.id)} className="group block h-full w-full rounded-2xl border bg-black/55 p-5 text-left backdrop-blur-sm transition hover:-translate-y-0.5" style={{ borderColor: `${pal.highlight}66` }}>
              <span className="rounded-full border px-2.5 py-0.5 text-[10px] font-semibold tracking-[0.18em]" style={{ borderColor: t.hot ? pal.highlight : 'rgba(255,255,255,0.2)', color: t.hot ? pal.highlight : '#b4b3bb' }}>
                {t.badge.toUpperCase()}
              </span>
              <span className="mt-4 block font-display text-2xl tracking-wide text-bone">{t.title.toUpperCase()}</span>
              <span className="mt-1.5 block text-sm leading-relaxed text-mist">{t.text}</span>
              <span className="mt-4 block text-xs font-semibold tracking-[0.2em] transition group-hover:translate-x-1" style={{ color: pal.highlight }}>
                OPEN →
              </span>
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}

/* ---------- shared bits ---------- */

const card = 'rounded-2xl border border-white/10 bg-black/60 p-5 backdrop-blur-sm';
const field = 'mt-1.5 w-full rounded-lg border border-white/15 bg-ink px-3 py-2.5 text-sm text-bone outline-none placeholder:text-smoke focus:border-[var(--hl)]';

function Heading({ children }: { children: ReactNode }) {
  return <h2 className="font-display text-3xl tracking-wide text-bone">{children}</h2>;
}

function Facts({ s, you }: { s: Series; you: string }) {
  const rows: [string, string][] = [
    ['Type', typeLabel(s.type)],
    ['Hosted by', s.host.name],
    [s.opponents.length > 1 ? 'Opponents' : 'Opponent', s.opponents.map((o) => (s.status === 'pending' && s.opponents.length > 1 ? `${o.name}${o.accepted ? ' ✓' : ''}` : o.name)).join(', ')],
    ['Matches', String(s.matches)],
    ...(s.type === 'bilateral' ? ([[s.matches === 1 ? 'Stadium' : 'Stadiums', s.stadiums.map((x, i) => (s.matches === 1 ? x : `${i + 1}. ${x}`)).join(s.matches === 1 ? '' : ' · ')]] as [string, string][]) : []),
    ['Bet amount', money(s.bet)],
    ['Format', formatLabel(s)],
    ...(s.status === 'pending' ? ([['Deadline', `11:59 PM IST, ${ist(s.deadlineAt)}`]] as [string, string][]) : []),
  ];
  return (
    <dl className="mt-3 grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-[auto_1fr]" aria-label={`Details of ${s.name} (${you})`}>
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-[11px] font-semibold tracking-[0.18em] text-smoke">{k.toUpperCase()}</dt>
          <dd className="text-bone">{v}</dd>
        </div>
      ))}
      {s.type !== 'bilateral' && (
        <div className="contents">
          <dt className="text-[11px] font-semibold tracking-[0.18em] text-smoke">SCHEDULE</dt>
          <dd>
            <ol className="space-y-1 text-bone">
              {s.fixtures.map((f) => (
                <li key={f.no}>
                  <span className="text-mist">Match {f.no}:</span> {f.final ? <span className="font-semibold">Final <span className="font-normal text-mist">· teams decided after the league matches</span></span> : <>{f.teams!.join(' vs ')} <span className="text-mist">· {f.stadium}</span></>}
                </li>
              ))}
            </ol>
          </dd>
        </div>
      )}
    </dl>
  );
}

function Empty({ text }: { text: string }) {
  return <p className={`${card} mt-6 text-center text-sm text-mist`}>{text}</p>;
}

/* ---------- upcoming ---------- */

export function Upcoming({ theme, data }: { theme: BoardTheme; data: SeriesOverview }) {
  const pal = paletteOf(theme);
  return (
    <div style={{ ['--hl' as string]: pal.highlight }}>
      <Heading>UPCOMING SERIES</Heading>
      <p className="mt-1 text-sm text-mist">Series that have been announced and accepted, across all boards.</p>
      {!data.upcoming.length ? (
        <Empty text="No upcoming series yet." />
      ) : (
        <ul className="mt-6 grid gap-4 lg:grid-cols-2">
          {data.upcoming.map((s) => (
            <li key={s.id} className={card}>
              <p className="font-display text-2xl tracking-wide text-bone">{s.name.toUpperCase()}</p>
              <p className="text-xs font-semibold tracking-[0.18em]" style={{ color: pal.highlight }}>
                {[s.host.name, ...s.opponents.map((o) => o.name)].join(' vs ').toUpperCase()}
              </p>
              <Facts s={s} you="upcoming" />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ---------- accept ---------- */

export function Accept({ theme, data, admin, reload }: { theme: BoardTheme; data: SeriesOverview; admin: boolean; reload: () => Promise<void> }) {
  const pal = paletteOf(theme);
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const accept = async (s: Series) => {
    setBusy(s.id);
    setMsg(null);
    try {
      await api.acceptSeries(theme.slug, s.id);
      await reload();
      setMsg({ ok: true, text: `You accepted “${s.name}”. It is now confirmed.` });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof ApiError ? e.message : 'Something went wrong.' });
      await reload();
    }
    setBusy('');
  };
  return (
    <div style={{ ['--hl' as string]: pal.highlight }}>
      <Heading>ACCEPT THE SERIES</Heading>
      <p className="mt-1 text-sm text-mist">Series other boards have announced to {theme.name}. Each must be accepted before 11:59 PM IST on the day it was announced, or it is declined.</p>
      <p role="status" aria-live="polite" className={`mt-3 min-h-[1.2rem] text-sm ${msg ? (msg.ok ? 'text-[#6fcf8e]' : 'text-crimson-2') : ''}`}>
        {msg?.text}
      </p>
      {!data.invitations.length ? (
        <Empty text="No series are waiting for your acceptance." />
      ) : (
        <ul className="mt-4 grid gap-4 lg:grid-cols-2">
          {data.invitations.map((s) => (
            <li key={s.id} className={card}>
              <p className="font-display text-2xl tracking-wide text-bone">{s.name.toUpperCase()}</p>
              <p className="text-xs font-semibold tracking-[0.18em]" style={{ color: pal.highlight }}>
                ANNOUNCED BY {s.host.name.toUpperCase()}
              </p>
              <Facts s={s} you="invitation" />
              {!admin && (
                <button type="button" onClick={() => void accept(s)} disabled={busy === s.id} className="mt-4 rounded-lg px-6 py-2.5 text-xs font-bold tracking-[0.2em] text-ink transition hover:brightness-110 disabled:opacity-50" style={{ background: pal.highlight }}>
                  {busy === s.id ? 'ACCEPTING…' : 'ACCEPT THE SERIES'}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ---------- announce / edit ---------- */

function Pills<T extends string | number>({ label, value, options, onPick, show, hl }: { label: string; value: T | undefined; options: T[]; onPick: (v: T) => void; show?: (v: T) => string; hl: string }) {
return (
  <fieldset className="mt-5">
    <legend className="text-[11px] font-semibold tracking-[0.2em] text-mist">{label}</legend>
    <div className="mt-2 flex flex-wrap gap-2">
      {options.map((o) => (
        <button key={String(o)} type="button" aria-pressed={value === o} onClick={() => onPick(o)} className="rounded-full border px-4 py-2 text-sm font-semibold transition" style={value === o ? { borderColor: hl, background: `${hl}22`, color: hl } : { borderColor: 'rgba(255,255,255,0.15)', color: '#d9d8de' }}>
          {show ? show(o) : String(o)}
        </button>
      ))}
    </div>
  </fieldset>
);
}


export function Announce({ theme, data, admin, reload }: { theme: BoardTheme; data: SeriesOverview; admin: boolean; reload: () => Promise<void> }) {
  const pal = paletteOf(theme);
  const [form, setForm] = useState<SeriesInput>(EMPTY);
  const [editing, setEditing] = useState<Series | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const need = TYPES.find((t) => t.id === form.type)?.opponents ?? 0;
  const others = BOARD_THEMES.filter((b) => b.slug !== theme.slug).sort((a, b) => a.name.localeCompare(b.name));
  const set = (patch: Partial<SeriesInput>) => setForm((f) => ({ ...f, ...patch }));

  const blanks = (n: number) => Array.from({ length: n }, () => '');
  const matchOptions = TYPES.find((t) => t.id === form.type)?.matchOptions ?? [];
  // the match list: every opponent must be chosen first, because the teams in each match depend on them
  const teamsReady = need > 0 && form.opponents.length === need && form.opponents.every(Boolean);
  const nameOf = (slug: string) => BOARD_THEMES.find((b) => b.slug === slug)?.name ?? slug;
  const schedule = teamsReady && form.matches > 0 ? buildFixtures(form.type, [theme.slug, ...form.opponents], form.matches) : [];
  const scheduled = schedule.filter((f) => !f.final);
  const stadiumsFor = (f: (typeof schedule)[number]) => [...new Set(stadiumBoards(form.type, f, theme.slug).flatMap((b) => data.allStadiums[b] ?? []))];

  const pickType = (id: string) => {
    const t = TYPES.find((x) => x.id === id)!;
    set({ type: id, opponents: Array.from({ length: t.opponents }, (_, i) => form.opponents[i] ?? ''), matches: t.matchOptions.includes(form.matches) ? form.matches : 0, stadiums: [] });
  };
  const pickOpponent = (i: number, slug: string) => set({ opponents: form.opponents.map((x, j) => (j === i ? slug : x)), stadiums: [] });
  const pickMatches = (n: number) => set({ matches: n, stadiums: blanks(buildFixtures(form.type, [theme.slug, ...form.opponents], n).filter((f) => !f.final).length) });
  const reset = () => {
    setForm(EMPTY);
    setEditing(null);
  };
  const startEdit = (s: Series) => {
    setEditing(s);
    setMsg(null);
    setForm({ name: s.name, type: s.type, opponents: s.opponents.map((o) => o.slug), matches: s.matches, stadiums: s.stadiums, bet: s.bet, format: s.format, clubFormat: cfg.clubFormats.find((c) => c.label === s.clubFormat)?.id });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const send = async () => {
    setBusy(true);
    setMsg(null);
    const body: SeriesInput = { ...form, ...(form.format === 'Club' ? {} : { clubFormat: undefined }) };
    try {
      if (editing) await api.editSeries(theme.slug, editing.id, body);
      else await api.announceSeries(theme.slug, body);
      await reload();
      setMsg({ ok: true, text: editing ? 'Changes saved. The opponent now sees the updated series.' : 'Series sent. It is now waiting for your opponent to accept it.' });
      reset();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof ApiError ? e.message : 'Something went wrong.' });
      if (e instanceof ApiError && (e.code === 'locked' || e.code === 'expired')) {
        reset();
        await reload();
      }
    }
    setBusy(false);
  };

  const ready =
    form.name.trim().length >= 3 && form.type && form.opponents.length === need && form.opponents.every(Boolean) && new Set(form.opponents).size === need && teamsReady && form.matches > 0 && scheduled.length > 0 && scheduled.every((_, i) => form.stadiums[i]) && form.bet > 0 && form.format && (form.format !== 'Club' || form.clubFormat);

  return (
    <div style={{ ['--hl' as string]: pal.highlight }}>
      <Heading>ANNOUNCE A SERIES</Heading>
      <p className="mt-1 text-sm text-mist">
        You are in {data.active} of {data.limit} allowed series. Once sent, the series waits in your opponent’s Accept tile until 11:59 PM IST today; if it is not accepted by then it is declined. You can edit it until it is accepted.
      </p>
      <p role="status" aria-live="polite" className={`mt-3 min-h-[1.2rem] text-sm ${msg ? (msg.ok ? 'text-[#6fcf8e]' : 'text-crimson-2') : ''}`}>
        {msg?.text}
      </p>

      {admin ? (
        <Empty text="Only the board’s chairman can announce a series. You are viewing this board as the administrator." />
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (ready && !busy) void send();
          }}
          className={`${card} mt-4`}
          noValidate
        >
          {!data.stadiums.length && <p className="mb-3 text-sm text-crimson-2">No stadium is registered for your board yet. A bilateral series cannot be announced until one is added; in a trilateral or quadrilateral series you can use your opponents’ stadiums.</p>}
          {editing && <p className="mb-3 text-xs font-semibold tracking-[0.2em]" style={{ color: pal.highlight }}>EDITING “{editing.name.toUpperCase()}”</p>}
          <label className="block text-[11px] font-semibold tracking-[0.2em] text-mist">
            NAME OF THE SERIES
            <input value={form.name} onChange={(e) => set({ name: e.target.value })} maxLength={60} placeholder="e.g. Spring Cup" className={field} />
          </label>

          <Pills hl={pal.highlight} label="SERIES TYPE" value={form.type || undefined} options={TYPES.map((t) => t.id)} onPick={pickType} show={typeLabel} />

          {need > 0 && (
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              {form.opponents.map((o, i) => (
                <label key={i} className="block text-[11px] font-semibold tracking-[0.2em] text-mist">
                  {need === 1 ? 'OPPONENT BOARD' : `OPPONENT BOARD ${i + 1}`}
                  <select value={o} onChange={(e) => pickOpponent(i, e.target.value)} className={field}>
                    <option value="">Select a board</option>
                    {others.map((b) => (
                      <option key={b.slug} value={b.slug} disabled={form.opponents.some((x, j) => j !== i && x === b.slug)}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
          )}

          {form.type && <Pills hl={pal.highlight} label="HOW MANY MATCHES IN THE SERIES?" value={form.matches || undefined} options={matchOptions} onPick={pickMatches} />}
          {form.type && form.type !== 'bilateral' && <p className="mt-2 text-xs text-smoke">The last match is the final. Its teams are only known after the league matches, so it does not need a stadium or a schedule.</p>}

          {form.matches > 0 && !teamsReady && <p className="mt-5 text-sm text-mist">Choose {need === 1 ? 'the opponent board' : 'all the opponent boards'} to prepare the match schedule.</p>}
          {form.matches > 0 && teamsReady && (
            <div className="mt-5">
              <p className="text-[11px] font-semibold tracking-[0.2em] text-mist">{form.type === 'bilateral' ? (form.matches === 1 ? 'HOME STADIUM' : 'HOME STADIUM FOR EACH MATCH') : 'MATCH SCHEDULE'}</p>
              <ol className="mt-2 space-y-3">
                {schedule.map((f) => (
                  <li key={f.no} className="grid items-center gap-2 sm:grid-cols-[minmax(0,20rem)_1fr]">
                    <span className="text-sm text-bone">
                      <span className="text-mist">Match {f.no}:</span> {f.final ? <strong>Final</strong> : f.teams!.map(nameOf).join(' vs ')}
                    </span>
                    {f.final ? (
                      <span className="text-xs text-smoke">Teams decided after the league matches — no stadium needed.</span>
                    ) : (
                      <label className="block text-[11px] font-semibold tracking-[0.2em] text-mist">
                        <span className="sr-only">Stadium for match {f.no}</span>
                        <select value={form.stadiums[f.no - 1] ?? ''} onChange={(e) => set({ stadiums: scheduled.map((_, i) => (i === f.no - 1 ? e.target.value : (form.stadiums[i] ?? ''))) })} className={`${field} mt-0`}>
                          <option value="">Stadium:</option>
                          {stadiumsFor(f).map((x) => (
                            <option key={x} value={x}>
                              {x}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                  </li>
                ))}
              </ol>
            </div>
          )}

          <Pills hl={pal.highlight} label="BET AMOUNT" value={form.bet || undefined} options={cfg.bets} onPick={(v) => set({ bet: v })} show={money} />
          <Pills hl={pal.highlight} label="FORMAT" value={form.format || undefined} options={cfg.formats} onPick={(v) => set({ format: v, ...(v === 'Club' ? {} : { clubFormat: undefined }) })} />
          {form.format === 'Club' && <Pills hl={pal.highlight} label="CLUB FORMAT" value={form.clubFormat} options={cfg.clubFormats.map((c) => c.id)} onPick={(v) => set({ clubFormat: v })} show={(id) => cfg.clubFormats.find((c) => c.id === id)!.label} />}

          <div className="mt-7 flex flex-wrap items-center gap-3">
            <button type="submit" disabled={!ready || busy} className="rounded-lg px-8 py-3 text-sm font-bold tracking-[0.2em] text-ink transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40" style={{ background: pal.highlight }}>
              {busy ? 'SENDING…' : editing ? 'SAVE CHANGES' : 'SEND'}
            </button>
            {editing && (
              <button type="button" onClick={reset} className="text-xs font-semibold tracking-[0.2em] text-mist hover:text-bone">
                CANCEL EDIT
              </button>
            )}
          </div>
        </form>
      )}

      <h3 className="mt-10 text-[11px] font-semibold tracking-[0.24em]" style={{ color: pal.highlight }}>
        YOUR ANNOUNCED SERIES
      </h3>
      {!data.announced.length ? (
        <Empty text="You have not announced any series." />
      ) : (
        <ul className="mt-3 grid gap-4 lg:grid-cols-2">
          {data.announced.map((s) => (
            <li key={s.id} className={card}>
              <div className="flex items-start justify-between gap-3">
                <p className="font-display text-2xl tracking-wide text-bone">{s.name.toUpperCase()}</p>
                <span className="shrink-0 rounded-full border px-2.5 py-0.5 text-[10px] font-semibold tracking-[0.18em]" style={{ borderColor: s.status === 'accepted' ? '#6fcf8e' : pal.highlight, color: s.status === 'accepted' ? '#6fcf8e' : pal.highlight }}>
                  {s.status === 'accepted' ? 'ACCEPTED' : 'WAITING FOR ACCEPTANCE'}
                </span>
              </div>
              <Facts s={s} you="announced" />
              {!admin && (
                <p className="mt-4">
                  {s.editable ? (
                    <button type="button" onClick={() => startEdit(s)} className="rounded-lg border px-5 py-2 text-xs font-bold tracking-[0.2em] transition hover:brightness-125" style={{ borderColor: pal.highlight, color: pal.highlight }}>
                      EDIT SERIES
                    </button>
                  ) : (
                    <span className="text-xs text-smoke">Locked — a series cannot be edited once an opponent has accepted it.</span>
                  )}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
