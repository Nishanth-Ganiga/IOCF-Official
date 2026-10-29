import type { PlayerStats } from '../data/leagueStats';
import { Card, MISSING } from './IocfPlayers';

const fmt = (n: number) => n.toLocaleString('en-US');
const dec = (n: number | null | undefined, d = 1) => (n === null || n === undefined ? MISSING : n.toFixed(d));

export function Stat({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <div>
      <dt className="text-[10px] font-semibold tracking-[0.22em] text-smoke">{label.toUpperCase()}</dt>
      <dd className="mt-1 text-lg font-semibold text-bone">{value === null || value === undefined ? MISSING : value}</dd>
    </div>
  );
}

/** The batting, bowling and fielding cards of a scorer-export player record. `period` says what it covers, e.g. "this tournament". */
export function StatCards({ p, period }: { p: PlayerStats; period: string }) {
  return (
    <>
      <Card title="BATTING" className="mt-8">
        {p.batInn === 0 ? (
          <p className="text-sm text-smoke">Did not bat {period}.</p>
        ) : (
          <dl className="grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-4 lg:grid-cols-6">
            <Stat label="Innings" value={p.batInn} />
            <Stat label="Runs" value={fmt(p.runs)} />
            <Stat label="Highest score" value={p.hs === null ? null : `${p.hs}${p.hsNotOut ? '*' : ''}`} />
            <Stat label="Average" value={dec(p.avg)} />
            <Stat label="Strike rate" value={dec(p.sr)} />
            <Stat label="Not outs" value={p.notOuts} />
            <Stat label="Balls faced" value={fmt(p.balls)} />
            <Stat label="Fours" value={p.fours} />
            <Stat label="Sixes" value={p.sixes} />
            <Stat label="30s" value={p.thirties} />
            <Stat label="50s" value={p.fifties} />
            <Stat label="100s" value={p.hundreds} />
            <Stat label="Most sixes in an innings" value={p.most6} />
            <Stat label="Most fours in an innings" value={p.most4} />
            <Stat label="Fastest 50 (balls)" value={p.fast50} />
            <Stat label="Fastest 100 (balls)" value={p.fast100} />
          </dl>
        )}
      </Card>

      <Card title="BOWLING" className="mt-8">
        {p.bowlInn === 0 ? (
          <p className="text-sm text-smoke">Did not bowl {period}.</p>
        ) : (
          <dl className="grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-4 lg:grid-cols-6">
            <Stat label="Innings" value={p.bowlInn} />
            <Stat label="Wickets" value={p.wickets} />
            <Stat label="Best figures" value={p.best} />
            <Stat label="Average" value={p.wickets ? dec(p.bowlAvg) : null} />
            <Stat label="Strike rate" value={p.wickets ? dec(p.bowlSr) : null} />
            <Stat label="Economy" value={dec(p.economy)} />
            <Stat label="Runs conceded" value={fmt(p.runsConceded)} />
            <Stat label="Balls bowled" value={fmt(p.ballsBowled)} />
            <Stat label="Dot balls" value={fmt(p.dots)} />
            <Stat label="Maidens" value={p.maidens} />
            <Stat label="3-wicket hauls" value={p.threeW} />
            <Stat label="5-wicket hauls" value={p.fiveW} />
          </dl>
        )}
      </Card>

      <Card title="FIELDING" className="mt-8">
        {p.catches + p.stumpings + p.runOuts > 0 ? (
          <dl className="grid grid-cols-3 gap-4">
            <Stat label="Catches" value={p.catches} />
            <Stat label="Stumpings" value={p.stumpings} />
            <Stat label="Run outs" value={p.runOuts} />
          </dl>
        ) : (
          <p className="text-sm text-smoke">No catches, stumpings or run-outs are recorded for this player. The scorer exports hardly record fielding, so this is not a full picture.</p>
        )}
      </Card>
    </>
  );
}
