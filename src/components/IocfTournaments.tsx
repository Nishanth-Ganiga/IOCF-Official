import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import type { ProfileId } from '../data/portfolio';
import { dataState } from '../data/store';
import type { PlayerStats } from '../data/leagueStats';
import { describeEdition, majorTournaments, type MajorTournament, type TournamentEdition, type TournamentSection } from '../data/tournaments';
import { awardsFor, boardSlug, groupsOf, groupTotals, loadTournamentStats, otherTournaments, type AllTournamentStats, type BoardGroup } from '../data/tournamentStats';
import { useSmoothScroll } from '../hooks/smoothScroll';
import { EASE } from './fx';
import { IocfHeader, LOGO } from './IocfHome';
import { Flag } from './IocfChairmen';
import { BackButton, Breadcrumb, Card, Loading, Notice, searchInput } from './IocfPlayers';
import { Stat, StatCards } from './PlayerStatCards';
import SiteFooter, { ShareButton } from './SiteFooter';

const ROUTE = '#/tournaments';

const container = { hidden: {}, show: { transition: { staggerChildren: 0.09, delayChildren: 0.2 } } };
const item = {
  hidden: { opacity: 0, y: 24, filter: 'blur(8px)' },
  show: { opacity: 1, y: 0, filter: 'blur(0px)', transition: { duration: 0.8, ease: EASE } },
};

/** Routes: `#/tournaments`, `#/tournaments/<id>`, `#/tournaments/<id>/<year>`. */
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

/** What each tournament is, in a sentence or two (from its sheet). Edit here if a tournament's format changes. */
const ABOUT: Record<string, string> = {
  't20-world-cup': 'The flagship T20 event. Ten boards are drawn into two groups of five; the top three of each group go through to a Super 6 stage, followed by the semi-finals and the final.',
  'euro-cup': 'England, Scotland, the Netherlands and Italy play a league of matches followed by a final.',
  'oceania-cup': 'New Zealand, Australia, West Indies and South Africa play a league of matches followed by a final.',
  'asia-cup': 'Six boards — India, Pakistan, Qatar, Bangladesh, Sri Lanka and the UAE — play a league round, then two semi-finals and a final.',
  'associate-nations-cup': 'The associate boards — the USA, Ireland, Zimbabwe, Canada and Uganda — play a league of matches followed by a final.',
  'odi-world-cup': 'The 50-over world championship. Fourteen boards with 18-player squads play in two pools of seven, then quarter-finals, semi-finals and the final.',
  'world-test-championship': 'Three-day Test matches between boards. Each match carries a bet amount, and the championship tracks completed matches, upcoming fixtures and the pending schedule.',
  'emerging-talents-league': 'A league for young talent: four boards (Scotland, New Zealand, West Indies and England) field squads that include a few experienced players, marked "Exp".',
  'womens-global-league': "The IOCF's women's competition. Five boards play each other, then the top sides contest the qualifiers and the final.",
  'lone-warrior': 'An individual tournament. One player from each of twelve boards plays in two groups of six, followed by quarter-finals, semi-finals and the grand final.',
};

const fmtYears = (t: MajorTournament) => t.editions.map((e) => e.year).join(' · ');

export default function IocfTournaments({ profileId, onSwitch }: { profileId: ProfileId; onSwitch: (id: ProfileId) => void }) {
  const { scrollTo } = useSmoothScroll();
  const [id, yearPart, boardPart, playerPart] = useRoute();
  const tournaments = majorTournaments();

  useEffect(() => {
    scrollTo(0, { offset: 0 });
  }, [id, yearPart, boardPart, playerPart, scrollTo]);

  const go = (target: string) => {
    const scroll = () => scrollTo(target === 'top' ? 0 : `#${target}`, { offset: target === 'top' ? 0 : -72 });
    if (id) {
      navigate();
      window.setTimeout(scroll, 150);
    } else scroll();
  };
  const links = [
    { id: 'top', label: 'Home' },
    { id: 'tournaments', label: 'Tournaments' },
  ];

  const tournament = tournaments.find((t) => t.id === id);
  const edition = tournament?.editions.find((e) => String(e.year) === yearPart);

  let body;
  if (!id) body = <IndexPage tournaments={tournaments} />;
  else if (!tournament) body = <NotFound what="tournament" />;
  else if (!yearPart) body = <TournamentPage t={tournament} />;
  else if (!edition) body = <NotFound what="edition" back={{ label: tournament.name, to: [tournament.id] }} />;
  else if (!boardPart) body = <EditionPage t={tournament} e={edition} />;
  else body = <StatsRoute t={tournament} e={edition} boardId={boardPart} playerId={playerPart} />;

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

function NotFound({ what, back }: { what: string; back?: { label: string; to: string[] } }) {
  return (
    <div className="gutter pt-32 text-center">
      <p className="text-sm text-mist">That {what} could not be found.</p>
      <button type="button" onClick={() => (back ? navigate(...back.to) : navigate())} className="mt-4 text-xs font-semibold tracking-[0.2em] text-[#c9a24b] hover:underline">
        {back ? `BACK TO ${back.label.toUpperCase()}` : 'BACK TO MAJOR TOURNAMENTS'}
      </button>
    </div>
  );
}

/* ---------- 1. all tournaments ---------- */

function IndexPage({ tournaments }: { tournaments: MajorTournament[] }) {
  return (
    <>
      <section id="top" className="relative overflow-hidden">
        <div aria-hidden className="absolute inset-0 bg-[radial-gradient(55%_60%_at_78%_45%,rgba(107,18,41,0.35),transparent_70%)]" />
        <div className="gutter relative z-[2] grid w-full items-center gap-8 pb-10 pt-24 lg:grid-cols-[1.15fr_1fr] lg:pt-28">
          <motion.div variants={container} initial="hidden" animate="show" className="order-2 lg:order-1">
            <motion.p variants={item} className="font-sans text-[11px] font-semibold tracking-[0.3em] text-[#c9a24b] sm:text-xs">
              INTERNATIONAL ONLINE CRICKET FEDERATION
            </motion.p>
            <motion.h1 variants={item} className="mt-3 font-display leading-[0.9] tracking-[0.02em] text-bone" style={{ fontSize: 'clamp(2.8rem, 7vw, 6rem)' }}>
              IOCF MAJOR TOURNAMENTS
            </motion.h1>
            <motion.p variants={item} className="mt-4 font-sans text-xs font-bold tracking-[0.3em] text-bone sm:text-sm">
              {tournaments.length} TOURNAMENTS • SQUADS • RESULTS • AWARDS
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

      <section aria-label="About the major tournaments" className="gutter pb-4">
        <Card title="ABOUT THE MAJOR TOURNAMENTS">
          <div className="space-y-3 text-[15px] leading-relaxed text-bone/80">
            <p>
              The IOCF Major Tournaments are the federation&apos;s biggest competitions, where national boards — and, in the Lone Warrior, individual players — come together to play for
              world, continental and special titles. All ten tournaments below belong to the 2026 season.
            </p>
            <p>
              Choose a tournament, then its 2026 edition, to open everything the official IOCF workbook records for it: the squads, groups and pools; the full schedule with the winner of every
              match and, where recorded, its venue, umpire, Man of the Match, Best Batsman and Best Bowler; the tournament awards and the credits that went with them; the Fantasy League and
              Prediction Contest results; and the credits paid to each participating board. The pages update as the workbook does.
            </p>
          </div>
          <ul className="mt-5 grid gap-x-8 gap-y-3 border-t border-white/5 pt-4 md:grid-cols-2">
            {tournaments.map((t) => (
              <li key={t.id} className="border-l border-[#c9a24b]/40 pl-3">
                <p className="text-sm font-semibold text-bone">{t.name}</p>
                <p className="mt-0.5 text-[13px] leading-relaxed text-mist">{ABOUT[t.id] ?? `An IOCF ${t.kind.toLowerCase()}.`}</p>
              </li>
            ))}
          </ul>
        </Card>
      </section>

      <section id="tournaments" aria-label="Major tournaments" className="gutter py-10 sm:py-14">
        <h2 className="mb-4 text-[11px] font-semibold tracking-[0.24em] text-[#c9a24b]">TOURNAMENTS ({tournaments.length})</h2>
        {tournaments.length === 0 ? (
          <div className="rounded-xl border border-white/10 bg-ink-2 px-5 py-12 text-center">
            <p className="text-sm text-bone">The tournament sheets could not be loaded.</p>
            <p className="mt-1 text-xs text-smoke">Please refresh the page to try again. (Data source: {dataState.origin}.)</p>
          </div>
        ) : (
          <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {tournaments.map((t) => {
              const e = t.editions[t.editions.length - 1];
              return (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => navigate(t.id)}
                    aria-label={`Open ${t.name}`}
                    className="group flex h-full w-full flex-col gap-3 rounded-2xl border border-white/10 bg-ink-2 p-5 text-left transition-[border-color,transform] duration-300 hover:-translate-y-0.5 hover:border-[#c9a24b]/50"
                  >
                    <span className="flex items-center justify-between gap-3">
                      <span className="text-[11px] font-semibold tracking-[0.24em] text-[#c9a24b]">{t.kind.toUpperCase()}</span>
                      <span className="rounded-full border border-[#c9a24b]/50 px-2.5 py-0.5 text-[10px] font-semibold tracking-[0.18em] text-[#c9a24b]">{fmtYears(t)}</span>
                    </span>
                    <span className="font-display text-2xl leading-tight tracking-wide text-bone">{t.name.toUpperCase()}</span>
                    <span className="flex flex-col gap-0.5 text-xs text-mist">
                      {e.host && <span>Host: {e.host}</span>}
                      <span className="text-smoke">{e.champions ? `Champions: ${e.champions}` : 'Champions: not recorded'}</span>
                    </span>
                    <span className="mt-auto pt-2 text-xs font-semibold tracking-[0.2em] text-[#c9a24b] transition group-hover:translate-x-1">VIEW TOURNAMENT →</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </>
  );
}

/* ---------- 2. a tournament: its editions ---------- */

function TournamentPage({ t }: { t: MajorTournament }) {
  return (
    <div className="gutter pb-16 pt-28">
      <Breadcrumb items={[{ label: 'Major Tournaments', onClick: () => navigate() }, { label: t.name }]} />
      <div className="mt-3">
        <BackButton onClick={() => navigate()}>BACK TO MAJOR TOURNAMENTS</BackButton>
      </div>
      <header className="mt-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold tracking-[0.3em] text-[#c9a24b]">{t.kind.toUpperCase()}</p>
          <h1 className="mt-1 font-display text-[clamp(2.2rem,6vw,4.5rem)] leading-[0.9] tracking-wide text-bone">{t.name.toUpperCase()}</h1>
        </div>
        <ShareButton />
      </header>

      <Card title="ABOUT THIS TOURNAMENT" className="mt-6">
        <p className="text-[15px] leading-relaxed text-bone/80">{ABOUT[t.id] ?? `An IOCF ${t.kind.toLowerCase()}.`}</p>
      </Card>

      <section className="mt-8" aria-label="Editions">
        <h2 className="mb-1 text-[11px] font-semibold tracking-[0.24em] text-[#c9a24b]">EDITIONS ({t.editions.length})</h2>
        <p className="mb-4 text-sm text-mist">Choose a year to see everything recorded for that edition.</p>
        <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {t.editions.map((e) => (
            <li key={e.year}>
              <button
                type="button"
                onClick={() => navigate(t.id, String(e.year))}
                aria-label={`Open ${t.name} ${e.year}`}
                className="group flex h-full w-full flex-col gap-3 rounded-2xl border border-white/10 bg-ink-2 p-5 text-left transition-[border-color,transform] duration-300 hover:-translate-y-0.5 hover:border-[#c9a24b]/50"
              >
                <span className="text-[11px] font-semibold tracking-[0.24em] text-[#c9a24b]">{t.name.toUpperCase()}</span>
                <span className="font-display text-5xl leading-tight tracking-wide text-bone">{e.year}</span>
                <span className="flex flex-col gap-0.5 text-xs text-mist">
                  {e.host && <span>Host: {e.host}</span>}
                  <span className="text-smoke">{e.champions ? `Champions: ${e.champions}` : 'Champions: not recorded'}</span>
                  {e.runnersUp && <span className="text-smoke">Runners-up: {e.runnersUp}</span>}
                </span>
                <span className="mt-auto pt-2 text-xs font-semibold tracking-[0.2em] text-[#c9a24b] transition group-hover:translate-x-1">OPEN {e.year} →</span>
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

/* ---------- 3. an edition: everything in the sheet ---------- */

function EditionPage({ t, e }: { t: MajorTournament; e: TournamentEdition }) {
  const [query, setQuery] = useState('');
  const { all, failed } = useTournamentStats();
  const boards = useBoards();
  const q = query.trim().toLowerCase();
  const shown = useMemo(
    () =>
      e.sections
        .map((s, i) => ({ s, i }))
        .map(({ s, i }) => {
          if (!q) return { s, i, rows: s.rows };
          // a section whose heading matches shows in full; otherwise only the rows that mention the search
          const headMatch = [...s.titles, ...s.columns].some((x) => x.toLowerCase().includes(q));
          return { s, i, rows: headMatch ? s.rows : s.rows.filter((r) => r.some((c) => c.toLowerCase().includes(q))) };
        })
        .filter((x) => !q || x.rows.length > 0 || x.s.titles.some((y) => y.toLowerCase().includes(q))),
    [e, q],
  );
  const facts = [
    { label: 'Host', value: e.host },
    { label: 'Champions', value: e.champions },
    { label: 'Runners-up', value: e.runnersUp },
  ].filter((f) => f.value);
  const jump = (i: number) => document.getElementById(`section-${i}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  const label = (s: TournamentSection, i: number) => s.titles[s.titles.length - 1] ?? s.columns[0] ?? `Table ${i + 1}`;
  const nav = e.sections.map((s, i) => ({ i, label: label(s, i) })).filter((x, k, all) => all.findIndex((y) => y.label === x.label) === k);

  return (
    <div className="gutter pb-16 pt-28">
      <Breadcrumb items={[{ label: 'Major Tournaments', onClick: () => navigate() }, { label: t.name, onClick: () => navigate(t.id) }, { label: String(e.year) }]} />
      <div className="mt-3">
        <BackButton onClick={() => navigate(t.id)}>BACK TO {t.name.toUpperCase()}</BackButton>
      </div>
      <header className="mt-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold tracking-[0.3em] text-[#c9a24b]">{t.kind.toUpperCase()} · {e.year}</p>
          <h1 className="mt-1 font-display text-[clamp(2.2rem,6vw,4.5rem)] leading-[0.9] tracking-wide text-bone">
            {t.name.toUpperCase()} {e.year}
          </h1>
        </div>
        <ShareButton />
      </header>

      <Card title="OVERVIEW" className="mt-6">
        <div className="space-y-2 text-[15px] leading-relaxed text-bone/80">
          {describeEdition(t, e).map((p) => (
            <p key={p}>{p}</p>
          ))}
        </div>
        {facts.length > 0 && (
          <dl className="mt-5 grid grid-cols-2 gap-4 border-t border-white/5 pt-4 sm:grid-cols-3">
            {facts.map((f) => (
              <div key={f.label}>
                <dt className="text-[10px] font-semibold tracking-[0.22em] text-smoke">{f.label.toUpperCase()}</dt>
                <dd className="mt-1 text-sm text-bone">{f.value}</dd>
              </div>
            ))}
          </dl>
        )}
      </Card>

      <StatsSection t={t} e={e} all={all} failed={failed} boards={boards} />

      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <nav aria-label="Tables in this tournament" className="flex flex-wrap gap-2">
          <button type="button" onClick={() => document.getElementById('player-statistics')?.scrollIntoView({ behavior: 'smooth', block: 'start' })} className="rounded-full border border-[#c9a24b]/60 px-3.5 py-1.5 text-xs font-semibold tracking-wide text-[#c9a24b] transition hover:bg-[#c9a24b] hover:text-ink">
            Player Statistics
          </button>
          {nav.map((x) => (
            <button key={x.i} type="button" onClick={() => jump(x.i)} className="rounded-full border border-white/15 px-3.5 py-1.5 text-xs font-semibold tracking-wide text-mist transition hover:border-[#c9a24b] hover:text-[#c9a24b]">
              {x.label}
            </button>
          ))}
        </nav>
        <input type="search" value={query} onChange={(ev) => setQuery(ev.target.value)} placeholder="Search this tournament" aria-label="Search this tournament" className={searchInput} />
      </div>
      {q && (
        <p role="status" aria-live="polite" className="mt-3 text-xs text-smoke">
          {shown.reduce((n, x) => n + x.rows.length, 0)} matching rows in {shown.length} {shown.length === 1 ? 'table' : 'tables'}
        </p>
      )}

      {shown.length === 0 ? (
        <p className="mt-6 rounded-xl border border-white/10 bg-ink-2 px-5 py-10 text-center text-sm text-mist">Nothing matches your search.</p>
      ) : (
        shown.map(({ s, i, rows }) => <SectionTable key={i} id={`section-${i}`} s={s} rows={rows} />)
      )}
    </div>
  );
}

/* ---------- player statistics: boards → players → one player ---------- */

function useTournamentStats() {
  const [state, setState] = useState<{ all: AllTournamentStats | null; failed: boolean }>({ all: null, failed: false });
  useEffect(() => {
    loadTournamentStats().then(
      (all) => setState({ all, failed: false }),
      () => setState({ all: null, failed: true }),
    );
  }, []);
  return state;
}

type BoardsModule = typeof import('../data/boards');
function useBoards() {
  const [mod, setMod] = useState<BoardsModule | null>(null);
  useEffect(() => {
    import('../data/boards').then(setMod, () => undefined);
  }, []);
  return mod;
}

function BoardFlag({ name, boards, className = 'text-3xl' }: { name: string; boards: BoardsModule | null; className?: string }) {
  const b = boards?.boards.find((x) => x.name === name);
  return b ? <Flag board={b} className={className} /> : null;
}

const fmt = (n: number) => n.toLocaleString('en-US');
const same = (a?: string, b?: string) => !!a && !!b && a.toLowerCase().replace(/[^a-z0-9]/g, '') === b.toLowerCase().replace(/[^a-z0-9]/g, '');

export function StatsSection({ t, e, all, failed, boards }: { t: MajorTournament; e: TournamentEdition; all: AllTournamentStats | null; failed: boolean; boards: BoardsModule | null }) {
  const groups = useMemo(() => groupsOf(all?.[t.id]), [all, t.id]);
  return (
    <section id="player-statistics" className="mt-8 scroll-mt-24" aria-label="Player statistics">
      <h2 className="font-display text-2xl tracking-wide text-bone sm:text-3xl">PLAYER STATISTICS{groups.length > 0 ? ` (${groups.length} BOARDS)` : ''}</h2>
      <p className="mt-1 text-sm text-mist">Choose a board to see its players, then a player for his full {e.year} statistics and awards.</p>
      {failed ? (
        <div className="mt-4"><Notice tone="error">The player statistics could not be loaded. Please refresh the page to try again.</Notice></div>
      ) : !all ? (
        <ul aria-busy="true" aria-label="Loading boards" className="mt-4 grid grid-cols-1 gap-4 min-[420px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <li key={i} className="h-36 animate-pulse rounded-2xl border border-white/5 bg-ink-2" />
          ))}
        </ul>
      ) : groups.length === 0 ? (
        <p className="mt-4 rounded-xl border border-white/10 bg-ink-2 px-5 py-8 text-center text-sm text-mist">Player statistics have not been recorded for this tournament yet.</p>
      ) : (
        <ul className="mt-4 grid grid-cols-1 gap-4 min-[420px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {groups.map((g) => {
            const totals = groupTotals(g.players);
            const champion = same(g.name, e.champions);
            return (
              <li key={g.slug}>
                <button
                  type="button"
                  onClick={() => navigate(t.id, String(e.year), g.slug)}
                  aria-label={`Open ${g.name} players`}
                  className="group flex h-full w-full flex-col gap-2 rounded-2xl border border-white/10 bg-ink-2 p-4 text-left transition-[border-color,transform] duration-300 hover:-translate-y-0.5 hover:border-[#c9a24b]/50"
                >
                  <span className="flex items-start justify-between gap-2">
                    <span className="text-base font-semibold leading-tight text-bone">{g.name}{g.squad ? <span className="ml-1.5 text-[11px] font-normal text-smoke">{g.squad}</span> : null}</span>
                    <BoardFlag name={g.name} boards={boards} className="text-2xl" />
                  </span>
                  <span className="text-xs text-mist">
                    {g.players.length} players · {fmt(totals.runs)} runs · {fmt(totals.wickets)} wkts
                  </span>
                  {champion && <span className="w-fit rounded border border-[#c9a24b]/50 px-1.5 py-px text-[10px] font-semibold tracking-wider text-[#c9a24b]">CHAMPIONS</span>}
                  <span className="mt-auto pt-2 text-xs font-semibold tracking-[0.2em] text-[#c9a24b] transition group-hover:translate-x-1">VIEW PLAYERS →</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function StatsRoute({ t, e, boardId, playerId }: { t: MajorTournament; e: TournamentEdition; boardId: string; playerId?: string }) {
  const { all, failed } = useTournamentStats();
  const boards = useBoards();
  const groups = useMemo(() => groupsOf(all?.[t.id]), [all, t.id]);
  const back = { label: `${t.name} ${e.year}`, to: [t.id, String(e.year)] };
  if (failed) return <div className="gutter pt-32"><Notice tone="error">The player statistics could not be loaded. Please refresh the page to try again.</Notice></div>;
  if (!all) return <Loading />;
  const group = groups.find((g) => g.slug === boardId);
  if (!group) return <NotFound what="board" back={back} />;
  if (!playerId) return <BoardPage t={t} e={e} group={group} boards={boards} />;
  const player = group.players.find((p) => p.id === playerId);
  if (!player) return <NotFound what="player" back={{ label: group.name, to: [t.id, String(e.year), group.slug] }} />;
  return <PlayerPage t={t} e={e} group={group} player={player} all={all} boards={boards} />;
}

type TileSort = 'runs' | 'wickets' | 'matches' | 'name';

export function BoardPage({ t, e, group, boards }: { t: MajorTournament; e: TournamentEdition; group: BoardGroup; boards: BoardsModule | null }) {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<TileSort>('runs');
  const totals = useMemo(() => groupTotals(group.players), [group]);
  const q = query.trim().toLowerCase();
  const players = group.players
    .filter((p) => !q || p.name.toLowerCase().includes(q))
    .sort((a, b) => {
      if (sort === 'name') return a.name.localeCompare(b.name);
      const key = (p: PlayerStats) => (sort === 'runs' ? p.runs : sort === 'wickets' ? p.wickets : p.matches);
      return key(b) - key(a) || a.name.localeCompare(b.name);
    });
  const year = String(e.year);
  const champion = same(group.name, e.champions);
  return (
    <div className="gutter pb-16 pt-28">
      <Breadcrumb items={[{ label: 'Major Tournaments', onClick: () => navigate() }, { label: t.name, onClick: () => navigate(t.id) }, { label: year, onClick: () => navigate(t.id, year) }, { label: group.name }]} />
      <div className="mt-3">
        <BackButton onClick={() => navigate(t.id, year)}>BACK TO {t.name.toUpperCase()} {year}</BackButton>
      </div>
      <header className="mt-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold tracking-[0.3em] text-[#c9a24b]">{t.name.toUpperCase()} · {year} · PLAYER STATISTICS</p>
          <h1 className="mt-1 flex items-center gap-4 font-display text-[clamp(2.2rem,6vw,4.5rem)] leading-[0.9] tracking-wide text-bone">
            {group.name.toUpperCase()}
            <BoardFlag name={group.name} boards={boards} className="text-4xl" />
          </h1>
          {(group.squad || champion) && (
            <p className="mt-3 flex flex-wrap gap-2">
              {group.squad && <span className="rounded border border-white/20 px-2 py-0.5 text-[11px] font-semibold tracking-[0.2em] text-mist">{group.squad.toUpperCase()} SQUAD</span>}
              {champion && <span className="rounded border border-[#c9a24b]/50 px-2 py-0.5 text-[11px] font-semibold tracking-[0.2em] text-[#c9a24b]">CHAMPIONS</span>}
            </p>
          )}
        </div>
        <ShareButton />
      </header>

      <Card title="BOARD SUMMARY" className="mt-6">
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-7">
          <Stat label="Players" value={group.players.length} />
          <Stat label="Runs" value={fmt(totals.runs)} />
          <Stat label="Wickets" value={fmt(totals.wickets)} />
          <Stat label="Sixes" value={fmt(totals.sixes)} />
          <Stat label="Fours" value={fmt(totals.fours)} />
          <Stat label="Hundreds" value={fmt(totals.hundreds)} />
          <Stat label="Fifties" value={fmt(totals.fifties)} />
        </dl>
      </Card>

      <section className="mt-8" aria-label="Players">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-[11px] font-semibold tracking-[0.24em] text-[#c9a24b]">PLAYERS ({group.players.length})</h2>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <input type="search" value={query} onChange={(ev) => setQuery(ev.target.value)} placeholder="Search players" aria-label="Search players" className={searchInput} />
            <label className="flex items-center gap-2 text-xs text-smoke">
              Sort
              <select value={sort} onChange={(ev) => setSort(ev.target.value as TileSort)} className="rounded-md border border-white/15 bg-ink-2 px-2 py-1.5 text-xs text-bone outline-none focus:border-[#c9a24b]">
                <option value="runs">Most runs</option>
                <option value="wickets">Most wickets</option>
                <option value="matches">Most matches</option>
                <option value="name">Name A → Z</option>
              </select>
            </label>
          </div>
        </div>
        {players.length === 0 ? (
          <p className="rounded-xl border border-white/10 bg-ink-2 px-5 py-8 text-center text-sm text-mist">No players match your search.</p>
        ) : (
          <ul className="grid grid-cols-1 gap-4 min-[420px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {players.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => navigate(t.id, year, group.slug, p.id)}
                  aria-label={`Open ${p.name}`}
                  className="group flex h-full w-full flex-col gap-2 rounded-2xl border border-white/10 bg-ink-2 p-4 text-left transition-[border-color,transform] duration-300 hover:-translate-y-0.5 hover:border-[#c9a24b]/50"
                >
                  <span className="text-base font-semibold leading-tight text-bone">{p.name}</span>
                  <span className="text-[11px] text-smoke">
                    {p.matches} {p.matches === 1 ? 'match' : 'matches'}
                  </span>
                  <span className="grid grid-cols-3 gap-2 text-center">
                    {[
                      ['RUNS', p.runs],
                      ['WKTS', p.wickets],
                      ['SIXES', p.sixes],
                    ].map(([l, v]) => (
                      <span key={l} className="rounded-lg bg-ink-3 py-1.5">
                        <span className="block text-sm font-semibold text-bone">{v}</span>
                        <span className="block text-[9px] tracking-[0.18em] text-smoke">{l}</span>
                      </span>
                    ))}
                  </span>
                  {(p.pom > 0 || p.hundreds > 0) && (
                    <span className="flex flex-wrap gap-1.5">
                      {p.pom > 0 && <span className="rounded border border-[#c9a24b]/50 px-1.5 py-px text-[10px] font-semibold tracking-wider text-[#c9a24b]">MoM ×{p.pom}</span>}
                      {p.hundreds > 0 && <span className="rounded border border-[#c9a24b]/50 px-1.5 py-px text-[10px] font-semibold tracking-wider text-[#c9a24b]">{p.hundreds === 1 ? '100' : `${p.hundreds} × 100`}</span>}
                    </span>
                  )}
                  <span className="mt-auto pt-1 text-xs font-semibold tracking-[0.2em] text-[#c9a24b] transition group-hover:translate-x-1">VIEW STATS →</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

export function PlayerPage({ t, e, group, player: p, all, boards }: { t: MajorTournament; e: TournamentEdition; group: BoardGroup; player: PlayerStats; all: AllTournamentStats; boards: BoardsModule | null }) {
  const year = String(e.year);
  const awards = useMemo(() => awardsFor(e, p, all[t.id]), [e, p, all, t.id]);
  const others = useMemo(() => otherTournaments(all, { tournamentId: t.id, name: p.name }), [all, t.id, p.name]);
  const period = `in the ${t.name} ${year}`;
  return (
    <div className="gutter pb-16 pt-28">
      <Breadcrumb
        items={[
          { label: 'Major Tournaments', onClick: () => navigate() },
          { label: t.name, onClick: () => navigate(t.id) },
          { label: year, onClick: () => navigate(t.id, year) },
          { label: group.name, onClick: () => navigate(t.id, year, group.slug) },
          { label: p.name },
        ]}
      />
      <div className="mt-3">
        <BackButton onClick={() => navigate(t.id, year, group.slug)}>BACK TO {group.name.toUpperCase()}</BackButton>
      </div>
      <header className="mt-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold tracking-[0.3em] text-[#c9a24b]">{t.name.toUpperCase()} · {year}</p>
          <h1 className="mt-1 font-display text-[clamp(2.2rem,6vw,4.5rem)] leading-[0.9] tracking-wide text-bone">{p.name.toUpperCase()}</h1>
          <p className="mt-3 flex items-center gap-2 text-sm text-mist">
            <BoardFlag name={group.name} boards={boards} className="text-lg" />
            <button type="button" onClick={() => navigate(t.id, year, group.slug)} className="font-semibold text-bone hover:text-[#c9a24b]">
              {group.name}
            </button>
            {group.squad && <span className="text-smoke">· {group.squad} squad</span>}
          </p>
        </div>
        <ShareButton />
      </header>

      <Card title="PLAYER PROFILE" className="mt-6">
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat label="Matches" value={p.matches} />
          <Stat label="Runs" value={fmt(p.runs)} />
          <Stat label="Wickets" value={p.wickets} />
          <Stat label="Man of the Match" value={p.pom} />
        </dl>
      </Card>

      <StatCards p={p} period={period} />

      <Card title="AWARDS" className="mt-8">
        {awards.length === 0 && p.pom === 0 ? (
          <p className="text-sm text-smoke">No awards recorded for this player {period}.</p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {p.pom > 0 && (
              <li className="rounded-lg bg-ink-3 px-4 py-3">
                <p className="text-[11px] font-semibold tracking-wide text-[#c9a24b]">Man of the Match</p>
                <p className="mt-1 text-sm text-bone">{p.pom} {p.pom === 1 ? 'time' : 'times'}</p>
              </li>
            )}
            {awards.map((a, i) => (
              <li key={`${a.award}-${i}`} className="rounded-lg bg-ink-3 px-4 py-3">
                <p className="text-[11px] font-semibold tracking-wide text-[#c9a24b]">{a.award}</p>
                {a.detail && <p className="mt-1 text-sm text-bone">{a.detail}</p>}
                {a.credits && <p className="text-[11px] text-smoke">{a.credits} credits</p>}
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-[11px] text-smoke">Tournament awards are read from the tournament's awards tables and matched by name (a shortened name counts when it fits only one player of the board). Man of the Match comes from the scorer's statistics.</p>
      </Card>

      {others.length > 0 && (
        <Card title="OTHER MAJOR TOURNAMENTS" className="mt-8">
          <ul className="space-y-2">
            {others.map((o) => (
              <li key={o.tournamentId}>
                <button type="button" onClick={() => navigate(o.tournamentId, year, boardSlug(o.board), o.p.id)} className="flex w-full flex-wrap items-baseline justify-between gap-x-3 border-l border-[#c9a24b]/40 pl-3 text-left hover:text-[#c9a24b]">
                  <span className="text-sm text-bone">
                    {majorTournaments().find((x) => x.id === o.tournamentId)?.name ?? o.tournamentId} · {o.board}
                  </span>
                  <span className="text-[11px] text-smoke">
                    {o.p.matches} {o.p.matches === 1 ? 'match' : 'matches'} · {o.p.runs} runs · {o.p.wickets} wkts
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[11px] text-smoke">Matched by exact name.</p>
        </Card>
      )}
    </div>
  );
}

function SectionTable({ id, s, rows }: { id: string; s: TournamentSection; rows: string[][] }) {
  const [main, ...rest] = s.titles;
  const width = Math.max(s.columns.length, ...rows.map((r) => r.length), 1);
  return (
    <section id={id} className="mt-8 scroll-mt-24" aria-label={main ?? 'Table'}>
      {main && <h2 className="font-display text-2xl tracking-wide text-bone sm:text-3xl">{main.toUpperCase()}</h2>}
      {rest.map((x) => (
        <p key={x} className="mt-0.5 text-sm text-mist">
          {x}
        </p>
      ))}
      {rows.length > 0 && (
        <div className="mt-3 overflow-x-auto rounded-2xl border border-white/10 bg-ink-2">
          <table className="w-full text-left text-sm" style={{ minWidth: `${Math.min(width, 8) * 9}rem` }}>
            {s.columns.length > 0 && (
              <thead>
                <tr className="text-[10px] tracking-[0.18em] text-smoke">
                  {s.columns.map((c, k) => (
                    <th key={k} className="whitespace-nowrap px-4 py-3 font-semibold">
                      {c.toUpperCase()}
                    </th>
                  ))}
                </tr>
              </thead>
            )}
            <tbody>
              {rows.map((r, k) => {
                const champion = /^champions?$/i.test(r[0] ?? '');
                return (
                  <tr key={k} className={`border-t border-white/5 align-top ${champion ? 'bg-[#c9a24b]/10 text-bone' : 'text-mist'}`}>
                    {Array.from({ length: width }, (_, c) => (
                      <td key={c} className={`px-4 py-2.5 ${c === 0 ? 'font-semibold text-bone' : ''} ${champion ? 'font-semibold text-[#c9a24b]' : ''}`}>
                        {r[c]}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
