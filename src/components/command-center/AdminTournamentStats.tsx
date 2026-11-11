import { useState } from 'react';
import { api, ApiError } from '../../data/commandApi';
import { refreshTournamentStats } from '../../data/tournamentStats';
import { majorTournaments } from '../../data/tournaments';
import TournamentStatsUpload from './TournamentStatsUpload';

type Nav = (...parts: string[]) => void;

/** Administrator: replace the player statistics of any Major Tournament (the same control also sits on each tournament's page). */
export default function AdminTournamentStats({ nav }: { nav: Nav }) {
  const list = majorTournaments();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const clearAll = async () => {
    if (!window.confirm('Remove the uploaded statistics of ALL Major Tournaments? You can upload new files afterwards.')) return;
    setBusy(true);
    setMsg(null);
    let removed = 0;
    try {
      for (const t of list) {
        try {
          await api.removeSeriesStats(`tour-${t.id}`);
          removed += 1;
        } catch (e) {
          if (!(e instanceof ApiError && e.status === 404)) throw e; // nothing was uploaded for this tournament
        }
      }
      refreshTournamentStats();
      setMsg(`Removed the uploaded statistics of ${removed} ${removed === 1 ? 'tournament' : 'tournaments'}. Reloading…`);
      window.setTimeout(() => window.location.reload(), 900);
    } catch (e) {
      setMsg(e instanceof ApiError ? e.message : 'Something went wrong.');
      setBusy(false);
    }
  };
  return (
    <div className="gutter pb-20 pt-28">
      <button type="button" onClick={() => nav()} className="text-xs font-semibold tracking-[0.2em] text-mist transition hover:text-bone">
        ��� BACK TO ADMIN DASHBOARD
      </button>
      <header className="mt-6">
        <p className="text-[11px] font-semibold tracking-[0.3em] text-[#c9a24b]">MASTER ADMINISTRATOR</p>
        <h1 className="mt-1 font-display text-[clamp(2.2rem,6vw,4.5rem)] leading-[0.9] tracking-wide text-bone">TOURNAMENT STATISTICS</h1>
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-mist">Replace a Major Tournament&apos;s player statistics with the scorer&apos;s latest CSV, as often as you like — for example the World Test Championship while it is being played. The new file takes the place of the old one everywhere.</p>
        <button type="button" onClick={() => void clearAll()} disabled={busy} className="mt-4 rounded-lg border border-white/20 px-4 py-2 text-xs font-bold tracking-[0.2em] text-mist transition hover:border-white/50 hover:text-bone disabled:opacity-50">
          {busy ? 'WORKING…' : 'REMOVE ALL UPLOADED TOURNAMENT STATISTICS'}
        </button>
        <p role="status" aria-live="polite" className="mt-2 text-xs text-mist">{msg}</p>
      </header>
      <ul className="mt-6 grid gap-4 lg:grid-cols-2">
        {list.map((t) => (
          <li key={t.id} className="rounded-2xl border border-white/10 bg-ink-2 p-5">
            <p className="font-display text-2xl tracking-wide text-bone">{t.name.toUpperCase()}</p>
            <p className="text-xs text-smoke">{t.kind}</p>
            <TournamentStatsUpload id={t.id} name={t.name} />
          </li>
        ))}
      </ul>
    </div>
  );
}
