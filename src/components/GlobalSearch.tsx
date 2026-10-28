import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { ProfileId } from '../data/portfolio';
import { EASE } from './fx';

type Hit = { key: string; group: string; label: string; sub?: string; run: () => void };
type Index = {
  boards: import('../data/boards').Board[];
  slug: (b: import('../data/boards').Board) => string;
  players: import('../data/players').Player[];
  umpires: import('../data/umpires').Umpire[];
  leagues: import('../data/leagues').League[];
};

const GROUPS = ['Pages', 'Boards', 'Chairmen', 'Players', 'Umpires', 'Leagues', 'Teams'];
const PER_GROUP = 5;

/** Header search: finds pages, boards, chairmen, players, umpires, leagues and teams, and jumps to the right profile. */
export default function GlobalSearch({
  profileId,
  onSwitch,
  go,
  pages,
}: {
  profileId: ProfileId;
  onSwitch: (id: ProfileId) => void;
  go: (id: string) => void;
  pages: { id: string; label: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState<Index | null>(null);
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || index) return;
    Promise.all([import('../data/boards'), import('../data/players'), import('../data/umpires'), import('../data/leagues')]).then(async ([b, p, u, l]) =>
      setIndex({ boards: b.boards, slug: b.boardSlug, players: await p.loadPlayers(), umpires: await u.loadUmpires(), leagues: await l.loadLeagues() }),
    );
  }, [open, index]);

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, [open]);

  const reset = () => {
    setOpen(false);
    setQuery('');
  };
  const jump = (profile: ProfileId, hash: string) => {
    window.location.hash = hash;
    if (profile !== profileId) onSwitch(profile);
    reset();
  };

  const q = query.trim().toLowerCase();
  const hits = useMemo(() => {
    if (q.length < 2) return [] as Hit[];
    const match = (s?: string) => (s ?? '').toLowerCase().includes(q);
    const rank = (s: string) => (s.toLowerCase().startsWith(q) ? 0 : 1);
    const out: Hit[] = [];
    if (match('my iocf') || match('favourites')) out.push({ key: 'pg-my', group: 'Pages', label: 'My IOCF (favourites)', run: () => jump('main', '#/my') });
    pages.filter((p) => match(p.label)).forEach((p) => out.push({ key: `pg-${p.id}`, group: 'Pages', label: p.label, run: () => { go(p.id); reset(); } }));
    if (index) {
      const { boards, slug, players, umpires, leagues } = index;
      const boardName = (id?: string) => boards.find((b) => slug(b) === id)?.name;
      boards.filter((b) => match(b.name)).forEach((b) => out.push({ key: `b-${b.name}`, group: 'Boards', label: b.name, sub: b.chairman ? `Chairman: ${b.chairman}` : undefined, run: () => jump('board', `#/board/${slug(b)}`) }));
      boards.filter((b) => match(b.chairman) || match(b.ceo)).forEach((b) => out.push({ key: `c-${b.name}`, group: 'Chairmen', label: match(b.chairman) ? b.chairman! : b.ceo!, sub: `${match(b.chairman) ? 'Chairman' : 'CEO'} · ${b.name}`, run: () => jump('chairman', `#/chairmen/${slug(b)}`) }));
      players.filter((p) => match(p.name)).forEach((p) => out.push({ key: `p-${p.id}`, group: 'Players', label: p.name, sub: boardName(p.boardId), run: () => jump('player', `#/players/${p.boardId}/${p.id}`) }));
      umpires.filter((u) => match(u.name) && u.name !== 'Umpire').forEach((u) => out.push({ key: `u-${u.id}`, group: 'Umpires', label: u.name, sub: boardName(u.boardId), run: () => jump('umpire', `#/umpires/u/${u.id}`) }));
      leagues.filter((l) => match(l.name) || match(l.shortName)).forEach((l) => out.push({ key: `l-${l.id}`, group: 'Leagues', label: l.name, sub: l.status, run: () => jump('leagues', `#/leagues/${l.id}`) }));
      leagues.forEach((l) => l.teams.filter((t) => match(t.name)).forEach((t) => out.push({ key: `t-${l.id}-${t.id}`, group: 'Teams', label: t.name, sub: l.shortName, run: () => jump('leagues', `#/leagues/${l.id}/${t.id}`) })));
    }
    return out.sort((a, b) => GROUPS.indexOf(a.group) - GROUPS.indexOf(b.group) || rank(a.label) - rank(b.label));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, index, pages]);

  const shown = GROUPS.flatMap((g) => hits.filter((h) => h.group === g).slice(0, PER_GROUP));

  return (
    <div ref={wrap} className="relative flex items-center">
      <AnimatePresence initial={false}>
        {open && (
          <motion.input
            key="q"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setOpen(false);
              if (e.key === 'Enter' && shown[0]) shown[0].run();
            }}
            placeholder="Search IOCF"
            aria-label="Search boards, players, umpires and leagues"
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 180, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: EASE }}
            className="mr-2 rounded-md border border-white/15 bg-transparent px-3 py-1.5 text-xs text-bone outline-none placeholder:text-smoke focus:border-[#c9a24b]"
          />
        )}
      </AnimatePresence>
      <button type="button" onClick={() => setOpen((s) => !s)} aria-label="Search" aria-expanded={open} className="flex h-10 w-10 items-center justify-center text-mist transition hover:text-bone">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" className="h-5 w-5" aria-hidden>
          <circle cx="11" cy="11" r="6.5" />
          <path d="m16 16 4 4" />
        </svg>
      </button>

      {open && q.length >= 2 && (
        <div role="listbox" aria-label="Search results" className="absolute right-0 top-12 max-h-[70vh] w-[min(92vw,22rem)] overflow-y-auto rounded-xl border border-white/10 bg-ink-2/95 p-2 shadow-2xl backdrop-blur-xl">
          {!index && <p className="px-3 py-4 text-xs text-smoke">Loading…</p>}
          {index && shown.length === 0 && <p className="px-3 py-4 text-xs text-smoke">No results for “{query.trim()}”.</p>}
          {GROUPS.map((g) => {
            const items = shown.filter((h) => h.group === g);
            if (!items.length) return null;
            return (
              <div key={g} className="mb-1">
                <p className="px-3 pb-1 pt-2 text-[10px] font-semibold tracking-[0.24em] text-[#c9a24b]">{g.toUpperCase()}</p>
                {items.map((h) => (
                  <button key={h.key} role="option" aria-selected={false} type="button" onClick={h.run} className="flex w-full items-baseline justify-between gap-3 rounded-lg px-3 py-2 text-left transition hover:bg-white/5">
                    <span className="truncate text-sm text-bone">{h.label}</span>
                    {h.sub && <span className="shrink-0 truncate text-[11px] text-smoke">{h.sub}</span>}
                  </button>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
