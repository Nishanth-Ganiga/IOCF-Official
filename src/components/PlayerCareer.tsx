import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { FORMAT_LABEL, formatsIn, norm, selectLines, sumLines } from '../data/careerStats.mjs';
import { aliasNorm, aliasesOf, buildAliasIndex, squadEntriesOf } from '../data/commandCenter/aliases.mjs';
import aliasList from '../data/commandCenter/playerAliases.json';
import { cleanSquadName, franchiseHistory } from '../data/franchise';
import { loadLeagueStats, playersOf, type AllStats, type PlayerStats } from '../data/leagueStats';
import { loadCareerLines, type CareerLine } from '../data/playerCareer';
import type { Player } from '../data/players';
import { store } from '../data/store';
import { StatCards } from './PlayerStatCards';

const GOLD = '#c9a24b';
const ALIASES = buildAliasIndex(aliasList as never);
type Source = 'all' | 'tournament' | 'series';

const pill = (active: boolean) =>
  `rounded-full border px-4 py-1.5 text-xs font-semibold tracking-wide transition ${active ? 'border-[#c9a24b] bg-[#c9a24b] text-ink' : 'border-white/15 text-mist hover:border-white/40 hover:text-bone'}`;

/** Totals as a scorer-export record, so the shared statistic cards can show them. */
function asStats(name: string, label: string, lines: PlayerStats[]): PlayerStats {
  return { ...(sumLines(lines as unknown as Record<string, unknown>[]) as unknown as PlayerStats), id: label, name, team: label };
}

function Heading({ title, blurb }: { title: string; blurb: ReactNode }) {
  return (
    <header className="mt-12">
      <h2 className="font-display text-3xl tracking-wide text-bone">{title}</h2>
      <p className="mt-1 max-w-3xl text-sm leading-relaxed text-mist">{blurb}</p>
    </header>
  );
}

function Breakdown({ rows }: { rows: { key: string; label: string; sub: string; own: boolean; board: string; m: number; runs: number; wkts: number }[] }) {
  return (
    <div className="mt-8 overflow-x-auto rounded-xl border border-white/10">
      <table className="min-w-full text-sm">
        <thead className="bg-black/40 text-[10px] font-semibold tracking-[0.14em] text-smoke">
          <tr>
            <th scope="col" className="px-3 py-2 text-left">
              WHERE
            </th>
            <th scope="col" className="px-3 py-2 text-left">
              BOARD
            </th>
            <th scope="col" className="px-2 py-2 text-right">
              M
            </th>
            <th scope="col" className="px-2 py-2 text-right">
              RUNS
            </th>
            <th scope="col" className="px-2 py-2 text-right">
              WKTS
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5 text-bone">
          {rows.map((r) => (
            <tr key={r.key}>
              <th scope="row" className="px-3 py-2 text-left font-medium">
                {r.label}
                <span className="block text-[11px] font-normal text-smoke">{r.sub}</span>
              </th>
              <td className="px-3 py-2" style={r.own ? undefined : { color: GOLD }}>
                {r.board}
                {r.own ? '' : ' (another board)'}
              </td>
              <td className="px-2 py-2 text-right text-mist">{r.m || '—'}</td>
              <td className="px-2 py-2 text-right">{r.runs || '—'}</td>
              <td className="px-2 py-2 text-right">{r.wkts || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Board statistics: the Major Tournaments and the series played for a board, by format. Franchise league statistics are
 * a separate section below (FranchiseStats), never mixed in.
 */
export function BoardStats({ player, boardName }: { player: Player; boardName: string }) {
  const [all, setAll] = useState<CareerLine[] | null>(null);
  const [source, setSource] = useState<Source>('all');
  const [format, setFormat] = useState<string>('all');
  useEffect(() => {
    let live = true;
    loadCareerLines().then((l) => live && setAll(l), () => live && setAll([]));
    return () => {
      live = false;
    };
  }, []);

  const mine = useMemo(() => (all ? selectLines(all, { name: player.name, boardSlug: player.boardId }, ALIASES) : []), [all, player.name, player.boardId]);
  const bySource = useMemo(() => mine.filter((e) => source === 'all' || e.source === source), [mine, source]);
  const formats = useMemo(() => formatsIn(bySource), [bySource]);
  const active = format !== 'all' && formats.includes(format) ? format : 'all';
  const shown = useMemo(() => (active === 'all' ? bySource : bySource.filter((e) => e.format === active)), [bySource, active]);
  const noFormat = bySource.filter((e) => !e.format).length;
  const others = [...new Set(mine.filter((e) => !e.own).map((e) => e.boardName))];
  const count = (s: Source) => mine.filter((e) => s === 'all' || e.source === s).length;

  if (!all) return <p className="mt-10 text-sm text-smoke" aria-busy="true">Loading statistics…</p>;
  const title = active === 'all' ? 'ALL FORMATS' : FORMAT_LABEL[active].toUpperCase();
  return (
    <section aria-label="Board statistics">
      <Heading
        title={`${boardName.toUpperCase()} STATISTICS`}
        blurb="Major tournaments and series, by format. Asia Cup, Oceania Cup, Euro Cup and ODI World Cup count as ODI; World Test Championship and Associate Nations Cup as Test; Emerging Talents League, Women's Global League and Lone Warrior as Club; the T20 World Cup as T20. A series counts in the format it was played in. Franchise league statistics are shown separately below."
      />
      {!mine.length ? (
        <p className="mt-4 rounded-2xl border border-white/10 bg-ink-2 px-5 py-8 text-center text-sm text-mist">No major tournament or series statistics have been recorded for {player.name} yet.</p>
      ) : (
        <>
          <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Show statistics from">
            {([['all', 'All'], ['tournament', 'Major tournaments'], ['series', 'Series']] as [Source, string][]).map(([id, label]) => (
              <button key={id} type="button" aria-pressed={source === id} onClick={() => setSource(id)} className={pill(source === id)}>
                {label} · {count(id)}
              </button>
            ))}
          </div>
          <div role="tablist" aria-label="Cricket format" className="mt-3 flex flex-wrap gap-2">
            {['all', ...formats].map((f) => (
              <button key={f} role="tab" type="button" aria-selected={active === f} onClick={() => setFormat(f)} className={pill(active === f)}>
                {f === 'all' ? 'All formats' : FORMAT_LABEL[f]}
              </button>
            ))}
          </div>
          {others.length > 0 && (
            <p className="mt-3 text-xs text-mist">
              <span style={{ color: GOLD }}>Also played for {others.join(', ')}.</span> Those numbers are included, and marked “another board” in the list below. They are matched by his exact full name.
            </p>
          )}
          {active === 'all' && noFormat > 0 && <p className="mt-2 text-xs text-smoke">{noFormat} {noFormat === 1 ? 'entry has' : 'entries have'} no format yet, so {noFormat === 1 ? 'it counts' : 'they count'} in “All formats” only.</p>}
          {shown.length ? (
            <>
              <StatCards p={asStats(player.name, title, shown.map((e) => e.line))} period={`in ${title.toLowerCase()}`} />
              <Breakdown
                rows={shown.map((e) => ({ key: `${e.source}-${e.id}-${e.boardSlug}`, label: e.label, sub: `${e.source === 'tournament' ? 'Major tournament' : 'Series'}${e.format ? ` · ${FORMAT_LABEL[e.format]}` : ''}`, own: e.own, board: e.boardName, m: e.line.matches, runs: e.line.runs, wkts: e.line.wickets }))}
              />
            </>
          ) : (
            <p className="mt-4 text-sm text-smoke">Nothing recorded in this selection.</p>
          )}
        </>
      )}
    </section>
  );
}

/** Franchise league statistics: only the franchise leagues, never mixed with the board statistics above. */
export function FranchiseStats({ player, boardName }: { player: Player; boardName: string }) {
  const [all, setAll] = useState<AllStats | null | 'none'>(null);
  useEffect(() => {
    let live = true;
    loadLeagueStats().then((s) => live && setAll(s), () => live && setAll('none'));
    return () => {
      live = false;
    };
  }, []);

  const stints = useMemo(() => {
    if (!all || all === 'none') return [];
    const own = franchiseHistory(player, boardName);
    // the same full name (two or more words) under another board is the same person, as in the board statistics
    const multi = (player.name.match(/[A-Za-z0-9]+/g) ?? []).length >= 2;
    // the other names this player is known by (see playerAliases.json): his squad entries in the franchise leagues may use them
    const names = aliasesOf(ALIASES, player.name, player.boardId);
    // squad entries named in playerAliases.json (a spelling too plain to match on its own, e.g. "Ahmed")
    const listed = squadEntriesOf(ALIASES, player.name, player.boardId);
    const isListed = (league: { id: string }, team: { name: string }, entry: { name: string }) => listed.some((l) => l.league === league.id && l.team === team.name && l.name === entry.name);
    const known = (entry: { name: string }) => names.some((a) => aliasNorm(a.name) === aliasNorm(cleanSquadName(entry.name)));
    const extra = store.leagues.flatMap((league) =>
      league.teams.flatMap((team) =>
        team.players
          .filter((entry) => !own.some((o) => o.entry === entry) && ((multi && norm(cleanSquadName(entry.name)) === norm(player.name)) || known(entry) || isListed(league, team, entry)))
          .map((entry) => ({ league, team, entry, honours: entry.honours ?? [] })),
      ),
    );
    return [...own, ...extra]
      .map((s) => ({ ...s, stat: playersOf(all, s.league, s.team).find((p) => p.squad === s.entry), other: !own.includes(s as never) }))
      .filter((s) => s.stat);
  }, [all, player, boardName]);

  if (!all) return <p className="mt-10 text-sm text-smoke" aria-busy="true">Loading franchise statistics…</p>;
  return (
    <section aria-label="Franchise league statistics">
      <Heading title="FRANCHISE LEAGUE STATISTICS" blurb="Season 1 of the franchise leagues. These are separate from the board statistics above and are never added to them." />
      {!stints.length ? (
        <p className="mt-4 rounded-2xl border border-white/10 bg-ink-2 px-5 py-8 text-center text-sm text-mist">No franchise league statistics have been recorded for {player.name}.</p>
      ) : (
        <>
          <StatCards p={asStats(player.name, 'Franchise leagues', stints.map((s) => s.stat as PlayerStats))} period="in the franchise leagues" />
          <Breakdown
            rows={stints.map((s) => ({ key: `${s.league.id}-${s.team.id}`, label: `${s.league.name}`, sub: s.team.name, own: !s.other, board: s.entry.board ?? boardName, m: (s.stat as PlayerStats).matches, runs: (s.stat as PlayerStats).runs, wkts: (s.stat as PlayerStats).wickets }))}
          />
        </>
      )}
    </section>
  );
}
