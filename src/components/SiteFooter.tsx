import { useState } from 'react';
import { dataState, store } from '../data/store';

/** "Data updated …" line: when the dataset was last synced, and whether it is live or the bundled snapshot. */
export function DataStamp() {
  const at = store.generatedAt ? new Date(store.generatedAt) : null;
  if (!at || Number.isNaN(at.getTime())) return null;
  const when = at.toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  return (
    <p className="mt-2 text-[11px] text-smoke/80">
      Data updated {when}
      {dataState.origin === 'snapshot' ? ' · offline copy' : ''}
    </p>
  );
}

export default function SiteFooter() {
  return (
    <footer className="gutter border-t border-white/5 py-10 text-center text-xs text-smoke">
      One Federation. Many Roles. One Cricketing Vision.
      <DataStamp />
    </footer>
  );
}

/** Copies the current page link; falls back to a prompt where the clipboard is unavailable. */
export function ShareButton({ className = '' }: { className?: string }) {
  const [copied, setCopied] = useState(false);
  const share = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt('Copy this link', window.location.href);
    }
  };
  return (
    <button type="button" onClick={share} className={`text-xs font-semibold tracking-[0.2em] text-[#c9a24b] hover:underline ${className}`}>
      {copied ? 'LINK COPIED ✓' : 'SHARE LINK'}
    </button>
  );
}
