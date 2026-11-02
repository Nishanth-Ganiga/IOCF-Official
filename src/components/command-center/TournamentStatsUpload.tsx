import { useEffect, useRef, useState } from 'react';
import { api, ApiError } from '../../data/commandApi';
import { refreshTournamentStats } from '../../data/tournamentStats';

const GOLD = '#c9a24b';
const when = (ms: number) => new Date(ms).toLocaleString('en-GB', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

/**
 * Replace a Major Tournament's player statistics with the scorer's latest export. The new file replaces the bundled CSV of that
 * tournament everywhere (its statistics page, player profiles, rankings), so it can be repeated as often as the tournament goes on.
 * With `adminOnly` the control is invisible to everyone but a signed-in administrator (it sits on the public tournament page).
 */
export default function TournamentStatsUpload({ id, name, adminOnly = false }: { id: string; name: string; adminOnly?: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const [admin, setAdmin] = useState(!adminOnly);
  const [uploadedAt, setUploadedAt] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (adminOnly) api.me().then((u) => setAdmin(u.role === 'admin'), () => setAdmin(false));
  }, [adminOnly]);
  useEffect(() => {
    api.tournamentStatsLive().then((r) => setUploadedAt(r.tournaments[id]?.uploadedAt ?? null), () => undefined);
  }, [id]);
  if (!admin) return null;

  const done = (text: string) => {
    refreshTournamentStats();
    setMsg({ ok: true, text: `${text} Reloading…` });
    window.setTimeout(() => window.location.reload(), 900);
  };
  const upload = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await api.uploadSeriesStats(`tour-${id}`, await file.text(), name);
      done(`${name} statistics replaced: ${r.players} players.${r.warnings.length ? ` Note: ${r.warnings.join(' ')}` : ''}`);
    } catch (e) {
      setMsg({ ok: false, text: e instanceof ApiError ? e.message : 'Something went wrong.' });
      setBusy(false);
    }
    if (input.current) input.current.value = '';
  };
  const remove = async () => {
    setBusy(true);
    setMsg(null);
    try {
      await api.removeSeriesStats(`tour-${id}`);
      done('Back to the bundled statistics.');
    } catch (e) {
      setMsg({ ok: false, text: e instanceof ApiError ? e.message : 'Something went wrong.' });
      setBusy(false);
    }
  };

  return (
    <div className="mt-4 rounded-xl border p-4" style={{ borderColor: `${GOLD}66` }}>
      <p className="text-[11px] font-semibold tracking-[0.22em]" style={{ color: GOLD }}>
        ADMINISTRATOR · UPDATE THE STATISTICS
      </p>
      <p className="mt-1 text-sm text-mist">
        Upload the scorer&apos;s latest player-statistics CSV for <b className="text-bone">{name}</b>. It replaces the current statistics everywhere — this page, player profiles and the rankings. Upload a newer file whenever the tournament moves on.
      </p>
      <p className="mt-2 text-xs text-smoke">{uploadedAt ? `Last uploaded ${when(uploadedAt)}.` : 'Showing the statistics bundled with the site.'}</p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <input ref={input} type="file" accept=".csv,text/csv" aria-label={`Statistics CSV for ${name}`} className="hidden" onChange={(e) => void upload(e.target.files?.[0])} />
        <button type="button" onClick={() => input.current?.click()} disabled={busy} className="rounded-lg px-5 py-2.5 text-xs font-bold tracking-[0.2em] text-ink transition hover:brightness-110 disabled:opacity-50" style={{ background: GOLD }}>
          {busy ? 'WORKING…' : 'REPLACE STATISTICS CSV'}
        </button>
        {uploadedAt && (
          <button type="button" onClick={() => void remove()} disabled={busy} className="text-xs font-semibold tracking-[0.18em] text-mist hover:text-bone disabled:opacity-50">
            USE THE BUNDLED STATISTICS AGAIN
          </button>
        )}
      </div>
      <p role="status" aria-live="polite" className={`mt-2 text-xs ${msg ? (msg.ok ? 'text-[#6fcf8e]' : 'text-crimson-2') : ''}`}>
        {msg?.text}
      </p>
    </div>
  );
}
