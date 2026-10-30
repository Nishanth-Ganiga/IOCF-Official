// A Command Center store that works from ONE table you import into Supabase from a CSV (iocf_logins), instead of the four
// command_* tables. It holds the accounts and doubles as an "inbox": type a username and a password in the table's rows and the
// server picks them up — it hashes each password, keeps only the hash, and wipes the readable password from the table.
//
// Features that need their own tables degrade gracefully: no audit log (the activity list stays empty), module switches are
// not stored (every module that is active is on), and login rate limiting is counted in memory per server instance (the
// per-account lock still persists in the table). Run the full setup SQL later for all of those.
import { BOARDS } from './handler.mjs';
import { hashPassword } from './crypto.mjs';
import { SeriesRest, SupabaseStore, storeFromEnv } from './store.mjs';

const norm = (x) => String(x ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
const BOARD_ALIASES = { png: 'papuanewguinea', unitedarabemirates: 'uae', unitedstates: 'usa', unitedstatesofamerica: 'usa' };
export const boardByName = (name) => {
  const n = norm(name);
  return BOARDS.find((b) => norm(b.name) === (BOARD_ALIASES[n] ?? n) || b.slug === String(name ?? '').trim().toLowerCase());
};
const isAdminType = (t) => /admin|master|president/i.test(String(t ?? ''));
const idFor = (role, board) => (role === 'admin' ? 'IOCF-ADM-001' : `IOCF-BRD-${String(BOARDS.indexOf(board) + 1).padStart(3, '0')}`);

/** The first value found under any of these column names (case-insensitive). */
const pick = (row, names) => {
  const key = Object.keys(row).find((k) => names.includes(k.toLowerCase().replace(/[\s-]+/g, '_')));
  return key === undefined ? undefined : row[key];
};

/** A table row as an account, in the shape the rest of the server uses. */
export function accountFromRow(row) {
  const role = isAdminType(pick(row, ['account_type', 'role', 'type'])) ? 'admin' : 'board';
  const board = role === 'board' ? boardByName(pick(row, ['board', 'board_name', 'country'])) : null;
  const num = (v, d) => (v === null || v === undefined || v === '' || Number.isNaN(Number(v)) ? d : Number(v));
  const status = String(pick(row, ['status', 'account_status']) ?? 'active').trim().toLowerCase();
  return {
    id: String(pick(row, ['account_id', 'id']) ?? ''),
    account_id: String(pick(row, ['account_id', 'id']) ?? ''),
    role,
    board_slug: board?.slug ?? null,
    board_name: board?.name ?? null,
    username: String(pick(row, ['username', 'user_name', 'login', 'user_id']) ?? '').trim().toLowerCase(),
    password_hash: String(pick(row, ['password_hash']) ?? ''),
    status: status === 'inactive' ? 'inactive' : 'active',
    chairman_name: pick(row, ['chairman', 'chairman_name']) || null,
    session_version: num(pick(row, ['session_version']), 1),
    failed_logins: num(pick(row, ['failed_logins']), 0),
    locked_until: pick(row, ['locked_until']) || null,
    last_login_at: pick(row, ['last_login_at']) || null,
  };
}

const enc = encodeURIComponent;

export class LoginTableStore {
  constructor({ url, serviceKey, table = 'iocf_logins', fetchImpl = fetch }) {
    this.seriesRest = new SeriesRest({ url, serviceKey, fetchImpl });
    if (!/^[a-zA-Z0-9_]+$/.test(table)) throw new Error('Invalid table name');
    this.url = `${url.replace(/\/$/, '')}/rest/v1/${table}`;
    this.headers = { apikey: serviceKey, ...(serviceKey.startsWith('sb_') ? {} : { authorization: `Bearer ${serviceKey}` }), 'content-type': 'application/json' };
    this.fetch = fetchImpl;
    this.memory = new Map(); // login attempt counters (per server instance)
  }
  async req(method, query, body, extra = {}) {
    const res = await this.fetch(`${this.url}${query}`, { method, headers: { ...this.headers, ...extra }, body: body === undefined ? undefined : JSON.stringify(body) });
    if (!res.ok) throw new Error(`Database request failed (${res.status})`);
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  }
  async list() {
    return (await this.req('GET', '?select=*&order=account_id.asc')).map(accountFromRow);
  }
  async findById(id) {
    return ((await this.req('GET', `?select=*&account_id=eq.${enc(id)}&limit=1`)) ?? []).map(accountFromRow)[0] ?? null;
  }
  async findByUsername(username) {
    const u = String(username ?? '').trim().toLowerCase();
    // ilike so a mixed-case username typed into the table is still found; exactness is checked here
    return ((await this.req('GET', `?select=*&username=ilike.${enc(u.replace(/[%_*]/g, ''))}`)) ?? []).map(accountFromRow).find((a) => a.username === u) ?? null;
  }
  async create(rec) {
    const row = await this.req('POST', '', {
      account_id: rec.account_id,
      account_type: rec.role === 'admin' ? 'Master Administrator' : 'Board Chairman',
      board: rec.board_name ?? null,
      username: rec.username,
      password: null,
      status: rec.status ?? 'active',
      chairman: rec.chairman_name ?? null,
      password_hash: rec.password_hash,
      session_version: 1,
      failed_logins: 0,
    }, { prefer: 'return=representation' });
    return accountFromRow(row[0]);
  }
  async update(id, patch) {
    const map = { username: 'username', password_hash: 'password_hash', status: 'status', chairman_name: 'chairman', session_version: 'session_version', failed_logins: 'failed_logins', locked_until: 'locked_until', last_login_at: 'last_login_at' };
    const body = {};
    for (const [k, v] of Object.entries(patch)) if (map[k]) body[map[k]] = v;
    if (!Object.keys(body).length) return this.findById(id);
    const row = await this.req('PATCH', `?account_id=eq.${enc(id)}`, body, { prefer: 'return=representation' });
    return row?.[0] ? accountFromRow(row[0]) : null;
  }
  seriesList() { return this.seriesRest.seriesList(); }
  seriesGet(id) { return this.seriesRest.seriesGet(id); }
  seriesInsert(row) { return this.seriesRest.seriesInsert(row); }
  seriesUpdate(id, patch) { return this.seriesRest.seriesUpdate(id, patch); }
  async moduleOverrides() {
    return [];
  }
  async setModuleOverride() {
    throw Object.assign(new Error('Module switches need the full setup (run the setup SQL in Supabase).'), { code: 'unsupported' });
  }
  async addAudit() {}
  async listAudit() {
    return [];
  }
  async getRate(key, now) {
    const r = this.memory.get(key);
    return r && r.reset_at > now ? r : { count: 0, reset_at: 0 };
  }
  async bumpRate(key, windowMs, now) {
    const cur = await this.getRate(key, now);
    const next = { count: cur.count + 1, reset_at: cur.count ? cur.reset_at : now + windowMs };
    this.memory.set(key, next);
    return next;
  }
  async clearRate(key) {
    this.memory.delete(key);
  }

  /**
   * Picks up any usernames / passwords typed into the table: hashes each password, stores only the hash, and wipes the readable
   * password (only if it is still the one that was read, so a newer edit is never lost). Rows it cannot accept are left alone
   * and reported. Returns { absorbed, rejected }.
   */
  async absorb() {
    const rows = (await this.req('GET', '?select=*&password=not.is.null&password=neq.')) ?? [];
    const out = { absorbed: 0, rejected: [] };
    if (!rows.length) return out;
    const all = await this.list();
    // a username counts as taken if any OTHER account row carries it
    const owners = all.filter((a) => a.account_id).map((a) => ({ username: a.username, id: a.account_id }));
    for (const row of rows) {
      const plain = String(pick(row, ['password']) ?? '');
      const acc = accountFromRow(row);
      const label = acc.account_id || acc.username || '(row)';
      const reject = (reason) => out.rejected.push({ row: label, reason });
      if (!acc.role || (acc.role === 'board' && !acc.board_slug)) {
        reject('the board name is not one of the 26 boards');
        continue;
      }
      if (!/^[a-z0-9._@+-]{3,60}$/.test(acc.username)) {
        reject('the username must be 3–60 letters, digits, dots, dashes, underscores or @');
        continue;
      }
      if (plain.length < 6 || plain.length > 100) {
        reject('the password must be 6–100 characters');
        continue;
      }
      const accountId = acc.account_id || idFor(acc.role, boardByName(acc.board_name));
      if (owners.some((o) => o.username === acc.username && o.id !== accountId)) {
        reject(`the username "${acc.username}" is already used by another account`);
        continue;
      }
      const existing = all.find((a) => a.account_id === accountId);
      const body = {
        account_id: accountId,
        account_type: acc.role === 'admin' ? 'Master Administrator' : 'Board Chairman',
        board: acc.board_name,
        username: acc.username,
        status: acc.status,
        password_hash: await hashPassword(plain),
        password: null,
        session_version: (existing?.session_version ?? acc.session_version ?? 1) + 1,
        failed_logins: 0,
        locked_until: null,
      };
      const key = acc.account_id ? `account_id=eq.${enc(acc.account_id)}` : `username=eq.${enc(String(pick(row, ['username', 'user_name', 'login', 'user_id'])))}`;
      await this.req('PATCH', `?${key}&password=eq.${enc(plain)}`, body, { prefer: 'return=minimal' });
      for (const o of owners) if (o.id === accountId) o.username = acc.username;
      out.absorbed++;
    }
    return out;
  }
}

/**
 * The production store. It looks at what exists in the Supabase project the first time it is used: the full command_*
 * tables if they were created (setup SQL), otherwise the single imported logins table.
 */
export class AutoStore {
  constructor({ url, serviceKey, loginTable = 'iocf_logins', fetchImpl = fetch }) {
    this.cfg = { url, serviceKey, loginTable, fetchImpl };
    this.pending = null;
  }
  impl() {
    this.pending ??= this.detect().catch((e) => {
      this.pending = null; // look again on the next request
      throw e;
    });
    return this.pending;
  }
  async detect() {
    const { url, serviceKey, loginTable, fetchImpl } = this.cfg;
    const headers = { apikey: serviceKey, ...(serviceKey.startsWith('sb_') ? {} : { authorization: `Bearer ${serviceKey}` }) };
    const probe = (t) => fetchImpl(`${url.replace(/\/$/, '')}/rest/v1/${t}?select=*&limit=0`, { headers });
    const full = await probe('command_accounts');
    if (full.status === 401 || full.status === 403) throw Object.assign(new Error('Supabase refused the server\'s key.'), { code: 'not_configured' });
    if (full.ok) return new SupabaseStore({ url, serviceKey, fetchImpl });
    const single = await probe(loginTable);
    if (single.ok) return new LoginTableStore({ url, serviceKey, table: loginTable, fetchImpl });
    throw Object.assign(new Error('No Command Center tables found.'), { code: 'not_configured' });
  }
}
for (const m of ['list', 'findById', 'findByUsername', 'create', 'update', 'moduleOverrides', 'setModuleOverride', 'addAudit', 'listAudit', 'getRate', 'bumpRate', 'clearRate', 'seriesList', 'seriesGet', 'seriesInsert', 'seriesUpdate']) {
  AutoStore.prototype[m] = async function (...a) {
    return (await this.impl())[m](...a);
  };
}
AutoStore.prototype.absorb = async function () {
  const s = await this.impl();
  return s.absorb ? s.absorb() : { absorbed: 0, rejected: [] };
};

/** The store for this environment: the auto-detecting Supabase store when Supabase is configured, else the local file store. */
export function productionStoreFromEnv(env = process.env, root = process.cwd()) {
  if (env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY) return new AutoStore({ url: env.SUPABASE_URL, serviceKey: env.SUPABASE_SERVICE_ROLE_KEY, loginTable: env.COMMAND_CENTER_LOGIN_TABLE || 'iocf_logins' });
  return storeFromEnv(env, root);
}
