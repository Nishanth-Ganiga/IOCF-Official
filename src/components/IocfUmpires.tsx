import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import type { Board } from '../data/boards';
import type { ProfileId } from '../data/portfolio';
import type { Umpire } from '../data/umpires';
import { useSmoothScroll } from '../hooks/smoothScroll';
import { EASE } from './fx';
import { Flag } from './IocfChairmen';
import { IocfHeader, LOGO } from './IocfHome';
import { Avatar, BackButton, Breadcrumb, Card, EntryList, Fact, Loading, MISSING, Notice, StatGrid, searchInput } from './IocfPlayers';
import SiteFooter, { ShareButton } from './SiteFooter';
import { officiatedBy, officiatingCounts } from '../data/officiating';
import { useFavourites } from '../data/favourites';

type BoardsModule = typeof import('../data/boards');
type UmpiresModule = typeof import('../data/umpires');

const ROUTE = '#/umpires';

const container = { hidden: {}, show: { transition: { staggerChildren: 0.09, delayChildren: 0.2 } } };
const item = {
  hidden: { opacity: 0, y: 24, filter: 'blur(8px)' },
  show: { opacity: 1, y: 0, filter: 'blur(0px)', transition: { duration: 0.8, ease: EASE } },
};

/** Routes: `#/umpires`, `#/umpires/board/<boardId>`, `#/umpires/u/<umpireId>`. */
type Route = { kind: 'home' } | { kind: 'board'; id: string } | { kind: 'umpire'; id: string };

function readRoute(): Route {
  const h = window.location.hash;
  if (!h.startsWith(ROUTE)) return { kind: 'home' };
  const [kind, id] = h.slice(ROUTE.length).split('/').filter(Boolean).map(decodeURIComponent);
  if (kind === 'board' && id) return { kind: 'board', id };
  if (kind === 'u' && id) return { kind: 'umpire', id };
  return { kind: 'home' };
}

function useRoute() {
  const [route, setRoute] = useState<Route>(readRoute);
  useEffect(() => {
    const on = () => setRoute(readRoute());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return route;
}

/** Counts in-app navigations so "back" can use real history when there is some, and a fallback otherwise. */
let inAppNavs = 0;
const navigate = (...parts: string[]) => {
  inAppNavs += 1;
  window.location.hash = [ROUTE, ...parts].join('/');
};
const goBack = (fallback: () => void) => {
  if (inAppNavs > 0) {
    inAppNavs -= 1;
    history.back();
  } else fallback();
};

function useData() {
  const [data, setData] = useState<{ b: BoardsModule; u: UmpiresModule; umpires: Umpire[] } | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    Promise.all([import('../data/boards'), import('../data/umpires')])
      .then(async ([b, u]) => setData({ b, u, umpires: await u.loadUmpires() }))
      .catch(() => setFailed(true));
  }, []);
  return { data, failed };
}
type Data = NonNullable<ReturnType<typeof useData>['data']>;

export default function IocfUmpires({ profileId, onSwitch }: { profileId: ProfileId; onSwitch: (id: ProfileId) => void }) {
  const { scrollTo } = useSmoothScroll();
  const { data, failed } = useData();
  const route = useRoute();
  const routeKey = route.kind === 'home' ? 'home' : `${route.kind}:${route.id}`;

  useEffect(() => {
    scrollTo(0, { offset: 0 });
  }, [routeKey, scrollTo]);

  const go = (id: string) => {
    const scroll = () => scrollTo(id === 'top' ? 0 : `#${id}`, { offset: id === 'top' ? 0 : -72 });
    if (route.kind !== 'home') {
      navigate();
      window.setTimeout(scroll, 150);
    } else scroll();
  };
  const links = [
    { id: 'top', label: 'Home' },
    { id: 'rankings', label: 'Top 30' },
    { id: 'all', label: 'All umpires' },
    { id: 'boards', label: 'Boards' },
  ];

  let body;
  if (failed) body = <Notice tone="error">The Umpire Centre could not be loaded. Please refresh the page to try again.</Notice>;
  else if (!data) body = <Loading />;
  else if (route.kind === 'home') body = <Home data={data} />;
  else if (route.kind === 'board') {
    const board = data.b.boards.find((b) => data.b.boardSlug(b) === route.id);
    body = board ? <BoardList board={board} data={data} /> : <NotFound what="board" />;
  } else {
    const umpire = data.umpires.find((u) => u.id === route.id);
    body = umpire ? <Profile umpire={umpire} data={data} onSwitch={onSwitch} /> : <NotFound what="umpire" />;
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

function NotFound({ what }: { what: string }) {
  return (
    <div className="gutter pt-32 text-center">
      <p className="text-sm text-mist">That {what} could not be found.</p>
      <button type="button" onClick={() => navigate()} className="mt-4 text-xs font-semibold tracking-[0.2em] text-[#c9a24b] hover:underline">
        BACK TO UMPIRE CENTRE
      </button>
    </div>
  );
}

const val = (v: string | number | undefined) => (v === undefined ? MISSING : v);

/* ---------- home: hero + Top 30 + boards ---------- */

function Home({ data }: { data: Data }) {
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
              IOCF UMPIRE CENTRE
            </motion.h1>
            <motion.p variants={item} className="mt-4 font-sans text-xs font-bold tracking-[0.3em] text-bone sm:text-sm">
              INTEGRITY • PRECISION • FAIR PLAY
            </motion.p>
            <motion.p variants={item} className="mt-5 max-w-xl text-[15px] leading-relaxed text-bone/75 sm:text-base">
              Meet the officials who uphold the spirit of cricket across IOCF. Explore umpire rankings, board representatives, officiating records and individual career statistics.
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
      <Top30 data={data} />
      <AllUmpires data={data} />
      <Boards data={data} />
    </>
  );
}

function Top30({ data }: { data: Data }) {
  const byId = useMemo(() => new Map(data.umpires.map((u) => [u.id, u])), [data]);
  const boardName = (id?: string) => data.b.boards.find((b) => data.b.boardSlug(b) === id);
  const rows = data.u.ranking.map((r) => ({ position: r.position, umpire: byId.get(r.umpireId) }));
  const awaiting = rows.every((r) => r.umpire?.performance?.points === undefined);

  return (
    <section id="rankings" aria-label="Top 30 umpires" className="gutter py-10 sm:py-14">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-[clamp(2.2rem,5vw,4rem)] leading-[0.9] tracking-wide text-bone">TOP 30 UMPIRES</h2>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-mist">Recognising excellence, consistency and professionalism in match officiating.</p>
          {!awaiting && <p className="mt-1 max-w-xl text-xs text-smoke">Ordered by points recorded in the IOCF ledger. This is not an official ranking.</p>}
        </div>
        {awaiting && <span className="rounded-full border border-[#c9a24b]/50 px-3 py-1 text-[10px] font-semibold tracking-[0.22em] text-[#c9a24b]">AWAITING DATA</span>}
      </div>

      <div className="mt-6 overflow-hidden rounded-2xl border border-white/10 bg-ink-2">
        <div role="row" className="hidden grid-cols-[4rem_1fr_9rem_7rem_7rem_8rem] gap-3 border-b border-white/10 px-5 py-3 text-[10px] font-semibold tracking-[0.22em] text-smoke md:grid">
          <span>RANK</span>
          <span>UMPIRE</span>
          <span>BOARD</span>
          <span>MATCHES</span>
          <span>POINTS</span>
          <span />
        </div>
        <ol>
          {rows.map(({ position, umpire }) => {
            if (!umpire) return null;
            const board = boardName(umpire.boardId);
            return (
              <li key={position} className="border-b border-white/5 last:border-b-0">
                <button
                  type="button"
                  onClick={() => navigate('u', umpire.id)}
                  aria-label={`Rank ${position}: view profile of ${umpire.name} (ID ${umpire.id})`}
                  className="group grid w-full grid-cols-[3rem_1fr_auto] items-center gap-3 px-4 py-3 text-left transition hover:bg-white/[0.03] md:grid-cols-[4rem_1fr_9rem_7rem_7rem_8rem] md:px-5"
                >
                  <span className="font-display text-2xl text-[#c9a24b]">#{position}</span>
                  <span className="flex min-w-0 items-center gap-3">
                    <Avatar player={umpire} size="h-10 w-10" />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-bone">{umpire.name}</span>
                      <span className="block truncate text-[11px] text-smoke md:hidden">
                        {board?.name ?? MISSING} · {val(umpire.career?.total)} matches · {val(umpire.performance?.points)} pts
                      </span>
                    </span>
                  </span>
                  <span className="hidden items-center gap-2 text-sm text-mist md:flex">
                    {board ? (
                      <>
                        <Flag board={board} className="text-lg" />
                        <span className="truncate">{board.name}</span>
                      </>
                    ) : (
                      MISSING
                    )}
                  </span>
                  <span className="hidden text-sm text-mist md:block">{val(umpire.career?.total)}</span>
                  <span className="hidden text-sm text-mist md:block">{val(umpire.performance?.points)}</span>
                  <span className="text-right text-[11px] font-semibold tracking-[0.18em] text-[#c9a24b] transition group-hover:translate-x-0.5">
                    <span className="hidden md:inline">VIEW PROFILE →</span>
                    <span className="md:hidden">→</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}

function AllUmpires({ data }: { data: Data }) {
  const { favs, toggle } = useFavourites('umpires');
  const [query, setQuery] = useState('');
  const [board, setBoard] = useState('');
  const [sort, setSort] = useState<'points' | 'name' | 'matches'>('points');
  const [favOnly, setFavOnly] = useState(false);
  const boardOf = useMemo(() => new Map(data.b.boards.map((b) => [data.b.boardSlug(b), b])), [data]);
  const counts = useMemo(() => officiatingCounts(data.umpires), [data]);
  const pts = (u: Umpire) => (typeof u.performance?.points === 'number' ? u.performance.points : -1);

  const q = query.trim().toLowerCase();
  const rows = data.umpires
    .filter((u) => u.boardId && u.name !== 'Umpire')
    .filter((u) => !q || u.name.toLowerCase().includes(q))
    .filter((u) => !board || u.boardId === board)
    .filter((u) => !favOnly || favs.includes(u.id))
    .sort((a, b) => (sort === 'name' ? a.name.localeCompare(b.name) : sort === 'matches' ? (counts.get(b.id) ?? 0) - (counts.get(a.id) ?? 0) : pts(b) - pts(a)) || a.name.localeCompare(b.name));
  const total = data.umpires.filter((u) => u.boardId).length;
  const sel = 'rounded-md border border-white/15 bg-ink-2 px-2 py-1.5 text-xs text-bone outline-none focus:border-[#c9a24b]';

  return (
    <section id="all" aria-label="All umpires" className="gutter py-10 sm:py-14">
      <h2 className="font-display text-[clamp(2.2rem,5vw,4rem)] leading-[0.9] tracking-wide text-bone">ALL UMPIRES</h2>
      <p className="mt-3 max-w-xl text-sm leading-relaxed text-mist">Every board umpire in one list. Franchise matches officiated are counted from the umpire names in the match results.</p>
      <div className="mb-4 mt-6 flex flex-wrap items-center gap-3">
        <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search umpires" aria-label="Search umpires" className={searchInput} />
        <select value={board} onChange={(e) => setBoard(e.target.value)} aria-label="Filter by board" className={sel}>
          <option value="">All boards</option>
          {data.b.boards.map((b) => (
            <option key={b.name} value={data.b.boardSlug(b)}>
              {b.name}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-xs text-smoke">
          Sort
          <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} className={sel}>
            <option value="points">Points</option>
            <option value="matches">Matches officiated</option>
            <option value="name">Name A → Z</option>
          </select>
        </label>
        <button type="button" aria-pressed={favOnly} onClick={() => setFavOnly((v) => !v)} className={`rounded-full border px-3.5 py-1.5 text-xs font-semibold ${favOnly ? 'border-[#c9a24b] bg-[#c9a24b] text-ink' : 'border-white/15 text-mist hover:text-bone'}`}>
          ★ Favourites{favs.length ? ` (${favs.length})` : ''}
        </button>
      </div>
      <p role="status" aria-live="polite" className="mb-3 text-xs text-smoke">
        Showing {rows.length} of {total} umpires
      </p>
      {rows.length === 0 ? (
        <div className="rounded-xl border border-white/10 bg-ink-2 px-5 py-12 text-center text-sm text-mist">No umpires match your filters.</div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-white/10 bg-ink-2">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="text-[10px] tracking-[0.2em] text-smoke">
              <tr>
                <th className="px-4 py-3 font-semibold" />
                <th className="px-2 py-3 font-semibold">UMPIRE</th>
                <th className="px-2 py-3 font-semibold">BOARD</th>
                <th className="px-2 py-3 text-right font-semibold">POINTS</th>
                <th className="px-4 py-3 text-right font-semibold">FRANCHISE MATCHES</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((u) => {
                const b = boardOf.get(u.boardId!);
                return (
                  <tr key={u.id} className="border-t border-white/5 hover:bg-white/[0.03]">
                    <td className="px-4 py-2.5">
                      <button type="button" onClick={() => toggle(u.id)} aria-pressed={favs.includes(u.id)} aria-label={`${favs.includes(u.id) ? 'Remove' : 'Add'} ${u.name} ${favs.includes(u.id) ? 'from' : 'to'} favourites`} className={`text-lg leading-none ${favs.includes(u.id) ? 'text-[#c9a24b]' : 'text-smoke hover:text-bone'}`}>
                        {favs.includes(u.id) ? '★' : '☆'}
                      </button>
                    </td>
                    <td className="px-2 py-2.5">
                      <button type="button" onClick={() => navigate('u', u.id)} className="text-bone hover:text-[#c9a24b]">
                        {u.name}
                      </button>
                    </td>
                    <td className="px-2 py-2.5 text-mist">
                      {b && (
                        <span className="flex items-center gap-1.5">
                          <Flag board={b} className="text-base" />
                          {b.name}
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-2.5 text-right text-mist">{pts(u) >= 0 ? pts(u) : MISSING}</td>
                    <td className="px-4 py-2.5 text-right text-mist">{counts.get(u.id) ?? 0}</td>
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

function Boards({ data }: { data: Data }) {
  const [query, setQuery] = useState('');
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    data.umpires.forEach((u) => u.boardId && m.set(u.boardId, (m.get(u.boardId) ?? 0) + 1));
    return m;
  }, [data]);
  const q = query.trim().toLowerCase();
  const visible = data.b.boards.filter((b) => !q || b.name.toLowerCase().includes(q));

  return (
    <section id="boards" aria-label="Umpires by board" className="gutter py-10 sm:py-14">
      <h2 className="font-display text-[clamp(2.2rem,5vw,4rem)] leading-[0.9] tracking-wide text-bone">UMPIRES BY BOARD</h2>
      <p className="mt-3 max-w-xl text-sm leading-relaxed text-mist">Explore the officiating teams representing every IOCF board.</p>

      <div className="mb-4 mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search boards by name" aria-label="Search boards by name" className={searchInput} />
        <p role="status" aria-live="polite" className="text-xs text-smoke">
          Showing {visible.length} of {data.b.boards.length} boards
        </p>
      </div>
      {visible.length === 0 ? (
        <div className="rounded-xl border border-white/10 bg-ink-2 px-5 py-12 text-center">
          <p className="text-sm text-bone">No boards match your search.</p>
          <button type="button" onClick={() => setQuery('')} className="mt-4 text-xs font-semibold tracking-[0.2em] text-[#c9a24b] hover:underline">
            CLEAR SEARCH
          </button>
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-4 min-[420px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {visible.map((b) => {
            const id = data.b.boardSlug(b);
            const count = counts.get(id);
            return (
              <li key={id}>
                <button
                  type="button"
                  onClick={() => navigate('board', id)}
                  aria-label={`View umpires of ${b.name}`}
                  className="group flex h-full w-full flex-col gap-4 rounded-2xl border border-white/10 bg-ink-2 p-5 text-left transition-[border-color,transform] duration-300 hover:-translate-y-0.5 hover:border-[#c9a24b]/50"
                >
                  <span className="flex items-start justify-between gap-3">
                    <span className="font-display text-2xl leading-tight tracking-wide text-bone">{b.name.toUpperCase()}</span>
                    <Flag board={b} />
                  </span>
                  {count !== undefined && (
                    <span className="text-xs text-mist">
                      {count} {count === 1 ? 'umpire' : 'umpires'}
                    </span>
                  )}
                  <span className="mt-auto text-xs font-semibold tracking-[0.2em] text-[#c9a24b] transition group-hover:translate-x-1">VIEW UMPIRES →</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/* ---------- board umpire list ---------- */

function BoardList({ board, data }: { board: Board; data: Data }) {
  const boardId = data.b.boardSlug(board);
  const [query, setQuery] = useState('');
  const all = useMemo(() => data.umpires.filter((u) => u.boardId === boardId), [data, boardId]);
  const rankOf = useMemo(() => new Map(data.u.ranking.map((r) => [r.umpireId, r.position])), [data]);
  const q = query.trim().toLowerCase();
  const visible = all.filter((u) => !q || u.name.toLowerCase().includes(q));

  return (
    <div className="gutter pb-16 pt-28">
      <Breadcrumb items={[{ label: 'Umpire Centre', onClick: () => navigate() }, { label: board.name }]} />
      <div className="mt-3">
        <BackButton onClick={() => goBack(() => navigate())}>BACK</BackButton>
      </div>
      <header className="mt-6 flex items-center justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold tracking-[0.3em] text-[#c9a24b]">
            {all.length} {all.length === 1 ? 'UMPIRE' : 'UMPIRES'}
          </p>
          <h1 className="mt-1 font-display text-[clamp(2.4rem,6vw,4.5rem)] leading-[0.9] tracking-wide text-bone">{board.name.toUpperCase()}</h1>
        </div>
        <Flag board={board} className="text-5xl" />
      </header>

      <div className="mb-4 mt-8">
        <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={`Search ${board.name} umpires`} aria-label={`Search ${board.name} umpires`} className={searchInput} />
      </div>
      <p role="status" aria-live="polite" className="mb-4 text-xs text-smoke">
        Showing {visible.length} of {all.length} umpires
      </p>

      {all.length === 0 ? (
        <Notice tone="info">No umpires have been added for this board yet.</Notice>
      ) : visible.length === 0 ? (
        <div className="rounded-xl border border-white/10 bg-ink-2 px-5 py-12 text-center">
          <p className="text-sm text-bone">No umpires match your search.</p>
          <button type="button" onClick={() => setQuery('')} className="mt-4 text-xs font-semibold tracking-[0.2em] text-[#c9a24b] hover:underline">
            CLEAR SEARCH
          </button>
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-4 min-[420px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {visible.map((u) => (
            <li key={u.id}>
              <button
                type="button"
                onClick={() => navigate('u', u.id)}
                aria-label={`View profile of ${u.name} (${board.name}, ID ${u.id})`}
                className="group flex w-full flex-col gap-4 rounded-2xl border border-white/10 bg-ink-2 p-4 text-left transition-[border-color,transform] duration-300 hover:-translate-y-0.5 hover:border-[#c9a24b]/50"
              >
                <span className="flex items-center gap-4">
                  <Avatar player={u} size="h-16 w-16" />
                  <span className="min-w-0">
                    <span className="block truncate text-base font-semibold text-bone">{u.name}</span>
                    <span className="mt-1 flex items-center gap-2 text-xs text-mist">
                      <Flag board={board} className="text-base" />
                      {board.name}
                    </span>
                  </span>
                </span>
                <dl className="grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-lg bg-ink-3 px-3 py-2">
                    <dt className="text-[10px] text-smoke">Matches officiated</dt>
                    <dd className="mt-0.5 font-semibold text-bone">{val(u.career?.total)}</dd>
                  </div>
                  <div className="rounded-lg bg-ink-3 px-3 py-2">
                    <dt className="text-[10px] text-smoke">Current ranking</dt>
                    <dd className="mt-0.5 font-semibold text-bone">{rankOf.has(u.id) ? `#${rankOf.get(u.id)}` : MISSING}</dd>
                  </div>
                </dl>
                <span className="text-xs font-semibold tracking-[0.2em] text-[#c9a24b] transition group-hover:translate-x-1">VIEW PROFILE →</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ---------- individual profile ---------- */

function Profile({ umpire, data, onSwitch }: { umpire: Umpire; data: Data; onSwitch: (id: ProfileId) => void }) {
  const { favs, toggle } = useFavourites('umpires');
  const { matches, shared } = useMemo(() => officiatedBy(umpire, data.umpires), [umpire, data]);
  const board = data.b.boards.find((b) => data.b.boardSlug(b) === umpire.boardId);
  const position = data.u.ranking.find((r) => r.umpireId === umpire.id)?.position;
  // ranking placeholders belong to the Top 30 list; board umpires to their board list
  const parent = board ? { label: board.name, to: () => navigate('board', umpire.boardId!) } : { label: 'Top 30 Umpires', to: () => navigate() };

  return (
    <div className="gutter mx-auto max-w-5xl pb-16 pt-28">
      <Breadcrumb items={[{ label: 'Umpire Centre', onClick: () => navigate() }, { label: parent.label, onClick: parent.to }, { label: `${umpire.name} (${umpire.id})` }]} />
      <div className="mt-3">
        <BackButton onClick={() => goBack(parent.to)}>BACK</BackButton>
      </div>

      <div className="mt-6 flex items-center gap-4">
        <button type="button" onClick={() => toggle(umpire.id)} aria-pressed={favs.includes(umpire.id)} aria-label={`${favs.includes(umpire.id) ? 'Remove' : 'Add'} ${umpire.name} ${favs.includes(umpire.id) ? 'from' : 'to'} favourites`} className={`text-lg leading-none ${favs.includes(umpire.id) ? 'text-[#c9a24b]' : 'text-smoke hover:text-bone'}`}>
          {favs.includes(umpire.id) ? '★' : '☆'}
        </button>
        <ShareButton />
      </div>

      <Card title="UMPIRE PROFILE" className="mt-4">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
          <Avatar player={umpire} size="h-32 w-32" />
          <dl className="grid flex-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Fact label="Umpire name" value={umpire.name} />
            <Fact label="Umpire ID" value={umpire.id} mono />
            <Fact label="Board">
              {board ? (
                <span className="flex items-center gap-2">
                  <Flag board={board} className="text-xl" />
                  {board.name}
                </span>
              ) : (
                MISSING
              )}
            </Fact>
            <Fact label="Current ranking" value={position !== undefined && umpire.performance?.points !== undefined ? `#${position}` : MISSING} />
            <Fact label="Official status" value={umpire.status ?? data.u.DEFAULT_STATUS} />
          </dl>
        </div>
      </Card>

      <div className="mt-6 grid gap-6 md:grid-cols-2">
        <Card title="CAREER OVERVIEW">
          <StatGrid fields={data.u.CAREER_FIELDS} values={umpire.career} />
        </Card>
        <Card title="PERFORMANCE STATISTICS">
          <StatGrid fields={data.u.PERFORMANCE_FIELDS} values={umpire.performance} />
          <h3 className="mb-3 mt-5 text-[10px] font-semibold tracking-[0.22em] text-smoke">AWARDS &amp; RECOGNITIONS</h3>
          <EntryList entries={umpire.awards} />
        </Card>
      </div>

      <div className="mt-6 grid gap-6 md:grid-cols-2">
        <Card title="TOURNAMENT ASSIGNMENTS">
          <EntryList entries={umpire.assignments} />
        </Card>
        <Card title="RECENT MATCHES">
          <EntryList entries={umpire.recentMatches} />
        </Card>
        <Card title="MATCH-BY-MATCH RECORDS">
          <EntryList entries={umpire.matchRecords} />
        </Card>
        <Card title="CAREER MILESTONES">
          <EntryList entries={umpire.milestones} />
        </Card>
        <Card title={`FRANCHISE LEAGUE MATCHES (${matches.length})`} className="md:col-span-2">
          {matches.length === 0 ? (
            <p className="text-sm text-smoke">No franchise league matches found under this name.</p>
          ) : (
            <ul className="space-y-2">
              {matches.map(({ league, match }, i) => (
                <li key={i} className="border-l border-[#c9a24b]/40 pl-3 text-[13px] text-mist">
                  <span className="text-bone">
                    {match.teams[0]} vs {match.teams[1]}
                  </span>{' '}
                  · {[league.shortName, match.stage, match.date, match.venue].filter(Boolean).join(' · ')}
                  {match.winner && ` · ${match.winner} won`}
                  <button
                    type="button"
                    onClick={() => {
                      window.location.hash = `#/leagues/${league.id}`;
                      onSwitch('leagues');
                    }}
                    className="ml-3 text-[11px] font-semibold tracking-[0.2em] text-[#c9a24b] hover:underline"
                  >
                    LEAGUE →
                  </button>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-[11px] text-smoke">Matched by the umpire name recorded in the match results{shared > 0 ? `; ${shared} other ${shared === 1 ? 'umpire shares' : 'umpires share'} this name, so some matches may belong to them` : ''}.</p>
        </Card>
      </div>
    </div>
  );
}
