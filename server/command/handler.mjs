// The Command Center API. Framework-free: `handle(req)` takes a plain request description and returns a plain response,
// so the same code runs on Vercel, on the Node server (Fly) and in the dev server, and can be tested without a network.
//
//   POST /login                         { role: 'admin' | 'board', username, password }
//   POST /logout
//   GET  /me
//   GET  /boards/:slug/dashboard        admin: any board; board account: only its own
//   GET  /admin/overview                admin only
//   GET  /admin/accounts                admin only
//   PATCH /admin/accounts/:accountId    admin only   { status?, chairmanName? }
//   PUT  /admin/boards/:slug/modules    admin only   { moduleId, enabled }
//   PUT  /admin/boards/:slug/account    admin only   { username?, password?, chairmanName? }  creates or updates the board's login
//   GET  /admin/series                 admin only   every series, any status
//   DELETE /admin/series/:id           admin only   removes a series for good
//   GET  /admin/audit                   admin only
//   GET  /boards/:slug/series           the board's announced series, invitations and the upcoming list
//   POST /boards/:slug/series           announce a series (own board)
//   PUT  /boards/:slug/series/:id       edit it until an opponent accepts
//   POST /boards/:slug/series/:id/accept  accept an invitation (own board)
//
// Every permission check below runs on the server for every request. The browser's own state is never trusted.
import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { SERIES_CFG, STADIUMS, activeCount, adminView, isLive, newSeries, toApi, validateSeries } from './series.mjs';
import { dummyHash, hashPassword, parseCookies, signSession, verifyPassword, verifySession } from './crypto.mjs';

const read = (rel) => JSON.parse(readFileSync(new URL(rel, import.meta.url), 'utf8'));
export const BOARDS = read('../../src/data/commandCenter/boards.json');
export const MODULES = read('../../src/data/commandCenter/modules.json');

export const COOKIE = 'iocf_cc';
const SESSION_MS = 8 * 60 * 60 * 1000;
const WINDOW_MS = 15 * 60 * 1000;
const MAX_USER_FAILS = 5; // wrong passwords per IP + username in the window
const MAX_IP_FAILS = 30; // per IP in the window
const MAX_ACCOUNT_FAILS = 10; // in a row, whoever tries: the account locks
const ACCOUNT_LOCK_MS = 30 * 60 * 1000;

const ACTIONS = {
  login_success: 'Signed in',
  login_failed: 'Failed sign-in',
  login_locked: 'Sign-in blocked (too many attempts)',
  login_inactive: 'Sign-in refused (inactive account)',
  login_wrong_portal: 'Sign-in refused (wrong login type)',
  logout: 'Signed out',
  account_activated: 'Account activated',
  account_deactivated: 'Account deactivated',
  chairman_updated: 'Chairman information updated',
  modules_changed: 'Board modules changed',
  board_preview: 'Board dashboard previewed',
  account_created: 'Account created',
  credentials_reset: 'Credentials reset',
  credentials_set: 'Login set by administrator',
  series_announced: 'Series announced',
  series_edited: 'Series edited',
  series_accepted: 'Series accepted',
  series_deleted: 'Series deleted by administrator',
};
export const actionLabel = (a) => ACTIONS[a] ?? a;

const json = (status, body, headers = {}) => ({
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', ...headers },
  body,
});
const fail = (status, code, message, extra = {}) => json(status, { error: { code, message, ...extra } });

const publicUser = (a) => ({ accountId: a.account_id, role: a.role, username: a.username, board: a.board_slug ?? null, boardName: a.board_name ?? null, chairmanName: a.chairman_name ?? null });

export function createHandler({ store, env = process.env, now = () => Date.now() }) {
  const secret = env.COMMAND_CENTER_SESSION_SECRET || randomBytes(32).toString('hex'); // a per-process secret still works for dev/tests
  const production = Boolean(env.COMMAND_CENTER_SESSION_SECRET);

  const cookie = (value, maxAgeSec, secure) => `${COOKIE}=${value}; Path=/api/command; HttpOnly; SameSite=Strict; Max-Age=${maxAgeSec}${secure ? '; Secure' : ''}`;
  const isHttps = (req) => (req.headers['x-forwarded-proto'] ?? '').split(',')[0].trim() === 'https';

  const audit = (action, actor, target, req, detail) =>
    store.addAudit({ action, actor: actor?.username ?? actor ?? null, actor_role: actor?.role ?? null, target: target ?? null, ip: req.ip ?? null, detail: detail ?? null }).catch(() => undefined);

  /** The signed-in account for this request, or null. The account is read from the database every time, so a
   *  deactivation, a reset or a role change takes effect on the very next request. */
  async function authenticate(req) {
    const token = parseCookies(req.headers.cookie)[COOKIE];
    const s = verifySession(token, secret, now());
    if (!s) return null;
    const account = await store.findById(s.aid);
    if (!account || account.status !== 'active' || account.session_version !== s.sv || account.role !== s.role) return null;
    return account;
  }

  const enabledModules = async (slug) => {
    const overrides = await store.moduleOverrides(slug);
    return MODULES.filter((m) => m.status === 'active' && overrides.find((o) => o.module_id === m.id)?.enabled !== false).map((m) => m.id);
  };

  // ---- login ----
  async function login(req) {
    const { role, username, password } = req.body ?? {};
    if (!['admin', 'board'].includes(role) || typeof username !== 'string' || typeof password !== 'string' || !username.trim() || !password || password.length > 200) {
      return fail(400, 'bad_request', 'Enter your username and password.');
    }
    const name = username.trim().toLowerCase().slice(0, 80);
    const t = now();
    const userKey = `login:${req.ip}:${name}`;
    const ipKey = `login-ip:${req.ip}`;
    const [u, ip] = await Promise.all([store.getRate(userKey, t), store.getRate(ipKey, t)]);
    if (u.count >= MAX_USER_FAILS || ip.count >= MAX_IP_FAILS) {
      const retry = Math.max(1, Math.ceil((Math.max(u.count >= MAX_USER_FAILS ? u.reset_at : 0, ip.count >= MAX_IP_FAILS ? ip.reset_at : 0) - t) / 1000));
      await audit('login_locked', name, null, req);
      return fail(429, 'rate_limited', 'Too many attempts. Please wait before trying again.', { retryAfter: retry });
    }

    // logins typed into the Supabase table are picked up (hashed, readable copy wiped) before the check
    await store.absorb?.().catch(() => undefined);

    const account = await store.findByUsername(name);
    if (account?.locked_until && new Date(account.locked_until).getTime() > t) {
      await audit('login_locked', name, account.account_id, req);
      return fail(429, 'account_locked', 'This account is temporarily locked after repeated failed attempts. Try again later.', { retryAfter: Math.ceil((new Date(account.locked_until).getTime() - t) / 1000) });
    }
    // the hash is checked even for an unknown username, so both cases take the same time
    const ok = await verifyPassword(password, account?.password_hash ?? (await dummyHash()));

    if (!account || !ok) {
      await Promise.all([store.bumpRate(userKey, WINDOW_MS, t), store.bumpRate(ipKey, WINDOW_MS, t)]);
      if (account) {
        const fails = (account.failed_logins ?? 0) + 1;
        await store.update(account.id, { failed_logins: fails, locked_until: fails >= MAX_ACCOUNT_FAILS ? new Date(t + ACCOUNT_LOCK_MS).toISOString() : account.locked_until ?? null });
      }
      await audit('login_failed', name, account?.account_id ?? null, req);
      return fail(401, 'invalid_credentials', 'Incorrect username or password.');
    }
    // the password is right from here on
    if (account.status !== 'active') {
      await audit('login_inactive', name, account.account_id, req);
      return fail(403, 'inactive', 'This account is inactive. Please contact the IOCF administrator.');
    }
    if (account.role !== role) {
      await audit('login_wrong_portal', name, account.account_id, req);
      return fail(403, 'wrong_portal', account.role === 'admin' ? 'This account is not authorized for Board Login. Use Admin Login.' : 'This account is not authorized for Admin Login. Use Board Login.');
    }

    await Promise.all([store.clearRate(userKey), store.update(account.id, { failed_logins: 0, locked_until: null, last_login_at: new Date(t).toISOString() })]);
    await audit('login_success', account, account.account_id, req);
    const token = signSession({ aid: account.id, role: account.role, sv: account.session_version, iat: t, exp: t + SESSION_MS }, secret);
    return json(200, { user: publicUser(account) }, { 'set-cookie': cookie(token, SESSION_MS / 1000, production || isHttps(req)) });
  }

  // ---- routes ----
  return async function handle(req) {
    try {
      const [a, b, c, d, e] = req.path;
      const method = req.method;

      if (method !== 'GET' && method !== 'HEAD') {
        // state-changing requests must come from this site's own scripts (custom header + same origin), never from another site
        const origin = req.headers.origin;
        if (req.headers['x-iocf-request'] !== '1') return fail(403, 'forbidden', 'Request not allowed.');
        if (origin && req.headers.host && new URL(origin).host !== req.headers.host) return fail(403, 'forbidden', 'Request not allowed.');
      }

      if (!store) return fail(503, 'not_configured', 'The Command Center backend is not configured yet.');
      // with a real database a shared session secret is required: a per-process one would log people out between server instances
      if (env.SUPABASE_URL && String(env.COMMAND_CENTER_SESSION_SECRET ?? '').length < 32) return fail(503, 'not_configured', 'The Command Center is not fully configured yet (session secret).');

      if (a === 'login' && method === 'POST' && !b) return await login(req);

      if (a === 'logout' && method === 'POST' && !b) {
        const who = await authenticate(req);
        if (who) await audit('logout', who, who.account_id, req);
        return json(200, { ok: true }, { 'set-cookie': cookie('', 0, production || isHttps(req)) });
      }

      // everything below needs a signed-in account
      const who = await authenticate(req);
      if (!who) return fail(401, 'unauthenticated', 'Please sign in.');

      if (a === 'me' && method === 'GET' && !b) return json(200, { user: publicUser(who) });

      if (a === 'boards' && b && c === 'dashboard' && method === 'GET') {
        const board = BOARDS.find((x) => x.slug === b);
        if (!board) return fail(404, 'not_found', 'Board not found.');
        if (who.role !== 'admin' && who.board_slug !== board.slug) return fail(403, 'forbidden', 'You do not have access to this board.');
        const account = (await store.list()).find((x) => x.board_slug === board.slug);
        if (who.role === 'admin') await audit('board_preview', who, board.slug, req);
        return json(200, {
          board: board.slug,
          preview: who.role === 'admin',
          chairmanName: account?.chairman_name ?? null,
          modules: await enabledModules(board.slug),
        });
      }

      if (a === 'boards' && b && c === 'series') {
        const board = BOARDS.find((x) => x.slug === b);
        if (!board) return fail(404, 'not_found', 'Board not found.');
        const own = who.role === 'board' && who.board_slug === board.slug;
        if (!own && who.role !== 'admin') return fail(403, 'forbidden', 'You do not have access to this board.');
        const t = now();
        const mustOwn = () => (own ? null : fail(403, 'forbidden', 'Only the board chairman can do this.'));
        const limitMsg = (name, you) => `${you ? 'Your board is' : `${name} is`} already in ${SERIES_CFG.maxSeriesPerBoard} series. A board can play at most ${SERIES_CFG.maxSeriesPerBoard} series at a time.`;

        if (!d && method === 'GET') {
          const all = await store.seriesList();
          const live = all.filter((x) => isLive(x, t));
          return json(200, {
            limit: SERIES_CFG.maxSeriesPerBoard,
            active: activeCount(all, board.slug, t),
            canAct: own,
            stadiums: STADIUMS[board.slug] ?? [],
            allStadiums: STADIUMS,
            announced: live.filter((x) => x.host === board.slug).map((x) => toApi(x, BOARDS, t)),
            invitations: live.filter((x) => x.status === 'pending' && x.opponents.includes(board.slug) && !x.accepted.includes(board.slug)).map((x) => toApi(x, BOARDS, t)),
            upcoming: live.filter((x) => x.status === 'accepted').sort((p, q) => (q.accepted_at ?? 0) - (p.accepted_at ?? 0)).map((x) => toApi(x, BOARDS, t)),
          });
        }

        if (!d && method === 'POST') {
          const no = mustOwn();
          if (no) return no;
          const v = validateSeries(req.body, board.slug, BOARDS);
          if (v.error) return fail(400, 'invalid', v.error);
          const all = await store.seriesList();
          if (activeCount(all, board.slug, t) >= SERIES_CFG.maxSeriesPerBoard) return fail(409, 'series_limit', limitMsg(board.name, true));
          const full = v.value.opponents.map((o) => BOARDS.find((x) => x.slug === o)).find((o) => activeCount(all, o.slug, t) >= SERIES_CFG.maxSeriesPerBoard);
          if (full) return fail(409, 'series_limit', limitMsg(full.name, false));
          const row = await store.seriesInsert(newSeries(v.value, board.slug, t));
          await audit('series_announced', who, row.id, req, { name: row.name });
          return json(201, { series: toApi(row, BOARDS, t) });
        }

        if (d && !e && method === 'PUT') {
          const no = mustOwn();
          if (no) return no;
          const cur = await store.seriesGet(d);
          if (!cur || cur.host !== board.slug) return fail(404, 'not_found', 'Series not found.');
          if (cur.status !== 'pending' || cur.accepted.length > 0) return fail(409, 'locked', 'This series has been accepted and can no longer be edited.');
          if (t > cur.deadline_at) return fail(409, 'expired', 'The deadline for this series has passed.');
          const v = validateSeries(req.body, board.slug, BOARDS);
          if (v.error) return fail(400, 'invalid', v.error);
          const all = await store.seriesList();
          const full = v.value.opponents.map((o) => BOARDS.find((x) => x.slug === o)).find((o) => activeCount(all, o.slug, t, cur.id) >= SERIES_CFG.maxSeriesPerBoard);
          if (full) return fail(409, 'series_limit', limitMsg(full.name, false));
          const row = await store.seriesUpdate(cur.id, { ...v.value, updated_at: t });
          await audit('series_edited', who, cur.id, req, { name: row.name });
          return json(200, { series: toApi(row, BOARDS, t) });
        }

        if (d && e === 'accept' && method === 'POST') {
          const no = mustOwn();
          if (no) return no;
          const cur = await store.seriesGet(d);
          if (!cur || !cur.opponents.includes(board.slug)) return fail(404, 'not_found', 'Series not found.');
          if (cur.accepted.includes(board.slug)) return fail(409, 'already', 'You have already accepted this series.');
          if (!isLive(cur, t) || cur.status !== 'pending') return fail(409, 'expired', 'The deadline for this series has passed, so it was declined.');
          const all = await store.seriesList();
          if (activeCount(all, board.slug, t, cur.id) >= SERIES_CFG.maxSeriesPerBoard) return fail(409, 'series_limit', limitMsg(board.name, true));
          const accepted = [...cur.accepted, board.slug];
          const done = cur.opponents.every((o) => accepted.includes(o));
          const row = await store.seriesUpdate(cur.id, { accepted, status: done ? 'accepted' : 'pending', accepted_at: done ? t : null, updated_at: t });
          await audit('series_accepted', who, cur.id, req, { name: row.name });
          return json(200, { series: toApi(row, BOARDS, t) });
        }
        return fail(404, 'not_found', 'Not found.');
      }

      if (a === 'admin') {
        if (who.role !== 'admin') return fail(403, 'forbidden', 'Administrator access is required.');

        if (b === 'overview' && method === 'GET') {
          const accounts = await store.list();
          const boardAccounts = accounts.filter((x) => x.role === 'board');
          const recent = await store.listAudit(8);
          return json(200, {
            totalBoards: BOARDS.length,
            totalAccounts: accounts.length,
            activeBoardAccounts: boardAccounts.filter((x) => x.status === 'active').length,
            inactiveBoardAccounts: boardAccounts.filter((x) => x.status !== 'active').length,
            boardsWithoutAccount: BOARDS.length - boardAccounts.length,
            availableModules: MODULES.filter((m) => m.status === 'active').length,
            recentActivity: recent.map((r) => ({ at: r.at, action: r.action, label: actionLabel(r.action), actor: r.actor, target: r.target })),
          });
        }

        if (b === 'series' && !c && method === 'GET') {
          const t = now();
          return json(200, { series: (await store.seriesList()).sort((p, q) => q.created_at - p.created_at).map((x) => adminView(x, BOARDS, t)) });
        }

        if (b === 'series' && c && method === 'DELETE') {
          const cur = await store.seriesGet(c);
          if (!cur) return fail(404, 'not_found', 'Series not found.');
          await store.seriesDelete(cur.id);
          await audit('series_deleted', who, cur.id, req, { name: cur.name, host: cur.host });
          return json(200, { ok: true });
        }

        if (b === 'accounts' && !c && method === 'GET') {
          const accounts = await store.list();
          const overrides = await store.moduleOverrides();
          const admin = accounts.find((x) => x.role === 'admin');
          return json(200, {
            admin: admin ? { accountId: admin.account_id, username: admin.username, status: admin.status, lastLoginAt: admin.last_login_at } : null,
            boards: BOARDS.map((bd) => {
              const acc = accounts.find((x) => x.board_slug === bd.slug);
              return {
                slug: bd.slug,
                name: bd.name,
                accountId: acc?.account_id ?? null,
                username: acc?.username ?? null,
                status: acc ? acc.status : 'none',
                chairmanName: acc?.chairman_name ?? null,
                lastLoginAt: acc?.last_login_at ?? null,
                modules: MODULES.filter((m) => m.status === 'active').map((m) => ({ id: m.id, enabled: overrides.find((o) => o.board_slug === bd.slug && o.module_id === m.id)?.enabled !== false })),
              };
            }),
          });
        }

        if (b === 'accounts' && c && method === 'PATCH') {
          const target = (await store.list()).find((x) => x.account_id === c);
          if (!target) return fail(404, 'not_found', 'Account not found.');
          const { status, chairmanName } = req.body ?? {};
          const patch = {};
          if (status !== undefined) {
            if (!['active', 'inactive'].includes(status)) return fail(400, 'bad_request', 'Status must be active or inactive.');
            if (target.role === 'admin' && status !== 'active') return fail(400, 'bad_request', 'The administrator account cannot be deactivated.');
            patch.status = status;
            // a deactivated account loses its open sessions at once
            if (status !== target.status && status === 'inactive') patch.session_version = target.session_version + 1;
          }
          if (chairmanName !== undefined) {
            if (typeof chairmanName !== 'string' || chairmanName.length > 120) return fail(400, 'bad_request', 'Chairman name must be text of up to 120 characters.');
            patch.chairman_name = chairmanName.trim() || null;
          }
          if (!Object.keys(patch).length) return fail(400, 'bad_request', 'Nothing to update.');
          const row = await store.update(target.id, patch);
          if (patch.status && patch.status !== target.status) await audit(patch.status === 'active' ? 'account_activated' : 'account_deactivated', who, target.account_id, req);
          if ('chairman_name' in patch) await audit('chairman_updated', who, target.account_id, req);
          return json(200, { ok: true, status: row.status, chairmanName: row.chairman_name ?? null });
        }

        if (b === 'boards' && c && req.path[3] === 'modules' && method === 'PUT') {
          const board = BOARDS.find((x) => x.slug === c);
          if (!board) return fail(404, 'not_found', 'Board not found.');
          const { moduleId, enabled } = req.body ?? {};
          const mod = MODULES.find((m) => m.id === moduleId);
          if (!mod || typeof enabled !== 'boolean') return fail(400, 'bad_request', 'Choose a module and whether it is enabled.');
          if (mod.status !== 'active') return fail(400, 'bad_request', 'This module is not available yet.');
          await store.setModuleOverride(board.slug, mod.id, enabled);
          await audit('modules_changed', who, board.slug, req, { moduleId: mod.id, enabled });
          return json(200, { ok: true, modules: await enabledModules(board.slug) });
        }

        // sets (or first creates) a board's login. The password is hashed here and never returned or logged.
        if (b === 'boards' && c && req.path[3] === 'account' && method === 'PUT') {
          const board = BOARDS.find((x) => x.slug === c);
          if (!board) return fail(404, 'not_found', 'Board not found.');
          const { username, password, chairmanName } = req.body ?? {};
          const existing = (await store.list()).find((x) => x.board_slug === board.slug);
          const name = typeof username === 'string' ? username.trim().toLowerCase() : existing?.username;
          if (!name || !/^[a-z0-9._-]{3,60}$/.test(name)) return fail(400, 'bad_request', 'A username uses 3–60 letters, digits, dots, dashes or underscores.');
          if (password !== undefined && (typeof password !== 'string' || password.length < 6 || password.length > 100)) return fail(400, 'bad_request', 'A password needs 6–100 characters.');
          if (!existing && !password) return fail(400, 'bad_request', 'Choose a password for the new login.');
          if (chairmanName !== undefined && (typeof chairmanName !== 'string' || chairmanName.length > 120)) return fail(400, 'bad_request', 'Chairman name must be text of up to 120 characters.');
          const clash = await store.findByUsername(name);
          if (clash && clash.board_slug !== board.slug) return fail(409, 'username_taken', 'That username is already used by another account.');

          if (!existing) {
            const made = await store.create({
              account_id: `IOCF-BRD-${String(BOARDS.indexOf(board) + 1).padStart(3, '0')}`,
              role: 'board',
              board_slug: board.slug,
              board_name: board.name,
              username: name,
              password_hash: await hashPassword(password),
              status: 'active',
              chairman_name: typeof chairmanName === 'string' ? chairmanName.trim() || null : null,
            });
            await audit('account_created', who, made.account_id, req);
            return json(200, { ok: true, accountId: made.account_id, username: made.username, status: made.status, created: true });
          }
          const patch = {};
          if (name !== existing.username) patch.username = name;
          if (password) patch.password_hash = await hashPassword(password);
          if (chairmanName !== undefined) patch.chairman_name = chairmanName.trim() || null;
          if (!Object.keys(patch).length) return fail(400, 'bad_request', 'Nothing to change.');
          if (patch.username || patch.password_hash) Object.assign(patch, { session_version: existing.session_version + 1, failed_logins: 0, locked_until: null }); // signs the chairman out everywhere
          const row = await store.update(existing.id, patch);
          if (patch.username || patch.password_hash) await audit('credentials_set', who, existing.account_id, req, { username: Boolean(patch.username), password: Boolean(patch.password_hash) });
          if ('chairman_name' in patch) await audit('chairman_updated', who, existing.account_id, req);
          return json(200, { ok: true, accountId: row.account_id, username: row.username, status: row.status, created: false });
        }

        if (b === 'audit' && method === 'GET') {
          return json(200, { entries: (await store.listAudit(50)).map((r) => ({ at: r.at, action: r.action, label: actionLabel(r.action), actor: r.actor, target: r.target })) });
        }
      }

      return fail(404, 'not_found', 'Not found.');
    } catch (err) {
      if (err?.code === 'not_configured') return fail(503, 'not_configured', 'The Command Center database has no logins yet. Import the logins file into Supabase first.');
      if (err?.code === 'series_missing') return fail(503, 'series_missing', 'Series Announcement is not set up yet: the series table has not been created in Supabase.');
      if (err?.code === 'unsupported') return fail(501, 'unsupported', err.message);
      console.error('[command-center]', err instanceof Error ? err.message : err);
      return fail(500, 'server_error', 'Something went wrong. Please try again.');
    }
  };
}

export { hashPassword };
