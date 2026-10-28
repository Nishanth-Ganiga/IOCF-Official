import { useCallback, useEffect, useState } from 'react';

/**
 * Favourites, saved on this device only. One list per kind (boards, players, umpires, teams).
 * Keys are `iocf-fav-<kind>`; the boards list keeps the key the Board profile already used.
 */
export type FavKind = 'boards' | 'players' | 'umpires' | 'teams';

const keyOf = (kind: FavKind) => `iocf-fav-${kind}`;
const CHANGE = 'iocf-fav-change';

export const readFavourites = (kind: FavKind): string[] => {
  try {
    const v = JSON.parse(localStorage.getItem(keyOf(kind)) ?? '[]');
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
};

export function useFavourites(kind: FavKind) {
  const [favs, setFavs] = useState<string[]>(() => readFavourites(kind));
  useEffect(() => {
    const on = () => setFavs(readFavourites(kind));
    window.addEventListener(CHANGE, on);
    window.addEventListener('storage', on);
    return () => {
      window.removeEventListener(CHANGE, on);
      window.removeEventListener('storage', on);
    };
  }, [kind]);
  const toggle = useCallback(
    (id: string) => {
      const cur = readFavourites(kind);
      const next = cur.includes(id) ? cur.filter((s) => s !== id) : [...cur, id];
      try {
        localStorage.setItem(keyOf(kind), JSON.stringify(next));
      } catch {
        /* storage unavailable — favourites just won't persist */
      }
      setFavs(next);
      window.dispatchEvent(new Event(CHANGE));
    },
    [kind],
  );
  return { favs, toggle };
}
