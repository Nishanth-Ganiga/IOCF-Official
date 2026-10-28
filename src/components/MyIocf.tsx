import { useEffect, useState } from 'react';
import type { Board } from '../data/boards';
import type { League } from '../data/leagues';
import type { Player } from '../data/players';
import type { Umpire } from '../data/umpires';
import { useFavourites, type FavKind } from '../data/favourites';
import type { ProfileId } from '../data/portfolio';
import { Flag } from './IocfChairmen';
import { Notice } from './IocfPlayers';

type Loaded = { boards: Board[]; slug: (b: Board) => string; players: Player[]; umpires: Umpire[]; leagues: League[] };

const linkCls = 'text-sm text-bone hover:text-[#c9a24b]';

/** Everything you have starred, across boards, players, umpires and franchise teams. Saved on this device only. */
export default function MyIocf({ onSwitch }: { onSwitch: (id: ProfileId) => void }) {
  const [data, setData] = useState<Loaded | null>(null);
  const boards = useFavourites('boards');
  const players = useFavourites('players');
  const umpires = useFavourites('umpires');
  const teams = useFavourites('teams');

  useEffect(() => {
    Promise.all([import('../data/boards'), import('../data/players'), import('../data/umpires'), import('../data/leagues')]).then(async ([b, p, u, l]) =>
      setData({ boards: b.boards, slug: b.boardSlug, players: await p.loadPlayers(), umpires: await u.loadUmpires(), leagues: await l.loadLeagues() }),
    );
  }, []);

  const open = (profile: ProfileId, hash: string) => {
    window.location.hash = hash;
    onSwitch(profile);
  };
  const total = boards.favs.length + players.favs.length + umpires.favs.length + teams.favs.length;

  return (
    <div className="gutter mx-auto max-w-4xl pb-16 pt-28">
      <p className="text-[11px] font-semibold tracking-[0.3em] text-[#c9a24b]">SAVED ON THIS DEVICE</p>
      <h1 className="mt-1 font-display text-[clamp(2.4rem,6vw,4.5rem)] leading-[0.9] tracking-wide text-bone">MY IOCF</h1>
      <p className="mt-3 text-sm text-mist">Tap the ★ on any board, player, umpire or team to keep it here.</p>

      {!data ? (
        <p className="mt-8 text-sm text-smoke">Loading…</p>
      ) : total === 0 ? (
        <div className="mt-8">
          <Notice tone="info">You have not starred anything yet.</Notice>
        </div>
      ) : (
        <div className="mt-8 space-y-8">
          <Group title="BOARDS" kind="boards" ids={boards.favs} toggle={boards.toggle}>
            {(id) => {
              const b = data.boards.find((x) => data.slug(x) === id);
              return b && (
                <button type="button" onClick={() => open('board', `#/board/${id}`)} className={`flex items-center gap-2 ${linkCls}`}>
                  <Flag board={b} className="text-lg" />
                  {b.name}
                </button>
              );
            }}
          </Group>
          <Group title="PLAYERS" kind="players" ids={players.favs} toggle={players.toggle}>
            {(id) => {
              const p = data.players.find((x) => x.id === id);
              return p && (
                <button type="button" onClick={() => open('player', `#/players/${p.boardId}/${p.id}`)} className={linkCls}>
                  {p.name} <span className="text-xs text-smoke">· {data.boards.find((b) => data.slug(b) === p.boardId)?.name}</span>
                </button>
              );
            }}
          </Group>
          <Group title="UMPIRES" kind="umpires" ids={umpires.favs} toggle={umpires.toggle}>
            {(id) => {
              const u = data.umpires.find((x) => x.id === id);
              return u && (
                <button type="button" onClick={() => open('umpire', `#/umpires/u/${u.id}`)} className={linkCls}>
                  {u.name} <span className="text-xs text-smoke">· {data.boards.find((b) => data.slug(b) === u.boardId)?.name}</span>
                </button>
              );
            }}
          </Group>
          <Group title="TEAMS" kind="teams" ids={teams.favs} toggle={teams.toggle}>
            {(id) => {
              const [leagueId, teamId] = id.split('/');
              const league = data.leagues.find((l) => l.id === leagueId);
              const team = league?.teams.find((t) => t.id === teamId);
              return team && league && (
                <button type="button" onClick={() => open('leagues', `#/leagues/${leagueId}/${teamId}`)} className={linkCls}>
                  {team.name} <span className="text-xs text-smoke">· {league.shortName}</span>
                </button>
              );
            }}
          </Group>
        </div>
      )}
    </div>
  );
}

function Group({ title, ids, toggle, children }: { title: string; kind: FavKind; ids: string[]; toggle: (id: string) => void; children: (id: string) => React.ReactNode }) {
  if (ids.length === 0) return null;
  return (
    <section aria-label={title}>
      <h2 className="mb-3 text-[11px] font-semibold tracking-[0.24em] text-[#c9a24b]">
        {title} ({ids.length})
      </h2>
      <ul className="space-y-2 rounded-2xl border border-white/10 bg-ink-2 p-4">
        {ids.map((id) => {
          const row = children(id);
          return row ? (
            <li key={id} className="flex items-center justify-between gap-3">
              {row}
              <button type="button" onClick={() => toggle(id)} aria-label="Remove from favourites" className="text-lg leading-none text-[#c9a24b] hover:text-bone">
                ★
              </button>
            </li>
          ) : null;
        })}
      </ul>
    </section>
  );
}
