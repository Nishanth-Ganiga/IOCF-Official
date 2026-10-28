import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import type { Board } from '../data/boards';
import {
  bestFormat, councilGroups, councilOf, creditsOf, hallOfFameOf, honoursOf, leagueAwardsOf, leagueFootprint, movement, overallRank, rankIn, REGION_ORDER, regionOf, sponsorsOf,
  squadAwardsByTournament, strength, titlesOf, topAchievers, winRate,
} from '../data/boardInsights';
import type { ProfileId } from '../data/portfolio';
import { store } from '../data/store';
import { useSmoothScroll } from '../hooks/smoothScroll';
import { EASE } from './fx';
import { Flag } from './IocfChairmen';
import { IocfHeader, LOGO } from './IocfHome';
import { Avatar, BackButton, Breadcrumb, Card, Fact, Loading, Notice, searchInput } from './IocfPlayers';
import { Compare, Councils, Credits, Leadership, Rankings, Sponsors } from './IocfBoardPages';
import { Bar, chip, fmtNum, GOLD, InstagramLink, linkBtn, Move, navigate, selectCls, StarButton, useData, useFavs, useRoute, type Data } from './boardKit';
import { downloadBoardReport } from './boardReport';
import { announcementsFor } from '../data/chairmanContent';
import SiteFooter from './SiteFooter';

const container = { hidden: {}, show: { transition: { staggerChildren: 0.09, delayChildren: 0.2 } } };
const item = {
  hidden: { opacity: 0, y: 24, filter: 'blur(8px)' },
  show: { opacity: 1, y: 0, filter: 'blur(0px)', transition: { duration: 0.8, ease: EASE } },
};

const PAGES = ['rankings', 'compare', 'sponsors', 'councils', 'credits', 'leadership'];
const NAV = [
  { id: 'top', label: 'Home' },
  { id: 'boards', label: 'Boards' },
  { id: 'rankings', label: 'Rankings' },
  { id: 'compare', label: 'Compare' },
  { id: 'sponsors', label: 'Sponsors' },
  { id: 'councils', label: 'Councils' },
  { id: 'credits', label: 'Credits' },
  { id: 'leadership', label: 'Leadership' },
];

export default function IocfBoards({ profileId, onSwitch }: { profileId: ProfileId; onSwitch: (id: ProfileId) => void }) {
  const { scrollTo } = useSmoothScroll();
  const { data, failed } = useData();
  const [page, arg] = useRoute();

  useEffect(() => {
    scrollTo(0, { offset: 0 });
  }, [page, arg, scrollTo]);

  const go = (id: string) => {
    if (id === 'top' || id === 'boards') {
      if (!page && id === 'boards') scrollTo('#boards', { offset: -72 });
      else navigate();
    } else navigate(id);
  };
  const searchable = useMemo(() => [...NAV, ...(data?.b.boards.map((b) => ({ id: data.b.boardSlug(b), label: b.name })) ?? [])], [data]);

  const board = data && page && !PAGES.includes(page) ? data.b.boards.find((b) => data.b.boardSlug(b) === page) : undefined;

  let body;
  if (failed) body = <Notice tone="error">The boards could not be loaded. Please refresh the page to try again.</Notice>;
  else if (!data) body = <Loading />;
  else if (!page) body = <Directory data={data} />;
  else if (page === 'rankings') body = <Rankings data={data} />;
  else if (page === 'compare') body = <Compare data={data} arg={arg} />;
  else if (page === 'sponsors') body = <Sponsors data={data} />;
  else if (page === 'councils') body = <Councils data={data} />;
  else if (page === 'credits') body = <Credits data={data} />;
  else if (page === 'leadership') body = <Leadership data={data} />;
  else if (!board) body = <NotFound />;
  else body = <BoardPage board={board} data={data} onSwitch={onSwitch} />;

  return (
    <>
      <IocfHeader profileId={profileId} onSwitch={onSwitch} go={go} links={NAV} searchable={searchable} />
      <main className="min-h-[100svh]">
        {body}
        <SiteFooter />
      </main>
    </>
  );
}

function NotFound() {
  return (
    <div className="gutter pt-32 text-center">
      <p className="text-sm text-mist">That board could not be found.</p>
      <button type="button" onClick={() => navigate()} className={`mt-4 ${linkBtn}`}>
        BACK TO BOARDS
      </button>
    </div>
  );
}

/* ---------- 1. board directory ---------- */

type Sort = 'name' | 'rank' | 'credits';

function Directory({ data }: { data: Data }) {
  const { favs, toggle } = useFavs();
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<Sort>('name');
  const [status, setStatus] = useState<'all' | 'available' | 'vacant'>('all');
  const [council, setCouncil] = useState('');
  const [sponsored, setSponsored] = useState<'all' | 'yes' | 'no'>('all');
  const [favOnly, setFavOnly] = useState(false);
  const [region, setRegion] = useState('');
  const [byRegion, setByRegion] = useState(false);
  const [view, setView] = useState<'grid' | 'table'>('grid');

  const boards = data.b.boards;
  const groups = useMemo(() => councilGroups(boards), [boards]);
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    data.players.forEach((p) => m.set(p.boardId, (m.get(p.boardId) ?? 0) + 1));
    return m;
  }, [data]);
  const totalCredits = boards.reduce((n, b) => n + (creditsOf(b) ?? 0), 0);
  const podium = useMemo(() => [...boards].filter((b) => overallRank(b) !== undefined).sort((a, b) => overallRank(a)! - overallRank(b)!).slice(0, 3), [boards]);
  const topCredits = useMemo(() => [...boards].filter((b) => creditsOf(b) !== undefined).sort((a, b) => creditsOf(b)! - creditsOf(a)!).slice(0, 10), [boards]);

  const q = query.trim().toLowerCase();
  const visible = boards
    .filter((b) => !q || b.name.toLowerCase().includes(q) || b.chairman?.toLowerCase().includes(q))
    .filter((b) => status === 'all' || (status === 'available') === data.b.isAvailable(b))
    .filter((b) => !council || councilOf(b, groups) === council)
    .filter((b) => sponsored === 'all' || (sponsored === 'yes') === Boolean(b.sponsors?.length))
    .filter((b) => !favOnly || favs.includes(data.b.boardSlug(b)))
    .filter((b) => !region || regionOf(b) === region)
    .sort((a, b) =>
      sort === 'name' ? a.name.localeCompare(b.name) : sort === 'rank' ? (overallRank(a) ?? 999) - (overallRank(b) ?? 999) : (creditsOf(b) ?? -1) - (creditsOf(a) ?? -1),
    );
  const filtered = Boolean(q || status !== 'all' || council || sponsored !== 'all' || favOnly || region);
  const clear = () => {
    setQuery('');
    setStatus('all');
    setCouncil('');
    setSponsored('all');
    setFavOnly(false);
    setRegion('');
  };

  const stats = [
    { label: 'Boards', value: boards.length },
    { label: 'Players', value: data.players.length },
    { label: 'Umpires', value: data.umpires.length },
    { label: 'Leagues', value: store.leagues.length },
    { label: 'Matches', value: store.leagues.reduce((n, l) => n + l.matches.length, 0) },
    { label: 'Credits held', value: totalCredits },
  ];

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
              IOCF BOARDS
            </motion.h1>
            <motion.p variants={item} className="mt-4 font-sans text-xs font-bold tracking-[0.3em] text-bone sm:text-sm">
              {boards.length} BOARDS • {data.players.length} PLAYERS
            </motion.p>
            <motion.p variants={item} className="mt-5 max-w-xl text-[15px] leading-relaxed text-bone/75 sm:text-base">
              Every IOCF board in one place: leadership, rankings across formats, councils, sponsors and credits.
            </motion.p>
            <motion.div variants={item} className="mt-6 flex flex-wrap gap-3">
              {[['rankings', 'RANKINGS'], ['compare', 'COMPARE BOARDS'], ['credits', 'CREDITS']].map(([id, label]) => (
                <button key={id} type="button" onClick={() => navigate(id)} className="rounded-md border border-[#c9a24b] px-5 py-2.5 text-xs font-semibold tracking-[0.2em] text-[#c9a24b] transition hover:bg-[#c9a24b] hover:text-ink">
                  {label} →
                </button>
              ))}
            </motion.div>
          </motion.div>
          <motion.div
            className="order-1 mx-auto aspect-square w-[min(52vw,20rem)] lg:order-2 lg:w-full lg:max-w-[24rem]"
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 1.2, ease: EASE }}
          >
            <img src={LOGO.src} srcSet={LOGO.srcSet} sizes="(max-width: 1024px) 52vw, 24rem" alt={LOGO.alt} className="h-full w-full object-contain drop-shadow-[0_24px_60px_rgba(0,0,0,0.6)]" />
          </motion.div>
        </div>
      </section>

      <section aria-label="Federation summary" className="gutter">
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {stats.map((s) => (
            <div key={s.label} className="rounded-xl border border-white/10 bg-ink-2 px-4 py-3">
              <dt className="text-[10px] font-semibold tracking-[0.22em] text-smoke">{s.label.toUpperCase()}</dt>
              <dd className="mt-1 font-display text-2xl text-bone">{fmtNum(s.value)}</dd>
            </div>
          ))}
        </dl>
      </section>

      {podium.length > 0 && (
        <section aria-label="Top boards" className="gutter pt-10">
          <h2 className="mb-4 text-[11px] font-semibold tracking-[0.24em] text-[#c9a24b]">TOP 3 BOARDS · OVERALL</h2>
          <ul className="grid gap-4 sm:grid-cols-3">
            {podium.map((b, i) => (
              <li key={b.name}>
                <button
                  type="button"
                  onClick={() => navigate(data.b.boardSlug(b))}
                  className="flex w-full items-center gap-4 rounded-2xl border bg-ink-2 p-5 text-left transition hover:-translate-y-0.5"
                  style={{ borderColor: i === 0 ? GOLD : 'rgba(255,255,255,0.1)' }}
                >
                  <span className="font-display text-5xl" style={{ color: i === 0 ? GOLD : '#9a99a3' }}>
                    {i + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-display text-2xl tracking-wide text-bone">{b.name.toUpperCase()}</span>
                    <span className="text-xs text-mist">
                      {rankIn(b)?.points} points
                      <Move by={movement(b)} />
                    </span>
                  </span>
                  <Flag board={b} />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {topCredits.length > 0 && (
        <section aria-label="Credits chart" className="gutter pt-10">
          <div className="mb-4 flex items-baseline justify-between gap-4">
            <h2 className="text-[11px] font-semibold tracking-[0.24em] text-[#c9a24b]">AVAILABLE CREDITS · TOP 10</h2>
            <button type="button" onClick={() => navigate('credits')} className={linkBtn}>
              FULL LEDGER →
            </button>
          </div>
          <div className="space-y-2 rounded-2xl border border-white/10 bg-ink-2 p-5">
            {topCredits.map((b) => (
              <Bar key={b.name} label={b.name} pct={(creditsOf(b)! / creditsOf(topCredits[0])!) * 100} value={fmtNum(creditsOf(b)!)} />
            ))}
          </div>
        </section>
      )}

      <section id="boards" aria-label="Boards" className="gutter py-10 sm:py-14">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search boards or chairmen" aria-label="Search boards or chairmen" className={searchInput} />
          <div role="group" aria-label="View" className="flex gap-2">
            <button type="button" aria-pressed={view === 'grid'} onClick={() => setView('grid')} className={chip(view === 'grid')}>
              Grid
            </button>
            <button type="button" aria-pressed={view === 'table'} onClick={() => setView('table')} className={chip(view === 'table')}>
              Table
            </button>
          </div>
        </div>
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <select value={status} onChange={(e) => setStatus(e.target.value as typeof status)} aria-label="Filter by chairman status" className={selectCls}>
            <option value="all">All boards</option>
            <option value="available">Chairman appointed</option>
            <option value="vacant">Chairman vacant</option>
          </select>
          <select value={council} onChange={(e) => setCouncil(e.target.value)} aria-label="Filter by council" className={selectCls}>
            <option value="">All councils</option>
            {groups.filter((g) => g.members.length).map((g) => (
              <option key={g.name} value={g.name}>
                {g.name}
              </option>
            ))}
          </select>
          <select value={region} onChange={(e) => setRegion(e.target.value)} aria-label="Filter by region" className={selectCls}>
            <option value="">All regions</option>
            {REGION_ORDER.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
          <select value={sponsored} onChange={(e) => setSponsored(e.target.value as typeof sponsored)} aria-label="Filter by sponsors" className={selectCls}>
            <option value="all">Any sponsors</option>
            <option value="yes">Has sponsors</option>
            <option value="no">No sponsors</option>
          </select>
          <label className="flex items-center gap-2 text-xs text-smoke">
            Sort
            <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} className={selectCls}>
              <option value="name">Name</option>
              <option value="rank">Overall rank</option>
              <option value="credits">Credits</option>
            </select>
          </label>
          <button type="button" aria-pressed={byRegion} onClick={() => setByRegion((v) => !v)} className={chip(byRegion)}>
            Group by region
          </button>
          <button type="button" aria-pressed={favOnly} onClick={() => setFavOnly((v) => !v)} className={chip(favOnly)}>
            ★ Favourites{favs.length ? ` (${favs.length})` : ''}
          </button>
          {filtered && (
            <button type="button" onClick={clear} className={linkBtn}>
              CLEAR FILTERS
            </button>
          )}
        </div>
        <p role="status" aria-live="polite" className="mb-4 text-xs text-smoke">
          Showing {visible.length} of {boards.length} boards
        </p>

        {visible.length === 0 ? (
          <div className="rounded-xl border border-white/10 bg-ink-2 px-5 py-12 text-center">
            <p className="text-sm text-bone">{favOnly && !filtered ? 'No favourite boards yet.' : 'No boards match your filters.'}</p>
            <button type="button" onClick={clear} className={`mt-4 ${linkBtn}`}>
              CLEAR FILTERS
            </button>
          </div>
        ) : view === 'grid' ? (
          <>
            {(byRegion ? [...REGION_ORDER, 'Other'].map((r) => ({ title: r, list: visible.filter((b) => regionOf(b) === r) })).filter((g) => g.list.length) : [{ title: '', list: visible }]).map((g) => (
              <div key={g.title || 'all'} className="mb-8">
                {g.title && <h2 className="mb-3 border-b border-white/10 pb-1 font-display text-2xl tracking-wide text-[#c9a24b]">{g.title.toUpperCase()}</h2>}
                <ul className="grid grid-cols-1 gap-4 min-[420px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {g.list.map((b) => {
                    const id = data.b.boardSlug(b);
                    const rank = overallRank(b);
                    return (
                      <li key={id} className="relative">
                        <button
                          type="button"
                          onClick={() => navigate(id)}
                          aria-label={`View ${b.name} board`}
                          className="group flex h-full w-full flex-col gap-3 rounded-2xl border border-white/10 bg-ink-2 p-5 text-left transition-[border-color,transform] duration-300 hover:-translate-y-0.5 hover:border-[#c9a24b]/50"
                        >
                          <span className="flex items-start justify-between gap-3">
                            <span className="font-display text-2xl leading-tight tracking-wide text-bone">{b.name.toUpperCase()}</span>
                            <Flag board={b} />
                          </span>
                          <span className="text-xs text-mist">{b.chairman ? `Chairman: ${b.chairman}` : 'Chairman vacant'}</span>
                          <span className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-smoke">
                            {rank !== undefined && (
                              <span>
                                Overall rank #{rank}
                                <Move by={movement(b)} />
                              </span>
                            )}
                            <span>{counts.get(id) ?? 0} players</span>
                          </span>
                          <span className="mt-auto text-xs font-semibold tracking-[0.2em] text-[#c9a24b] transition group-hover:translate-x-1">VIEW BOARD →</span>
                        </button>
                        <span className="absolute bottom-4 right-4 flex items-center gap-3">
                          <InstagramLink board={b} />
                          <StarButton on={favs.includes(id)} onClick={() => toggle(id)} name={b.name} />
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-white/10 bg-ink-2">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="text-[10px] tracking-[0.2em] text-smoke">
                <tr>
                  <th className="px-4 py-3 font-semibold" />
                  <th className="px-4 py-3 font-semibold">BOARD</th>
                  <th className="px-4 py-3 font-semibold">CHAIRMAN</th>
                  <th className="px-4 py-3 text-right font-semibold">RANK</th>
                  <th className="px-4 py-3 text-right font-semibold">CREDITS</th>
                  <th className="px-4 py-3 text-right font-semibold">PLAYERS</th>
                  <th className="px-4 py-3 text-right font-semibold">INSTAGRAM</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((b) => {
                  const id = data.b.boardSlug(b);
                  return (
                    <tr key={id} className="border-t border-white/5 hover:bg-white/[0.03]">
                      <td className="px-4 py-2.5">
                        <StarButton on={favs.includes(id)} onClick={() => toggle(id)} name={b.name} />
                      </td>
                      <td className="px-4 py-2.5">
                        <button type="button" onClick={() => navigate(id)} className="flex items-center gap-2 text-bone hover:text-[#c9a24b]">
                          <Flag board={b} className="text-lg" />
                          {b.name}
                        </button>
                      </td>
                      <td className="px-4 py-2.5 text-mist">{b.chairman ?? '—'}</td>
                      <td className="px-4 py-2.5 text-right text-[#c9a24b]">
                        {overallRank(b) !== undefined ? `#${overallRank(b)}` : '—'}
                        <Move by={movement(b)} />
                      </td>
                      <td className="px-4 py-2.5 text-right text-mist">{creditsOf(b) !== undefined ? fmtNum(creditsOf(b)!) : '—'}</td>
                      <td className="px-4 py-2.5 text-right text-mist">{counts.get(id) ?? 0}</td>
                      <td className="px-4 py-2.5 text-right">
                        <InstagramLink board={b} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

/* ---------- 2. a single board ---------- */

function BoardPage({ board, data, onSwitch }: { board: Board; data: Data; onSwitch: (id: ProfileId) => void }) {
  const { favs, toggle } = useFavs();
  const [copied, setCopied] = useState(false);
  const slug = data.b.boardSlug(board);
  const boards = data.b.boards;
  const i = boards.findIndex((b) => b.name === board.name);
  const prev = boards[(i - 1 + boards.length) % boards.length];
  const next = boards[(i + 1) % boards.length];

  const squad = useMemo(() => data.players.filter((p) => p.boardId === slug), [data, slug]);
  const umpires = useMemo(() => data.umpires.filter((u) => u.boardId === slug), [data, slug]);
  const groups = useMemo(() => councilGroups(boards), [boards]);
  const council = councilOf(board, groups);
  const honours = honoursOf(board);
  const hall = hallOfFameOf(board);
  const footprint = leagueFootprint(board);
  const leagueAwards = leagueAwardsOf(board);
  const awardsByTournament = squadAwardsByTournament(squad);
  const achievers = topAchievers(squad);
  const winners = squad.filter((p) => p.achievements?.length).length;
  const best = bestFormat(board);
  const rankedBoards = boards.filter((b) => overallRank(b) !== undefined).length || boards.length;
  const credits = creditsOf(board);
  const sponsors = sponsorsOf(board);
  const rankings = board.rankings ?? [];
  const news = announcementsFor(slug);

  const openIn = (profile: ProfileId, hash: string) => {
    window.location.hash = hash;
    onSwitch(profile);
  };
  const share = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt('Copy this link', window.location.href);
    }
  };

  return (
    <div className="gutter mx-auto max-w-5xl pb-16 pt-28">
      <Breadcrumb items={[{ label: 'Boards', onClick: () => navigate() }, { label: board.name }]} />
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <BackButton onClick={() => navigate()}>BACK TO BOARDS</BackButton>
        <div className="flex items-center gap-4">
          <button type="button" onClick={() => navigate(data.b.boardSlug(prev))} aria-label={`Previous board: ${prev.name}`} className="text-xs font-semibold tracking-[0.2em] text-mist hover:text-bone">
            ← {prev.name.toUpperCase()}
          </button>
          <button type="button" onClick={() => navigate(data.b.boardSlug(next))} aria-label={`Next board: ${next.name}`} className="text-xs font-semibold tracking-[0.2em] text-mist hover:text-bone">
            {next.name.toUpperCase()} →
          </button>
        </div>
      </div>

      <header className="mt-6 flex items-center justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold tracking-[0.3em] text-[#c9a24b]">IOCF BOARD{council ? ` · ${council.toUpperCase()}` : ''}</p>
          <h1 className="mt-1 font-display text-[clamp(2.4rem,6vw,4.5rem)] leading-[0.9] tracking-wide text-bone">{board.name.toUpperCase()}</h1>
          <div className="mt-3 flex items-center gap-4">
            <StarButton on={favs.includes(slug)} onClick={() => toggle(slug)} name={board.name} />
            <button type="button" onClick={share} className={linkBtn}>
              {copied ? 'LINK COPIED ✓' : 'SHARE LINK'}
            </button>
            <button type="button" onClick={() => navigate('compare', slug)} className={linkBtn}>
              COMPARE →
            </button>
            <InstagramLink board={board} label="INSTAGRAM" className="text-xs font-semibold tracking-[0.2em] !text-[#c9a24b] hover:underline" />
            <button type="button" onClick={() => downloadBoardReport(board, { players: squad.length, awardWinners: winners, council })} className={linkBtn}>
              ⬇ REPORT CARD
            </button>
          </div>
        </div>
        <Flag board={board} className="text-5xl" />
      </header>

      <Card title="LEADERSHIP & OVERVIEW" className="mt-6">
        <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Fact label="Chairman" value={board.chairman ?? 'Vacant'} />
          <Fact label="CEO" value={board.ceo ?? 'Not announced'} />
          <Fact label="Players" value={String(squad.length)} />
          <Fact label="Umpires" value={String(umpires.length)} />
          <Fact label="Region" value={regionOf(board)} />
          <Fact label="Council" value={council ?? 'Not assigned'} />
          <Fact label="Tournament titles" value={String(titlesOf(board))} />
          {credits !== undefined && <Fact label="Available credits" value={fmtNum(credits)} />}
          {best && <Fact label="Strongest format" value={`${best.format} · #${best.rank}`} />}
        </dl>
        {board.vision && <p className="mt-5 border-l border-[#c9a24b]/40 pl-3 text-sm italic leading-relaxed text-mist">“{board.vision}”</p>}
        <div className="mt-5 flex flex-wrap gap-5">
          {squad.length > 0 && (
            <button type="button" onClick={() => openIn('player', `#/players/${slug}`)} className={linkBtn}>
              VIEW FULL SQUAD →
            </button>
          )}
          {board.chairman && (
            <button type="button" onClick={() => openIn('chairman', `#/chairmen/${slug}`)} className={linkBtn}>
              CHAIRMAN PROFILE →
            </button>
          )}
          <button type="button" onClick={() => openIn('umpire', `#/umpires/board/${slug}`)} className={linkBtn}>
            BOARD UMPIRES →
          </button>
        </div>
      </Card>

      <div className="mt-6 grid gap-6 md:grid-cols-2">
        <Card title="FORMAT STRENGTHS">
          {rankings.length ? (
            <div className="space-y-2.5">
              {rankings.map((r) => (
                <Bar key={r.format} label={r.format} pct={strength(r.rank, rankedBoards)} value={`#${r.rank}`} />
              ))}
              <p className="pt-1 text-[11px] text-smoke">Longer bar = higher rank among {rankedBoards} boards.</p>
            </div>
          ) : (
            <p className="text-sm text-smoke">Not available</p>
          )}
        </Card>
        <Card title="WIN RATE BY FORMAT">
          {rankings.some((r) => winRate(r) !== undefined) ? (
            <div className="space-y-2.5">
              {rankings.map((r) => {
                const w = winRate(r);
                return w === undefined ? null : <Bar key={r.format} label={r.format} pct={w * 100} value={`${Math.round(w * 100)}%`} tone="#4fae8a" />;
              })}
              <p className="pt-1 text-[11px] text-smoke">Matches won ÷ matches played.</p>
            </div>
          ) : (
            <p className="text-sm text-smoke">Not available</p>
          )}
        </Card>

        <Card title="RANKINGS BY FORMAT">
          {rankings.length ? (
            <table className="w-full text-left text-sm">
              <thead className="text-[10px] tracking-[0.2em] text-smoke">
                <tr>
                  <th className="pb-2 font-semibold">FORMAT</th>
                  <th className="pb-2 text-right font-semibold">RANK</th>
                  <th className="pb-2 text-right font-semibold">PTS</th>
                  <th className="pb-2 text-right font-semibold">W/P</th>
                </tr>
              </thead>
              <tbody>
                {rankings.map((r) => (
                  <tr key={r.format} className="border-t border-white/5">
                    <td className="py-2 text-bone">{r.format}</td>
                    <td className="py-2 text-right font-semibold text-[#c9a24b]">
                      #{r.rank}
                      <Move by={movement(board, r.format)} />
                    </td>
                    <td className="py-2 text-right text-mist">{r.points}</td>
                    <td className="py-2 text-right text-mist">
                      {r.won ?? '—'}/{r.played ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-sm text-smoke">Not available</p>
          )}
        </Card>
        <Card title="SQUAD SNAPSHOT">
          {squad.length ? (
            <>
              <dl className="grid grid-cols-3 gap-3">
                <Fact label="Players" value={String(squad.length)} />
                <Fact label="Award winners" value={String(winners)} />
                <Fact label="Awards" value={String(squad.reduce((n, p) => n + (p.achievements?.length ?? 0), 0))} />
              </dl>
              {achievers.length > 0 && (
                <>
                  <h3 className="mb-2 mt-5 text-[10px] font-semibold tracking-[0.22em] text-smoke">TOP ACHIEVERS</h3>
                  <ul className="space-y-1.5">
                    {achievers.map((p) => (
                      <li key={p.id}>
                        <button type="button" onClick={() => openIn('player', `#/players/${slug}/${p.id}`)} className="flex w-full items-center justify-between text-left text-sm text-bone hover:text-[#c9a24b]">
                          <span>{p.name}</span>
                          <span className="text-xs text-mist">{p.achievements?.length} awards</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </>
          ) : (
            <p className="text-sm text-smoke">No players added for this board yet.</p>
          )}
        </Card>

        {squad.length > 0 && (
          <Card title="SQUAD PREVIEW" className="md:col-span-2">
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {squad.slice(0, 8).map((p) => (
                <li key={p.id}>
                  <button type="button" onClick={() => openIn('player', `#/players/${slug}/${p.id}`)} className="flex w-full items-center gap-3 rounded-lg bg-ink-3 p-2 text-left hover:ring-1 hover:ring-[#c9a24b]/50">
                    <Avatar player={p} size="h-10 w-10" />
                    <span className="truncate text-xs text-bone">{p.name}</span>
                  </button>
                </li>
              ))}
            </ul>
            {squad.length > 8 && (
              <button type="button" onClick={() => openIn('player', `#/players/${slug}`)} className={`mt-4 ${linkBtn}`}>
                SEE ALL {squad.length} PLAYERS →
              </button>
            )}
          </Card>
        )}

        <Card title="TOURNAMENT HONOURS">
          {honours.length ? (
            <ul className="space-y-2">
              {honours.map((h) => (
                <li key={h.tournament + h.result} className="flex items-baseline justify-between gap-3 border-l border-[#c9a24b]/40 pl-3">
                  <span className="text-sm text-bone">{h.tournament}</span>
                  <span className="text-xs font-semibold text-[#c9a24b]">{h.result}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-smoke">No tournament finishes recorded yet.</p>
          )}
        </Card>
        <Card title="SQUAD AWARDS BY TOURNAMENT">
          {awardsByTournament.length ? (
            <div className="space-y-2.5">
              {awardsByTournament.slice(0, 8).map((t) => (
                <Bar key={t.tournament} label={t.tournament} pct={(t.awards / awardsByTournament[0].awards) * 100} value={String(t.awards)} />
              ))}
            </div>
          ) : (
            <p className="text-sm text-smoke">No player awards recorded yet.</p>
          )}
        </Card>

        <Card title="LEAGUE PARTICIPATION">
          {footprint.length ? (
            <ul className="space-y-2">
              {footprint.map((f) => (
                <li key={f.league.id}>
                  <button type="button" onClick={() => openIn('leagues', `#/leagues/${f.league.id}`)} className="flex w-full items-baseline justify-between gap-3 border-l border-[#c9a24b]/40 pl-3 text-left text-sm text-bone hover:text-[#c9a24b]">
                    <span>{f.league.name}</span>
                    <span className="text-xs text-mist">{f.players} players</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-smoke">No franchise league players recorded.</p>
          )}
          {leagueAwards.length > 0 && (
            <>
              <h3 className="mb-2 mt-5 text-[10px] font-semibold tracking-[0.22em] text-smoke">LEAGUE AWARDS</h3>
              <ul className="space-y-1.5 text-sm">
                {leagueAwards.map((a, k) => (
                  <li key={k} className="flex justify-between gap-3 text-bone">
                    <span>
                      {a.award} · {a.winner}
                    </span>
                    <span className="text-xs text-mist">{a.league}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Card>
        <Card title="HALL OF FAME CARDS">
          {hall.length ? (
            <ul className="space-y-3">
              {hall.map((h, k) => (
                <li key={k} className="border-l border-[#c9a24b]/40 pl-3">
                  <p className="text-sm font-semibold text-bone">{h.card}</p>
                  <p className="text-[13px] text-mist">
                    {h.role}: {h.player} · {h.period}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-smoke">No Hall of Fame cards yet.</p>
          )}
        </Card>

        <Card title="UMPIRES FROM THIS BOARD">
          {umpires.length ? (
            <ul className="space-y-1.5">
              {umpires.map((u) => (
                <li key={u.id}>
                  <button type="button" onClick={() => openIn('umpire', `#/umpires/u/${u.id}`)} className="flex w-full items-center justify-between text-left text-sm text-bone hover:text-[#c9a24b]">
                    <span>{u.name}</span>
                    <span className="text-xs text-mist">{u.performance?.points !== undefined ? `${u.performance.points} pts` : ''}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-smoke">No umpires recorded for this board.</p>
          )}
        </Card>
        <Card title="SPONSORS">
          {sponsors.length ? (
            <ul className="space-y-2">
              {sponsors.map((s) => (
                <li key={s.role + s.name} className="border-l border-[#c9a24b]/40 pl-3">
                  <p className="text-[11px] text-smoke">{s.role}</p>
                  <p className="text-sm text-bone">{s.name}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-smoke">No sponsors announced yet.</p>
          )}
        </Card>

        <Card title="NEWS & ANNOUNCEMENTS" className="md:col-span-2">
          {news.length ? (
            <ul className="space-y-4">
              {news.map((a) => (
                <li key={a.id} className="border-l border-[#c9a24b]/40 pl-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <p className="text-sm font-semibold text-bone">{a.title}</p>
                    <p className="text-[11px] text-smoke">
                      {a.date}
                      {!a.board && ' · Federation-wide'}
                    </p>
                  </div>
                  {a.body && <p className="mt-1 text-[13px] leading-relaxed text-mist">{a.body}</p>}
                  {a.link && (
                    <a href={a.link} target="_blank" rel="noopener noreferrer" className={`mt-1 inline-block ${linkBtn}`}>
                      READ MORE →
                    </a>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-smoke">No announcements yet. They are added in chairmanContent.ts.</p>
          )}
        </Card>

        <Card title="ACHIEVEMENTS" className="md:col-span-2">
          {board.achievements?.length ? (
            <ul className="grid gap-3 sm:grid-cols-2">
              {board.achievements.map((a, k) => (
                <li key={`${a.title}-${k}`} className="border-l border-[#c9a24b]/40 pl-3">
                  <p className="text-sm font-semibold text-bone">{a.title}</p>
                  {a.detail && <p className="mt-1 text-[13px] text-mist">{a.detail}</p>}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-smoke">Not available</p>
          )}
        </Card>
      </div>
    </div>
  );
}

