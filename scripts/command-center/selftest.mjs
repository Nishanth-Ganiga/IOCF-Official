#!/usr/bin/env node
// Self-test for the Command Center backend: `npm run cc:test`.
// Drives the real request handler and the real credential tool against a temporary store and a temporary home folder,
// so it never touches your real register or database.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { createHandler, BOARDS, MODULES } from '../../server/command/handler.mjs';
import { commandCenterRequestListener } from '../../server/command/http.mjs';
import { MemoryStore, SupabaseStore } from '../../server/command/store.mjs';
import { provision, resetCredentials, reveal, verifyRegister, readRegister, syncStatuses, REGISTER_FILE, PLAIN_FILE, backup, writePlain, importPlain, pushAccounts } from './lib.mjs';

let passed = 0;
const failures = [];
const check = (name, ok, extra = '') => {
  if (ok) passed++;
  else failures.push(`${name} ${extra}`);
  console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : `  ${extra}`}`);
};

const home = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-test-'));
const store = new MemoryStore();
let clock = Date.now();
const handle = createHandler({ store, env: { COMMAND_CENTER_SESSION_SECRET: 'test-secret-test-secret-test-secret-1234' }, now: () => clock });

const created = await provision({ store, home, chairmen: { 'New Zealand': 'Test Chairman' } });
const cred = (ref) => created.find((c) => c.username === ref || c.board === ref);
const admin = cred('iocf.admin');

const H = { 'x-iocf-request': '1', host: 'site.test', 'x-forwarded-proto': 'https' };
let ipCounter = 0;
const call = (method, p, { body, cookie, ip, headers } = {}) =>
  handle({ method, path: p.split('/').filter(Boolean), headers: { ...H, ...(cookie ? { cookie } : {}), ...headers }, body: body ?? null, ip: ip ?? `10.0.0.${++ipCounter}` });
const cookieOf = (res) => /iocf_cc=([^;]*)/.exec(res.headers['set-cookie'] ?? '')?.[1];
const login = async (role, c, ip) => {
  const r = await call('POST', 'login', { body: { role, username: c.username, password: c.password }, ip });
  return { r, cookie: r.status === 200 ? `iocf_cc=${cookieOf(r)}` : null };
};

console.log('— setup —');
check('27 accounts created (1 admin + 26 boards)', created.length === 27 && created.filter((c) => c.type === 'Board Chairman').length === 26);
check('every username and password is unique', new Set(created.map((c) => c.username)).size === 27 && new Set(created.map((c) => c.password)).size === 27);
check('passwords are 20 characters', created.every((c) => c.password.length === 20));
check('no plain password in the store', !JSON.stringify(store.data).includes(admin.password) && store.data.accounts.every((a) => a.password_hash.startsWith('scrypt$')));
const reg = readRegister(home);
check('register has the 8 required columns and 27 rows', reg.length === 27 && Object.keys(reg[0]).join('|') === 'Account ID|Account Type|Board Name|Username|Encrypted Password|Account Status|Created Date|Last Updated Date');
check('register passwords are encrypted (not readable in the file)', !fs.readFileSync(path.join(home, REGISTER_FILE), 'utf8').includes(admin.password));
check('register and key files are private (mode 600)', (fs.statSync(path.join(home, REGISTER_FILE)).mode & 0o077) === 0 && (fs.statSync(path.join(home, 'register.key')).mode & 0o077) === 0);
check('register agrees with the database', (await verifyRegister({ store, home })).problems.length === 0);
check('setup is repeatable (creates nothing the second time)', (await provision({ store, home })).length === 0);

console.log('\n— 1/2. logins and redirection data —');
const a = await login('admin', admin);
check('admin login succeeds', a.r.status === 200 && a.r.body.user.role === 'admin');
check('session cookie is HttpOnly, SameSite=Strict, Secure, scoped to the API', /HttpOnly/.test(a.r.headers['set-cookie']) && /SameSite=Strict/.test(a.r.headers['set-cookie']) && /Secure/.test(a.r.headers['set-cookie']) && /Path=\/api\/command/.test(a.r.headers['set-cookie']));
check('login response contains no password or hash', !/password|hash|scrypt/i.test(JSON.stringify(a.r.body)));
const nz = await login('board', cred('New Zealand'));
check('New Zealand login identifies the New Zealand board', nz.r.status === 200 && nz.r.body.user.board === 'new-zealand' && nz.r.body.user.chairmanName === 'Test Chairman');
const india = await login('board', cred('India'));
check('India login identifies the India board', india.r.body.user.board === 'india');

console.log('\n— 4. all 26 boards —');
let allOk = true;
for (const b of BOARDS) {
  const s = await login('board', cred(b.name));
  const me = await call('GET', 'me', { cookie: s.cookie });
  const dash = await call('GET', `boards/${b.slug}/dashboard`, { cookie: s.cookie });
  if (s.r.status !== 200 || me.body.user.board !== b.slug || dash.status !== 200 || dash.body.board !== b.slug || dash.body.preview) allOk = false;
}
check('each of the 26 boards signs in and loads its own dashboard data', allOk);

console.log('\n— 5/6. permissions —');
check('a board user cannot open another board', (await call('GET', 'boards/india/dashboard', { cookie: nz.cookie })).status === 403);
check('a board user cannot use admin endpoints', (await call('GET', 'admin/accounts', { cookie: nz.cookie })).status === 403 && (await call('GET', 'admin/overview', { cookie: nz.cookie })).status === 403);
check('a board user cannot change accounts or modules', (await call('PATCH', `admin/accounts/${cred('India').accountId}`, { cookie: nz.cookie, body: { status: 'inactive' } })).status === 403 && (await call('PUT', 'admin/boards/india/modules', { cookie: nz.cookie, body: { moduleId: 'series-announcement', enabled: false } })).status === 403);
check('no session means no access', (await call('GET', 'me')).status === 401 && (await call('GET', 'boards/india/dashboard')).status === 401 && (await call('GET', 'admin/accounts')).status === 401);
let previews = 0;
for (const b of BOARDS) if ((await call('GET', `boards/${b.slug}/dashboard`, { cookie: a.cookie })).body?.preview === true) previews++;
check('admin can preview all 26 dashboards (marked as preview)', previews === 26);
check('previews are written to the audit log', (await store.listAudit(100)).filter((e) => e.action === 'board_preview').length >= 26);
check('unknown board is a 404', (await call('GET', 'boards/atlantis/dashboard', { cookie: a.cookie })).status === 404);

console.log('\n— errors on login —');
check('wrong password is refused with the generic message', (await call('POST', 'login', { body: { role: 'admin', username: 'iocf.admin', password: 'nope' } })).body.error.message === 'Incorrect username or password.');
check('unknown username gets the same answer', (await call('POST', 'login', { body: { role: 'admin', username: 'ghost', password: 'nope' } })).body.error.message === 'Incorrect username or password.');
const wrongPortal = await call('POST', 'login', { body: { role: 'board', username: admin.username, password: admin.password } });
check('admin credentials on Board Login are "not authorized" (403)', wrongPortal.status === 403 && wrongPortal.body.error.code === 'wrong_portal' && !wrongPortal.headers['set-cookie']);
const wrongPortal2 = await call('POST', 'login', { body: { role: 'admin', username: cred('India').username, password: cred('India').password } });
check('board credentials on Admin Login are "not authorized" (403)', wrongPortal2.status === 403 && wrongPortal2.body.error.code === 'wrong_portal');
check('empty fields are rejected (400)', (await call('POST', 'login', { body: { role: 'admin', username: '', password: '' } })).status === 400);

console.log('\n— rate limiting —');
const victim = cred('Japan');
const same = '203.0.113.9';
let last;
for (let i = 0; i < 5; i++) last = await call('POST', 'login', { body: { role: 'board', username: victim.username, password: 'wrong' + i }, ip: same });
check('5 wrong passwords are still answered normally (401)', last.status === 401);
const blocked = await call('POST', 'login', { body: { role: 'board', username: victim.username, password: victim.password }, ip: same });
check('the 6th attempt is blocked even with the CORRECT password (429, retryAfter)', blocked.status === 429 && blocked.body.error.retryAfter > 0);
clock += 16 * 60 * 1000;
check('after the window it works again', (await call('POST', 'login', { body: { role: 'board', username: victim.username, password: victim.password }, ip: same })).status === 200);

console.log('\n— sessions —');
const tampered = `${a.cookie.slice(0, -2)}xx`;
check('a tampered cookie is rejected', (await call('GET', 'me', { cookie: tampered })).status === 401);
const forged = `iocf_cc=${Buffer.from(JSON.stringify({ aid: 'x', role: 'admin', sv: 1, exp: clock + 1e9 })).toString('base64url')}.AAAA`;
check('a forged admin cookie is rejected', (await call('GET', 'admin/accounts', { cookie: forged })).status === 401);
clock += 9 * 60 * 60 * 1000;
check('sessions expire after 8 hours', (await call('GET', 'me', { cookie: a.cookie })).status === 401);
const a2 = await login('admin', admin);
check('state-changing requests need the custom header', (await handle({ method: 'POST', path: ['logout'], headers: { host: 'site.test', cookie: a2.cookie }, body: null, ip: '9.9.9.9' })).status === 403);
check('cross-site origins are refused', (await call('PATCH', `admin/accounts/${cred('India').accountId}`, { cookie: a2.cookie, body: { status: 'inactive' }, headers: { origin: 'https://evil.example' } })).status === 403);
check('logout ends the cookie', (await call('POST', 'logout', { cookie: a2.cookie })).headers['set-cookie'].includes('Max-Age=0'));

console.log('\n— 9. activation / deactivation —');
const adm = await login('admin', admin);
const indiaSession = await login('board', cred('India'));
const off = await call('PATCH', `admin/accounts/${cred('India').accountId}`, { cookie: adm.cookie, body: { status: 'inactive' } });
check('admin deactivates India', off.status === 200 && off.body.status === 'inactive');
check('India\'s open session stops working immediately', (await call('GET', 'me', { cookie: indiaSession.cookie })).status === 401);
const refused = await call('POST', 'login', { body: { role: 'board', username: cred('India').username, password: cred('India').password } });
check('India cannot sign in while inactive (403 "inactive")', refused.status === 403 && refused.body.error.code === 'inactive');
check('a wrong password on an inactive account does NOT reveal it is inactive', (await call('POST', 'login', { body: { role: 'board', username: cred('India').username, password: 'wrong' } })).status === 401);
check('the administrator account cannot be deactivated', (await call('PATCH', `admin/accounts/${admin.accountId}`, { cookie: adm.cookie, body: { status: 'inactive' } })).status === 400);
check('admin reactivates India', (await call('PATCH', `admin/accounts/${cred('India').accountId}`, { cookie: adm.cookie, body: { status: 'active' } })).status === 200 && (await login('board', cred('India'))).r.status === 200);
const ov = (await call('GET', 'admin/overview', { cookie: adm.cookie })).body;
check('overview counts are right', ov.totalBoards === 26 && ov.totalAccounts === 27 && ov.activeBoardAccounts === 26 && ov.inactiveBoardAccounts === 0 && ov.availableModules === 1);
await call('PATCH', `admin/accounts/${cred('Spain').accountId}`, { cookie: adm.cookie, body: { status: 'inactive' } });
check('overview counts inactive boards', (await call('GET', 'admin/overview', { cookie: adm.cookie })).body.inactiveBoardAccounts === 1);
const list = (await call('GET', 'admin/accounts', { cookie: adm.cookie })).body;
check('account list covers 26 boards and exposes no secrets', list.boards.length === 26 && !/password|hash|scrypt/i.test(JSON.stringify(list)));
check('chairman information can be updated', (await call('PATCH', `admin/accounts/${cred('Spain').accountId}`, { cookie: adm.cookie, body: { chairmanName: 'New Name' } })).body.chairmanName === 'New Name');

console.log('\n— 7/8. modules —');
const nz2 = await login('board', cred('New Zealand'));
const dash = await call('GET', 'boards/new-zealand/dashboard', { cookie: nz2.cookie });
check('Series Announcement is the only active module', MODULES.filter((m) => m.status === 'active').map((m) => m.id).join() === 'series-announcement' && dash.body.modules.join() === 'series-announcement');
check('coming-soon modules cannot be switched on', (await call('PUT', 'admin/boards/new-zealand/modules', { cookie: adm.cookie, body: { moduleId: 'fixtures', enabled: true } })).status === 400);
await call('PUT', 'admin/boards/new-zealand/modules', { cookie: adm.cookie, body: { moduleId: 'series-announcement', enabled: false } });
check('admin can switch a module off for one board only', (await call('GET', 'boards/new-zealand/dashboard', { cookie: nz2.cookie })).body.modules.length === 0 && (await call('GET', 'boards/india/dashboard', { cookie: (await login('board', cred('India'))).cookie })).body.modules.length === 1);

console.log('\n— 10. password reset —');
const before = cred('Pakistan');
const s1 = await login('board', before);
const reset = await resetCredentials({ store, home, ref: 'pakistan' });
check('reset gives a new password', reset.password !== before.password && reset.password.length === 20);
check('old session ended by the reset', (await call('GET', 'me', { cookie: s1.cookie })).status === 401);
check('old password no longer works', (await call('POST', 'login', { body: { role: 'board', username: before.username, password: before.password } })).status === 401);
check('new password works', (await call('POST', 'login', { body: { role: 'board', username: reset.username, password: reset.password } })).status === 200);
check('register row was re-encrypted and still agrees with the database', (await verifyRegister({ store, home })).problems.length === 0 && reveal({ home, ref: 'pakistan' })[0].password === reset.password);
const renamed = await resetCredentials({ store, home, ref: 'pakistan', newUsername: 'pakistan.board' });
check('a username can be changed during a reset', (await call('POST', 'login', { body: { role: 'board', username: 'pakistan.board', password: renamed.password } })).status === 200 && (await verifyRegister({ store, home })).problems.length === 0);
check('a username already taken is refused', await resetCredentials({ store, home, ref: 'pakistan', newUsername: 'india.chairman' }).then(() => false, () => true));
check('status changes made online can be copied into the register', (await syncStatuses({ store, home })) >= 1 && readRegister(home).find((r) => r['Board Name'] === 'Spain')['Account Status'] === 'inactive');
const bk = backup({ home, outDir: path.join(home, 'bk') });
check('encrypted backup contains no readable password', !fs.readFileSync(bk, 'utf8').includes(reveal({ home, ref: 'india' })[0].password));

console.log('\n— the readable credentials file: export, edit, import —');
const plainFile = await writePlain({ store, home });
const plainRows = fs.readFileSync(plainFile, 'utf8').trim().split('\n');
check('plain CSV has 27 rows and readable passwords', plainRows.length === 28 && plainRows[0] === 'Account ID,Account Type,Board Name,Username,Password,Account Status' && plainRows.some((l) => l.includes(admin.password) || l.includes('iocf.admin')));
check('plain CSV is private (mode 600) and outside the project', (fs.statSync(plainFile).mode & 0o077) === 0 && !path.resolve(plainFile).startsWith(process.cwd()));
const before2 = await store.findByUsername('japan.chairman');
const edited = fs.readFileSync(plainFile, 'utf8').split('\n').map((l) => (l.includes(',japan.chairman,') ? l.replace(/,japan\.chairman,[^,]*,/, ',japan.board,MyNewPassword#2026,') : l.includes(',kenya.chairman,') ? l.replace(/,active$/, ',inactive') : l)).join('\n');
fs.writeFileSync(plainFile, edited);
const rep = await importPlain({ store, home });
check('import applies exactly the edited rows', rep.length === 2 && rep.some((r) => r.board === 'Japan' && r.changes === 'username + password') && rep.some((r) => r.board === 'Kenya' && r.changes === 'status'));
check('the edited password works on the site', (await call('POST', 'login', { body: { role: 'board', username: 'japan.board', password: 'MyNewPassword#2026' } })).status === 200);
check('the old Japan username no longer works', (await call('POST', 'login', { body: { role: 'board', username: 'japan.chairman', password: 'x' } })).status === 401);
check('an edit to inactive switches the account off', (await store.findByUsername('kenya.chairman')).status === 'inactive');
check('import re-encrypts the register and it still agrees with the database', (await verifyRegister({ store, home })).problems.length === 0);
check('importing again finds no changes', (await importPlain({ store, home })).length === 0);
fs.writeFileSync(plainFile, fs.readFileSync(plainFile, 'utf8').replace('MyNewPassword#2026', 'short'));
check('a too-short password is refused and nothing is changed', await importPlain({ store, home }).then(() => false, (e) => /at least 12/.test(e.message)) && (await call('POST', 'login', { body: { role: 'board', username: 'japan.board', password: 'MyNewPassword#2026' } })).status === 200);
fs.writeFileSync(plainFile, fs.readFileSync(plainFile, 'utf8').replace(',short,', ',MyNewPassword#2026,').replace(',india.chairman,', ',japan.board,'));
check('a username used twice is refused', await importPlain({ store, home }).then(() => false, (e) => /already used/.test(e.message)));
await writePlain({ store, home });
const remoteLike = new MemoryStore();
const pushed = await pushAccounts({ from: store, to: remoteLike });
check('push copies all 27 accounts to another store', pushed.created === 27 && (await remoteLike.list()).length === 27);
check('after push the same passwords work against the new store', await (async () => {
  const h2 = createHandler({ store: remoteLike, env: { COMMAND_CENTER_SESSION_SECRET: 'test-secret-test-secret-test-secret-1234' }, now: () => clock });
  const r = await h2({ method: 'POST', path: ['login'], headers: H, body: { role: 'board', username: 'japan.board', password: 'MyNewPassword#2026' }, ip: '5.5.5.5' });
  return r.status === 200;
})());
check('pushing again changes nothing', (await pushAccounts({ from: store, to: remoteLike })).updated === 0);
void before2;

console.log('\n— 11. the register stays private —');
const root = process.cwd();
const walk = (dir, out = []) => {
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', '.git', 'ios', 'android'].includes(f.name)) continue;
    const p = path.join(dir, f.name);
    f.isDirectory() ? walk(p, out) : out.push(p);
  }
  return out;
};
const files = walk(root);
check('no register file anywhere in the project folder', !files.some((f) => /CREDENTIAL|register\.key|local-store/i.test(path.basename(f))));
check('the register lives outside the project (home folder)', !path.resolve(home).startsWith(root));
check('public/ and dist/ hold no credential files', !files.some((f) => /\/(public|dist)\//.test(f) && /credential|register|\.key$/i.test(path.basename(f))));
check('the API source never reads the register or its key', !fs.readdirSync(path.join(root, 'server/command')).some((f) => /REGISTER_FILE|register\.key|IOCF_PRIVATE/.test(fs.readFileSync(path.join(root, 'server/command', f), 'utf8'))));
check('git ignores the register, its key and local data', ['IOCF_PRIVATE_CREDENTIAL_REGISTER', 'register.key', '.cc-data/'].every((p) => fs.readFileSync(path.join(root, '.gitignore'), 'utf8').includes(p)));
check('there is no route that returns a CSV or a password', (await call('GET', 'register', { cookie: adm.cookie })).status === 404 && (await call('GET', 'admin/credentials', { cookie: adm.cookie })).status === 404);

console.log('\n— Supabase adapter (requests only; no network) —');
const seen = [];
const fakeFetch = async (url, init) => {
  seen.push({ url, method: init.method, headers: init.headers, body: init.body });
  return { ok: true, text: async () => (init.method === 'GET' ? '[]' : '[{"id":"1"}]') };
};
const sb = new SupabaseStore({ url: 'https://x.supabase.co/', serviceKey: 'SERVICE', fetchImpl: fakeFetch });
await sb.findByUsername('India.Chairman');
await sb.update('abc', { status: 'inactive' });
await sb.setModuleOverride('india', 'series-announcement', false);
await sb.bumpRate('k', 1000, 5);
check('uses the REST API with the service-role key on every request', seen.every((s) => s.url.startsWith('https://x.supabase.co/rest/v1/') && s.headers.apikey === 'SERVICE' && s.headers.authorization === 'Bearer SERVICE'));
check('queries are lowercase-exact and URL-encoded', seen[0].url.endsWith('command_accounts?username=eq.india.chairman&limit=1'));
check('updates target one row by id', seen[1].method === 'PATCH' && seen[1].url.endsWith('command_accounts?id=eq.abc'));
check('module switches upsert on (board, module)', seen[2].url.includes('on_conflict=board_slug,module_id') && seen[2].headers.prefer === 'resolution=merge-duplicates');

console.log('\n— HTTP adapter (simulated request/response streams) —');
const listener = commandCenterRequestListener({ store, env: { COMMAND_CENTER_SESSION_SECRET: 'test-secret-test-secret-test-secret-1234' } });
const http = (method, url, { body, cookie, raw } = {}) =>
  new Promise((resolve) => {
    const payload = raw ?? (body === undefined ? '' : JSON.stringify(body));
    const req = Object.assign(Readable.from(payload ? [Buffer.from(payload)] : []), { method, url, headers: { host: 'site.test', 'x-iocf-request': '1', 'x-forwarded-for': '198.51.100.7', 'x-forwarded-proto': 'https', ...(cookie ? { cookie } : {}) }, socket: {} });
    const res = { writeHead(status, headers) { this.status = status; this.headers = headers; }, end(text) { resolve({ status: this.status, headers: this.headers, body: text ? JSON.parse(text) : null }); } };
    listener(req, res);
  });
clock = Date.now();
const adminAgain = await resetCredentials({ store, home, ref: 'iocf.admin' });
const hl = await http('POST', '/api/command/login', { body: { role: 'admin', username: 'iocf.admin', password: adminAgain.password } });
check('POST /api/command/login over HTTP returns the user and sets the cookie', hl.status === 200 && hl.body.user.role === 'admin' && /iocf_cc=/.test(hl.headers['set-cookie']));
const hcookie = /iocf_cc=[^;]*/.exec(hl.headers['set-cookie'])[0];
check('GET /api/command/me with that cookie works', (await http('GET', '/api/command/me', { cookie: hcookie })).body.user.username === 'iocf.admin');
check('responses are never cached', hl.headers['cache-control'] === 'no-store');
check('malformed JSON is a 400', (await http('POST', '/api/command/login', { raw: '{not json' })).status === 400);
check('oversized bodies are a 400', (await http('POST', '/api/command/login', { raw: 'x'.repeat(40000) })).status === 400);
check('an unknown API path is a 404', (await http('GET', '/api/command/nothing', { cookie: hcookie })).status === 404);
const noBackend = commandCenterRequestListener({ store: null, env: {} });
const nb = await new Promise((resolve) => {
  const req = Object.assign(Readable.from([Buffer.from('{}')]), { method: 'POST', url: '/api/command/login', headers: { host: 'site.test', 'x-iocf-request': '1' }, socket: {} });
  noBackend(req, { writeHead(st) { this.st = st; }, end(t) { resolve({ status: this.st, body: JSON.parse(t) }); } });
});
check('with no database configured the API answers 503 "not configured"', nb.status === 503 && nb.body.error.code === 'not_configured');

const prodNoSecret = createHandler({ store, env: { SUPABASE_URL: 'https://x.supabase.co' } });
check('with a database but no session secret the API refuses to run (503)', (await prodNoSecret({ method: 'GET', path: ['me'], headers: {}, body: null, ip: '1.1.1.1' })).status === 503);

console.log(`\n${failures.length ? '✗' : '✓'} ${passed} passed, ${failures.length} failed`);
fs.rmSync(home, { recursive: true, force: true });
if (failures.length) {
  console.log('\nFailures:\n' + failures.map((f) => ' - ' + f).join('\n'));
  process.exit(1);
}
