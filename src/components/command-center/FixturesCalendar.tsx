import { useEffect, useMemo, useState } from 'react';
import { api, ApiError, type CalendarMatch } from '../../data/commandApi';
import { paletteOf, type BoardTheme } from '../../data/commandCenter/boardConfig';

type Scope = 'mine' | 'all';

const WEEK = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const utc = (d: string) => new Date(`${d}T00:00:00Z`);
const longDay = (d: string) => utc(d).toLocaleDateString('en-GB', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const shortDay = (d: string) => utc(d).toLocaleDateString('en-GB', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' });
const monthTitle = (m: string) => utc(`${m}-01`).toLocaleDateString('en-GB', { timeZone: 'UTC', month: 'long', year: 'numeric' });
const addMonth = (m: string, n: number) => {
  const d = utc(`${m}-01`);
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString().slice(0, 7);
};
const money = (n: number) => `₹${n.toLocaleString('en-IN')}`;
const typeLabel = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

/** All the days of a month laid out Monday-first, with leading blanks. */
function monthCells(month: string) {
  const first = utc(`${month}-01`);
  const lead = (first.getUTCDay() + 6) % 7;
  const days = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  return [...Array.from({ length: lead }, () => null), ...Array.from({ length: days }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`)];
}

/** An .ics file (all-day events) so the matches can be added to a phone or Google calendar. */
function icsFor(boardName: string, matches: CalendarMatch[]) {
  const esc = (x: string) => x.replace(/[\;,]/g, (c) => `\\${c}`).replace(/\n/g, '\\n');
  const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';
  const events = matches
    .filter((m) => m.date)
    .map((m) => {
      const start = m.date!.replace(/-/g, '');
      const end = new Date(utc(m.date!).getTime() + 86400000).toISOString().slice(0, 10).replace(/-/g, '');
      return ['BEGIN:VEVENT', `UID:${m.seriesId}-${m.no}@iocf`, `DTSTAMP:${stamp}`, `DTSTART;VALUE=DATE:${start}`, `DTEND;VALUE=DATE:${end}`, `SUMMARY:${esc(`${m.teamNames!.join(' vs ')} (${m.series})`)}`, `LOCATION:${esc(m.stadium ?? '')}`, `DESCRIPTION:${esc(`Match ${m.no} of ${m.of} · ${m.format} · bet ${money(m.bet)}`)}`, 'END:VEVENT'].join('\r\n');
    });
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', `PRODID:-//IOCF//${esc(boardName)} fixtures//EN`, ...events, 'END:VCALENDAR'].join('\r\n');
}

function MatchCard({ m, hl, mine }: { m: CalendarMatch; hl: string; mine: boolean }) {
  return (
    <li className="rounded-xl border border-white/10 bg-black/50 px-4 py-3" style={mine ? { borderColor: `${hl}66` } : undefined}>
      <p className="text-[11px] font-semibold tracking-[0.16em] text-mist">
        {m.series.toUpperCase()} · {typeLabel(m.type).toUpperCase()} · MATCH {m.no} OF {m.of}
      </p>
      <p className="mt-1 font-display text-xl tracking-wide text-bone">{m.final ? 'FINAL' : m.teamNames!.join(' VS ').toUpperCase()}</p>
      <p className="mt-0.5 text-sm text-mist">
        {m.final ? 'Teams and date announced after the league matches' : <>{m.stadium}{m.date ? ` · ${shortDay(m.date)}` : ''}</>}
      </p>
      <p className="mt-0.5 text-xs text-smoke">
        {m.format} · bet {money(m.bet)}
      </p>
    </li>
  );
}

/**
 * Fixtures & Scheduling: a calendar of every match in the confirmed series — the board's own by default, or all boards.
 * It reads the dates and stadiums chosen when the series were announced; nothing is entered here.
 */
export default function FixturesCalendar({ theme }: { theme: BoardTheme }) {
  const pal = paletteOf(theme);
  const [data, setData] = useState<{ today: string; matches: CalendarMatch[] } | null>(null);
  const [error, setError] = useState('');
  const [scope, setScope] = useState<Scope>('mine');
  const [month, setMonth] = useState('');
  const [picked, setPicked] = useState<string | null>(null);

  const load = () => {
    setError('');
    api.fixtures(theme.slug).then(setData, (e: unknown) => setError(e instanceof ApiError ? e.message : 'Something went wrong.'));
  };
  useEffect(() => {
    setData(null);
    load();
  }, [theme.slug]); // eslint-disable-line react-hooks/exhaustive-deps

  const shown = useMemo(() => (data?.matches ?? []).filter((m) => scope === 'all' || m.boards.includes(theme.slug)), [data, scope, theme.slug]);
  const dated = useMemo(() => shown.filter((m) => m.date).sort((a, b) => a.date!.localeCompare(b.date!) || a.no - b.no), [shown]);
  const byDay = useMemo(() => {
    const map = new Map<string, CalendarMatch[]>();
    for (const m of dated) map.set(m.date!, [...(map.get(m.date!) ?? []), m]);
    return map;
  }, [dated]);

  // open on the month of the next match (or this month)
  useEffect(() => {
    if (!data) return;
    const next = dated.find((m) => m.date! >= data.today);
    setMonth((next?.date ?? data.today).slice(0, 7));
    setPicked(null);
  }, [data, scope]); // eslint-disable-line react-hooks/exhaustive-deps

  if (error)
    return (
      <p role="alert" className="mt-8 rounded-xl border border-crimson/40 bg-black/70 px-5 py-4 text-sm text-mist">
        {error}{' '}
        <button type="button" onClick={load} className="font-semibold underline" style={{ color: pal.highlight }}>
          Try again
        </button>
      </p>
    );
  if (!data || !month) return <p className="mt-8 text-sm text-smoke" aria-busy="true">Loading…</p>;

  const upcoming = dated.filter((m) => m.date! >= data.today);
  const earlier = dated.filter((m) => m.date! < data.today).reverse();
  const finals = shown.filter((m) => m.final);
  const dayMatches = picked ? (byDay.get(picked) ?? []) : [];
  const mineOnly = scope === 'mine';

  const download = () => {
    const blob = new Blob([icsFor(theme.name, dated)], { type: 'text/calendar' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${theme.slug}-fixtures.ics`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const pill = (active: boolean) => (active ? { borderColor: pal.highlight, background: `${pal.highlight}22`, color: pal.highlight } : { borderColor: 'rgba(255,255,255,0.15)', color: '#d9d8de' });
  const card = 'rounded-2xl border border-white/10 bg-black/60 p-5 backdrop-blur-sm';

  return (
    <div className="mt-8" style={{ ['--hl' as string]: pal.highlight }}>
      <div className="flex flex-wrap items-center gap-2">
        {([['mine', `${theme.name} matches`], ['all', 'All boards']] as [Scope, string][]).map(([id, label]) => (
          <button key={id} type="button" aria-pressed={scope === id} onClick={() => setScope(id)} className="rounded-full border px-4 py-2 text-sm font-semibold transition" style={pill(scope === id)}>
            {label}
          </button>
        ))}
        {mineOnly && dated.length > 0 && (
          <button type="button" onClick={download} className="ml-auto rounded-full border border-white/20 px-4 py-2 text-xs font-semibold tracking-[0.16em] text-mist transition hover:text-bone">
            ADD TO MY CALENDAR (.ICS)
          </button>
        )}
      </div>

      {!shown.length ? (
        <p className={`${card} mt-6 text-center text-sm text-mist`}>
          {mineOnly ? `No confirmed series for ${theme.name} yet. When a series is announced and accepted, its matches appear here with their dates and stadiums.` : 'No series have been confirmed yet.'}
        </p>
      ) : (
        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,26rem)_1fr]">
          <section aria-label="Calendar" className={card}>
            <div className="flex items-center justify-between">
              <button type="button" onClick={() => setMonth(addMonth(month, -1))} aria-label="Previous month" className="rounded-full border border-white/20 px-3 py-1 text-mist hover:text-bone">
                ‹
              </button>
              <p className="font-display text-xl tracking-wide text-bone">{monthTitle(month).toUpperCase()}</p>
              <button type="button" onClick={() => setMonth(addMonth(month, 1))} aria-label="Next month" className="rounded-full border border-white/20 px-3 py-1 text-mist hover:text-bone">
                ›
              </button>
            </div>
            <div className="mt-3 grid grid-cols-7 gap-1 text-center text-[10px] font-semibold tracking-[0.12em] text-smoke">
              {WEEK.map((d) => (
                <span key={d}>{d.toUpperCase()}</span>
              ))}
            </div>
            <div className="mt-1 grid grid-cols-7 gap-1">
              {monthCells(month).map((d, i) => {
                if (!d) return <span key={`b${i}`} />;
                const n = byDay.get(d)?.length ?? 0;
                const isToday = d === data.today;
                return (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setPicked(d === picked ? null : d)}
                    aria-label={`${longDay(d)}${n ? `, ${n} match${n > 1 ? 'es' : ''}` : ''}`}
                    aria-pressed={picked === d}
                    className="relative aspect-square rounded-lg border text-sm transition"
                    style={{ borderColor: picked === d ? pal.highlight : isToday ? `${pal.highlight}88` : 'rgba(255,255,255,0.08)', background: n ? `${pal.highlight}1f` : 'transparent', color: n ? '#fff' : '#9a99a3' }}
                  >
                    {Number(d.slice(8))}
                    {n > 0 && (
                      <span className="absolute bottom-1 left-1/2 -translate-x-1/2 text-[9px] font-bold" style={{ color: pal.highlight }}>
                        {'•'.repeat(Math.min(n, 3))}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            <button type="button" onClick={() => { setMonth(data.today.slice(0, 7)); setPicked(data.today); }} className="mt-3 text-[11px] font-semibold tracking-[0.2em]" style={{ color: pal.highlight }}>
              GO TO TODAY
            </button>
          </section>

          <section aria-label={picked ? longDay(picked) : 'Upcoming matches'} className="space-y-6">
            {picked ? (
              <div>
                <h2 className="text-[11px] font-semibold tracking-[0.24em]" style={{ color: pal.highlight }}>
                  {longDay(picked).toUpperCase()}
                </h2>
                {dayMatches.length ? (
                  <ul className="mt-3 space-y-3">
                    {dayMatches.map((m) => (
                      <MatchCard key={`${m.seriesId}-${m.no}`} m={m} hl={pal.highlight} mine={m.boards.includes(theme.slug)} />
                    ))}
                  </ul>
                ) : (
                  <p className="mt-3 text-sm text-mist">No matches on this day.</p>
                )}
              </div>
            ) : (
              <div>
                <h2 className="text-[11px] font-semibold tracking-[0.24em]" style={{ color: pal.highlight }}>
                  UPCOMING MATCHES
                </h2>
                {upcoming.length ? (
                  <ul className="mt-3 space-y-3">
                    {upcoming.slice(0, 12).map((m) => (
                      <MatchCard key={`${m.seriesId}-${m.no}`} m={m} hl={pal.highlight} mine={m.boards.includes(theme.slug)} />
                    ))}
                  </ul>
                ) : (
                  <p className="mt-3 text-sm text-mist">No upcoming dated matches.</p>
                )}
                {upcoming.length > 12 && <p className="mt-2 text-xs text-smoke">Showing the next 12. Use the calendar to see the rest.</p>}
              </div>
            )}

            {finals.length > 0 && !picked && (
              <div>
                <h2 className="text-[11px] font-semibold tracking-[0.24em]" style={{ color: pal.highlight }}>
                  FINALS · DATE TO BE ANNOUNCED
                </h2>
                <ul className="mt-3 space-y-3">
                  {finals.map((m) => (
                    <MatchCard key={`${m.seriesId}-final`} m={m} hl={pal.highlight} mine={m.boards.includes(theme.slug)} />
                  ))}
                </ul>
              </div>
            )}

            {earlier.length > 0 && !picked && (
              <details>
                <summary className="cursor-pointer text-[11px] font-semibold tracking-[0.24em] text-mist">EARLIER MATCHES ({earlier.length})</summary>
                <ul className="mt-3 space-y-3">
                  {earlier.map((m) => (
                    <MatchCard key={`${m.seriesId}-${m.no}`} m={m} hl={pal.highlight} mine={m.boards.includes(theme.slug)} />
                  ))}
                </ul>
              </details>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
