import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import type { Board } from '../data/boards';
import type { League, LeagueMatch, LeagueTeam } from '../data/leagues';
import type { ProfileId } from '../data/portfolio';
import { useSmoothScroll } from '../hooks/smoothScroll';
import { EASE } from './fx';
import { Flag } from './IocfChairmen';
import { IocfHeader, LOGO } from './IocfHome';
import { BackButton, Breadcrumb, Card, Loading, MISSING, Notice, searchInput } from './IocfPlayers';
import { useFavourites } from '../data/favourites';
import { ShareButton } from './SiteFooter';
import SiteFooter from './SiteFooter';

type LeaguesModule = typeof import('../data/leagues');
type BoardsModule = typeof import('../data/boards');

const ROUTE = '#/leagues';

const container = { hidden: {}, show: { transition: { staggerChildren: 0.09, delayChildren: 0.2 } } };
const item = {
  hidden: { opacity: 0, y: 24, filter: 'blur(8px)' },
  show: { opacity: 1, y: 0, filter: 'blur(0px)', transition: { duration: 0.8, ease: EASE } },
};

/** Routes: `#/leagues`, `#/leagues/<leagueId>`, `#/leagues/<leagueId>/<teamId>`. */
function readRoute() {
  const h = window.location.hash;
  if (!h.startsWith(ROUTE)) return [] as string[];
  return h.slice(ROUTE.length).split('/').filter(Boolean).map(decodeURIComponent);
}
function useRoute() {
  const [parts, setParts] = useState<string[]>(readRoute);
  useEffect(() => {
    const on = () => setParts(readRoute());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return parts;
}
const navigate = (...parts: string[]) => {
  window.location.hash = [ROUTE, ...parts].join('/');
};

function useData() {
  const [data, setData] = useState<{ m: LeaguesModule; leagues: League[]; boards: Board[] } | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    Promise.all([import('../data/leagues'), import('../data/boards')])
      .then(async ([m, b]: [LeaguesModule, BoardsModule]) => setData({ m, leagues: await m.loadLeagues(), boards: b.boards }))
      .catch(() => setFailed(true));
  }, []);
  return { data, failed };
}
type Data = NonNullable<ReturnType<typeof useData>['data']>;

const fmt = (n?: number) => (n === undefined ? MISSING : n.toLocaleString('en-US'));

export default function IocfLeagues({ profileId, onSwitch }: { profileId: ProfileId; onSwitch: (id: ProfileId) => void }) {
  const { scrollTo } = useSmoothScroll();
  const { data, failed } = useData();
  const [leagueId, teamId] = useRoute();

  useEffect(() => {
    scrollTo(0, { offset: 0 });
  }, [leagueId, teamId, scrollTo]);

  const go = (id: string) => {
    const scroll = () => scrollTo(id === 'top' ? 0 : `#${id}`, { offset: id === 'top' ? 0 : -72 });
    if (leagueId) {
      navigate();
      window.setTimeout(scroll, 150);
    } else scroll();
  };
  const links = [
    { id: 'top', label: 'Home' },
    { id: 'leagues', label: 'Leagues' },
  ];

  let body;
  if (failed) body = <Notice tone="error">The franchise leagues could not be loaded. Please refresh the page to try again.</Notice>;
  else if (!data) body = <Loading />;
  else if (!leagueId) body = <LeagueIndex data={data} />;
  else {
    const league = data.leagues.find((l) => l.id === leagueId);
    const team = league && teamId ? league.teams.find((t) => t.id === teamId) : undefined;
    if (!league) body = <NotFound what="league" />;
    else if (!teamId) body = <LeaguePage league={league} data={data} />;
    else if (!team) body = <NotFound what="team" league={league} />;
    else body = <TeamPage league={league} team={team} data={data} />;
  }

  return (
    <>
      <IocfHeader profileId={profileId} onSwitch={onSwitch} go={go} links={links} searchable={links} />
      <main className="min-h-[100svh]">
        {body}
        <SiteFooter />
      </main>
    </>
  );
}

function NotFound({ what, league }: { what: string; league?: League }) {
  return (
    <div className="gutter pt-32 text-center">
      <p className="text-sm text-mist">That {what} could not be found.</p>
      <button type="button" onClick={() => (league ? navigate(league.id) : navigate())} className="mt-4 text-xs font-semibold tracking-[0.2em] text-[#c9a24b] hover:underline">
        {league ? `BACK TO ${league.name.toUpperCase()}` : 'BACK TO FRANCHISE LEAGUES'}
      </button>
    </div>
  );
}

function BoardFlag({ name, data, className = 'text-lg' }: { name?: string; data: Data; className?: string }) {
  const board = name ? data.boards.find((b) => b.name === name) : undefined;
  return board ? <Flag board={board} className={className} /> : null;
}

function StatusBadge({ status }: { status: string }) {
  const tone = status === 'Completed' ? 'border-[#c9a24b]/50 text-[#c9a24b]' : 'border-crimson/50 text-crimson-2';
  return <span className={`rounded-full border px-2.5 py-0.5 text-[10px] font-semibold tracking-[0.18em] ${tone}`}>{status.toUpperCase()}</span>;
}

/* ---------- 1. all leagues ---------- */

function LeagueIndex({ data }: { data: Data }) {
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const visible = data.leagues.filter((l) => !q || l.name.toLowerCase().includes(q) || l.shortName.toLowerCase().includes(q));
  return (
    <>
      <section className="relative overflow-hidden">
        <div aria-hidden className="absolute inset-0 bg-[radial-gradient(55%_60%_at_78%_45%,rgba(107,18,41,0.35),transparent_70%)]" />
        <div className="gutter relative z-[2] grid w-full items-center gap-8 pb-10 pt-24 lg:grid-cols-[1.15fr_1fr] lg:pt-28">
          <motion.div variants={container} initial="hidden" animate="show" className="order-2 lg:order-1">
            <motion.p variants={item} className="font-sans text-[11px] font-semibold tracking-[0.3em] text-[#c9a24b] sm:text-xs">
              INTERNATIONAL ONLINE CRICKET FEDERATION
            </motion.p>
            <motion.h1 variants={item} className="mt-3 font-display leading-[0.9] tracking-[0.02em] text-bone" style={{ fontSize: 'clamp(2.8rem, 7vw, 6rem)' }}>
              IOCF FRANCHISE LEAGUES
            </motion.h1>
            <motion.p variants={item} className="mt-4 font-sans text-xs font-bold tracking-[0.3em] text-bone sm:text-sm">
              {data.leagues.length} LEAGUES • TEAMS • SQUADS • RESULTS
            </motion.p>
            <motion.p variants={item} className="mt-5 max-w-xl text-[15px] leading-relaxed text-bone/75 sm:text-base">
              Explore every IOCF franchise league. Open a league for its teams, champions, standings, results and awards, then open a team for its full squad.
            </motion.p>
          </motion.div>
          <motion.div
            className="order-1 mx-auto aspect-square w-[min(48vw,18rem)] lg:order-2 lg:w-full lg:max-w-[22rem]"
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 1.2, ease: EASE }}
          >
            <img src={LOGO.src} srcSet={LOGO.srcSet} sizes="(max-width: 1024px) 48vw, 22rem" alt={LOGO.alt} className="h-full w-full object-contain drop-shadow-[0_24px_60px_rgba(0,0,0,0.6)]" />
          </motion.div>
        </div>
      </section>

      <section id="leagues" aria-label="Franchise leagues" className="gutter py-10 sm:py-14">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search leagues by name" aria-label="Search leagues by name" className={searchInput} />
          <p role="status" aria-live="polite" className="text-xs text-smoke">
            Showing {visible.length} of {data.leagues.length} leagues
          </p>
        </div>
        {visible.length === 0 ? (
          <div className="rounded-xl border border-white/10 bg-ink-2 px-5 py-12 text-center">
            <p className="text-sm text-bone">No leagues match your search.</p>
            <button type="button" onClick={() => setQuery('')} className="mt-4 text-xs font-semibold tracking-[0.2em] text-[#c9a24b] hover:underline">
              CLEAR SEARCH
            </button>
          </div>
        ) : (
          <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {visible.map((l) => (
              <li key={l.id}>
                <button
                  type="button"
                  onClick={() => navigate(l.id)}
                  aria-label={`Open ${l.name}`}
                  className="group flex h-full w-full flex-col gap-3 rounded-2xl border border-white/10 bg-ink-2 p-5 text-left transition-[border-color,transform] duration-300 hover:-translate-y-0.5 hover:border-[#c9a24b]/50"
                >
                  <span className="flex items-center justify-between gap-3">
                    <span className="text-[11px] font-semibold tracking-[0.24em] text-[#c9a24b]">{l.shortName}</span>
                    <StatusBadge status={l.status} />
                  </span>
                  <span className="font-display text-2xl leading-tight tracking-wide text-bone">{l.name.toUpperCase()}</span>
                  <span className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-mist">
                    {l.host && (
                      <span className="flex items-center gap-1.5">
                        <BoardFlag name={l.host} data={data} /> Host: {l.host}
                      </span>
                    )}
                    <span>{l.teams.length} teams</span>
                  </span>
                  <span className="text-xs text-smoke">{l.champions ? `Champions: ${l.champions}` : 'Champions: not recorded'}</span>
                  <span className="mt-auto pt-2 text-xs font-semibold tracking-[0.2em] text-[#c9a24b] transition group-hover:translate-x-1">VIEW LEAGUE →</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

/* ---------- 2. a league ---------- */

function MatchRow({ m, data }: { m: LeagueMatch; data: Data }) {
  void data;
  return (
    <li className="rounded-xl border border-white/10 bg-ink-2 px-4 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="text-sm font-semibold text-bone">
          {m.stage && <span className="mr-2 rounded border border-[#c9a24b]/50 px-1.5 py-px text-[10px] tracking-wider text-[#c9a24b]">{m.stage.toUpperCase()}</span>}
          {m.teams[0]} <span className="font-normal text-smoke">vs</span> {m.teams[1]}
        </p>
        <p className="text-[11px] text-smoke">{[m.date, m.venue].filter(Boolean).join(' · ')}</p>
      </div>
      <p className="mt-1 text-[12px] leading-relaxed text-mist">
        {m.winner ? (
          <>
            Winner: <span className="text-bone">{m.winner}</span>
          </>
        ) : (
          'Result not recorded'
        )}
        {m.umpire && ` · Umpire: ${m.umpire}`}
        {m.mom && ` · Man of the Match: ${m.mom}`}
        {m.bat && ` · Best Batsman: ${m.bat}`}
        {m.bowl && ` · Best Bowler: ${m.bowl}`}
      </p>
    </li>
  );
}

function LeaguePage({ league, data }: { league: League; data: Data }) {
  const table = useMemo(() => data.m.standings(league), [data, league]);
  const [teamQuery, setTeamQuery] = useState('');
  const [venue, setVenue] = useState('');
  const q = teamQuery.trim().toLowerCase();
  const teams = league.teams.filter((t) => !q || t.name.toLowerCase().includes(q));
  const regular = league.matches.filter((m) => !m.stage);
  const facts = [
    { label: 'Host board', value: league.host },
    { label: 'Champions', value: league.champions },
    { label: 'Runners-up', value: league.runnersUp },
    { label: 'Fair Play award', value: league.fairPlay },
  ].filter((f) => f.value);

  return (
    <div className="gutter pb-16 pt-28">
      <Breadcrumb items={[{ label: 'Franchise Leagues', onClick: () => navigate() }, { label: league.name }]} />
      <div className="mt-3">
        <BackButton onClick={() => navigate()}>BACK TO LEAGUES</BackButton>
      </div>
      <header className="mt-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold tracking-[0.3em] text-[#c9a24b]">{league.shortName}</p>
          <h1 className="mt-1 font-display text-[clamp(2.2rem,6vw,4.5rem)] leading-[0.9] tracking-wide text-bone">{league.name.toUpperCase()}</h1>
        </div>
        <div className="flex flex-col items-end gap-3">
          <StatusBadge status={league.status} />
          <ShareButton />
        </div>
      </header>

      <Card title="LEAGUE SUMMARY" className="mt-6">
        {facts.length > 0 ? (
          <dl className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {facts.map((f) => (
              <div key={f.label}>
                <dt className="text-[10px] font-semibold tracking-[0.22em] text-smoke">{f.label.toUpperCase()}</dt>
                <dd className="mt-1 flex items-center gap-2 text-sm text-bone">
                  {f.label === 'Host board' && <BoardFlag name={f.value} data={data} />}
                  {f.value}
                </dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="text-sm text-smoke">No results have been recorded for this league yet.</p>
        )}
        {league.status === 'Cancelled' && <p className="mt-4 text-sm text-mist">This tournament was cancelled before completion; the matches that were played are listed below.</p>}
      </Card>

      <section className="mt-8" aria-label="Teams">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-[11px] font-semibold tracking-[0.24em] text-[#c9a24b]">TEAMS ({league.teams.length})</h2>
          <input type="search" value={teamQuery} onChange={(e) => setTeamQuery(e.target.value)} placeholder="Search teams" aria-label="Search teams" className={searchInput} />
        </div>
        {teams.length === 0 ? (
          <p className="rounded-xl border border-white/10 bg-ink-2 px-5 py-8 text-center text-sm text-mist">No teams match your search.</p>
        ) : (
          <ul className="grid grid-cols-1 gap-4 min-[420px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {teams.map((t) => {
              const badge = t.name === league.champions ? 'CHAMPIONS' : t.name === league.runnersUp ? 'RUNNERS-UP' : t.name === league.fairPlay ? 'FAIR PLAY' : null;
              return (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => navigate(league.id, t.id)}
                    aria-label={`Open team ${t.name}`}
                    className="group flex h-full w-full flex-col gap-2 rounded-2xl border border-white/10 bg-ink-2 p-4 text-left transition-[border-color,transform] duration-300 hover:-translate-y-0.5 hover:border-[#c9a24b]/50"
                  >
                    <span className="text-base font-semibold text-bone">{t.name}</span>
                    <span className="text-xs text-mist">{t.players.length} players</span>
                    {badge && <span className="w-fit rounded border border-[#c9a24b]/50 px-1.5 py-px text-[10px] font-semibold tracking-wider text-[#c9a24b]">{badge}</span>}
                    <span className="mt-auto pt-2 text-xs font-semibold tracking-[0.2em] text-[#c9a24b] transition group-hover:translate-x-1">VIEW TEAM →</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {regular.length > 0 && (
        <Card title="STANDINGS (LEAGUE STAGE, FROM RECORDED RESULTS)" className="mt-8">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[420px] text-left text-sm">
              <thead>
                <tr className="text-[10px] tracking-[0.2em] text-smoke">
                  <th className="py-2 pr-3 font-semibold">#</th>
                  <th className="py-2 pr-3 font-semibold">TEAM</th>
                  <th className="py-2 pr-3 font-semibold">P</th>
                  <th className="py-2 pr-3 font-semibold">W</th>
                  <th className="py-2 pr-3 font-semibold">L</th>
                  <th className="py-2 font-semibold">OTHER</th>
                </tr>
              </thead>
              <tbody>
                {table.map((r, i) => (
                  <tr key={r.id} className="border-t border-white/5 text-mist">
                    <td className="py-2 pr-3 text-smoke">{i + 1}</td>
                    <td className="py-2 pr-3">
                      <button type="button" onClick={() => navigate(league.id, r.id)} className="text-left text-bone hover:text-[#c9a24b]">
                        {r.team}
                      </button>
                    </td>
                    <td className="py-2 pr-3">{r.played}</td>
                    <td className="py-2 pr-3">{r.won}</td>
                    <td className="py-2 pr-3">{r.lost}</td>
                    <td className="py-2">{r.other || MISSING}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-[11px] text-smoke">Counted from the recorded match results. Points and net run rate are not recorded in the workbook.</p>
        </Card>
      )}

      {league.awards.length > 0 && (
        <Card title="LEAGUE AWARDS" className="mt-8">
          <ul className="grid gap-3 sm:grid-cols-2">
            {league.awards.map((a) => (
              <li key={a.award} className="rounded-lg bg-ink-3 px-4 py-3">
                <p className="text-[11px] font-semibold tracking-wide text-[#c9a24b]">{a.award}</p>
                <p className="mt-1 text-sm text-bone">{a.winner ?? MISSING}</p>
                <p className="text-[12px] text-mist">{[a.team, a.board].filter(Boolean).join(' · ')}</p>
                {a.credits !== undefined && <p className="text-[11px] text-smoke">{fmt(a.credits)} credits</p>}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <AuctionCard league={league} data={data} />
      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <VenuesCard league={league} data={data} onPick={(v) => { setVenue(v); window.setTimeout(() => document.getElementById('results')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50); }} />
        <HeadToHeadCard league={league} data={data} />
      </div>
      <ResultsExplorer league={league} data={data} venue={venue} setVenue={setVenue} />
    </div>
  );
}

function AuctionCard({ league, data }: { league: League; data: Data }) {
  const rows = useMemo(() => data.m.auction(league).filter((r) => r.spent > 0 || r.purse !== undefined), [data, league]);
  if (rows.length === 0) return null;
  const maxSpent = Math.max(1, ...rows.map((r) => r.spent));
  return (
    <Card title="AUCTION · SPEND AND REMAINING PURSE" className="mt-8">
      <ul className="space-y-3">
        {rows.map((r) => (
          <li key={r.team.id} className="grid items-center gap-2 sm:grid-cols-[11rem_1fr_16rem]">
            <button type="button" onClick={() => navigate(league.id, r.team.id)} className="text-left text-sm font-semibold text-bone hover:text-[#c9a24b]">
              {r.team.name}
            </button>
            <span className="h-2.5 overflow-hidden rounded-full bg-ink-3" role="img" aria-label={`${r.team.name} spent ${fmt(r.spent)} credits`}>
              <span className="block h-full rounded-full bg-[#c9a24b]" style={{ width: `${(r.spent / maxSpent) * 100}%` }} />
            </span>
            <span className="text-[12px] text-mist">
              Spent {fmt(r.spent)}
              {r.purse !== undefined && ` · Purse left ${fmt(r.purse)}`}
              {r.top && ` · Top buy ${r.top.name} (${fmt(r.top.price)})`}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-[11px] text-smoke">Spend adds up the recorded price of each squad member. Purse left is the figure in the team's notes.</p>
    </Card>
  );
}

function VenuesCard({ league, data, onPick }: { league: League; data: Data; onPick: (venue: string) => void }) {
  const venues = useMemo(() => data.m.venuesOf(league), [data, league]);
  return (
    <Card title="VENUES">
      {venues.length === 0 ? (
        <p className="text-sm text-smoke">No venues recorded.</p>
      ) : (
        <ul className="space-y-2">
          {venues.map((v) => (
            <li key={v.venue}>
              <button type="button" onClick={() => onPick(v.venue)} className="flex w-full items-baseline justify-between gap-3 border-l border-[#c9a24b]/40 pl-3 text-left hover:text-[#c9a24b]">
                <span className="text-sm text-bone">{v.venue}</span>
                <span className="text-[11px] text-smoke">
                  {v.matches} {v.matches === 1 ? 'match' : 'matches'}
                  {v.topWinner && ` · most wins: ${v.topWinner[0]} (${v.topWinner[1]})`}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function HeadToHeadCard({ league, data }: { league: League; data: Data }) {
  const [a, setA] = useState('');
  const [b, setB] = useState('');
  const res = a && b && a !== b ? data.m.headToHead(league, a, b) : null;
  return (
    <Card title="HEAD TO HEAD">
      <div className="flex flex-wrap gap-2">
        {[
          [a, setA, 'Team A'],
          [b, setB, 'Team B'],
        ].map(([val, set, label]) => (
          <select key={label as string} value={val as string} onChange={(e) => (set as (v: string) => void)(e.target.value)} aria-label={label as string} className="rounded-md border border-white/15 bg-ink-2 px-2 py-1.5 text-xs text-bone outline-none focus:border-[#c9a24b]">
            <option value="">{label as string}</option>
            {league.teams.map((t) => (
              <option key={t.id} value={t.name}>
                {t.name}
              </option>
            ))}
          </select>
        ))}
      </div>
      {!res ? (
        <p className="mt-4 text-sm text-smoke">Pick two different teams to see how they have fared against each other.</p>
      ) : res.games.length === 0 ? (
        <p className="mt-4 text-sm text-smoke">These teams have not met in this league.</p>
      ) : (
        <>
          <p className="mt-4 text-sm text-bone">
            {a} <span className="font-semibold text-[#c9a24b]">{res.aWins}</span> – <span className="font-semibold text-[#c9a24b]">{res.bWins}</span> {b} <span className="text-smoke">in {res.games.length} {res.games.length === 1 ? 'match' : 'matches'}</span>
          </p>
          <ul className="mt-3 space-y-1.5 text-[12px] text-mist">
            {res.games.map((m, i) => (
              <li key={i}>
                {[m.stage, m.date, m.venue].filter(Boolean).join(' · ')} — {m.winner ? `${m.winner} won` : 'no result recorded'}
              </li>
            ))}
          </ul>
        </>
      )}
    </Card>
  );
}
function ResultsExplorer({ league, data, venue, setVenue }: { league: League; data: Data; venue: string; setVenue: (v: string) => void }) {
  const [team, setTeam] = useState('');
  const [umpire, setUmpire] = useState('');
  const [stage, setStage] = useState<'all' | 'league' | 'playoffs'>('all');
  const [newest, setNewest] = useState(false);
  const sel = 'rounded-md border border-white/15 bg-ink-2 px-2 py-1.5 text-xs text-bone outline-none focus:border-[#c9a24b]';

  const umpires = useMemo(() => [...new Set(league.matches.map((m) => m.umpire).filter((u): u is string => !!u))].sort(), [league]);
  const venues = useMemo(() => [...new Set(league.matches.map((m) => m.venue).filter((u): u is string => !!u))].sort(), [league]);
  const shown = league.matches
    .filter((m) => !team || m.teams.includes(team))
    .filter((m) => !venue || m.venue === venue)
    .filter((m) => !umpire || m.umpire === umpire)
    .filter((m) => stage === 'all' || (stage === 'playoffs') === Boolean(m.stage));
  const list = newest ? [...shown].reverse() : shown;
  const filtered = Boolean(team || venue || umpire || stage !== 'all');
  const clear = () => {
    setTeam('');
    setVenue('');
    setUmpire('');
    setStage('all');
  };

  return (
    <section id="results" className="mt-8" aria-label="Matches">
      <h2 className="mb-4 text-[11px] font-semibold tracking-[0.24em] text-[#c9a24b]">RESULTS ({league.matches.length} MATCHES)</h2>
      {league.matches.length === 0 ? (
        <p className="rounded-xl border border-white/10 bg-ink-2 px-5 py-8 text-center text-sm text-mist">No matches have been recorded for this league.</p>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <select value={team} onChange={(e) => setTeam(e.target.value)} aria-label="Filter by team" className={sel}>
              <option value="">All teams</option>
              {league.teams.map((t) => (
                <option key={t.id} value={t.name}>
                  {t.name}
                </option>
              ))}
            </select>
            <select value={venue} onChange={(e) => setVenue(e.target.value)} aria-label="Filter by venue" className={sel}>
              <option value="">All venues</option>
              {venues.map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
            <select value={umpire} onChange={(e) => setUmpire(e.target.value)} aria-label="Filter by umpire" className={sel}>
              <option value="">All umpires</option>
              {umpires.map((u) => (
                <option key={u}>{u}</option>
              ))}
            </select>
            <select value={stage} onChange={(e) => setStage(e.target.value as typeof stage)} aria-label="Filter by stage" className={sel}>
              <option value="all">All stages</option>
              <option value="league">League stage</option>
              <option value="playoffs">Playoffs</option>
            </select>
            <label className="flex items-center gap-2 text-xs text-smoke">
              <input type="checkbox" checked={newest} onChange={(e) => setNewest(e.target.checked)} /> Latest first
            </label>
            {filtered && (
              <button type="button" onClick={clear} className="text-xs font-semibold tracking-[0.2em] text-[#c9a24b] hover:underline">
                CLEAR FILTERS
              </button>
            )}
          </div>
          <p role="status" aria-live="polite" className="mb-3 text-xs text-smoke">
            Showing {list.length} of {league.matches.length} matches
          </p>
          {list.length === 0 ? (
            <p className="rounded-xl border border-white/10 bg-ink-2 px-5 py-8 text-center text-sm text-mist">No matches match your filters.</p>
          ) : (
            <ul className="space-y-2">
              {list.map((m, i) => (
                <MatchRow key={i} m={m} data={data} />
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}

/* ---------- 3. a team ---------- */

type Sort = 'squad' | 'name' | 'price' | 'awards';

function TeamPage({ league, team, data }: { league: League; team: LeagueTeam; data: Data }) {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<Sort>('squad');
  const { favs, toggle: toggleFav } = useFavourites('teams');
  const favId = `${league.id}/${team.id}`;
  const isFav = favs.includes(favId);
  const record = data.m.standings(league).find((r) => r.id === team.id);
  const teamMatches = league.matches.filter((m) => m.teams.includes(team.name));
  const result = team.name === league.champions ? 'Champions' : team.name === league.runnersUp ? 'Runners-up' : team.name === league.fairPlay ? 'Fair Play award' : undefined;

  const awardsOf = (p: LeagueTeam['players'][number]) => (p.mom ?? 0) + (p.bat ?? 0) + (p.bowl ?? 0) + (p.honours?.length ?? 0);
  const q = query.trim().toLowerCase();
  const players = team.players
    .filter((p) => !q || p.name.toLowerCase().includes(q))
    .sort((a, b) => {
      if (sort === 'name') return a.name.localeCompare(b.name);
      if (sort === 'price') return (b.price ?? -1) - (a.price ?? -1);
      if (sort === 'awards') return awardsOf(b) - awardsOf(a);
      return 0;
    });

  return (
    <div className="gutter pb-16 pt-28">
      <Breadcrumb items={[{ label: 'Franchise Leagues', onClick: () => navigate() }, { label: league.name, onClick: () => navigate(league.id) }, { label: team.name }]} />
      <div className="mt-3">
        <BackButton onClick={() => navigate(league.id)}>BACK TO {league.shortName}</BackButton>
      </div>
      <header className="mt-6">
        <p className="text-[11px] font-semibold tracking-[0.3em] text-[#c9a24b]">{league.name.toUpperCase()}</p>
        <h1 className="mt-1 font-display text-[clamp(2.2rem,6vw,4.5rem)] leading-[0.9] tracking-wide text-bone">{team.name.toUpperCase()}</h1>
        {result && <p className="mt-3 w-fit rounded border border-[#c9a24b]/50 px-2 py-0.5 text-[11px] font-semibold tracking-[0.2em] text-[#c9a24b]">{result.toUpperCase()}</p>}
        <div className="mt-3 flex items-center gap-4">
          <button type="button" onClick={() => toggleFav(favId)} aria-pressed={isFav} aria-label={isFav ? `Remove ${team.name} from favourites` : `Add ${team.name} to favourites`} className={`text-lg leading-none ${isFav ? 'text-[#c9a24b]' : 'text-smoke hover:text-bone'}`}>
            {isFav ? '★' : '☆'}
          </button>
          <ShareButton />
        </div>
      </header>

      <Card title="TEAM SUMMARY" className="mt-6">
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Fact label="Players" value={String(team.players.length)} />
          <Fact label="Matches played" value={teamMatches.length ? String(teamMatches.length) : undefined} />
          <Fact label="League-stage record" value={record && record.played ? `${record.won}W – ${record.lost}L` : undefined} />
          <Fact label="Season result" value={result} />
        </dl>
        {team.notes && team.notes.length > 0 && (
          <ul className="mt-4 space-y-1 text-[13px] text-mist">
            {team.notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        )}
      </Card>

      <section className="mt-8" aria-label="Squad">
        <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-[11px] font-semibold tracking-[0.24em] text-[#c9a24b]">SQUAD ({team.players.length})</h2>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search players" aria-label="Search players" className={searchInput} />
            <label className="flex items-center gap-2 text-xs text-smoke">
              Sort
              <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} className="rounded-md border border-white/15 bg-ink-2 px-2 py-1.5 text-xs text-bone outline-none focus:border-[#c9a24b]">
                <option value="squad">Squad order</option>
                <option value="name">Name A → Z</option>
                <option value="price">Price (high first)</option>
                <option value="awards">Most awards</option>
              </select>
            </label>
          </div>
        </div>
        <p className="mb-4 text-[11px] text-smoke">
          Player stats are the award tallies recorded in the workbook (Man of the Match, Best Batsman, Best Bowler) and league honours. Runs and wickets are not recorded.
        </p>
        {team.players.length === 0 ? (
          <Notice tone="info">No players have been recorded for this team.</Notice>
        ) : players.length === 0 ? (
          <p className="rounded-xl border border-white/10 bg-ink-2 px-5 py-8 text-center text-sm text-mist">No players match your search.</p>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-white/10 bg-ink-2">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="text-[10px] tracking-[0.2em] text-smoke">
                  <th className="px-4 py-3 font-semibold">PLAYER</th>
                  <th className="px-2 py-3 font-semibold">ROLE</th>
                  <th className="px-2 py-3 font-semibold">BOARD</th>
                  <th className="px-2 py-3 font-semibold">PRICE</th>
                  <th className="px-2 py-3 font-semibold" title="Man of the Match">
                    MOM
                  </th>
                  <th className="px-2 py-3 font-semibold" title="Best Batsman">
                    BAT
                  </th>
                  <th className="px-2 py-3 font-semibold" title="Best Bowler">
                    BOWL
                  </th>
                  <th className="px-4 py-3 font-semibold">HONOURS</th>
                </tr>
              </thead>
              <tbody>
                {players.map((p) => (
                  <tr key={p.id} className="border-t border-white/5 align-top text-mist">
                    <td className="px-4 py-2.5 font-semibold text-bone">{p.name}</td>
                    <td className="px-2 py-2.5">{p.role ?? MISSING}</td>
                    <td className="px-2 py-2.5">
                      {p.board ? (
                        <span className="flex items-center gap-1.5">
                          <BoardFlag name={p.board} data={data} className="text-base" />
                          {p.board}
                        </span>
                      ) : (
                        MISSING
                      )}
                    </td>
                    <td className="px-2 py-2.5">{fmt(p.price)}</td>
                    <td className="px-2 py-2.5">{p.mom ?? MISSING}</td>
                    <td className="px-2 py-2.5">{p.bat ?? MISSING}</td>
                    <td className="px-2 py-2.5">{p.bowl ?? MISSING}</td>
                    <td className="px-4 py-2.5 text-[12px]">{p.honours?.length ? p.honours.map((h) => h.title).join(', ') : MISSING}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="mt-8" aria-label="Team matches">
        <h2 className="mb-4 text-[11px] font-semibold tracking-[0.24em] text-[#c9a24b]">MATCHES ({teamMatches.length})</h2>
        {teamMatches.length === 0 ? (
          <p className="rounded-xl border border-white/10 bg-ink-2 px-5 py-8 text-center text-sm text-mist">No matches recorded for this team.</p>
        ) : (
          <ul className="space-y-2">
            {teamMatches.map((m, i) => (
              <MatchRow key={i} m={m} data={data} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Fact({ label, value }: { label: string; value?: string }) {
  return (
    <div>
      <dt className="text-[10px] font-semibold tracking-[0.22em] text-smoke">{label.toUpperCase()}</dt>
      <dd className="mt-1 text-sm text-bone">{value ?? MISSING}</dd>
    </div>
  );
}
