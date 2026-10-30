// Storage for the Command Center: accounts, per-board module switches, the audit log and login rate limits.
//
// Three interchangeable stores with the same methods:
//   MemoryStore    — tests
//   FileStore      — local development (a JSON file under .cc-data/, ignored by git)
//   SupabaseStore  — production (Postgres through Supabase's REST API with the service-role key; see schema.sql)
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const nowIso = () => new Date().toISOString();

export class MemoryStore {
  constructor(data) {
    this.data = data ?? { accounts: [], moduleOverrides: [], audit: [], rateLimits: {} };
  }
  async persist() {}

  async seriesList() {
    return (this.data.series ??= []).map((x) => ({ ...x }));
  }
  async seriesGet(id) {
    const r = (this.data.series ??= []).find((x) => x.id === id);
    return r ? { ...r } : null;
  }
  async seriesInsert(row) {
    (this.data.series ??= []).push({ ...row });
    await this.persist();
    return { ...row };
  }
  async seriesUpdate(id, patch) {
    const r = (this.data.series ??= []).find((x) => x.id === id);
    if (!r) return null;
    Object.assign(r, patch);
    await this.persist();
    return { ...r };
  }

  async findByUsername(username) {
    const u = String(username ?? '').trim().toLowerCase();
    return this.data.accounts.find((a) => a.username === u) ?? null;
  }
  async findById(id) {
    return this.data.accounts.find((a) => a.id === id) ?? null;
  }
  async list() {
    return [...this.data.accounts].sort((a, b) => a.account_id.localeCompare(b.account_id));
  }
  async create(rec) {
    const t = nowIso();
    const row = { id: randomUUID(), session_version: 1, failed_logins: 0, locked_until: null, last_login_at: null, created_at: t, updated_at: t, status: 'active', ...rec };
    if (this.data.accounts.some((a) => a.username === row.username || a.account_id === row.account_id)) throw new Error('Account already exists');
    this.data.accounts.push(row);
    await this.persist();
    return row;
  }
  async update(id, patch) {
    const row = this.data.accounts.find((a) => a.id === id);
    if (!row) return null;
    Object.assign(row, patch, { updated_at: nowIso() });
    await this.persist();
    return row;
  }
  async moduleOverrides(boardSlug) {
    return this.data.moduleOverrides.filter((m) => !boardSlug || m.board_slug === boardSlug);
  }
  async setModuleOverride(boardSlug, moduleId, enabled) {
    const row = this.data.moduleOverrides.find((m) => m.board_slug === boardSlug && m.module_id === moduleId);
    if (row) Object.assign(row, { enabled, updated_at: nowIso() });
    else this.data.moduleOverrides.push({ board_slug: boardSlug, module_id: moduleId, enabled, updated_at: nowIso() });
    await this.persist();
  }
  async addAudit(entry) {
    this.data.audit.push({ id: randomUUID(), at: nowIso(), ...entry });
    if (this.data.audit.length > 5000) this.data.audit.splice(0, this.data.audit.length - 5000);
    await this.persist();
  }
  async listAudit(limit = 20) {
    return this.data.audit.slice(-limit).reverse();
  }
  /** Failed-attempt counter for a key within a time window. */
  async getRate(key, now) {
    const r = this.data.rateLimits[key];
    return r && r.reset_at > now ? r : { count: 0, reset_at: 0 };
  }
  async bumpRate(key, windowMs, now) {
    const cur = await this.getRate(key, now);
    const next = { count: cur.count + 1, reset_at: cur.count ? cur.reset_at : now + windowMs };
    this.data.rateLimits[key] = next;
    await this.persist();
    return next;
  }
  async clearRate(key) {
    delete this.data.rateLimits[key];
    await this.persist();
  }
}

export class FileStore extends MemoryStore {
  constructor(file) {
    let data;
    try {
      data = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch {
      data = undefined;
    }
    super(data);
    this.file = file;
  }
  async persist() {
    fs.mkdirSync(path.dirname(this.file), { recursive: true, mode: 0o700 });
    const tmp = `${this.file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 1), { mode: 0o600 });
    fs.renameSync(tmp, this.file);
  }
}

/** The series table (command_series, see series.sql) through Supabase REST. Shared by the full store and the single-table store. */
export class SeriesRest {
  constructor({ url, serviceKey, fetchImpl = fetch, table = 'command_series' }) {
    this.url = `${url.replace(/\/$/, '')}/rest/v1/${table}`;
    this.headers = { apikey: serviceKey, ...(serviceKey.startsWith('sb_') ? {} : { authorization: `Bearer ${serviceKey}` }), 'content-type': 'application/json' };
    this.fetch = fetchImpl;
  }
  async req(method, query, body, extra = {}) {
    const res = await this.fetch(`${this.url}${query}`, { method, headers: { ...this.headers, ...extra }, body: body === undefined ? undefined : JSON.stringify(body) });
    if (res.status === 404) throw Object.assign(new Error('The series table does not exist yet.'), { code: 'series_missing' });
    if (!res.ok) throw new Error(`Database request failed (${res.status})`);
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  }
  async seriesList() {
    return (await this.req('GET', '?select=*&order=created_at.desc')) ?? [];
  }
  async seriesGet(id) {
    return (await this.req('GET', `?select=*&id=eq.${encodeURIComponent(id)}&limit=1`))?.[0] ?? null;
  }
  async seriesInsert(row) {
    return (await this.req('POST', '', row, { prefer: 'return=representation' }))[0];
  }
  async seriesUpdate(id, patch) {
    return (await this.req('PATCH', `?id=eq.${encodeURIComponent(id)}`, patch, { prefer: 'return=representation' }))?.[0] ?? null;
  }
}

/** Postgres via Supabase REST. Only the server holds the service-role key; the tables allow no other access (schema.sql). */
export class SupabaseStore {
  constructor({ url, serviceKey, fetchImpl = fetch }) {
    this.base = `${url.replace(/\/$/, '')}/rest/v1`;
    // Supabase's newer keys (sb_secret_…) are not JWTs and go in the apikey header alone; the older service_role JWT goes in both
    this.headers = { apikey: serviceKey, ...(serviceKey.startsWith('sb_') ? {} : { authorization: `Bearer ${serviceKey}` }), 'content-type': 'application/json' };
    this.fetch = fetchImpl;
    this.seriesRest = new SeriesRest({ url, serviceKey, fetchImpl });
  }
  seriesList() { return this.seriesRest.seriesList(); }
  seriesGet(id) { return this.seriesRest.seriesGet(id); }
  seriesInsert(row) { return this.seriesRest.seriesInsert(row); }
  seriesUpdate(id, patch) { return this.seriesRest.seriesUpdate(id, patch); }
  async req(method, pathAndQuery, body, extra = {}) {
    const res = await this.fetch(`${this.base}/${pathAndQuery}`, {
      method,
      headers: { ...this.headers, ...extra },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`Database request failed (${res.status})`);
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  }
  async findByUsername(username) {
    const u = encodeURIComponent(String(username ?? '').trim().toLowerCase());
    return (await this.req('GET', `command_accounts?username=eq.${u}&limit=1`))?.[0] ?? null;
  }
  async findById(id) {
    return (await this.req('GET', `command_accounts?id=eq.${encodeURIComponent(id)}&limit=1`))?.[0] ?? null;
  }
  async list() {
    return this.req('GET', 'command_accounts?order=account_id.asc');
  }
  async create(rec) {
    return (await this.req('POST', 'command_accounts', rec, { prefer: 'return=representation' }))[0];
  }
  async update(id, patch) {
    return (await this.req('PATCH', `command_accounts?id=eq.${encodeURIComponent(id)}`, { ...patch, updated_at: nowIso() }, { prefer: 'return=representation' }))?.[0] ?? null;
  }
  async moduleOverrides(boardSlug) {
    return this.req('GET', `command_board_modules${boardSlug ? `?board_slug=eq.${encodeURIComponent(boardSlug)}` : ''}`);
  }
  async setModuleOverride(boardSlug, moduleId, enabled) {
    await this.req('POST', 'command_board_modules?on_conflict=board_slug,module_id', { board_slug: boardSlug, module_id: moduleId, enabled, updated_at: nowIso() }, { prefer: 'resolution=merge-duplicates' });
  }
  async addAudit(entry) {
    await this.req('POST', 'command_audit_log', entry);
  }
  async listAudit(limit = 20) {
    return this.req('GET', `command_audit_log?order=at.desc&limit=${Number(limit) || 20}`);
  }
  async getRate(key, now) {
    const r = (await this.req('GET', `command_rate_limits?key=eq.${encodeURIComponent(key)}&limit=1`))?.[0];
    return r && Number(r.reset_at) > now ? { count: r.count, reset_at: Number(r.reset_at) } : { count: 0, reset_at: 0 };
  }
  async bumpRate(key, windowMs, now) {
    const cur = await this.getRate(key, now);
    const next = { key, count: cur.count + 1, reset_at: cur.count ? cur.reset_at : now + windowMs };
    await this.req('POST', 'command_rate_limits?on_conflict=key', next, { prefer: 'resolution=merge-duplicates' });
    return next;
  }
  async clearRate(key) {
    await this.req('DELETE', `command_rate_limits?key=eq.${encodeURIComponent(key)}`);
  }
}

/** The store the environment asks for, or null if none is configured (the API then answers 503). */
export function storeFromEnv(env = process.env, root = process.cwd()) {
  if (env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY) return new SupabaseStore({ url: env.SUPABASE_URL, serviceKey: env.SUPABASE_SERVICE_ROLE_KEY });
  if (env.COMMAND_CENTER_STORE === 'file') return new FileStore(path.join(root, '.cc-data', 'store.json'));
  return null;
}
