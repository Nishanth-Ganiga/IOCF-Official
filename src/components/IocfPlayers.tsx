import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import type { Board } from '../data/boards';
import type { Entry, FormatId, Player } from '../data/players';
import type { ProfileId } from '../data/portfolio';
import { useSmoothScroll } from '../hooks/smoothScroll';
import { EASE } from './fx';
import { Flag } from './IocfChairmen';
import { IocfHeader, LOGO } from './IocfHome';
import SiteFooter, { ShareButton } from './SiteFooter';
import { franchiseHistory } from '../data/franchise';
import { useFavourites } from '../data/favourites';

type BoardsModule = typeof import('../data/boards');
type PlayersModule = typeof import('../data/players');

const ROUTE = '#/players';
export const MISSING = '—';

const container = { hidden: {}, show: { transition: { staggerChildren: 0.09, delayChildren: 0.2 } } };
const item = {
  hidden: { opacity: 0, y: 24, filter: 'blur(8px)' },
  show: { opacity: 1, y: 0, filter: 'blur(0px)', transition: { duration: 0.8, ease: EASE } },
};

/** Route is `#/players[/<boardId>[/<playerId>]]`. */
function useRoute() {
  const read = () => {
    const h = window.location.hash;
    if (!h.startsWith(ROUTE)) return [] as string[];
    return h
      .slice(ROUTE.length)
      .split('/')
      .filter(Boolean)
      .map(decodeURIComponent);
  };
  const [parts, setParts] = useState<string[]>(read);
  useEffect(() => {
    const on = () => setParts(read());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return parts;
}

const boardSlugOf = (b: Board) => b.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
const navigate = (...parts: string[]) => {
  window.location.hash = [ROUTE, ...parts].join('/');
};

function useData() {
  const [data, setData] = useState<{ b: BoardsModule; p: PlayersModule; players: Player[] } | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    Promise.all([import('../data/boards'), import('../data/players')])
      .then(async ([b, p]) => setData({ b, p, players: await p.loadPlayers() }))
      .catch(() => setFailed(true));
  }, []);
  return { data, failed };
}

export default function IocfPlayers({ profileId, onSwitch }: { profileId: ProfileId; onSwitch: (id: ProfileId) => void }) {
  const { scrollTo } = useSmoothScroll();
  const { data, failed } = useData();
  const [boardId, playerId, extraId] = useRoute();

  useEffect(() => {
    scrollTo(0, { offset: 0 });
  }, [boardId, playerId, scrollTo]);

  const go = (id: string) => {
    if (id === 'top') navigate();
    scrollTo(id === 'top' ? 0 : `#${id}`, { offset: id === 'top' ? 0 : -72 });
  };
  const links = [
    { id: 'top', label: 'Home' },
    { id: 'boards', label: 'Boards' },
  ];

  const board = data && boardId ? data.b.boards.find((b) => data.b.boardSlug(b) === boardId) : undefined;
  const player = data && playerId ? data.players.find((p) => p.id === playerId && p.boardId === boardId) : undefined;

  let body;
  if (failed) body = <Notice tone="error">The player directory could not be loaded. Please refresh the page to try again.</Notice>;
  else if (!data) body = <Loading />;
  else if (!boardId) body = <Directory data={data} />;
  else if (boardId === 'all') body = <AllPlayers data={data} />;
  else if (boardId === 'achievements') body = <AchievementsWall data={data} />;
  else if (boardId === 'highlights') body = <HighlightsGallery data={data} />;
  else if (boardId === 'compare') body = <ComparePlayers data={data} a={playerId} b={extraId} />;
  else if (!board) body = <NotFound what="board" />;
  else if (!playerId) body = <PlayerList board={board} data={data} />;
  else if (!player) body = <NotFound what="player" board={board} />;
  else body = <PlayerProfile board={board} player={player} onSwitch={onSwitch} />;

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

/* ---------- shared bits ---------- */

export function Notice({ tone, children }: { tone: 'error' | 'info'; children: ReactNode }) {
  return (
    <div className="gutter pt-32">
      <p role={tone === 'error' ? 'alert' : 'status'} className={`rounded-xl border bg-ink-2 px-5 py-10 text-center text-sm text-mist ${tone === 'error' ? 'border-crimson/40' : 'border-white/10'}`}>
        {children}
      </p>
    </div>
  );
}

export function Loading() {
  return (
    <div className="gutter pt-32" aria-busy="true">
      <p className="sr-only" role="status">
        Loading players
      </p>
      <ul className="grid grid-cols-1 gap-4 min-[420px]:grid-cols-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 8 }, (_, i) => (
          <li key={i} className="h-36 animate-pulse rounded-2xl border border-white/5 bg-ink-2" />
        ))}
      </ul>
    </div>
  );
}

function NotFound({ what, board }: { what: 'board' | 'player'; board?: Board }) {
  return (
    <div className="gutter pt-32 text-center">
      <p className="text-sm text-mist">That {what} could not be found.</p>
      <button type="button" onClick={() => (board ? navigate(boardSlugOf(board)) : navigate())} className="mt-4 text-xs font-semibold tracking-[0.2em] text-[#c9a24b] hover:underline">
        {board ? `BACK TO ${board.name.toUpperCase()}` : 'BACK TO PLAYER DIRECTORY'}
      </button>
    </div>
  );
}

export function Breadcrumb({ items }: { items: { label: string; onClick?: () => void }[] }) {
  return (
    <nav aria-label="Breadcrumb" className="text-xs text-smoke">
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-1">
        {items.map((it, i) => (
          <li key={it.label + i} className="flex items-center gap-2">
            {i > 0 && <span aria-hidden>/</span>}
            {it.onClick ? (
              <button type="button" onClick={it.onClick} className="transition hover:text-bone">
                {it.label}
              </button>
            ) : (
              <span aria-current="page" className="text-mist">
                {it.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

export function BackButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="text-xs font-semibold tracking-[0.2em] text-mist transition hover:text-bone">
      ← {children}
    </button>
  );
}

export function Avatar({ player, size }: { player: { name: string; photo?: string }; size: string }) {
  return (
    <div className={`flex shrink-0 items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-ink-3 ${size}`}>
      {player.photo ? (
        <img src={player.photo} alt={`${player.name} portrait`} className="h-full w-full object-cover" />
      ) : (
        <svg viewBox="0 0 24 24" fill="none" stroke="#6d6c75" strokeWidth="1.2" strokeLinecap="round" className="h-1/2 w-1/2" aria-hidden>
          <circle cx="12" cy="8" r="3.5" />
          <path d="M5 20c.8-3.6 3.5-5.5 7-5.5s6.2 1.9 7 5.5" />
        </svg>
      )}
    </div>
  );
}

export const searchInput = 'w-full rounded-lg border border-white/15 bg-ink-2 px-4 py-2.5 text-sm text-bone outline-none placeholder:text-smoke focus:border-[#c9a24b] sm:max-w-sm';

/* ---------- 1. directory of boards ---------- */

type Data = NonNullable<ReturnType<typeof useData>['data']>;

const BROWSE = [
  { route: 'all', title: 'ALL PLAYERS', blurb: 'Every player in one list. Filter by board, tournament or achievements, and jump by letter.' },
  { route: 'achievements', title: 'ACHIEVEMENTS WALL', blurb: 'Award winners grouped by tournament.' },
  { route: 'highlights', title: 'HIGHLIGHTS', blurb: 'Career highlight gallery, with video links as they are added.' },
  { route: 'compare', title: 'COMPARE PLAYERS', blurb: 'Put two players side by side: awards, tournaments and franchise history.' },
];

function Directory({ data }: { data: Data }) {
  const [query, setQuery] = useState('');
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    data.players.forEach((p) => m.set(p.boardId, (m.get(p.boardId) ?? 0) + 1));
    return m;
  }, [data]);
  const q = query.trim().toLowerCase();
  const visible = data.b.boards.filter((b) => !q || b.name.toLowerCase().includes(q));

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
              IOCF PLAYER DIRECTORY
            </motion.h1>
            <motion.p variants={item} className="mt-4 font-sans text-xs font-bold tracking-[0.3em] text-bone sm:text-sm">
              {data.b.boards.length} BOARDS • ONE GLOBAL CRICKET COMMUNITY
            </motion.p>
            <motion.p variants={item} className="mt-5 max-w-xl text-[15px] leading-relaxed text-bone/75 sm:text-base">
              Explore players representing IOCF boards worldwide. Discover player profiles, match statistics, rankings and achievements as the global cricket community grows.
            </motion.p>
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

      <section aria-label="Browse players" className="gutter pt-4">
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {BROWSE.map((l) => (
            <li key={l.route}>
              <button
                type="button"
                onClick={() => navigate(l.route)}
                className="group flex h-full w-full flex-col gap-2 rounded-2xl border border-white/10 bg-ink-2 p-5 text-left transition-[border-color,transform] duration-300 hover:-translate-y-0.5 hover:border-[#c9a24b]/50"
              >
                <span className="font-display text-2xl tracking-wide text-bone">{l.title}</span>
                <span className="text-xs leading-relaxed text-mist">{l.blurb}</span>
                <span className="mt-auto pt-2 text-xs font-semibold tracking-[0.2em] text-[#c9a24b] transition group-hover:translate-x-1">OPEN →</span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section id="boards" aria-label="Boards" className="gutter py-10 sm:py-14">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
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
                    onClick={() => navigate(id)}
                    aria-label={`View players of ${b.name}`}
                    className="group flex h-full w-full flex-col gap-4 rounded-2xl border border-white/10 bg-ink-2 p-5 text-left transition-[border-color,transform] duration-300 hover:-translate-y-0.5 hover:border-[#c9a24b]/50"
                  >
                    <span className="flex items-start justify-between gap-3">
                      <span className="font-display text-2xl leading-tight tracking-wide text-bone">{b.name.toUpperCase()}</span>
                      <Flag board={b} />
                    </span>
                    {count !== undefined && (
                      <span className="text-xs text-mist">
                        {count} {count === 1 ? 'player' : 'players'}
                      </span>
                    )}
                    <span className="mt-auto text-xs font-semibold tracking-[0.2em] text-[#c9a24b] transition group-hover:translate-x-1">VIEW PLAYERS →</span>
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

/* ---------- 2. rosters: a board's squad, or every player ---------- */

type Sort = 'default' | 'asc' | 'desc';

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
const letterOf = (name: string) => {
  const c = name.trim().charAt(0).toUpperCase();
  return c >= 'A' && c <= 'Z' ? c : '#';
};
const tournamentsOf = (p: Player) => (p.tournaments ?? []).map((t) => t.title);
const filterBtn = (on: boolean) =>
  `rounded-full border px-3.5 py-1.5 text-xs font-semibold tracking-wide transition ${on ? 'border-[#c9a24b] bg-[#c9a24b] text-ink' : 'border-white/15 text-mist hover:border-white/40 hover:text-bone'}`;
const selectCls = 'rounded-md border border-white/15 bg-ink-2 px-2 py-1.5 text-xs text-bone outline-none focus:border-[#c9a24b]';

function PlayerCard({ player, board, fav, onFav }: { player: Player; board?: Board; fav?: boolean; onFav?: () => void }) {
  const awards = player.achievements?.length ?? 0;
  return (
    <div className="relative">
    <button
      type="button"
      onClick={() => navigate(player.boardId, player.id)}
      aria-label={`View profile of ${player.name} (${board?.name ?? player.boardId}, ID ${player.id})`}
      className="group flex w-full flex-col gap-4 rounded-2xl border border-white/10 bg-ink-2 p-4 text-left transition-[border-color,transform] duration-300 hover:-translate-y-0.5 hover:border-[#c9a24b]/50"
    >
      <span className="flex items-center gap-4">
        <Avatar player={player} size="h-16 w-16" />
        <span className="min-w-0">
          <span className="block truncate text-base font-semibold text-bone">{player.name}</span>
          {board && (
            <span className="mt-1 flex items-center gap-2 text-xs text-mist">
              <Flag board={board} className="text-base" />
              {board.name}
            </span>
          )}
          {awards > 0 && (
            <span className="mt-1 block text-[11px] text-[#c9a24b]">
              {awards} {awards === 1 ? 'award' : 'awards'}
            </span>
          )}
        </span>
      </span>
      <span className="text-xs font-semibold tracking-[0.2em] text-[#c9a24b] transition group-hover:translate-x-1">VIEW PROFILE →</span>
    </button>
    {onFav && (
      <button type="button" onClick={onFav} aria-pressed={fav} aria-label={`${fav ? 'Remove' : 'Add'} ${player.name} ${fav ? 'from' : 'to'} favourites`} className={`absolute bottom-3 right-4 text-lg leading-none ${fav ? 'text-[#c9a24b]' : 'text-smoke hover:text-bone'}`}>
        {fav ? '★' : '☆'}
      </button>
    )}
    </div>
  );
}

function Roster({ players, data, boardId, label }: { players: Player[]; data: Data; boardId?: string; label: string }) {
  const { scrollTo } = useSmoothScroll();
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<Sort>('asc');
  const [board, setBoard] = useState('');
  const [tournament, setTournament] = useState('');
  const [awardsOnly, setAwardsOnly] = useState(false);
  const [favOnly, setFavOnly] = useState(false);
  const { favs, toggle } = useFavourites('players');

  const boardBySlug = useMemo(() => new Map(data.b.boards.map((b) => [data.b.boardSlug(b), b])), [data]);
  const tournaments = useMemo(() => [...new Set(players.flatMap(tournamentsOf))].sort(), [players]);
  const boardOptions = useMemo(() => [...new Set(players.map((p) => p.boardId))].map((id) => boardBySlug.get(id)).filter((b): b is Board => !!b), [players, boardBySlug]);

  const q = query.trim().toLowerCase();
  const visible = players
    .filter((p) => !q || p.name.toLowerCase().includes(q))
    .filter((p) => !board || p.boardId === board)
    .filter((p) => !tournament || tournamentsOf(p).includes(tournament))
    .filter((p) => !awardsOnly || (p.achievements?.length ?? 0) > 0)
    .filter((p) => !favOnly || favs.includes(p.id))
    .sort((a, b) => (sort === 'default' ? 0 : (sort === 'asc' ? 1 : -1) * a.name.localeCompare(b.name)));

  const grouped = sort !== 'default';
  const groups = useMemo(() => {
    if (!grouped) return [{ letter: '', items: visible }];
    const m = new Map<string, Player[]>();
    visible.forEach((p) => m.set(letterOf(p.name), [...(m.get(letterOf(p.name)) ?? []), p]));
    return [...m.entries()].map(([letter, items]) => ({ letter, items }));
  }, [visible, grouped]);
  const present = new Set(groups.map((g) => g.letter));
  const filtered = Boolean(q || board || tournament || awardsOnly || favOnly);
  const clear = () => {
    setQuery('');
    setBoard('');
    setTournament('');
    setAwardsOnly(false);
    setFavOnly(false);
  };

  return (
    <>
      <div className="mb-4 mt-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={`Search ${label}`} aria-label={`Search ${label}`} className={searchInput} />
        <label className="flex items-center gap-2 text-xs text-smoke">
          Sort by name
          <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} className={selectCls}>
            <option value="asc">A → Z</option>
            <option value="desc">Z → A</option>
            <option value="default">Default order</option>
          </select>
        </label>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        {!boardId && (
          <select value={board} onChange={(e) => setBoard(e.target.value)} aria-label="Filter by board" className={selectCls}>
            <option value="">All boards</option>
            {boardOptions.map((b) => (
              <option key={b.name} value={data.b.boardSlug(b)}>
                {b.name}
              </option>
            ))}
          </select>
        )}
        <select value={tournament} onChange={(e) => setTournament(e.target.value)} aria-label="Filter by tournament" className={selectCls}>
          <option value="">All tournaments</option>
          {tournaments.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <button type="button" aria-pressed={awardsOnly} onClick={() => setAwardsOnly((v) => !v)} className={filterBtn(awardsOnly)}>
          Has achievements
        </button>
        <button type="button" aria-pressed={favOnly} onClick={() => setFavOnly((v) => !v)} className={filterBtn(favOnly)}>
          ★ Favourites{favs.length ? ` (${favs.length})` : ''}
        </button>
        {filtered && (
          <button type="button" onClick={clear} className="text-xs font-semibold tracking-[0.2em] text-[#c9a24b] hover:underline">
            CLEAR FILTERS
          </button>
        )}
      </div>

      {grouped && (
        <nav aria-label="Jump to letter" className="mb-4 flex flex-wrap gap-1">
          {[...LETTERS, '#'].map((l) => {
            const on = present.has(l);
            return (
              <button
                key={l}
                type="button"
                disabled={!on}
                onClick={() => scrollTo(`#letter-${l === '#' ? 'other' : l}`, { offset: -96 })}
                aria-label={`Jump to ${l}`}
                className={`h-7 w-7 rounded-md text-xs font-semibold transition ${on ? 'border border-white/15 text-bone hover:border-[#c9a24b] hover:text-[#c9a24b]' : 'cursor-not-allowed text-white/20'}`}
              >
                {l}
              </button>
            );
          })}
        </nav>
      )}

      <p role="status" aria-live="polite" className="mb-4 text-xs text-smoke">
        Showing {visible.length} of {players.length} players
      </p>

      {players.length === 0 ? (
        <Notice tone="info">No players have been added yet.</Notice>
      ) : visible.length === 0 ? (
        <div className="rounded-xl border border-white/10 bg-ink-2 px-5 py-12 text-center">
          <p className="text-sm text-bone">No players match your filters.</p>
          <button type="button" onClick={clear} className="mt-4 text-xs font-semibold tracking-[0.2em] text-[#c9a24b] hover:underline">
            CLEAR FILTERS
          </button>
        </div>
      ) : (
        groups.map((g) => (
          <section key={g.letter || 'all'} aria-label={g.letter ? `Players starting with ${g.letter}` : undefined} className="mb-6">
            {g.letter && (
              <h2 id={`letter-${g.letter === '#' ? 'other' : g.letter}`} className="mb-3 border-b border-white/10 pb-1 font-display text-2xl tracking-wide text-[#c9a24b]">
                {g.letter}
              </h2>
            )}
            <ul className="grid grid-cols-1 gap-4 min-[420px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {g.items.map((p) => (
                <li key={p.id}>
                  <PlayerCard player={p} board={boardBySlug.get(p.boardId)} fav={favs.includes(p.id)} onFav={() => toggle(p.id)} />
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </>
  );
}

/** A board's whole squad on one page. */
function PlayerList({ board, data }: { board: Board; data: Data }) {
  const boardId = data.b.boardSlug(board);
  const all = useMemo(() => data.players.filter((p) => p.boardId === boardId), [data, boardId]);
  return (
    <div className="gutter pb-16 pt-28">
      <Breadcrumb items={[{ label: 'Player Directory', onClick: () => navigate() }, { label: board.name }]} />
      <div className="mt-3">
        <BackButton onClick={() => navigate()}>BACK TO DIRECTORY</BackButton>
      </div>
      <header className="mt-6 flex items-center justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold tracking-[0.3em] text-[#c9a24b]">{all.length} PLAYERS · FULL SQUAD</p>
          <h1 className="mt-1 font-display text-[clamp(2.4rem,6vw,4.5rem)] leading-[0.9] tracking-wide text-bone">{board.name.toUpperCase()}</h1>
        </div>
        <Flag board={board} className="text-5xl" />
      </header>
      <Roster players={all} data={data} boardId={boardId} label={`${board.name} players`} />
    </div>
  );
}

function AllPlayers({ data }: { data: Data }) {
  return (
    <div className="gutter pb-16 pt-28">
      <Breadcrumb items={[{ label: 'Player Directory', onClick: () => navigate() }, { label: 'All Players' }]} />
      <div className="mt-3">
        <BackButton onClick={() => navigate()}>BACK TO DIRECTORY</BackButton>
      </div>
      <header className="mt-6">
        <p className="text-[11px] font-semibold tracking-[0.3em] text-[#c9a24b]">{data.players.length} PLAYERS · {data.b.boards.length} BOARDS</p>
        <h1 className="mt-1 font-display text-[clamp(2.4rem,6vw,4.5rem)] leading-[0.9] tracking-wide text-bone">ALL PLAYERS</h1>
      </header>
      <Roster players={data.players} data={data} label="all players" />
    </div>
  );
}

/* ---------- 2b. achievements wall ---------- */

const tournamentOfAward = (e: Entry) => (e.detail ?? '').split(' · ')[0].trim() || 'Other awards';
const countOfAward = (e: Entry) => Number(/×(\d+)/.exec(e.detail ?? '')?.[1] ?? 1);
/** Some sheet cells hold a credit amount after "×" (e.g. ×200000); only small numbers are real repeat counts. */
const repeatOf = (e: Entry) => (countOfAward(e) <= 50 ? countOfAward(e) : 1);

function AchievementsWall({ data }: { data: Data }) {
  const { scrollTo } = useSmoothScroll();
  const [query, setQuery] = useState('');
  const [board, setBoard] = useState('');
  const boardBySlug = useMemo(() => new Map(data.b.boards.map((b) => [data.b.boardSlug(b), b])), [data]);

  const q = query.trim().toLowerCase();
  const groups = useMemo(() => {
    const m = new Map<string, Map<string, { player: Player; awards: Entry[] }>>();
    for (const p of data.players) {
      if (board && p.boardId !== board) continue;
      if (q && !p.name.toLowerCase().includes(q)) continue;
      for (const e of p.achievements ?? []) {
        const t = tournamentOfAward(e);
        const byPlayer = m.get(t) ?? new Map();
        const row = byPlayer.get(p.id) ?? { player: p, awards: [] };
        row.awards.push(e);
        byPlayer.set(p.id, row);
        m.set(t, byPlayer);
      }
    }
    return [...m.entries()]
      .map(([tournament, byPlayer]) => ({
        tournament,
        rows: [...byPlayer.values()].sort((a, b) => b.awards.length - a.awards.length || a.player.name.localeCompare(b.player.name)),
      }))
      .sort((a, b) => b.rows.length - a.rows.length || a.tournament.localeCompare(b.tournament));
  }, [data, board, q]);

  const total = new Set(groups.flatMap((g) => g.rows.map((r) => r.player.id))).size;

  return (
    <div className="gutter pb-16 pt-28">
      <Breadcrumb items={[{ label: 'Player Directory', onClick: () => navigate() }, { label: 'Achievements Wall' }]} />
      <div className="mt-3">
        <BackButton onClick={() => navigate()}>BACK TO DIRECTORY</BackButton>
      </div>
      <header className="mt-6">
        <p className="text-[11px] font-semibold tracking-[0.3em] text-[#c9a24b]">
          {total} AWARD-WINNING PLAYERS · {groups.length} TOURNAMENTS
        </p>
        <h1 className="mt-1 font-display text-[clamp(2.4rem,6vw,4.5rem)] leading-[0.9] tracking-wide text-bone">ACHIEVEMENTS WALL</h1>
      </header>

      <div className="mb-4 mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
        <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search winners" aria-label="Search winners" className={searchInput} />
        <select value={board} onChange={(e) => setBoard(e.target.value)} aria-label="Filter by board" className={selectCls}>
          <option value="">All boards</option>
          {data.b.boards.map((b) => (
            <option key={b.name} value={data.b.boardSlug(b)}>
              {b.name}
            </option>
          ))}
        </select>
      </div>

      {groups.length > 0 && (
        <nav aria-label="Jump to tournament" className="mb-8 flex flex-wrap gap-2">
          {groups.map((g) => (
            <button key={g.tournament} type="button" onClick={() => scrollTo(`#wall-${slug(g.tournament)}`, { offset: -96 })} className={filterBtn(false)}>
              {g.tournament}
            </button>
          ))}
        </nav>
      )}

      {groups.length === 0 ? (
        <Notice tone="info">No achievements match your search.</Notice>
      ) : (
        groups.map((g) => (
          <section key={g.tournament} id={`wall-${slug(g.tournament)}`} aria-label={g.tournament} className="mb-10">
            <h2 className="mb-4 flex flex-wrap items-baseline justify-between gap-2 border-b border-white/10 pb-2">
              <span className="font-display text-2xl tracking-wide text-bone sm:text-3xl">{g.tournament}</span>
              <span className="text-xs text-smoke">{g.rows.length} {g.rows.length === 1 ? 'player' : 'players'}</span>
            </h2>
            <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {g.rows.map(({ player, awards }) => {
                const b = boardBySlug.get(player.boardId);
                return (
                  <li key={player.id}>
                    <button
                      type="button"
                      onClick={() => navigate(player.boardId, player.id)}
                      aria-label={`View profile of ${player.name}`}
                      className="flex h-full w-full flex-col gap-3 rounded-2xl border border-white/10 bg-ink-2 p-4 text-left transition-[border-color,transform] duration-300 hover:-translate-y-0.5 hover:border-[#c9a24b]/50"
                    >
                      <span className="flex items-center gap-3">
                        <Avatar player={player} size="h-12 w-12" />
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-semibold text-bone">{player.name}</span>
                          {b && (
                            <span className="flex items-center gap-1.5 text-xs text-mist">
                              <Flag board={b} className="text-sm" />
                              {b.name}
                            </span>
                          )}
                        </span>
                      </span>
                      <span className="flex flex-wrap gap-1.5">
                        {awards.map((a, i) => (
                          <span key={i} className="rounded-full border border-[#c9a24b]/40 px-2.5 py-1 text-[11px] text-bone">
                            {a.title}
                            {repeatOf(a) > 1 && <span className="text-[#c9a24b]"> ×{repeatOf(a)}</span>}
                          </span>
                        ))}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-');

/* ---------- 2c. highlights gallery ---------- */

function HighlightsGallery({ data }: { data: Data }) {
  const boardBySlug = useMemo(() => new Map(data.b.boards.map((b) => [data.b.boardSlug(b), b])), [data]);
  const items = useMemo(
    () => data.players.flatMap((p) => (p.highlights ?? []).map((h) => ({ player: p, highlight: h }))),
    [data],
  );

  return (
    <div className="gutter pb-16 pt-28">
      <Breadcrumb items={[{ label: 'Player Directory', onClick: () => navigate() }, { label: 'Highlights' }]} />
      <div className="mt-3">
        <BackButton onClick={() => navigate()}>BACK TO DIRECTORY</BackButton>
      </div>
      <header className="mt-6">
        <p className="text-[11px] font-semibold tracking-[0.3em] text-[#c9a24b]">{items.length} HIGHLIGHTS</p>
        <h1 className="mt-1 font-display text-[clamp(2.4rem,6vw,4.5rem)] leading-[0.9] tracking-wide text-bone">PLAYER HIGHLIGHTS</h1>
      </header>

      {items.length === 0 ? (
        <Notice tone="info">No highlights have been added yet.</Notice>
      ) : (
        <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map(({ player, highlight }, i) => {
            const b = boardBySlug.get(player.boardId);
            return (
              <li key={`${player.id}-${i}`} className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-ink-2 p-5">
                <div className="flex items-center gap-3">
                  <Avatar player={player} size="h-14 w-14" />
                  <div className="min-w-0">
                    <p className="truncate text-base font-semibold text-bone">{player.name}</p>
                    {b && (
                      <p className="flex items-center gap-1.5 text-xs text-mist">
                        <Flag board={b} className="text-sm" />
                        {b.name}
                      </p>
                    )}
                  </div>
                </div>
                <div className="border-l border-[#c9a24b]/40 pl-3">
                  <p className="text-sm font-semibold text-bone">{highlight.title}</p>
                  {highlight.detail && <p className="mt-1 text-[13px] leading-relaxed text-mist">{highlight.detail}</p>}
                </div>
                <div className="mt-auto flex items-center justify-between gap-3">
                  {highlight.video ? (
                    <a href={highlight.video} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold tracking-[0.2em] text-[#c9a24b] hover:underline">
                      ▶ WATCH VIDEO
                    </a>
                  ) : (
                    <span className="text-xs text-smoke">Video coming soon</span>
                  )}
                  <button type="button" onClick={() => navigate(player.boardId, player.id)} className="text-xs font-semibold tracking-[0.2em] text-mist transition hover:text-bone">
                    PROFILE →
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/* ---------- 3. individual player profile ---------- */

function PlayerProfile({ board, player, onSwitch }: { board: Board; player: Player; onSwitch: (id: ProfileId) => void }) {
  const { favs, toggle } = useFavourites('players');
  const stints = franchiseHistory(player, board.name);
  const [tab, setTab] = useState<FormatId | null>(null);
  const [mod, setMod] = useState<PlayersModule | null>(null);
  useEffect(() => {
    import('../data/players').then(setMod);
  }, []);
  const boardSlug = player.boardId;
  const formats = mod?.FORMATS ?? [];
  const activeFormat = tab ?? formats[0]?.id;

  return (
    <div className="gutter mx-auto max-w-5xl pb-16 pt-28">
      <Breadcrumb
        items={[
          { label: 'Player Directory', onClick: () => navigate() },
          { label: board.name, onClick: () => navigate(boardSlug) },
          { label: `${player.name} (${player.id})` },
        ]}
      />
      <div className="mt-3">
        <BackButton onClick={() => navigate(boardSlug)}>BACK TO {board.name.toUpperCase()} PLAYERS</BackButton>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-5">
        <button type="button" onClick={() => toggle(player.id)} aria-pressed={favs.includes(player.id)} aria-label={`${favs.includes(player.id) ? 'Remove' : 'Add'} ${player.name} ${favs.includes(player.id) ? 'from' : 'to'} favourites`} className={`text-lg leading-none ${favs.includes(player.id) ? 'text-[#c9a24b]' : 'text-smoke hover:text-bone'}`}>
          {favs.includes(player.id) ? '★' : '☆'}
        </button>
        <ShareButton />
        <button type="button" onClick={() => navigate('compare', player.id)} className="text-xs font-semibold tracking-[0.2em] text-[#c9a24b] hover:underline">
          COMPARE →
        </button>
      </div>

      <Card title="PLAYER OVERVIEW" className="mt-4">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
          <Avatar player={player} size="h-32 w-32" />
          <dl className="grid flex-1 gap-4 sm:grid-cols-3">
            <Fact label="Player name" value={player.name} />
            <Fact label="Board">
              <span className="flex items-center gap-2">
                <Flag board={board} className="text-xl" />
                {board.name}
              </span>
            </Fact>
            <Fact label="Player ID" value={player.id} mono />
          </dl>
        </div>
      </Card>

      {mod && (
        <>
          <div className="mt-6 grid gap-6 md:grid-cols-2">
            <Card title="BATTING STATISTICS">
              <StatGrid fields={mod.BATTING_FIELDS} values={player.batting} />
            </Card>
            <Card title="BOWLING STATISTICS">
              <StatGrid fields={mod.BOWLING_FIELDS} values={player.bowling} />
            </Card>
          </div>

          <Card title="FORMAT-BASED STATISTICS" className="mt-6">
            <div role="tablist" aria-label="Cricket format" className="flex flex-wrap gap-2">
              {formats.map((f) => (
                <button
                  key={f.id}
                  role="tab"
                  type="button"
                  id={`tab-${f.id}`}
                  aria-selected={activeFormat === f.id}
                  aria-controls="format-panel"
                  onClick={() => setTab(f.id)}
                  className={`rounded-full border px-4 py-1.5 text-xs font-semibold tracking-wide transition ${
                    activeFormat === f.id ? 'border-[#c9a24b] bg-[#c9a24b] text-ink' : 'border-white/15 text-mist hover:border-white/40 hover:text-bone'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
            {activeFormat && (
              <div id="format-panel" role="tabpanel" aria-labelledby={`tab-${activeFormat}`} className="mt-5 grid gap-6 md:grid-cols-2">
                <div>
                  <h3 className="mb-3 text-[10px] font-semibold tracking-[0.22em] text-smoke">BATTING</h3>
                  <StatGrid fields={mod.BATTING_FIELDS} values={player.formats?.[activeFormat]?.batting} />
                </div>
                <div>
                  <h3 className="mb-3 text-[10px] font-semibold tracking-[0.22em] text-smoke">BOWLING</h3>
                  <StatGrid fields={mod.BOWLING_FIELDS} values={player.formats?.[activeFormat]?.bowling} />
                </div>
              </div>
            )}
          </Card>
        </>
      )}

      <div className="mt-6 grid gap-6 md:grid-cols-2">
        <Card title="RECENT PERFORMANCES">
          <EntryList entries={player.recentPerformances} />
        </Card>
        <Card title="TOURNAMENT HISTORY">
          <EntryList entries={player.tournaments} />
        </Card>
        <Card title="PLAYER ACHIEVEMENTS">
          <EntryList entries={player.achievements} />
        </Card>
        <Card title="CURRENT RANKINGS">
          <EntryList entries={player.rankings} />
        </Card>
        <Card title="CAREER HIGHLIGHTS" className="md:col-span-2">
          <EntryList entries={player.highlights} />
        </Card>
        <Card title="FRANCHISE HISTORY" className="md:col-span-2">
          {stints.length === 0 ? (
            <p className="text-sm text-smoke">No franchise league squads found under this name.</p>
          ) : (
            <ul className="space-y-3">
              {stints.map((st) => (
                <li key={`${st.league.id}-${st.team.id}`} className="border-l border-[#c9a24b]/40 pl-3">
                  <button
                    type="button"
                    onClick={() => {
                      window.location.hash = `#/leagues/${st.league.id}/season-1/${st.team.id}`;
                      onSwitch('leagues');
                    }}
                    className="text-sm font-semibold text-bone hover:text-[#c9a24b]"
                  >
                    {st.team.name} <span className="font-normal text-mist">· {st.league.shortName}</span>
                  </button>
                  <p className="mt-1 text-[13px] text-mist">
                    {[st.entry.role, st.entry.price !== undefined ? `${st.entry.price.toLocaleString('en-US')} credits` : undefined, st.entry.mom ? `${st.entry.mom} Man of the Match` : undefined, st.entry.bat ? `${st.entry.bat} Best Batsman` : undefined, st.entry.bowl ? `${st.entry.bowl} Best Bowler` : undefined, ...st.honours.map((h) => h.title)]
                      .filter(Boolean)
                      .join(' · ') || 'Squad member'}
                  </p>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-[11px] text-smoke">Matched by player name, so check that it is the same person.</p>
        </Card>
      </div>
    </div>
  );
}

export function Card({ title, className = '', children }: { title: string; className?: string; children: ReactNode }) {
  return (
    <section className={`rounded-2xl border border-white/10 bg-ink-2 p-5 ${className}`}>
      <h2 className="mb-4 text-[11px] font-semibold tracking-[0.24em] text-[#c9a24b]">{title}</h2>
      {children}
    </section>
  );
}

export function Fact({ label, value, mono, children }: { label: string; value?: string; mono?: boolean; children?: ReactNode }) {
  return (
    <div>
      <dt className="text-[10px] font-semibold tracking-[0.22em] text-smoke">{label.toUpperCase()}</dt>
      <dd className={`mt-1 break-words text-sm text-bone ${mono ? 'font-mono text-xs' : ''}`}>{children ?? value}</dd>
    </div>
  );
}

export function StatGrid<K extends string>({ fields, values }: { fields: readonly { key: K; label: string }[]; values?: Partial<Record<K, string | number>> }) {
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3 md:grid-cols-2 lg:grid-cols-3">
      {fields.map((f) => {
        const v = values?.[f.key];
        return (
          <div key={f.key} className="rounded-lg bg-ink-3 px-3 py-2.5">
            <dt className="text-[10px] leading-tight tracking-wide text-smoke">{f.label}</dt>
            <dd className={`mt-1 text-base font-semibold ${v === undefined ? 'text-smoke' : 'text-bone'}`}>
              {v === undefined ? <span aria-label="Not available">{MISSING}</span> : v}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

export function EntryList({ entries }: { entries?: Entry[] }) {
  if (!entries || entries.length === 0) return <p className="text-sm text-smoke">Not available</p>;
  return (
    <ul className="space-y-3">
      {entries.map((e, i) => (
        <li key={`${e.title}-${i}`} className="border-l border-[#c9a24b]/40 pl-3">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3">
            <p className="text-sm font-semibold text-bone">{e.title}</p>
            {e.date && <p className="text-[11px] text-smoke">{e.date}</p>}
          </div>
          {e.detail && <p className="mt-1 text-[13px] leading-relaxed text-mist">{e.detail}</p>}
          {e.video && (
            <a href={e.video} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block text-xs font-semibold tracking-[0.2em] text-[#c9a24b] hover:underline">
              ▶ WATCH VIDEO
            </a>
          )}
        </li>
      ))}
    </ul>
  );
}


/* ---------- compare two players ---------- */

function ComparePlayers({ data, a, b }: { data: Data; a?: string; b?: string }) {
  const byId = useMemo(() => new Map(data.players.map((p) => [p.id, p])), [data]);
  const boardBy = useMemo(() => new Map(data.b.boards.map((x) => [data.b.boardSlug(x), x])), [data]);
  const chosen = [a, b].map((id) => (id ? byId.get(id) : undefined));
  const set = (i: number, id: string) => {
    const next = [chosen[0]?.id ?? '', chosen[1]?.id ?? ''];
    next[i] = id;
    navigate('compare', ...next.filter(Boolean));
  };
  const players = chosen.filter((p): p is Player => !!p);
  const options = useMemo(() => [...data.players].sort((x, y) => x.name.localeCompare(y.name)), [data]);

  const tournamentOf = (e: Entry) => (e.detail ?? '').split(' · ')[0].trim() || 'Other awards';
  const rows: { label: string; values: string[] }[] = players.length
    ? [
        { label: 'Board', values: players.map((p) => boardBy.get(p.boardId)?.name ?? '—') },
        { label: 'Awards', values: players.map((p) => String(p.achievements?.length ?? 0)) },
        { label: 'Tournaments', values: players.map((p) => String(p.tournaments?.length ?? 0)) },
        { label: 'Tournament list', values: players.map((p) => (p.tournaments ?? []).map((t) => t.title).join(', ') || '—') },
        { label: 'Awards by tournament', values: players.map((p) => { const m = new Map<string, number>(); (p.achievements ?? []).forEach((e) => m.set(tournamentOf(e), (m.get(tournamentOf(e)) ?? 0) + 1)); return [...m.entries()].map(([t, n]) => `${t}: ${n}`).join(' · ') || '—'; }) },
        { label: 'Highlights', values: players.map((p) => (p.highlights ?? []).map((h) => h.title).join(' · ') || '—') },
        { label: 'Franchise squads', values: players.map((p) => { const bd = boardBy.get(p.boardId); const st = bd ? franchiseHistory(p, bd.name) : []; return st.map((x) => `${x.team.name} (${x.league.shortName})`).join(', ') || '—'; }) },
      ]
    : [];

  return (
    <div className="gutter mx-auto max-w-5xl pb-16 pt-28">
      <Breadcrumb items={[{ label: 'Player Directory', onClick: () => navigate() }, { label: 'Compare Players' }]} />
      <div className="mt-3">
        <BackButton onClick={() => navigate()}>BACK TO DIRECTORY</BackButton>
      </div>
      <header className="mt-6">
        <h1 className="font-display text-[clamp(2.4rem,6vw,4.5rem)] leading-[0.9] tracking-wide text-bone">COMPARE PLAYERS</h1>
        <p className="mt-3 text-sm text-mist">Batting and bowling statistics will appear here once they are recorded.</p>
      </header>
      <div className="mt-8 grid gap-3 sm:grid-cols-2">
        {[0, 1].map((i) => (
          <label key={i} className="text-xs text-smoke">
            Player {i + 1}
            <select value={chosen[i]?.id ?? ''} onChange={(e) => set(i, e.target.value)} className="mt-1 w-full rounded-md border border-white/15 bg-ink-2 px-2 py-2 text-sm text-bone outline-none focus:border-[#c9a24b]">
              <option value="">Select a player</option>
              {options.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} — {boardBy.get(p.boardId)?.name ?? p.boardId}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
      {players.length < 2 ? (
        <div className="mt-6">
          <Notice tone="info">Pick two players to compare.</Notice>
        </div>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-2xl border border-white/10 bg-ink-2">
          <table className="w-full min-w-[480px] text-left text-sm">
            <thead>
              <tr>
                <th className="px-4 py-3" />
                {players.map((p) => (
                  <th key={p.id} className="px-4 py-3">
                    <button type="button" onClick={() => navigate(p.boardId, p.id)} className="flex items-center gap-3 text-left text-bone hover:text-[#c9a24b]">
                      <Avatar player={p} size="h-10 w-10" />
                      {p.name}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.label} className="border-t border-white/5 align-top">
                  <th scope="row" className="px-4 py-2.5 text-xs font-medium text-smoke">
                    {r.label}
                  </th>
                  {r.values.map((v, i) => (
                    <td key={i} className="px-4 py-2.5 text-[13px] text-bone">
                      {v}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
