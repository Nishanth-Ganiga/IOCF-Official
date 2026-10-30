import { accounts } from './accounts';

/**
 * Sign-in for the Command Center.
 *
 * Accounts live in accounts.ts as salted PBKDF2 hashes (never the passwords). The check runs in the browser, so this keeps
 * casual visitors out of the profile; it is not server-side security — anything shipped in the page can in principle be read.
 * Create accounts with `npm run account` (see scripts/make-account.mjs).
 */

export type Role = 'admin' | 'board';

export type Account = {
  role: Role;
  username: string;
  /** Board the account belongs to (board logins only), e.g. "India". */
  board?: string;
  /** Hex salt and PBKDF2-SHA256 hash (see ITERATIONS). */
  salt: string;
  hash: string;
};

export type Session = { role: Role; username: string; board?: string };

export const ITERATIONS = 120000;
const SESSION_KEY = 'iocf-command-center';
const bytes = (hex: string) => Uint8Array.from(hex.match(/.{2}/g) ?? [], (h) => parseInt(h, 16));
const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

async function derive(password: string, saltHex: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  return hex(await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: bytes(saltHex), iterations: ITERATIONS, hash: 'SHA-256' }, key, 256));
}

const DUMMY_SALT = '00112233445566778899aabbccddeeff';

/** The session for these credentials, or null. `role` is the login the user chose (Admin or Board). */
export async function signIn(role: Role, username: string, password: string): Promise<Session | null> {
  const name = username.trim().toLowerCase();
  const account = accounts.find((a) => a.role === role && a.username.toLowerCase() === name);
  // the hash is computed even for an unknown username, so both cases take the same time
  const hash = await derive(password, account?.salt ?? DUMMY_SALT);
  if (!account || hash !== account.hash) return null;
  const session: Session = { role: account.role, username: account.username, board: account.board };
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    /* storage unavailable: the session just lasts until the page reloads */
  }
  return session;
}

export function currentSession(): Session | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as Session;
    // only accept a stored session that still matches an account
    return accounts.some((a) => a.role === s.role && a.username === s.username) ? s : null;
  } catch {
    return null;
  }
}

export function signOut() {
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch {
    /* nothing to clear */
  }
}
