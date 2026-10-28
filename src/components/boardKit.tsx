import { useCallback, useEffect, useState } from 'react';
import type { Board } from '../data/boards';
import type { Player } from '../data/players';
import type { Umpire } from '../data/umpires';

export const ROUTE = '#/board';
export const GOLD = '#c9a24b';

type BoardsModule = typeof import('../data/boards');
export type Data = { b: BoardsModule; players: Player[]; umpires: Umpire[] };

/** Routes: `#/board[/<page>[/<arg>]]` where page is a board id, or rankings | compare | sponsors | councils | credits | leadership. */
export function useRoute() {
  const read = () => {
    const h = window.location.hash;
    if (!h.startsWith(ROUTE)) return [] as string[];
    return h.slice(ROUTE.length).split('/').filter(Boolean).map(decodeURIComponent);
  };
  const [parts, setParts] = useState<string[]>(read);
  useEffect(() => {
    const on = () => setParts(read());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return parts;
}

export const navigate = (...parts: string[]) => {
  window.location.hash = [ROUTE, ...parts].join('/');
};

export function useData() {
  const [data, setData] = useState<Data | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    Promise.all([import('../data/boards'), import('../data/players'), import('../data/umpires')])
      .then(async ([b, p, u]) => setData({ b, players: await p.loadPlayers(), umpires: await u.loadUmpires() }))
      .catch(() => setFailed(true));
  }, []);
  return { data, failed };
}

const FAV_KEY = 'iocf-fav-boards';
const readFavs = (): string[] => {
  try {
    const v = JSON.parse(localStorage.getItem(FAV_KEY) ?? '[]');
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
};

/** Favourite boards, saved on this device. */
export function useFavs() {
  const [favs, setFavs] = useState<string[]>(readFavs);
  const toggle = useCallback((slug: string) => {
    setFavs((cur) => {
      const next = cur.includes(slug) ? cur.filter((s) => s !== slug) : [...cur, slug];
      try {
        localStorage.setItem(FAV_KEY, JSON.stringify(next));
      } catch {
        /* storage unavailable — favourites just won't persist */
      }
      return next;
    });
  }, []);
  return { favs, toggle };
}

export const fmtNum = (n: number) => n.toLocaleString('en-US');

export function Bar({ pct, label, value, tone = GOLD }: { pct: number; label: string; value: string; tone?: string }) {
  return (
    <div className="flex items-center gap-3 text-xs">
      {label && <span className="w-28 shrink-0 truncate text-mist sm:w-36">{label}</span>}
      <span className="h-2.5 flex-1 overflow-hidden rounded-full bg-ink-3" role="img" aria-label={`${label}: ${value}`}>
        <span className="block h-full rounded-full" style={{ width: `${Math.min(100, Math.max(0, pct))}%`, background: tone }} />
      </span>
      <span className="w-20 shrink-0 text-right font-semibold text-bone">{value}</span>
    </div>
  );
}

export function StarButton({ on, onClick, name }: { on: boolean; onClick: () => void; name: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      aria-label={on ? `Remove ${name} from favourites` : `Add ${name} to favourites`}
      className={`text-lg leading-none transition ${on ? 'text-[#c9a24b]' : 'text-smoke hover:text-bone'}`}
    >
      {on ? '★' : '☆'}
    </button>
  );
}

export function downloadCsv(filename: string, rows: (string | number)[][]) {
  const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const blob = new Blob([rows.map((r) => r.map(esc).join(',')).join('\n')], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export const boardsBySlug = (data: Data) => new Map<string, Board>(data.b.boards.map((b) => [data.b.boardSlug(b), b]));

export const selectCls = 'rounded-md border border-white/15 bg-ink-2 px-2 py-1.5 text-xs text-bone outline-none focus:border-[#c9a24b]';
export const chip = (on: boolean) =>
  `rounded-full border px-3.5 py-1.5 text-xs font-semibold tracking-wide transition ${on ? 'border-[#c9a24b] bg-[#c9a24b] text-ink' : 'border-white/15 text-mist hover:border-white/40 hover:text-bone'}`;
export const linkBtn = 'text-xs font-semibold tracking-[0.2em] text-[#c9a24b] hover:underline';
