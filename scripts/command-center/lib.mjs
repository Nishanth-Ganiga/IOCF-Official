// Local tooling for the Command Center's private credential register. Runs on the President's own computer only.
//
// Everything secret lives OUTSIDE the project folder, in ~/.iocf-command-center/ (override with IOCF_CC_HOME):
//   register.key                               the AES-256 key that encrypts the passwords in the register   (mode 600)
//   IOCF_PRIVATE_CREDENTIAL_REGISTER.csv       one row per account, passwords encrypted                       (mode 600)
//   env                                        optional KEY=VALUE lines (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)  (mode 600)
//
// The website never reads any of this. It only ever sees the salted password hashes in the database.
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { generatePassword, hashPassword, verifyPassword } from '../../server/command/crypto.mjs';
import { BOARDS } from '../../server/command/handler.mjs';
import { cellValue } from '../sync/helpers.mjs';

export const REGISTER_FILE = 'IOCF_PRIVATE_CREDENTIAL_REGISTER.csv';
export const COLUMNS = ['Account ID', 'Account Type', 'Board Name', 'Username', 'Encrypted Password', 'Account Status', 'Created Date', 'Last Updated Date'];

export const PLAIN_FILE = 'IOCF_CREDENTIALS_PLAIN.csv';
export const PLAIN_COLUMNS = ['Account ID', 'Account Type', 'Board Name', 'Username', 'Password', 'Account Status'];
export const localStorePath = (home) => path.join(home, 'local-store.json');
const plainPath = (home) => path.join(home, PLAIN_FILE);

export const homeDir = (env = process.env) => env.IOCF_CC_HOME || path.join(os.homedir(), '.iocf-command-center');
const registerPath = (home) => path.join(home, REGISTER_FILE);
const keyPath = (home) => path.join(home, 'register.key');

function ensureDir(home) {
  fs.mkdirSync(home, { recursive: true, mode: 0o700 });
  fs.chmodSync(home, 0o700);
}

function writePrivate(file, data) {
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, data, { mode: 0o600 });
  fs.renameSync(tmp, file);
  fs.chmodSync(file, 0o600);
}

/** Reads KEY=VALUE lines from <home>/env into the environment (values already set win). */
export function loadEnvFile(home) {
  try {
    for (const line of fs.readFileSync(path.join(home, 'env'), 'utf8').split('\n')) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
      if (m && !line.trim().startsWith('#') && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  } catch {
    /* no env file */
  }
}

export function ensureKey(home) {
  ensureDir(home);
  const file = keyPath(home);
  if (!fs.existsSync(file)) writePrivate(file, randomBytes(32).toString('hex'));
  return Buffer.from(fs.readFileSync(file, 'utf8').trim(), 'hex');
}

export function readKey(home) {
  if (!fs.existsSync(keyPath(home))) throw new Error(`No encryption key at ${keyPath(home)}. Run the setup first.`);
  return ensureKey(home);
}

/** v1:iv:tag:ciphertext (base64) — AES-256-GCM, so a changed or forged value fails to decrypt. */
export function encrypt(key, text) {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([c.update(text, 'utf8'), c.final()]);
  return `v1:${iv.toString('base64')}:${c.getAuthTag().toString('base64')}:${ct.toString('base64')}`;
}

export function decrypt(key, packed) {
  const [v, iv, tag, ct] = String(packed).split(':');
  if (v !== 'v1') throw new Error('Unknown register format');
  const d = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64'));
  d.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([d.update(Buffer.from(ct, 'base64')), d.final()]).toString('utf8');
}

const quote = (v) => (/[",\n]/.test(v) ? `"${String(v).replace(/"/g, '""')}"` : String(v));

function parseCsvFile(file, columns) {
  if (!fs.existsSync(file)) return [];
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/).filter((l) => l.trim()).slice(1);
  return lines.map((l) => {
    const cells = [];
    let cur = '', q = false;
    for (let i = 0; i < l.length; i++) {
      const ch = l[i];
      if (q) {
        if (ch === '"' && l[i + 1] === '"') (cur += '"'), i++;
        else if (ch === '"') q = false;
        else cur += ch;
      } else if (ch === '"') q = true;
      else if (ch === ',') (cells.push(cur), (cur = ''));
      else cur += ch;
    }
    cells.push(cur);
    return Object.fromEntries(columns.map((c, i) => [c, (cells[i] ?? '').trim()]));
  });
}

export const readRegister = (home) => parseCsvFile(registerPath(home), COLUMNS);

export function writeRegister(home, rows) {
  ensureDir(home);
  const sorted = [...rows].sort((a, b) => a['Account ID'].localeCompare(b['Account ID']));
  writePrivate(registerPath(home), [COLUMNS.join(','), ...sorted.map((r) => COLUMNS.map((c) => quote(r[c] ?? '')).join(','))].join('\n') + '\n');
}

const day = (iso) => String(iso).slice(0, 10);
const rowFor = (key, acc, password) => ({
  'Account ID': acc.account_id,
  'Account Type': acc.role === 'admin' ? 'Master Administrator' : 'Board Chairman',
  'Board Name': acc.board_name ?? '',
  Username: acc.username,
  'Encrypted Password': encrypt(key, password),
  'Account Status': acc.status,
  'Created Date': day(acc.created_at),
  'Last Updated Date': day(acc.updated_at),
});

export const ADMIN_ACCOUNT_ID = 'IOCF-ADM-001';
export const boardAccountId = (i) => `IOCF-BRD-${String(i + 1).padStart(3, '0')}`;
export const boardUsername = (slug) => `${slug}.chairman`;
export const ADMIN_USERNAME = 'iocf.admin';

/**
 * Creates the Master Administrator and one chairman account per board that does not have one yet. Existing accounts are
 * left alone, so it is safe to run again. Returns the new credentials (plain passwords, in memory only) for display.
 */
export async function provision({ store, home, chairmen = {} }) {
  const key = ensureKey(home);
  const existing = await store.list();
  const register = readRegister(home);
  const created = [];
  const add = async (rec) => {
    if (existing.some((a) => a.account_id === rec.account_id)) return;
    const password = generatePassword(20);
    const acc = await store.create({ ...rec, password_hash: await hashPassword(password), status: 'active' });
    register.push(rowFor(key, acc, password));
    await store.addAudit({ action: 'account_created', actor: 'local-cli', actor_role: null, target: acc.account_id, ip: null, detail: null });
    created.push({ accountId: acc.account_id, type: acc.role === 'admin' ? 'Master Administrator' : 'Board Chairman', board: acc.board_name, username: acc.username, password });
  };
  await add({ account_id: ADMIN_ACCOUNT_ID, role: 'admin', board_slug: null, board_name: null, username: ADMIN_USERNAME, chairman_name: null });
  for (const [i, b] of BOARDS.entries()) {
    await add({ account_id: boardAccountId(i), role: 'board', board_slug: b.slug, board_name: b.name, username: boardUsername(b.slug), chairman_name: chairmen[b.name] ?? null });
  }
  writeRegister(home, register);
  return created;
}

/** Finds an account by username, account id or board slug/name. */
export async function findAccount(store, ref) {
  const r = String(ref).trim().toLowerCase();
  const all = await store.list();
  return all.find((a) => a.username === r || a.account_id.toLowerCase() === r || a.board_slug === r || a.board_name?.toLowerCase() === r) ?? null;
}

/**
 * Gives an account a new password (and optionally a new username): updates the database, ends its open sessions, and
 * re-encrypts the register row. Returns the new password for display on the terminal.
 */
export async function resetCredentials({ store, home, ref, newUsername }) {
  const key = readKey(home);
  const acc = await findAccount(store, ref);
  if (!acc) throw new Error(`No account matches "${ref}".`);
  const username = (newUsername ?? acc.username).trim().toLowerCase();
  if (!/^[a-z0-9._-]{3,60}$/.test(username)) throw new Error('A username uses 3–60 letters, digits, dots, dashes or underscores.');
  const other = await store.findByUsername(username);
  if (other && other.id !== acc.id) throw new Error(`The username "${username}" is already taken.`);
  const password = generatePassword(20);
  const updated = await store.update(acc.id, { username, password_hash: await hashPassword(password), session_version: acc.session_version + 1, failed_logins: 0, locked_until: null });
  const register = readRegister(home);
  const row = rowFor(key, updated, password);
  const i = register.findIndex((r) => r['Account ID'] === acc.account_id);
  if (i >= 0) register[i] = { ...row, 'Created Date': register[i]['Created Date'] };
  else register.push(row);
  writeRegister(home, register);
  if (fs.existsSync(plainPath(home))) await writePlain({ store, home });
  await store.addAudit({ action: 'credentials_reset', actor: 'local-cli', actor_role: null, target: acc.account_id, ip: null, detail: { usernameChanged: username !== acc.username } });
  return { accountId: acc.account_id, board: acc.board_name, username, password };
}

/** Decrypts register rows (all, or those matching `ref`) for display. */
export function reveal({ home, ref }) {
  const key = readKey(home);
  const r = ref ? String(ref).toLowerCase() : null;
  return readRegister(home)
    .filter((row) => !r || [row.Username, row['Account ID'], row['Board Name']].some((v) => v.toLowerCase() === r) || row.Username.toLowerCase().startsWith(`${r}.`))
    .map((row) => ({ accountId: row['Account ID'], type: row['Account Type'], board: row['Board Name'], username: row.Username, password: decrypt(key, row['Encrypted Password']), status: row['Account Status'] }));
}

/** Checks the register against the database: every account present, every password still matching its hash. */
export async function verifyRegister({ store, home }) {
  const key = readKey(home);
  const accounts = await store.list();
  const register = readRegister(home);
  const problems = [];
  for (const a of accounts) {
    const row = register.find((r) => r['Account ID'] === a.account_id);
    if (!row) {
      problems.push(`${a.account_id} (${a.username}) is not in the register`);
      continue;
    }
    if (row.Username !== a.username) problems.push(`${a.account_id}: username differs (register ${row.Username}, database ${a.username})`);
    let ok = false;
    try {
      ok = await verifyPassword(decrypt(key, row['Encrypted Password']), a.password_hash);
    } catch {
      /* unreadable */
    }
    if (!ok) problems.push(`${a.account_id} (${a.username}): the register's password does not match the database`);
  }
  for (const row of register) if (!accounts.some((a) => a.account_id === row['Account ID'])) problems.push(`${row['Account ID']} is in the register but not in the database`);
  return { accounts: accounts.length, register: register.length, problems };
}

/** Copies the database's account statuses into the register (an admin may have activated or deactivated accounts online). */
export async function syncStatuses({ store, home }) {
  const accounts = await store.list();
  const register = readRegister(home);
  let changed = 0;
  for (const row of register) {
    const a = accounts.find((x) => x.account_id === row['Account ID']);
    if (a && (row['Account Status'] !== a.status || row['Last Updated Date'] !== day(a.updated_at))) {
      row['Account Status'] = a.status;
      row['Last Updated Date'] = day(a.updated_at);
      changed++;
    }
  }
  if (changed) writeRegister(home, register);
  return changed;
}

/** The whole register encrypted into one file (for backups), or decrypted back. */
export function backup({ home, outDir }) {
  const key = readKey(home);
  fs.mkdirSync(outDir, { recursive: true, mode: 0o700 });
  const file = path.join(outDir, `IOCF_CREDENTIAL_REGISTER_${new Date().toISOString().slice(0, 10)}.enc`);
  writePrivate(file, encrypt(key, fs.readFileSync(registerPath(home), 'utf8')));
  return file;
}

/* ---------- the readable working copy ---------- */

/**
 * Writes the readable credentials file (IOCF_CREDENTIALS_PLAIN.csv) from the encrypted register. It is a convenience copy for
 * you to read, hand out and edit; the encrypted register stays the master. Same folder, same private permissions.
 */
export async function writePlain({ store, home }) {
  const key = readKey(home);
  const accounts = await store.list();
  const rows = readRegister(home).map((r) => ({
    'Account ID': r['Account ID'],
    'Account Type': r['Account Type'],
    'Board Name': r['Board Name'],
    Username: r.Username,
    Password: decrypt(key, r['Encrypted Password']),
    'Account Status': accounts.find((a) => a.account_id === r['Account ID'])?.status ?? r['Account Status'],
  }));
  rows.sort((a, b) => a['Account ID'].localeCompare(b['Account ID']));
  ensureDir(home);
  writePrivate(plainPath(home), [PLAIN_COLUMNS.join(','), ...rows.map((r) => PLAIN_COLUMNS.map((c) => quote(r[c] ?? '')).join(','))].join('\n') + '\n');
  return plainPath(home);
}

const norm = (x) => String(x ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
const boardBy = (name) => {
  const n = norm(name);
  const alias = { png: 'papuanewguinea', unitedarabemirates: 'uae', unitedstates: 'usa', unitedstatesofamerica: 'usa', westindies: 'westindies' };
  return BOARDS.find((b) => norm(b.name) === (alias[n] ?? n) || b.slug === String(name).trim().toLowerCase());
};

/**
 * Makes the accounts match a list of wanted credentials: creates a missing account, or updates a changed username, password
 * or status. Every entry is checked first; if any is invalid nothing is changed. Entries identify their account by
 * `accountId`, or by `board` (a board name), or `role: 'admin'`. Returns what changed (never the passwords).
 */
export async function applyCredentials({ store, home, entries, minLength = 8, dryRun = false, chairmen = {} }) {
  const key = ensureKey(home);
  const accounts = await store.list();
  const register = readRegister(home);
  const problems = [];
  const warnings = [];
  const plan = [];
  const taken = new Map(accounts.map((a) => [a.username, a.account_id]));
  const seenNames = new Map();
  const seenPasswords = new Map();

  for (const e of entries) {
    const label = e.label ?? e.accountId ?? e.board ?? 'administrator';
    let acc = null;
    let create = null;
    if (e.accountId) {
      acc = accounts.find((a) => a.account_id === e.accountId);
      if (!acc) problems.push(`${label}: no such account (Account IDs cannot be changed or added).`);
    } else if (e.role === 'admin') {
      acc = accounts.find((a) => a.role === 'admin');
      create = { account_id: ADMIN_ACCOUNT_ID, role: 'admin', board_slug: null, board_name: null, chairman_name: null };
    } else {
      const board = boardBy(e.board);
      if (!board) {
        problems.push(`${label}: "${e.board}" is not one of the 26 boards.`);
        continue;
      }
      acc = accounts.find((a) => a.board_slug === board.slug);
      create = { account_id: boardAccountId(BOARDS.indexOf(board)), role: 'board', board_slug: board.slug, board_name: board.name, chairman_name: chairmen[board.name] ?? null };
    }
    if (!acc && !create) continue;

    const username = String(e.username ?? '').trim().toLowerCase();
    const password = String(e.password ?? '');
    const status = String(e.status || 'active').toLowerCase();
    if (!/^[a-z0-9._-]{3,60}$/.test(username)) problems.push(`${label}: a username uses 3–60 letters, digits, dots, dashes or underscores (found "${e.username}").`);
    if (password.length < minLength) problems.push(`${label}: a password needs at least ${minLength} characters.`);
    else if (password.length < 12) warnings.push(`${label}: the password is short (under 12 characters).`);
    if (!['active', 'inactive'].includes(status)) problems.push(`${label}: status must be active or inactive (found "${e.status}").`);
    if ((acc?.role ?? create?.role) === 'admin' && status !== 'active') problems.push(`${label}: the administrator account cannot be inactive.`);
    if (seenNames.has(username)) problems.push(`${label}: the username "${username}" is used twice (also by ${seenNames.get(username)}).`);
    seenNames.set(username, label);
    if (taken.has(username) && taken.get(username) !== (acc?.account_id ?? create?.account_id)) problems.push(`${label}: the username "${username}" already belongs to ${taken.get(username)}.`);
    if (seenPasswords.has(password)) warnings.push(`${label}: uses the same password as ${seenPasswords.get(password)} — every account should have its own.`);
    seenPasswords.set(password, label);
    plan.push({ acc, create, label, username, password, status });
  }
  if (problems.length) throw new Error(`Nothing was changed. Please fix:\n - ${problems.join('\n - ')}`);

  const changes = [];
  for (const p of plan) {
    const { acc, create, username, password, status } = p;
    if (!acc) {
      changes.push({ accountId: create.account_id, board: create.board_name ?? 'Master Administrator', changes: 'created' });
      if (!dryRun) {
        const made = await store.create({ ...create, username, password_hash: await hashPassword(password), status });
        const row = rowFor(key, made, password);
        const i = register.findIndex((x) => x['Account ID'] === made.account_id);
        if (i >= 0) register[i] = row;
        else register.push(row);
        await store.addAudit({ action: 'account_created', actor: 'local-cli', actor_role: null, target: made.account_id, ip: null, detail: { from: 'credentials list' } });
      }
      continue;
    }
    const passwordChanged = !(await verifyPassword(password, acc.password_hash));
    const changed = { username: username !== acc.username, password: passwordChanged, status: status !== acc.status };
    if (!changed.username && !changed.password && !changed.status) continue;
    changes.push({ accountId: acc.account_id, board: acc.board_name ?? 'Master Administrator', changes: Object.entries(changed).filter(([, v]) => v).map(([k]) => k).join(' + ') });
    if (dryRun) continue;
    const patch = { username, status };
    if (changed.username || changed.password) {
      patch.password_hash = changed.password ? await hashPassword(password) : acc.password_hash;
      patch.session_version = acc.session_version + 1;
      patch.failed_logins = 0;
      patch.locked_until = null;
    } else if (status === 'inactive') patch.session_version = acc.session_version + 1;
    const updated = await store.update(acc.id, patch);
    const row = rowFor(key, updated, password);
    const i = register.findIndex((x) => x['Account ID'] === acc.account_id);
    if (i >= 0) register[i] = { ...row, 'Created Date': register[i]['Created Date'] };
    else register.push(row);
    await store.addAudit({ action: changed.status && !changed.username && !changed.password ? (status === 'active' ? 'account_activated' : 'account_deactivated') : 'credentials_reset', actor: 'local-cli', actor_role: null, target: acc.account_id, ip: null, detail: { from: 'credentials list' } });
  }
  if (!dryRun && changes.length) writeRegister(home, register);
  return { changes, warnings };
}

/** Applies the edits you made in IOCF_CREDENTIALS_PLAIN.csv (see applyCredentials). */
export async function importPlain({ store, home }) {
  readKey(home);
  if (!fs.existsSync(plainPath(home))) throw new Error(`There is no ${PLAIN_FILE} in ${home}. Create it with:  npm run cc -- export`);
  const rows = parseCsvFile(plainPath(home), PLAIN_COLUMNS);
  const { changes } = await applyCredentials({
    store,
    home,
    minLength: 12,
    entries: rows.map((r) => ({ accountId: r['Account ID'], username: r.Username, password: r.Password, status: r['Account Status'] })),
  });
  return changes;
}

/**
 * Reads login credentials from a spreadsheet (an ExcelJS workbook): the first tab that has a Username and a Password column.
 * Columns are found by their headings — Board (or Country), Username, Password, and optionally Role and Status. A row with
 * no board, or a Role of admin, is the Master Administrator. With no headings at all, columns A, B, C are Board, Username, Password.
 */
export function parseCredentialSheet(workbook, { tab } = {}) {
  const sheets = workbook.worksheets.filter((w) => !tab || w.name.toLowerCase() === tab.toLowerCase());
  if (!sheets.length) throw new Error(`There is no tab called "${tab}" in the sheet.`);
  const text = (v) => String(cellValue(v) ?? '').trim();
  for (const ws of sheets) {
    const grid = [];
    ws.eachRow({ includeEmpty: false }, (row, n) => {
      const cells = [];
      for (let c = 1; c <= ws.columnCount; c++) cells[c] = text(row.getCell(c).value);
      grid.push({ n, cells });
    });
    const find = (cells, re) => cells.findIndex((v, i) => i > 0 && re.test(v));
    let head = grid.slice(0, 40).find((r) => find(r.cells, /user/i) > 0 && find(r.cells, /pass/i) > 0);
    let cols;
    let body;
    if (head) {
      cols = { board: find(head.cells, /^(board|country|nation|team)/i), user: find(head.cells, /user/i), pass: find(head.cells, /pass/i), role: find(head.cells, /^(role|type|account)/i), status: find(head.cells, /status|active/i), id: find(head.cells, /account\s*id|^id$/i) };
      body = grid.filter((r) => r.n > head.n);
    } else if (grid.length && grid.every((r) => r.cells.slice(1, 4).filter(Boolean).length === 3)) {
      cols = { board: 1, user: 2, pass: 3, role: -1, status: -1, id: -1 };
      body = grid;
      head = null;
    } else continue;
    const entries = [];
    for (const r of body) {
      const username = r.cells[cols.user];
      const password = r.cells[cols.pass];
      if (!username && !password) continue;
      const board = cols.board > 0 ? r.cells[cols.board] : '';
      const role = cols.role > 0 ? r.cells[cols.role].toLowerCase() : '';
      const st = cols.status > 0 ? r.cells[cols.status].toLowerCase() : '';
      const isAdmin = /admin|master|president/.test(role) || /^(admin|master|iocf|president|all)/i.test(board) || !board;
      entries.push({
        label: `row ${r.n}${board ? ` (${board})` : ' (administrator)'}`,
        ...(isAdmin ? { role: 'admin' } : { board }),
        username,
        password,
        status: /^(inactive|no|blocked|disabled|off|false)$/.test(st) ? 'inactive' : 'active',
      });
    }
    if (entries.length) return { tab: ws.name, entries };
  }
  throw new Error('Could not find the credentials in the sheet. It needs a heading row with "Username" and "Password" columns (and "Board" or "Country").');
}

/**
 * Copies accounts from one store to another (the local one to Supabase): missing accounts are created, existing ones get the
 * local username, password hash and status. Used once Supabase is set up, so the passwords you already have keep working.
 */
export async function pushAccounts({ from, to }) {
  const target = await to.list();
  let created = 0, updated = 0;
  for (const a of await from.list()) {
    const have = target.find((t) => t.account_id === a.account_id);
    const { id, ...rest } = a; // the target assigns its own ids
    void id;
    if (!have) {
      await to.create(rest);
      created++;
    } else if (have.username !== a.username || have.password_hash !== a.password_hash || have.status !== a.status) {
      await to.update(have.id, { username: a.username, password_hash: a.password_hash, status: a.status, chairman_name: have.chairman_name ?? a.chairman_name, session_version: (have.session_version ?? 1) + 1, failed_logins: 0, locked_until: null });
      updated++;
    }
  }
  return { created, updated };
}
