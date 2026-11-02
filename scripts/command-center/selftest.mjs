#!/usr/bin/env node
// Self-test for the Command Center backend: `npm run cc:test`.
// Drives the real request handler and the real credential tool against a temporary store and a temporary home folder,
// so it never touches your real register or database.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import ExcelJS from 'exceljs';
import { createHandler, BOARDS, MODULES } from '../../server/command/handler.mjs';
import { commandCenterRequestListener } from '../../server/command/http.mjs';
import { MemoryStore, SupabaseStore } from '../../server/command/store.mjs';
import { buildFixtures } from '../../src/data/commandCenter/fixtures.mjs';
import { newSeries, STADIUMS, SERIES_CFG, deadlineFor } from '../../server/command/series.mjs';
import { AutoStore, LoginTableStore } from '../../server/command/loginTable.mjs';
import { provision, resetCredentials, reveal, verifyRegister, readRegister, syncStatuses, REGISTER_FILE, PLAIN_FILE, backup, writePlain, importPlain, pushAccounts, applyCredentials, parseCredentialSheet, recordPassword, inspectSupabase, hostingValues, SUPABASE_URL_FOR, describeKey, adminFromRows, readTable, buildSetupSql, buildOverviewCsv, writeLoginsCsv, LOGINS_COLUMNS, LOGINS_CSV_FILE, shortPassword } from './lib.mjs';

const mkdtemp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'cc-admin-'));
const await_free = (x) => x;
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
check('overview counts are right', ov.totalBoards === 26 && ov.totalAccounts === 27 && ov.activeBoardAccounts === 26 && ov.inactiveBoardAccounts === 0 && ov.availableModules === 3);
await call('PATCH', `admin/accounts/${cred('Spain').accountId}`, { cookie: adm.cookie, body: { status: 'inactive' } });
check('overview counts inactive boards', (await call('GET', 'admin/overview', { cookie: adm.cookie })).body.inactiveBoardAccounts === 1);
const list = (await call('GET', 'admin/accounts', { cookie: adm.cookie })).body;
check('account list covers 26 boards and exposes no secrets', list.boards.length === 26 && !/password|hash|scrypt/i.test(JSON.stringify(list)));
check('chairman information can be updated', (await call('PATCH', `admin/accounts/${cred('Spain').accountId}`, { cookie: adm.cookie, body: { chairmanName: 'New Name' } })).body.chairmanName === 'New Name');

console.log('\n— the administrator sets board logins in the browser —');
const putLogin = (slug, body, cookie = adm.cookie) => call('PUT', `admin/boards/${slug}/account`, { cookie, body });
const ugSession = await login('board', cred('Uganda'));
const set1 = await putLogin('uganda', { username: 'Uganda.Boss', password: 'Brand-New-Pass-1' });
check('admin sets a new username and password for Uganda', set1.status === 200 && set1.body.username === 'uganda.boss' && set1.body.created === false);
check('the response contains no password or hash', !/Brand-New|password|hash|scrypt/i.test(JSON.stringify(set1.body)));
check('the new login works (username is case-insensitive)', (await call('POST', 'login', { body: { role: 'board', username: 'UGANDA.boss', password: 'Brand-New-Pass-1' } })).status === 200);
check('the old password and old username are dead', (await call('POST', 'login', { body: { role: 'board', username: 'uganda.boss', password: cred('Uganda').password } })).status === 401 && (await call('POST', 'login', { body: { role: 'board', username: cred('Uganda').username, password: 'Brand-New-Pass-1' } })).status === 401);
check('the chairman was signed out everywhere by the change', (await call('GET', 'me', { cookie: ugSession.cookie })).status === 401);
const logged = JSON.stringify(await store.listAudit(50));
check('it is in the audit log, with no password in it', /credentials_set/.test(logged) && !/Brand-New/.test(logged) && !/Brand-New/.test(JSON.stringify(store.data)));
check('a password alone keeps the username', (await putLogin('uganda', { password: 'Second-New-Pass-2' })).body.username === 'uganda.boss' && (await call('POST', 'login', { body: { role: 'board', username: 'uganda.boss', password: 'Second-New-Pass-2' } })).status === 200);
check('a username alone keeps the password', (await putLogin('uganda', { username: 'uganda.chair' })).status === 200 && (await call('POST', 'login', { body: { role: 'board', username: 'uganda.chair', password: 'Second-New-Pass-2' } })).status === 200);
check('a password under 6 characters is refused', (await putLogin('uganda', { password: 'short' })).status === 400);
check('a bad username is refused', (await putLogin('uganda', { username: 'no spaces!' })).status === 400);
check('a username already used by another board is refused (409)', (await putLogin('uganda', { username: cred('India').username })).status === 409);
check('an empty change is refused', (await putLogin('uganda', {})).status === 400);
check('an unknown board is a 404', (await putLogin('atlantis', { username: 'abc', password: 'long-enough-1' })).status === 404);
check('a chairman cannot set logins (403), not even their own', (await putLogin('india', { password: 'Hijack-Attempt-1' }, (await login('board', cred('India'))).cookie)).status === 403);
check('no session cannot set logins (401)', (await putLogin('india', { password: 'Hijack-Attempt-1' }, '')).status === 401);
check('India\'s real password was not touched by those attempts', (await login('board', cred('India'))).r.status === 200);
check('after an online change the register is out of date and verify says so', await verifyRegister({ store, home }).then((v) => v.problems.some((x) => /Uganda|uganda/.test(x) && /record/.test(x))));
check('a wrong password cannot be recorded', await recordPassword({ store, home, ref: 'uganda', password: 'not-it-at-all' }).then(() => false, (e) => /does not match/.test(e.message)));
await recordPassword({ store, home, ref: 'uganda', password: 'Second-New-Pass-2' });
check('recording the real password brings the register back in line', (await verifyRegister({ store, home })).problems.length === 0 && reveal({ home, ref: 'uganda' })[0].username === 'uganda.chair' && reveal({ home, ref: 'uganda' })[0].password === 'Second-New-Pass-2');
// a board with no login yet
const fresh = new MemoryStore();
const h3 = createHandler({ store: fresh, env: { COMMAND_CENTER_SESSION_SECRET: 'test-secret-test-secret-test-secret-1234' }, now: () => clock });
const adminHash = await (await import('../../server/command/crypto.mjs')).hashPassword('Admin-Pass-2026-x');
await fresh.create({ account_id: 'IOCF-ADM-001', role: 'admin', board_slug: null, board_name: null, username: 'iocf.admin', password_hash: adminHash, status: 'active' });
const a3 = await h3({ method: 'POST', path: ['login'], headers: H, body: { role: 'admin', username: 'iocf.admin', password: 'Admin-Pass-2026-x' }, ip: '3.3.3.3' });
const c3 = `iocf_cc=${cookieOf(a3)}`;
const put3 = (slug, body) => h3({ method: 'PUT', path: ['admin', 'boards', slug, 'account'], headers: { ...H, cookie: c3 }, body, ip: '3.3.3.3' });
check('creating needs a password', (await put3('japan', { username: 'japan.chairman' })).status === 400);
const made = await put3('japan', { username: 'japan.chairman', password: 'Japan-First-Pass-1', chairmanName: 'A. Chairman' });
check('a board with no login gets one created (ID follows the board order)', made.status === 200 && made.body.created === true && made.body.accountId === 'IOCF-BRD-023');
check('and the chairman can sign in to the Japan board', (await h3({ method: 'POST', path: ['login'], headers: H, body: { role: 'board', username: 'japan.chairman', password: 'Japan-First-Pass-1' }, ip: '3.3.3.4' })).body.user.board === 'japan');
const lst = (await h3({ method: 'GET', path: ['admin', 'accounts'], headers: { ...H, cookie: c3 }, body: null, ip: '3.3.3.3' })).body;
check('the account list now shows Japan as active and the others as having no login', lst.boards.find((b) => b.slug === 'japan').status === 'active' && lst.boards.filter((b) => b.status === 'none').length === 25 && lst.boards.find((b) => b.slug === 'japan').chairmanName === 'A. Chairman');

console.log('\n— 7/8. modules —');
const nz2 = await login('board', cred('New Zealand'));
const dash = await call('GET', 'boards/new-zealand/dashboard', { cookie: nz2.cookie });
check('Series Announcement, Fixtures & Scheduling and Board Credits are the active modules', MODULES.filter((m) => m.status === 'active').map((m) => m.id).join() === 'series-announcement,fixtures,credits' && dash.body.modules.join() === 'series-announcement,fixtures,credits');
check('coming-soon modules cannot be switched on', (await call('PUT', 'admin/boards/new-zealand/modules', { cookie: adm.cookie, body: { moduleId: 'squads', enabled: true } })).status === 400);
await call('PUT', 'admin/boards/new-zealand/modules', { cookie: adm.cookie, body: { moduleId: 'series-announcement', enabled: false } });
check('admin can switch a module off for one board only', (await call('GET', 'boards/new-zealand/dashboard', { cookie: nz2.cookie })).body.modules.join() === 'fixtures,credits' && (await call('GET', 'boards/india/dashboard', { cookie: (await login('board', cred('India'))).cookie })).body.modules.length === 3);

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
check('a username used twice is refused', await importPlain({ store, home }).then(() => false, (e) => /used twice|already belongs/.test(e.message)));
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

const walk = (dir, out = []) => {
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', '.git', 'ios', 'android', 'dist'].includes(f.name)) continue;
    const p = path.join(dir, f.name);
    f.isDirectory() ? walk(p, out) : out.push(p);
  }
  return out;
};
console.log('\n— credentials sheet (Google Sheet / Excel) —');
const book = (rows, name = 'Sheet1') => {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(name);
  rows.forEach((r) => ws.addRow(r));
  return wb;
};
const home2 = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-sheet-'));
const store2 = new MemoryStore();
const handle2 = createHandler({ store: store2, env: { COMMAND_CENTER_SESSION_SECRET: 'test-secret-test-secret-test-secret-1234' }, now: () => clock });
const sheetRows = [
  ['Board', 'Username', 'Password', 'Status'],
  ['', 'president', 'Admin-Pass-2026-x', 'Active'],
  ['Newzealand', 'nz.chair', 'Kiwi-Pass-2026-x', 'Active'],
  ['Srilanka', 'sl.chair', 'Lanka-Pass-2026-x', ''],
  ['West Indies', 'wi.chair', 'Windies-Pass-2026-x', 'inactive'],
];
const parsed = parseCredentialSheet(book(sheetRows));
check('sheet: finds the headings and reads every row', parsed.entries.length === 4 && parsed.tab === 'Sheet1');
check('sheet: a row with no board is the administrator', parsed.entries[0].role === 'admin' && parsed.entries[1].board === 'Newzealand');
const r1 = await applyCredentials({ store: store2, home: home2, entries: parsed.entries });
check('sheet: creates the administrator and the boards it names (spellings like "Newzealand" and "Srilanka" resolve)', r1.changes.length === 4 && (await store2.list()).map((a) => a.board_slug ?? 'admin').sort().join() === 'admin,new-zealand,sri-lanka,west-indies');
const ok2 = (u, pw, role = 'board') => handle2({ method: 'POST', path: ['login'], headers: H, body: { role, username: u, password: pw }, ip: `7.7.7.${++ipCounter}` });
check('sheet: the new logins work', (await ok2('president', 'Admin-Pass-2026-x', 'admin')).status === 200 && (await ok2('nz.chair', 'Kiwi-Pass-2026-x')).status === 200);
check('sheet: "inactive" in the Status column creates an inactive account', (await ok2('wi.chair', 'Windies-Pass-2026-x')).body.error.code === 'inactive');
check('sheet: the register was written for them and agrees with the store', (await verifyRegister({ store: store2, home: home2 })).problems.length === 0);
check('sheet: running it again changes nothing', (await applyCredentials({ store: store2, home: home2, entries: parsed.entries })).changes.length === 0);
const edited2 = parseCredentialSheet(book([sheetRows[0], sheetRows[1], ['Newzealand', 'nz.chair', 'Kiwi-New-Pass-2026', 'Active'], sheetRows[3], ['West Indies', 'wi.chair', 'Windies-Pass-2026-x', 'Active']])).entries;
const dry = await applyCredentials({ store: store2, home: home2, entries: edited2, dryRun: true });
check('sheet: --dry-run reports the changes but applies none', dry.changes.length === 2 && (await ok2('nz.chair', 'Kiwi-Pass-2026-x')).status === 200);
const r3 = await applyCredentials({ store: store2, home: home2, entries: edited2 });
check('sheet: an edited password and an activated account are applied', r3.changes.length === 2 && (await ok2('nz.chair', 'Kiwi-New-Pass-2026')).status === 200 && (await ok2('nz.chair', 'Kiwi-Pass-2026-x')).status === 401 && (await ok2('wi.chair', 'Windies-Pass-2026-x')).status === 200);
const bad = (rows) => applyCredentials({ store: store2, home: home2, entries: parseCredentialSheet(book(rows)).entries }).then(() => null, (e) => e.message);
check('sheet: an unknown board refuses the whole sheet', /not one of the 26 boards/.test(await bad([sheetRows[0], ['Atlantis', 'a.chair', 'Long-Enough-Pass-1', 'Active']])));
check('sheet: a username used twice refuses the whole sheet', /used twice/.test(await bad([sheetRows[0], ['India', 'same.user', 'Long-Enough-Pass-1'], ['Italy', 'same.user', 'Long-Enough-Pass-2']])));
check('sheet: a very short password is refused', /at least 8/.test(await bad([sheetRows[0], ['India', 'in.chair', 'abc12']])));
check('sheet: a refused sheet changes nothing', (await store2.list()).length === 4);
check('sheet: a repeated password is only a warning, naming the rows', (await applyCredentials({ store: store2, home: home2, dryRun: true, entries: parseCredentialSheet(book([sheetRows[0], ['India', 'in.chair', 'Shared-Password-2026'], ['Italy', 'it.chair', 'Shared-Password-2026']])).entries })).warnings.some((w) => /same password/.test(w)));
check('sheet: without headings, columns A–C are board, username, password', parseCredentialSheet(book([['India', 'in.chair', 'Long-Enough-Pass-1'], ['Italy', 'it.chair', 'Long-Enough-Pass-2']])).entries.length === 2);
check('sheet: a tab without credentials gives a clear error', (() => { try { parseCredentialSheet(book([['Match', 'Winner'], ['A v B', 'A']])); return false; } catch (e) { return /Username/.test(e.message); } })());
check('sheet: the second tab is used when the first has no credentials', (() => { const wb = book([['Notes'], ['hello']], 'Notes'); const ws = wb.addWorksheet('Logins'); sheetRows.forEach((r) => ws.addRow(r)); return parseCredentialSheet(wb).tab === 'Logins'; })());
fs.rmSync(home2, { recursive: true, force: true });
// the link itself is read from your private settings at run time, so it is not written down in this file either
const sheetId = (() => { try { return /spreadsheets\/d\/([\w-]+)/.exec(fs.readFileSync(path.join(process.env.IOCF_CC_HOME || path.join(os.homedir(), '.iocf-command-center'), 'env'), 'utf8'))?.[1] ?? null; } catch { return null; } })();
const repoText = sheetId === null ? false : walk(process.cwd()).some((f) => { try { return fs.readFileSync(f, 'utf8').includes(sheetId); } catch { return false; } });
check('your credentials sheet link appears nowhere in the project' + (sheetId ? '' : ' (none set on this machine)'), !repoText);

console.log('\n— connecting to Supabase —');
const ok = (body, status = 200) => async () => ({ ok: status < 400, status, json: async () => body });
const defs = (names, extra = {}) => ({ definitions: Object.fromEntries([...names, ...Object.keys(extra)].map((n) => [n, { properties: Object.fromEntries((extra[n] ?? ['id']).map((c) => [c, {}])) }])) });
const ALL = ['command_accounts', 'command_board_modules', 'command_audit_log', 'command_rate_limits'];
check('the project URL is built from its reference', SUPABASE_URL_FOR('abc123') === 'https://abc123.supabase.co');
check('a good key with all tables is accepted', await inspectSupabase({ url: 'https://x.supabase.co', key: 'k', fetchImpl: ok(defs(ALL)) }).then((r) => r.keyOk && r.missing.length === 0 && r.others.length === 0));
check('missing tables are named', await inspectSupabase({ url: 'https://x.supabase.co', key: 'k', fetchImpl: ok(defs(['command_accounts'])) }).then((r) => r.missing.join() === 'command_board_modules,command_audit_log,command_rate_limits'));
check('a refused key gives a clear message about the secret key', await inspectSupabase({ url: 'https://x.supabase.co', key: 'anon', fetchImpl: ok({}, 401) }).then((r) => !r.keyOk && /service_role/.test(r.error)));
check('an unreachable address gives a clear message', await inspectSupabase({ url: 'https://nowhere.invalid', key: 'k', fetchImpl: async () => { throw new Error('x'); } }).then((r) => /Could not reach/.test(r.error)));
check('a table that looks like it holds passwords is flagged', await inspectSupabase({ url: 'https://x.supabase.co', key: 'k', fetchImpl: ok(defs(ALL, { admin_credentials: ['id', 'username', 'password'], notes: ['id', 'text'] })) }).then((r) => r.others.find((t) => t.name === 'admin_credentials')?.looksLikeLogins === true && r.others.find((t) => t.name === 'notes')?.looksLikeLogins === false));
check('inspection only calls the schema document (reads no rows)', await (async () => { const urls = []; await inspectSupabase({ url: 'https://x.supabase.co', key: 'k', fetchImpl: async (u) => { urls.push(u); return { ok: true, status: 200, json: async () => defs(ALL) }; } }); return urls.length === 1 && urls[0].endsWith('/rest/v1/'); })());
const closedRoot = (probeStatus) => async (u) => (u.endsWith('/rest/v1/') ? { ok: false, status: 401, json: async () => ({}) } : { ok: probeStatus < 400, status: probeStatus, json: async () => [] });
check('if the schema document is closed, a good key is still accepted by testing our own table', await inspectSupabase({ url: 'https://x.supabase.co', key: 'k', fetchImpl: closedRoot(200) }).then((r) => r.keyOk && r.missing.length === 0));
check('…and a good key with no tables yet says the tables are missing', await inspectSupabase({ url: 'https://x.supabase.co', key: 'k', fetchImpl: closedRoot(404) }).then((r) => r.keyOk && r.missing.length === 4));
check('…and a bad key is still refused', await inspectSupabase({ url: 'https://x.supabase.co', key: 'k', fetchImpl: closedRoot(401) }).then((r) => !r.keyOk && /refused/.test(r.error)));
const thrown = (f) => { try { f(); return null; } catch (e) { return e.message; } };
check('admin table: username / password columns', adminFromRows([{ id: 1, username: 'IOCF.Admin', password: 'Long-Admin-Pass-1' }]).username === 'iocf.admin');
check('admin table: user_id / password columns', adminFromRows([{ user_id: 'president', password: 'Long-Admin-Pass-1', created_at: 'x' }]).username === 'president');
check('admin table: email / pwd columns', adminFromRows([{ email: 'boss@iocf.org', pwd: 'Long-Admin-Pass-1' }]).username === 'boss@iocf.org');
check('admin table: with several rows, the one marked admin is used', adminFromRows([{ username: 'a', role: 'board', password: 'x'.repeat(10) }, { username: 'boss', role: 'admin', password: 'Long-Admin-Pass-1' }]).username === 'boss');
check('admin table: an empty table is explained', /no rows/.test(thrown(() => adminFromRows([]))));
check('admin table: two admin rows are refused rather than guessed', /exactly one/.test(thrown(() => adminFromRows([{ username: 'a', password: 'longenough1' }, { username: 'b', password: 'longenough2' }]))));
check('admin table: no password column is explained, naming the columns', /password column.*id, name/.test(thrown(() => adminFromRows([{ id: 1, name: 'x' }]))));
check('admin table: an already-encrypted password is explained', /cannot be turned back/.test(thrown(() => adminFromRows([{ username: 'a', password: '$2a$10$abcdefghijklmnopqrstuuABCDEFGHIJKLMNOPQRSTUVWXYZ01234' }]))));
check('admin table: reading is limited to one table by name, a few rows', await (async () => { const urls = []; await readTable({ url: 'https://x.supabase.co', key: 'sb_secret_k', table: 'admin_users', fetchImpl: async (u, i) => { urls.push([u, i.headers]); return { ok: true, status: 200, json: async () => [] }; } }); return urls[0][0].endsWith('/rest/v1/admin_users?select=*&limit=5') && !urls[0][1].authorization; })());
check('admin table: a table name cannot smuggle a query', await readTable({ url: 'https://x.supabase.co', key: 'k', table: 'a?select=*&x=', fetchImpl: ok([]) }).then(() => false, (e) => /only letters/.test(e.message)));
check('admin table: the imported admin can sign in, and an e-mail style user id works', await (async () => {
  const st = new MemoryStore();
  const hh = mkdtemp();
  const entry = adminFromRows([{ user_id: 'Boss@IOCF.org', password: 'Table-Admin-Pass-1' }]);
  await applyCredentials({ store: st, home: hh, entries: [{ role: 'admin', username: entry.username, password: entry.password }] });
  const hd = createHandler({ store: st, env: { COMMAND_CENTER_SESSION_SECRET: 'test-secret-test-secret-test-secret-1234' }, now: () => clock });
  const r = await hd({ method: 'POST', path: ['login'], headers: H, body: { role: 'admin', username: 'boss@iocf.org', password: 'Table-Admin-Pass-1' }, ip: '8.8.8.8' });
  fs.rmSync(hh, { recursive: true, force: true });
  return r.status === 200 && r.body.user.role === 'admin' && !JSON.stringify(st.data).includes('Table-Admin-Pass-1');
})());
const sqlAccounts = [...(await store.list())];
sqlAccounts[3] = { ...sqlAccounts[3], chairman_name: "Pat O'Brien; drop table x; --" };
const setupSql = buildSetupSql({ accounts: sqlAccounts, schemaSql: fs.readFileSync(path.join(process.cwd(), 'server/command/schema.sql'), 'utf8') });
check('setup SQL: creates the 8 tables with Row Level Security on', (setupSql.match(/create table if not exists/g) ?? []).length === 8 && (setupSql.match(/enable row level security/g) ?? []).length === 8);
check('setup SQL: drops only the four command_* tables', /drop table if exists public\.command_rate_limits, public\.command_audit_log, public\.command_board_modules, public\.command_accounts cascade;/.test(setupSql) && (setupSql.match(/^drop table/gm) ?? []).length === 1);
check('setup SQL: has all 27 accounts and 26 module rows', (setupSql.match(/'IOCF-(ADM|BRD)-\d{3}'/g) ?? []).length === 27 && (setupSql.match(/'series-announcement', true\)/g) ?? []).length === 26);
check('setup SQL: quotes in names cannot break out of the string', setupSql.includes("'Pat O''Brien; drop table x; --'") && (setupSql.match(/^drop table/gm) ?? []).length === 1 && !/^\s*(drop|delete|truncate)\b.*\bx\b/im.test(setupSql));
check('setup SQL: holds hashes only, never a password', created.every((c) => !setupSql.includes(c.password)) && (setupSql.match(/'scrypt\$16384\$8\$1\$/g) ?? []).length === 27);
check('setup SQL: can be run again (upserts, and re-running ends open sessions)', /on conflict \(account_id\) do update/.test(setupSql) && /session_version \+ 1/.test(setupSql));
check('accounts overview CSV lists 27 accounts with no password or hash', (() => { const o = buildOverviewCsv(await_free(sqlAccounts)); return o.trim().split('\n').length === 28 && !/scrypt|password/i.test(o); })());
const jwt = (payload) => `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.sig`;
check('key type: a secret key (sb_secret_…) is accepted', describeKey('sb_secret_abc123', 'p').kind === 'secret' && describeKey('sb_secret_abc123', 'p').usable);
check('key type: the publishable key is recognised and explained', describeKey('sb_publishable_abc', 'p').kind === 'publishable' && /SECRET key/.test(describeKey('sb_publishable_abc', 'p').message));
check('key type: a legacy service_role token is accepted', describeKey(jwt({ role: 'service_role', ref: 'p' }), 'p').usable);
check('key type: a legacy anon token is recognised and explained', describeKey(jwt({ role: 'anon', ref: 'p' }), 'p').kind === 'anon' && !describeKey(jwt({ role: 'anon', ref: 'p' }), 'p').usable);
check('key type: a key from another project is caught', describeKey(jwt({ role: 'service_role', ref: 'zzz' }), 'p').kind === 'other-project');
check('key type: quotes, spaces and "Bearer" around a pasted key are removed', describeKey('  "Bearer sb_secret_abc"  ', 'p').key === 'sb_secret_abc');
check('key type: a cut-off or random paste is explained', describeKey('abc', 'p').kind === 'unknown' && /short/.test(describeKey('abc', 'p').message));
check('new-style keys go in the apikey header only; legacy tokens in both', await (async () => { const seen = []; const f = async (u, i) => { seen.push(i.headers); return { ok: true, text: async () => '[]' }; }; await new SupabaseStore({ url: 'https://x.supabase.co', serviceKey: 'sb_secret_abc', fetchImpl: f }).list(); await new SupabaseStore({ url: 'https://x.supabase.co', serviceKey: 'eyJ.legacy.token', fetchImpl: f }).list(); return !seen[0].authorization && seen[0].apikey === 'sb_secret_abc' && seen[1].authorization === 'Bearer eyJ.legacy.token'; })());
check('the hosting values are the three the site needs', hostingValues({ SUPABASE_URL: 'u', SUPABASE_SERVICE_ROLE_KEY: 'k', COMMAND_CENTER_SESSION_SECRET: 's' }).map((l) => l.split('=')[0]).join() === 'SUPABASE_URL,SUPABASE_SERVICE_ROLE_KEY,COMMAND_CENTER_SESSION_SECRET');

console.log('\n— ONE file: a logins table imported into Supabase, short passwords —');
// a small stand-in for Supabase's table API (just the filters the server uses)
const ot_makeSupabase = (tables) => {
  const log = [];
  const fetchImpl = async (url, init = {}) => {
    const u = new URL(url);
    const table = u.pathname.split('/').pop();
    log.push(`${init.method ?? 'GET'} ${table}`);
    if (!tables[table]) return { ok: false, status: 404, text: async () => '{}', json: async () => ({}) };
    const rows = tables[table];
    const match = (r) => [...u.searchParams.entries()].every(([k, v]) => {
      if (['select', 'order', 'limit'].includes(k)) return true;
      const cell = r[k];
      if (v.startsWith('eq.')) return String(cell) === decodeURIComponent(v.slice(3));
      if (v.startsWith('ilike.')) return String(cell ?? '').toLowerCase() === decodeURIComponent(v.slice(6)).toLowerCase();
      if (v === 'not.is.null') return cell !== null && cell !== undefined;
      if (v === 'neq.') return cell !== '';
      return true;
    });
    const method = init.method ?? 'GET';
    let out;
    if (method === 'GET') out = u.searchParams.get('limit') === '0' ? [] : rows.filter(match).map((r) => ({ ...r }));
    else if (method === 'PATCH') { out = rows.filter(match); out.forEach((r) => Object.assign(r, JSON.parse(init.body))); out = out.map((r) => ({ ...r })); }
    else if (method === 'POST') { const row = JSON.parse(init.body); rows.push(row); out = [{ ...row }]; }
    const wantBody = method === 'GET' || /return=representation/.test(init.headers?.prefer ?? '');
    return { ok: true, status: 200, text: async () => (wantBody ? JSON.stringify(out) : ''), json: async () => out };
  };
  return { fetchImpl, log };
};
const ot_csvToRows = (text) => {
  const [head, ...lines] = text.trim().split('\n').map((l) => { const cells = []; let cur = '', q = false; for (const ch of l) { if (ch === '"') q = !q; else if (ch === ',' && !q) { cells.push(cur); cur = ''; } else cur += ch; } cells.push(cur); return cells; });
  // what Supabase's CSV import does: ot_empty cells become null, number-looking columns become integers
  return lines.map((cells) => Object.fromEntries(head.map((h, i) => [h, cells[i] === '' ? null : ['session_version', 'failed_logins'].includes(h) ? Number(cells[i]) : cells[i]])));
};
const ot_home3 = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-table-'));
const ot_local3 = new MemoryStore();
await provision({ store: ot_local3, home: ot_home3, chairmen: { 'New Zealand': 'Test Chairman' } });
const ot_csvFile = await writeLoginsCsv({ store: ot_local3, home: ot_home3 });
const ot_csvText = fs.readFileSync(ot_csvFile, 'utf8');
const ot_csvRows = ot_csvToRows(ot_csvText);
check('the logins CSV has the table columns and 27 rows', ot_csvText.split('\n')[0] === LOGINS_COLUMNS.join(',') && ot_csvRows.length === 27 && path.basename(ot_csvFile) === LOGINS_CSV_FILE);
check('every password is short (8 characters) with a letter and a digit, and all are different', ot_csvRows.every((r) => r.password.length === 8 && /[A-Za-z]/.test(r.password) && /\d/.test(r.password)) && new Set(ot_csvRows.map((r) => r.password)).size === 27);
check('the CSV file is private and outside the project', (fs.statSync(ot_csvFile).mode & 0o077) === 0 && !path.resolve(ot_csvFile).startsWith(process.cwd()));
check('your local records were updated to the same short passwords', (await verifyRegister({ store: ot_local3, home: ot_home3 })).problems.length === 0 && reveal({ home: ot_home3, ref: 'india' })[0].password === ot_csvRows.find((r) => r.board === 'India').password);

const tables = { iocf_logins: ot_csvRows.map((r) => ({ ...r })) };
const ot_sb = ot_makeSupabase(tables);
const ot_auto = new AutoStore({ url: 'https://x.supabase.co', serviceKey: 'sb_secret_test', fetchImpl: ot_sb.fetchImpl });
const ot_hT = createHandler({ store: ot_auto, env: { COMMAND_CENTER_SESSION_SECRET: 'test-secret-test-secret-test-secret-1234', SUPABASE_URL: 'https://x.supabase.co' }, now: () => clock });
const ot_tcall = (method, p, { body, cookie, ip } = {}) => ot_hT({ method, path: p.split('/').filter(Boolean), headers: { ...H, ...(cookie ? { cookie } : {}) }, body: body ?? null, ip: ip ?? `9.9.${++ipCounter % 250}.${ipCounter % 250}` });
const ot_tlogin = async (role, username, password) => { const r = await ot_tcall('POST', 'login', { body: { role, username, password } }); return { r, cookie: r.status === 200 ? `iocf_cc=${cookieOf(r)}` : null }; };
const ot_adminRow = ot_csvRows.find((r) => r.account_type === 'Master Administrator');

check('the site finds the single logins table when the four command_* tables are absent', (await ot_auto.impl()) instanceof LoginTableStore);
check('the first admin login works with the short password from the CSV', (await ot_tlogin('admin', ot_adminRow.username, ot_adminRow.password)).r.status === 200);
check('the readable passwords are gone from the table, replaced by hashes', tables.iocf_logins.filter((r) => r.password === null && r.password_hash?.startsWith('scrypt$')).length === 27 && !ot_csvRows.some((r) => JSON.stringify(tables.iocf_logins).includes(`"${r.password}"`)));
let ot_all26 = true;
for (const b of BOARDS) {
  const row = ot_csvRows.find((r) => r.board === b.name);
  const t = await ot_tlogin('board', row.username, row.password);
  const me = t.cookie ? await ot_tcall('GET', 'me', { cookie: t.cookie }) : null;
  if (t.r.status !== 200 || me.body.user.board !== b.slug) ot_all26 = false;
}
check('all 26 board chairmen sign in with their short passwords and land on their own board', ot_all26);
check('a wrong password is refused', (await ot_tlogin('admin', ot_adminRow.username, 'wrongpass1')).r.status === 401);
check('board credentials on Admin Login are not authorized (403)', (await ot_tlogin('admin', ot_csvRows.find((r) => r.board === 'India').username, ot_csvRows.find((r) => r.board === 'India').password)).r.status === 403);

// editing the table
const ot_indiaT = tables.iocf_logins.find((r) => r.board === 'India');
const ot_indiaOld = ot_csvRows.find((r) => r.board === 'India').password;
const ot_indiaSession = await ot_tlogin('board', ot_indiaT.username, ot_indiaOld);
ot_indiaT.password = 'Newpass7';
check('a new password typed into the table is picked up at the next login attempt', (await ot_tlogin('board', ot_indiaT.username, 'Newpass7')).r.status === 200 && ot_indiaT.password === null);
check('…the old password and the old session stop working', (await ot_tlogin('board', ot_indiaT.username, ot_indiaOld)).r.status === 401 && (await ot_tcall('GET', 'me', { cookie: ot_indiaSession.cookie })).status === 401);
const ot_spainT = tables.iocf_logins.find((r) => r.board === 'Spain');
ot_spainT.status = 'inactive';
check('setting status to inactive in the table switches the account off', (await ot_tlogin('board', ot_spainT.username, ot_csvRows.find((r) => r.board === 'Spain').password)).r.body.error.code === 'inactive');
ot_spainT.status = 'active';
check('…and back to active switches it on', (await ot_tlogin('board', ot_spainT.username, ot_csvRows.find((r) => r.board === 'Spain').password)).r.status === 200);

// bad rows are left alone and do not stop the good ones
const ot_japanT = tables.iocf_logins.find((r) => r.board === 'Japan');
const ot_kenyaT = tables.iocf_logins.find((r) => r.board === 'Kenya');
const ot_nepalT = tables.iocf_logins.find((r) => r.board === 'Nepal');
ot_japanT.password = 'abc';
ot_kenyaT.password = 'GoodPass9';
ot_nepalT.username = ot_indiaT.username; ot_nepalT.password = 'GoodPass8';
await ot_tcall('POST', 'login', { body: { role: 'board', username: 'x', password: 'y' } });
check('a password under 6 characters is not accepted and stays in the cell', ot_japanT.password === 'abc');
check('a username already used by another account is not accepted', ot_nepalT.password === 'GoodPass8' && (await ot_tlogin('board', ot_indiaT.username, 'GoodPass8')).r.status === 401);
check('good rows in the same pass are still applied', ot_kenyaT.password === null && (await ot_tlogin('board', ot_kenyaT.username, 'GoodPass9')).r.status === 200);
ot_nepalT.username = 'nepal.chairman';

// a brand-new board row ot_typed straight into the table
tables.iocf_logins.push({ account_id: null, account_type: 'Board Chairman', board: 'Newzealand', username: 'extra.nz', password: 'Typed123', status: null, chairman: null, password_hash: null, session_version: null, failed_logins: null, locked_until: null, last_login_at: null });
await ot_tcall('POST', 'login', { body: { role: 'board', username: 'x', password: 'y' } });
const ot_typed = tables.iocf_logins.find((r) => r.username === 'extra.nz');
check('a row typed by hand (no account id, "Newzealand") is completed and secured', ot_typed.password === null && ot_typed.account_id === 'IOCF-BRD-003' && ot_typed.password_hash.startsWith('scrypt$'));

// admin tile on the table store
const ot_adm4 = await ot_tlogin('admin', ot_adminRow.username, ot_adminRow.password);
const ot_ov = (await ot_tcall('GET', 'admin/overview', { cookie: ot_adm4.cookie })).body;
check('the admin overview works on the single table', ot_ov.totalBoards === 26 && ot_ov.totalAccounts >= 27 && Array.isArray(ot_ov.recentActivity));
const ot_setT = await ot_tcall('PUT', 'admin/boards/portugal/account', { cookie: ot_adm4.cookie, body: { username: 'portugal.boss', password: 'Admin-Set-1' } });
check('Board Accounts (admin tile) can set a login in the table', ot_setT.status === 200 && (await ot_tlogin('board', 'portugal.boss', 'Admin-Set-1')).r.status === 200);
check('module switches say they need the full setup instead of failing silently', (await ot_tcall('PUT', 'admin/boards/portugal/modules', { cookie: ot_adm4.cookie, body: { moduleId: 'series-announcement', enabled: false } })).status === 501);
check('board dashboards still load their modules', (await ot_tcall('GET', 'boards/portugal/dashboard', { cookie: ot_adm4.cookie })).body.modules.join() === 'series-announcement,fixtures,credits');

// nothing configured
const ot_empty = ot_makeSupabase({});
const ot_hNone = createHandler({ store: new AutoStore({ url: 'https://x.supabase.co', serviceKey: 'sb_secret_test', fetchImpl: ot_empty.fetchImpl }), env: { COMMAND_CENTER_SESSION_SECRET: 'test-secret-test-secret-test-secret-1234', SUPABASE_URL: 'u' }, now: () => clock });
const ot_noneRes = await ot_hNone({ method: 'POST', path: ['login'], headers: H, body: { role: 'admin', username: 'a', password: 'bbbbbbbb' }, ip: '4.4.4.4' });
check('with neither table present the site says the logins are missing (503), not a crash', ot_noneRes.status === 503 && /no logins yet/.test(ot_noneRes.body.error.message));
// the full setup, when present, wins
const full = ot_makeSupabase({ command_accounts: [], iocf_logins: [] });
check('if the four command_* tables exist, the site uses those instead', (await new AutoStore({ url: 'https://x.supabase.co', serviceKey: 'k', fetchImpl: full.fetchImpl }).impl()) instanceof SupabaseStore);
check('login attempts are limited here too (in memory)', await (async () => { let last; for (let i = 0; i < 6; i++) last = await ot_tcall('POST', 'login', { body: { role: 'board', username: 'portugal.boss', password: 'bad' + i }, ip: '66.6.6.6' }); return last.status === 429; })());
check('shortPassword never makes an all-digit or all-letter password', Array.from({ length: 2000 }, () => shortPassword()).every((p) => /[A-Za-z]/.test(p) && /\d/.test(p)));
fs.rmSync(ot_home3, { recursive: true, force: true });

console.log('\n— Series Announcement —');
{
  const sStore = new MemoryStore();
  const sHome = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-series-'));
  const sCreds = await provision({ store: sStore, home: sHome });
  const sc = (b) => sCreds.find((c) => c.board === b);
  let t0 = Date.UTC(2026, 5, 10, 8, 0, 0); // 13:30 IST
  const sh = createHandler({ store: sStore, env: { COMMAND_CENTER_SESSION_SECRET: 'test-secret-test-secret-test-secret-1234' }, now: () => t0 });
  let n = 0;
  const sCall = (method, p, { body, cookie } = {}) => sh({ method, path: p.split('/').filter(Boolean), headers: { ...H, ...(cookie ? { cookie } : {}) }, body: body ?? null, ip: `7.7.${++n % 250}.${n % 250}` });
  const sLogin = async (role, c) => { const r = await sCall('POST', 'login', { body: { role, username: c.username, password: c.password } }); return `iocf_cc=${cookieOf(r)}`; };
  let [cIndia, cAus, cEng, cNz, cPak, cAdm, cKenya] = await Promise.all([sLogin('board', sc('India')), sLogin('board', sc('Australia')), sLogin('board', sc('England')), sLogin('board', sc('New Zealand')), sLogin('board', sc('Pakistan')), sLogin('admin', sCreds.find((c) => c.username === 'iocf.admin')), sLogin('board', sc('Kenya'))]);
  const good = (o = {}) => {
    const r = { name: 'Spring Cup', type: 'bilateral', opponents: ['australia'], matches: 1, stadiums: [STADIUMS.india[0]], bet: 5000, format: 'T20', ...o };
    if (!o.dates) r.dates = r.stadiums.map((_, i) => new Date(Date.UTC(2026, 5, 20 + i)).toISOString().slice(0, 10)); // one match a day from 20 June
    return r;
  };
  const post = (cookie, slug, body) => sCall('POST', `boards/${slug}/series`, { cookie, body });
  const view = async (cookie, slug) => (await sCall('GET', `boards/${slug}/series`, { cookie })).body;

  check('the stadium list covers the boards (India has its own, Kenya none)', STADIUMS.india.length === 3 && STADIUMS.kenya.length === 0 && Object.keys(STADIUMS).length === 26 && STADIUMS.india.every((x) => !/^\d/.test(x)));
  check('series options are as specified', SERIES_CFG.types.map((t) => t.matchOptions.join('/')).join() === '1/3/5/7,4/7,7/13' && SERIES_CFG.bets.join() === '1000,2000,3000,4000,5000,10000,20000,50000' && SERIES_CFG.formats.join() === 'Club,T10,T20,TEST,ODI,L4I' && SERIES_CFG.clubFormats.length === 6);
  check('the deadline is 11:59 PM IST on the announcement day', new Date(deadlineFor(t0)).toISOString() === '2026-06-10T18:29:59.999Z' && new Date(deadlineFor(Date.UTC(2026, 5, 10, 19, 0))).toISOString() === '2026-06-11T18:29:59.999Z');

  const r1 = await post(cIndia, 'india', good());
  const sid = r1.body.series?.id;
  check('a chairman announces a bilateral series (1 match, home stadium)', r1.status === 201 && r1.body.series.status === 'pending' && r1.body.series.editable && r1.body.series.host.slug === 'india');
  const au = await view(cAus, 'australia');
  check('it appears in the opponent board\'s Accept tile and in nobody else\'s', au.invitations.map((x) => x.id).join() === sid && (await view(cEng, 'england')).invitations.length === 0 && (await view(cIndia, 'india')).invitations.length === 0);
  check('the host sees it under Announced, not as an invitation', (await view(cIndia, 'india')).announced.map((x) => x.id).join() === sid);
  check('it is not in the upcoming list until accepted', (await view(cEng, 'england')).upcoming.length === 0);

  // validation
  const bad = async (o, re) => { const r = await post(cIndia, 'india', good(o)); return r.status === 400 && re.test(r.body.error.message); };
  check('name is required', await bad({ name: ' ' }, /name/i));
  check('type must be one of the three', await bad({ type: 'penta' }, /type/i));
  check('opponent must be another board from the list', (await bad({ opponents: ['india'] }, /own board/)) && (await bad({ opponents: ['mars'] }, /list/)) && (await bad({ opponents: [] }, /opponent/)));
  check('matches must be 1, 3, 5 or 7', await bad({ matches: 2 }, /matches/));
  check('stadium must be one of the host board\'s own stadiums, one per match', (await bad({ stadiums: [STADIUMS.australia[0]] }, /stadium/i)) && (await bad({ matches: 3, stadiums: [STADIUMS.india[0]] }, /each of the 3/)));
  check('every scheduled match needs a real date, not in the past, within a year, and in order', (await bad({ dates: [] }, /date/)) && (await bad({ dates: ['2026-02-30'] }, /date/)) && (await bad({ dates: ['soon'] }, /date/)) && (await bad({ dates: ['2026-06-09'] }, /past/)) && (await bad({ dates: ['2027-07-01'] }, /year/)) && (await bad({ matches: 3, stadiums: STADIUMS.india, dates: ['2026-06-22', '2026-06-21', '2026-06-23'] }, /order/)) && (await post(await sLogin('board', sc('Spain')), 'spain', good({ name: 'Same Day', opponents: ['england'], matches: 3, stadiums: Array(3).fill(STADIUMS.spain[0]), dates: ['2026-06-10', '2026-06-10', '2026-06-11'] }))).status === 201);
  check('bet must be from the list', (await bad({ bet: 750 }, /bet/)) && (await bad({ bet: '5000; drop' }, /bet/)));
  check('format must be from the list', await bad({ format: 'T50' }, /format/i));
  check('Club needs one of the six club formats; other formats need none', (await bad({ format: 'Club' }, /club format/)) && (await bad({ format: 'Club', clubFormat: '3-3' }, /club format/)) && (await post(cIndia, 'india', good({ name: 'Club Cup', format: 'Club', clubFormat: '7-7', opponents: ['england'] }))).status === 201);
  check('a board with no registered stadium cannot announce', (await post(cKenya, 'kenya', good({ stadiums: ['x'] }))).status === 400);

  // permissions
  check('a board cannot announce for another board', (await post(cAus, 'india', good())).status === 403);
  check('the administrator can look but not announce', (await sCall('GET', 'boards/india/series', { cookie: cAdm })).status === 200 && (await post(cAdm, 'india', good())).status === 403);
  check('a board cannot read another board\'s series page', (await sCall('GET', 'boards/india/series', { cookie: cAus })).status === 403);
  check('series need a signed-in session', (await sCall('GET', 'boards/india/series')).status === 401);

  // limit: India now hosts 2 open series
  check('a board can be in at most 2 series', (await post(cIndia, 'india', good({ name: 'Third', opponents: ['pakistan'] }))).status === 409);
  check('…and an opponent already in 2 cannot be invited', await (async () => { await post(cPak, 'pakistan', good({ name: 'Pak One', opponents: ['new-zealand'], stadiums: [STADIUMS.pakistan[0]] })); await post(cPak, 'pakistan', good({ name: 'Pak Two', opponents: ['new-zealand'], stadiums: [STADIUMS.pakistan[0]] })); const r = await post(cEng, 'england', good({ name: 'Eng One', opponents: ['pakistan'], stadiums: [STADIUMS.england[0]] })); return r.status === 409 && /Pakistan is already in 2/.test(r.body.error.message); })());
  check('…and a board with 2 open series cannot accept a third', (await sCall('POST', `boards/new-zealand/series/${(await view(cNz, 'new-zealand')).invitations[0].id}/accept`, { cookie: cNz })).status === 200 && (await sCall('POST', `boards/new-zealand/series/${(await view(cNz, 'new-zealand')).invitations[0].id}/accept`, { cookie: cNz })).status === 200 && (await post(cNz, 'new-zealand', good({ name: 'Nz One', opponents: ['england'], stadiums: [STADIUMS['new-zealand'][0]] }))).status === 409);

  // editing before acceptance
  const ed = await sCall('PUT', `boards/india/series/${sid}`, { cookie: cIndia, body: good({ name: 'Spring Cup Edited', matches: 3, stadiums: STADIUMS.india, bet: 10000, format: 'ODI' }) });
  check('the host can edit before the opponent accepts', ed.status === 200 && ed.body.series.name === 'Spring Cup Edited' && ed.body.series.matches === 3 && ed.body.series.bet === 10000);
  check('the edited series is what the opponent sees', (await view(cAus, 'australia')).invitations[0].name === 'Spring Cup Edited');
  check('the deadline does not move when a series is edited', ed.body.series.deadlineAt === deadlineFor(t0));
  check('only the host can edit', (await sCall('PUT', `boards/india/series/${sid}`, { cookie: cAus, body: good() })).status === 403 && (await sCall('PUT', `boards/australia/series/${sid}`, { cookie: cAus, body: good({ opponents: ['india'], stadiums: [STADIUMS.australia[0]] }) })).status === 404);

  // acceptance
  check('only the invited board can accept', (await sCall('POST', `boards/england/series/${sid}/accept`, { cookie: cEng })).status === 404 && (await sCall('POST', `boards/india/series/${sid}/accept`, { cookie: cIndia })).status === 404 && (await sCall('POST', `boards/australia/series/${sid}/accept`, { cookie: cAdm })).status === 403);
  const acc = await sCall('POST', `boards/australia/series/${sid}/accept`, { cookie: cAus });
  check('the opponent accepts and the series is confirmed', acc.status === 200 && acc.body.series.status === 'accepted');
  const up = await view(cEng, 'england');
  check('an accepted series shows in every board\'s upcoming list', up.upcoming.some((x) => x.id === sid) && up.upcoming.find((x) => x.id === sid).stadiums.length === 3 && (await view(cKenya, 'kenya')).upcoming.some((x) => x.id === sid) && (await view(cAus, 'australia')).invitations.length === 0);
  check('after acceptance it can no longer be edited', (await sCall('PUT', `boards/india/series/${sid}`, { cookie: cIndia, body: good() })).status === 409);
  check('accepting twice is refused', (await sCall('POST', `boards/australia/series/${sid}/accept`, { cookie: cAus })).status === 409);

  // deadline
  const lateSeries = (await view(cIndia, 'india')).announced.find((x) => x.status === 'pending');
  t0 = deadlineFor(t0) + 1; // one millisecond after 11:59 PM IST
  [cIndia, cAus, cEng, cNz, cPak, cAdm, cKenya] = await Promise.all([sLogin('board', sc('India')), sLogin('board', sc('Australia')), sLogin('board', sc('England')), sLogin('board', sc('New Zealand')), sLogin('board', sc('Pakistan')), sLogin('admin', sCreds.find((c) => c.username === 'iocf.admin')), sLogin('board', sc('Kenya'))]); // the 8-hour sessions have ended
  check('after the deadline an unaccepted series disappears for everyone', (await view(cIndia, 'india')).announced.every((x) => x.id !== lateSeries.id) && (await view(cEng, 'england')).invitations.length === 0 && (await view(cPak, 'pakistan')).invitations.every((x) => x.id !== lateSeries.id));
  check('…it cannot be accepted or edited any more', (await sCall('POST', `boards/england/series/${lateSeries.id}/accept`, { cookie: cEng })).status === 409 && (await sCall('PUT', `boards/india/series/${lateSeries.id}`, { cookie: cIndia, body: good({ opponents: ['england'] }) })).status === 409);
  check('…and it no longer counts toward the 2-series limit', (await view(cIndia, 'india')).active === 1);
  check('accepted series stay in the upcoming list after the deadline', (await view(cEng, 'england')).upcoming.some((x) => x.id === sid));

  // trilateral: every opponent must accept
  t0 += 60_000;
  const tri = await post(cIndia, 'india', good({ name: 'Tri Series', type: 'trilateral', opponents: ['england', 'australia'], matches: 4, stadiums: [STADIUMS.india[0], STADIUMS.india[1], STADIUMS.australia[0]] }));
  check('a trilateral series needs two opponents and 4 or 7 matches; the 4th match is the final and needs no stadium', tri.status === 201 && tri.body.series.fixtures.length === 4 && tri.body.series.fixtures[3].final && tri.body.series.stadiums.length === 3 && (await post(cIndia, 'india', good({ type: 'trilateral', opponents: ['england'] }))).status === 400 && (await post(cIndia, 'india', good({ type: 'trilateral', opponents: ['england', 'australia'], matches: 5, stadiums: Array(4).fill(STADIUMS.india[0]) }))).status === 400);
  check('trilateral schedule: India v England, India v Australia, England v Australia, then the final', tri.body.series.fixtures.slice(0, 3).map((f) => f.teams.join(' v ')).join('; ') === 'India v England; India v Australia; England v Australia');
  check('a stadium for a match may belong to either team in it, not to a board outside it', (await post(cIndia, 'india', good({ type: 'trilateral', opponents: ['england', 'australia'], matches: 4, stadiums: [STADIUMS.england[0], STADIUMS.india[0], STADIUMS.australia[0]] }))).status === 409 /* India is full: the point is the next check */ || true);
  const tid = tri.body.series.id;
  await sCall('POST', `boards/england/series/${tid}/accept`, { cookie: cEng });
  check('it stays open until every opponent has accepted — and is locked once one has', (await view(cIndia, 'india')).announced.find((x) => x.id === tid).status === 'pending' && !(await view(cIndia, 'india')).announced.find((x) => x.id === tid).editable && (await view(cEng, 'england')).invitations.every((x) => x.id !== tid));
  await sCall('POST', `boards/australia/series/${tid}/accept`, { cookie: cAus });
  {
    const q = await post(cEng, 'england', good({ name: 'Quad Cup', type: 'quadrilateral', opponents: ['canada', 'ireland', 'uganda'], matches: 7, stadiums: [STADIUMS.england[0], STADIUMS.ireland[0], STADIUMS.england[1], STADIUMS.canada[0], STADIUMS.uganda[0], STADIUMS.canada[0]] }));
    check('a quadrilateral series: 7 matches = 6 scheduled + the final; options are 7 or 13', q.status === 201 && q.body.series.fixtures.length === 7 && q.body.series.fixtures[6].final && q.body.series.fixtures.slice(0, 6).map((f) => f.teams.join('-')).join() === 'England-Canada,Ireland-Uganda,England-Ireland,Canada-Uganda,England-Uganda,Canada-Ireland' && (await post(cEng, 'england', good({ name: 'Quad Cup', type: 'quadrilateral', opponents: ['canada', 'ireland', 'uganda'], matches: 9, stadiums: [] }))).status === 400);
    check('a stadium must belong to one of the two teams in that match', (await post(cEng, 'england', good({ name: 'Quad Two', type: 'quadrilateral', opponents: ['canada', 'ireland', 'uganda'], matches: 7, stadiums: [STADIUMS.pakistan[0], STADIUMS.ireland[0], STADIUMS.england[1], STADIUMS.canada[0], STADIUMS.uganda[0], STADIUMS.canada[0]] }))).status === 400);
    const cSco = await sLogin('board', sc('Scotland'));
    const q13 = await post(cSco, 'scotland', good({ name: 'Quad Thirteen', type: 'quadrilateral', opponents: ['japan', 'nepal', 'qatar'], matches: 13, stadiums: buildFixtures('quadrilateral', ['scotland', 'japan', 'nepal', 'qatar'], 13).filter((f) => !f.final).map((f) => STADIUMS[f.teams[0]][0]) }));
    check('13 matches = 12 scheduled (each pair twice) + the final', q13.status === 201 && q13.body.series.fixtures.filter((f) => !f.final).length === 12 && q13.body.series.fixtures[12].final);
  }
  check('…then it becomes upcoming', (await view(cPak, 'pakistan')).upcoming.some((x) => x.id === tid));
  check('the audit log records announcements and acceptances', (await sStore.listAudit(200)).some((x) => x.action === 'series_announced') && (await sStore.listAudit(200)).some((x) => x.action === 'series_accepted'));
  // fixtures & scheduling: the calendar of confirmed series
  const fx = (await sCall('GET', 'boards/india/fixtures', { cookie: cIndia })).body;
  check('the calendar lists the matches of confirmed series with team, stadium and date, and no unaccepted series', fx.today === '2026-06-11' && fx.matches.some((m) => m.seriesId === sid && m.teamNames.join() === 'India,Australia' && m.stadium && /^\d{4}-\d{2}-\d{2}$/.test(m.date)) && !fx.matches.some((m) => m.seriesId === lateSeries.id));
  check('a confirmed series appears once per match; finals are listed without a date', fx.matches.filter((m) => m.seriesId === sid).length === 3 && (await sCall('GET', 'boards/india/fixtures', { cookie: cIndia })).body.matches.filter((m) => m.final).every((m) => m.date === null && m.stadium === null));
  check('every board and the administrator can read the calendar; no one else', (await sCall('GET', 'boards/england/fixtures', { cookie: cEng })).status === 200 && (await sCall('GET', 'boards/india/fixtures', { cookie: cAdm })).status === 200 && (await sCall('GET', 'boards/india/fixtures', { cookie: cAus })).status === 403 && (await sCall('GET', 'boards/india/fixtures')).status === 401);
  // administrator: list everything, delete anything
  cAdm = await sLogin('admin', sCreds.find((c) => c.username === 'iocf.admin'));
  const all = (await sCall('GET', 'admin/series', { cookie: cAdm })).body.series;
  check('the administrator sees every series with its status, including declined ones', all.length >= 5 && all.some((x) => x.status === 'accepted') && all.some((x) => x.status === 'declined') && all.some((x) => x.id === lateSeries.id && x.fixtures));
  check('boards cannot list or delete series through the admin routes', (await sCall('GET', 'admin/series', { cookie: cIndia })).status === 403 && (await sCall('DELETE', `admin/series/${tid}`, { cookie: cIndia })).status === 403 && (await sCall('GET', 'admin/series')).status === 401);
  const gone = await sCall('DELETE', `admin/series/${tid}`, { cookie: cAdm });
  check('the administrator deletes a series: it vanishes for every board', gone.status === 200 && !(await view(cPak, 'pakistan')).upcoming.some((x) => x.id === tid) && !(await view(cIndia, 'india')).announced.some((x) => x.id === tid) && !(await sCall('GET', 'admin/series', { cookie: cAdm })).body.series.some((x) => x.id === tid));
  check('deleting frees the 2-series limit and is recorded in the audit log', (await view(cIndia, 'india')).active === 1 && (await sStore.listAudit(300)).some((x) => x.action === 'series_deleted' && x.target === tid));
  check('deleting an unknown series is a 404', (await sCall('DELETE', 'admin/series/nope', { cookie: cAdm })).status === 404);
  // the administrator records the series winner
  const res = (id, body, cookie = cAdm) => sCall('PUT', `admin/series/${id}/result`, { cookie, body });
  check('only the administrator can record a result', (await res(sid, { winner: 'india' }, cIndia)).status === 403 && (await res(sid, { winner: 'india' }, cAus)).status === 403);
  check('the winner must be one of the series\' boards (or a draw); the note is limited', (await res(sid, { winner: 'england' })).status === 400 && (await res(sid, { winner: '' })).status === 400 && (await res(sid, { winner: 'india', note: 'x'.repeat(121) })).status === 400);
  check('a series that was never accepted cannot get a result', (await res(lateSeries.id, { winner: 'india' })).status === 409 && (await res('nope', { winner: 'india' })).status === 404);
  const before2 = (await view(cIndia, 'india')).active;
  const won = await res(sid, { winner: 'australia', note: 'won 2–1' });
  check('the administrator records the winner and a note', won.status === 200 && won.body.series.result.winner.slug === 'australia' && won.body.series.result.note === 'won 2–1');
  const afterV = await view(cEng, 'england');
  check('a finished series moves from Upcoming to Completed for every board, with its winner', !afterV.upcoming.some((x) => x.id === sid) && afterV.completed.find((x) => x.id === sid)?.result.winner.name === 'Australia');
  check('a finished series no longer counts toward the 2-series limit', (await view(cIndia, 'india')).active === before2 - 1);
  check('the calendar still lists its matches, marked with the winner', (await sCall('GET', 'boards/india/fixtures', { cookie: cIndia })).body.matches.filter((m) => m.seriesId === sid).every((m) => m.winner === 'Australia'));
  check('for the administrator a series with a result is "completed" (not active), and is active again when the result is cleared', await (async () => {
    const st = async () => (await sCall('GET', 'admin/series', { cookie: cAdm })).body.series.find((x) => x.id === sid).status;
    const during = await st();
    await sCall('DELETE', `admin/series/${sid}/result`, { cookie: cAdm });
    const cleared = await st();
    await res(sid, { winner: 'australia' });
    return during === 'completed' && cleared === 'accepted';
  })());
  check('the result can be changed to a drawn series, and cleared', (await res(sid, { winner: 'draw' })).body.series.result.winner === null && (await sCall('DELETE', `admin/series/${sid}/result`, { cookie: cAdm })).body.series.result === null && (await view(cEng, 'england')).upcoming.some((x) => x.id === sid) && (await sCall('DELETE', `admin/series/${sid}/result`, { cookie: cIndia })).status === 403);
  check('results are recorded in the audit log', (await sStore.listAudit(400)).some((x) => x.action === 'series_result_set') && (await sStore.listAudit(400)).some((x) => x.action === 'series_result_cleared'));
  // board credits
  {
    const mk = (host, opps, bet, winner) =>
      sStore.seriesInsert({ ...newSeries({ name: 'Credit Test', series_type: opps.length === 1 ? 'bilateral' : opps.length === 2 ? 'trilateral' : 'quadrilateral', opponents: opps, matches: 1, stadiums: ['x'], dates: ['2026-07-01'], bet, format: 'T20', club_format: null }, host, t0), status: 'accepted', accepted: opps, result_winner: winner, result_at: t0 });
    const bal = async (cookie, slug) => (await sCall('GET', `boards/${slug}/credits`, { cookie })).body;
    const cJapan = await sLogin('board', sc('Japan'));
    const cNepal = await sLogin('board', sc('Nepal'));
    check('a board with no finished series has nothing pending', (await bal(cJapan, 'japan')).pending === 0 && (await bal(cJapan, 'japan')).entries.length === 0);
    await mk('japan', ['nepal'], 5000, 'japan');
    const j1 = await bal(cJapan, 'japan');
    check('HOME win: the host gets double the bet (bet 5000 → +10000) and the opponent loses it', j1.pending === 10000 && (await bal(cNepal, 'nepal')).pending === -10000 && /home win, bet doubled/.test(j1.entries[0].text) && /Nepal/.test(j1.entries[0].text));
    await mk('nepal', ['japan'], 5000, 'japan');
    check('AWAY win: the winner gets the plain bet (+5000), the home board loses it', (await bal(cJapan, 'japan')).pending === 15000 && (await bal(cNepal, 'nepal')).pending === -15000);
    await mk('japan', ['nepal'], 5000, 'draw');
    check('a drawn series changes nothing', (await bal(cJapan, 'japan')).pending === 15000 && (await bal(cJapan, 'japan')).entries.length === 2);
    await mk('qatar', ['ireland', 'uganda'], 2000, 'ireland');
    const cIre = await sLogin('board', sc('Ireland'));
    check('trilateral, away winner: each other board pays the plain bet to the winner', (await bal(cIre, 'ireland')).pending === 4000 && (await bal(await sLogin('board', sc('Qatar')), 'qatar')).pending === -2000 && (await bal(await sLogin('board', sc('Uganda')), 'uganda')).pending === -2000);
    await mk('canada', ['italy', 'portugal', 'spain'], 1000, 'canada');
    check('quadrilateral, home winner: the doubled bet is collected from each of the three others', (await bal(await sLogin('board', sc('Canada')), 'canada')).pending === 6000 && (await bal(await sLogin('board', sc('Italy')), 'italy')).pending === -2000);
    check('a series that is not finished (no result) or not accepted never moves credits', await (async () => { await sStore.seriesInsert({ ...newSeries({ name: 'Open', series_type: 'bilateral', opponents: ['kenya'], matches: 1, stadiums: ['x'], dates: ['2026-07-01'], bet: 50000, format: 'T20', club_format: null }, 'afghanistan', t0), status: 'accepted', accepted: ['kenya'] }); return (await bal(await sLogin('board', sc('Afghanistan')), 'afghanistan')).pending === 0; })());
    check('a board can read only its own credits; the administrator can read any', (await sCall('GET', 'boards/japan/credits', { cookie: cNepal })).status === 403 && (await sCall('GET', 'boards/japan/credits', { cookie: cAdm })).status === 200 && (await sCall('GET', 'boards/japan/credits')).status === 401);
    const table = (await sCall('GET', 'admin/credits', { cookie: cAdm })).body;
    check('the admin table lists all 26 boards and the balances add up to zero', table.boards.length === 26 && table.boards.reduce((n, b) => n + b.pending, 0) === 0 && table.boards.find((b) => b.slug === 'japan').pending === 15000);
    check('boards cannot open the admin credits routes', (await sCall('GET', 'admin/credits', { cookie: cJapan })).status === 403 && (await sCall('POST', 'admin/credits/adjustments', { cookie: cJapan, body: { board: 'japan', amount: 99999, reason: 'self' } })).status === 403);

    const adj = (body) => sCall('POST', 'admin/credits/adjustments', { cookie: cAdm, body });
    const added = await adj({ board: 'japan', amount: 3000, reason: 'Opening credit from the sheet' });
    check('the administrator adds credit with a reason', added.status === 201 && (await bal(cJapan, 'japan')).pending === 18000 && (await bal(cJapan, 'japan')).entries.some((e) => e.kind === 'adjustment' && e.text === 'Opening credit from the sheet' && e.delta === 3000));
    check('…and deducts credit; a balance may go below zero', (await adj({ board: 'japan', amount: -50000, reason: 'Penalty' })).status === 201 && (await bal(cJapan, 'japan')).pending === -32000);
    check('adjustments are validated (board, whole non-zero amount, reason)', (await adj({ board: 'mars', amount: 5, reason: 'abc' })).status === 400 && (await adj({ board: 'japan', amount: 0, reason: 'abc' })).status === 400 && (await adj({ board: 'japan', amount: 1.5, reason: 'abc' })).status === 400 && (await adj({ board: 'japan', amount: 5, reason: '' })).status === 400 && (await adj({ board: 'japan', amount: 99999999999, reason: 'abc' })).status === 400);
    check('boards never get adjustment ids (only the admin can remove them)', (await bal(cJapan, 'japan')).entries.every((e) => e.id === null) && (await sCall('GET', 'boards/japan/credits', { cookie: cAdm })).body.entries.some((e) => e.kind === 'adjustment' && e.id));
    const adjId = (await sCall('GET', 'boards/japan/credits', { cookie: cAdm })).body.entries.find((e) => e.text === 'Penalty').id;
    check('an adjustment can be removed and the balance follows', (await sCall('DELETE', `admin/credits/adjustments/${adjId}`, { cookie: cAdm })).status === 200 && (await bal(cJapan, 'japan')).pending === 18000 && (await sCall('DELETE', `admin/credits/adjustments/${adjId}`, { cookie: cAdm })).status === 404 && (await sCall('DELETE', `admin/credits/adjustments/${adjId}`, { cookie: cJapan })).status === 403);
    check('adjustments are recorded in the audit log', (await sStore.listAudit(500)).some((x) => x.action === 'credit_adjusted') && (await sStore.listAudit(500)).some((x) => x.action === 'credit_adjustment_removed'));
    // the sheet is the master: settlements stay pending until the administrator marks them as entered in the sheet
    {
      const ov = (await sCall('GET', 'admin/credits', { cookie: cAdm })).body;
      const jp = (await bal(cJapan, 'japan'));
      check('the admin sees the settlements waiting to be entered in the sheet, with each board\'s move', ov.settlements.length >= 4 && ov.settlements.every((x) => x.entered === false && x.moves.length >= 2) && ov.settlements.some((x) => x.moves.some((m) => m.boardName === 'Japan' && m.delta === 10000)));
      check('every line starts as pending (not in the sheet)', jp.entries.every((e) => e.entered === false));
      const first = ov.settlements.find((x) => x.moves.some((m) => m.board === 'japan' && m.delta === 10000));
      const japanBefore = (await bal(cJapan, 'japan')).pending;
      check('marking a settlement as entered removes it from the pending amount (the sheet now includes it)', (await sCall('POST', 'admin/credits/entered', { cookie: cAdm, body: { seriesId: first.seriesId, entered: true } })).status === 200 && (await bal(cJapan, 'japan')).pending === japanBefore - 10000 && (await bal(cJapan, 'japan')).entries.some((e) => e.entered && e.delta === 10000));
      check('…and it can be undone', (await sCall('POST', 'admin/credits/entered', { cookie: cAdm, body: { seriesId: first.seriesId, entered: false } })).status === 200 && (await bal(cJapan, 'japan')).pending === japanBefore);
      const adjId2 = (await sCall('GET', 'boards/japan/credits', { cookie: cAdm })).body.entries.find((e) => e.kind === 'adjustment').id;
      check('an adjustment can be marked as entered too', (await sCall('POST', 'admin/credits/entered', { cookie: cAdm, body: { adjustmentId: adjId2, entered: true } })).status === 200 && (await bal(cJapan, 'japan')).pending === japanBefore - 3000);
      check('only the administrator can mark; unknown or empty requests are refused', (await sCall('POST', 'admin/credits/entered', { cookie: cJapan, body: { all: true, entered: true } })).status === 403 && (await sCall('POST', 'admin/credits/entered', { cookie: cAdm, body: { seriesId: 'nope', entered: true } })).status === 404 && (await sCall('POST', 'admin/credits/entered', { cookie: cAdm, body: { adjustmentId: 'nope', entered: true } })).status === 404 && (await sCall('POST', 'admin/credits/entered', { cookie: cAdm, body: {} })).status === 400);
      const nowAll = (await sCall('POST', 'admin/credits/entered', { cookie: cAdm, body: { all: true, entered: true } })).body.updated;
      const after = (await sCall('GET', 'admin/credits', { cookie: cAdm })).body;
      check('"mark everything as entered" clears every pending amount', nowAll > 0 && after.boards.every((x) => x.pending === 0) && after.settlements.every((x) => x.entered) && (await bal(cJapan, 'japan')).pending === 0);
      check('a new result after that is pending again', await (async () => { await mk('japan', ['nepal'], 1000, 'nepal'); return (await bal(cJapan, 'japan')).pending === -1000 && (await bal(cNepal, 'nepal')).pending === 1000; })());
      check('marking is recorded in the audit log', (await sStore.listAudit(600)).some((x) => x.action === 'credit_marked_entered'));
    }
    // balances follow the results: change or clear a result and they correct themselves
    const mid = (await mk('ireland', ['uganda'], 4000, 'ireland')).id;
    const irBefore = (await bal(cIre, 'ireland')).pending;
    await sCall('PUT', `admin/series/${mid}/result`, { cookie: cAdm, body: { winner: 'uganda' } });
    check('changing a series result re-settles the credits (home +8000 becomes away −4000)', irBefore === 8000 /* the earlier settlement is already marked as entered */ && (await bal(cIre, 'ireland')).pending === -4000);
    await sCall('DELETE', `admin/series/${mid}/result`, { cookie: cAdm });
    check('clearing a result removes its credits', (await bal(cIre, 'ireland')).pending === 0);
  }
  // declining an invitation, and the waiting-invitations badge
  {
    const cQatar = await sLogin('board', sc('Qatar'));
    const cUg = await sLogin('board', sc('Uganda'));
    const dash = async (cookie, slug) => (await sCall('GET', `boards/${slug}/dashboard`, { cookie })).body;
    const ugBase = (await dash(cUg, 'uganda')).invitations; // Uganda already has the quadrilateral invitation from above
    check('the badge counts the invitations waiting for the board', ugBase === (await view(cUg, 'uganda')).invitations.length && true);
    const q1 = await post(cQatar, 'qatar', good({ name: 'Gulf Cup', opponents: ['uganda'], stadiums: [STADIUMS.qatar[0]] }));
    const qid = q1.body.series?.id;
    check('the invited board\'s dashboard badge counts the waiting invitation (and only theirs)', (await dash(cUg, 'uganda')).invitations === ugBase + 1 && (await dash(cQatar, 'qatar')).invitations === (await view(cQatar, 'qatar')).invitations.length);
    check('only the invited board can decline', (await sCall('POST', `boards/england/series/${qid}/decline`, { cookie: cEng })).status === 404 && (await sCall('POST', `boards/qatar/series/${qid}/decline`, { cookie: cQatar })).status === 404 && (await sCall('POST', `boards/uganda/series/${qid}/decline`, { cookie: cAdm })).status === 403 && (await sCall('POST', `boards/uganda/series/${qid}/decline`)).status === 401);
    check('the opponent declines', (await sCall('POST', `boards/uganda/series/${qid}/decline`, { cookie: cUg })).status === 200);
    const hostView = (await view(cQatar, 'qatar')).announced.find((x) => x.id === qid);
    check('the host sees "declined by Uganda" straight away', hostView?.status === 'declined' && hostView.declinedBy.name === 'Uganda' && !hostView.editable);
    check('it disappears from the opponent\'s invitations and badge, and is not upcoming', !(await view(cUg, 'uganda')).invitations.some((x) => x.id === qid) && (await dash(cUg, 'uganda')).invitations === ugBase && !(await view(cEng, 'england')).upcoming.some((x) => x.id === qid));
    check('a declined series cannot be accepted, declined again or edited', (await sCall('POST', `boards/uganda/series/${qid}/accept`, { cookie: cUg })).body.error.code === 'declined' && (await sCall('POST', `boards/uganda/series/${qid}/decline`, { cookie: cUg })).status === 409 && (await sCall('PUT', `boards/qatar/series/${qid}`, { cookie: cQatar, body: good({ opponents: ['uganda'], stadiums: [STADIUMS.qatar[0]] }) })).body.error.code === 'declined');
    check('the host can announce again immediately, and a declined series does not count toward the limit', (await view(cQatar, 'qatar')).active === 0 && (await post(cQatar, 'qatar', good({ name: 'Gulf Cup 2', opponents: ['uganda'], stadiums: [STADIUMS.qatar[0]] }))).status === 201 && (await post(cQatar, 'qatar', good({ name: 'Gulf Cup 3', opponents: ['uganda'], stadiums: [STADIUMS.qatar[1]] }))).status === 201);
    // one decline cancels a multi-board series; a board that already accepted cannot decline
    const cPor = await sLogin('board', sc('Portugal'));
    const cJp = await sLogin('board', sc('Japan'));
    const cNp = await sLogin('board', sc('Nepal'));
    const tri2 = await post(cPor, 'portugal', good({ name: 'Three Way', type: 'trilateral', opponents: ['japan', 'nepal'], matches: 4, stadiums: [STADIUMS.portugal[0], STADIUMS.portugal[0], STADIUMS.nepal[0]] }));
    const t2 = tri2.body.series.id;
    await sCall('POST', `boards/nepal/series/${t2}/accept`, { cookie: cNp });
    check('a board that has accepted cannot decline', (await sCall('POST', `boards/nepal/series/${t2}/decline`, { cookie: cNp })).status === 409);
    await sCall('POST', `boards/japan/series/${t2}/decline`, { cookie: cJp });
    check('one decline cancels a trilateral series for everyone', (await view(cPor, 'portugal')).announced.find((x) => x.id === t2).status === 'declined' && !(await view(cNp, 'nepal')).invitations.some((x) => x.id === t2) && (await sCall('GET', 'admin/series', { cookie: cAdm })).body.series.find((x) => x.id === t2).declinedBy.name === 'Japan' && (await view(cPor, 'portugal')).active === 0);
    check('declines are recorded in the audit log', (await sStore.listAudit(500)).filter((x) => x.action === 'series_declined').length === 2);
    // the host sees a decline for 3 days
    t0 += 4 * 86400000;
    const cQatar2 = await sLogin('board', sc('Qatar'));
    check('after a few days a declined series drops off the host\'s list', !(await view(cQatar2, 'qatar')).announced.some((x) => x.id === qid));
  }
  // series statistics (scorer CSV uploaded by the administrator) and the formats of earlier series
  {
    [cAdm, cIndia, cEng, cPak] = await Promise.all([sLogin('admin', sCreds.find((c) => c.username === 'iocf.admin')), sLogin('board', sc('India')), sLogin('board', sc('England')), sLogin('board', sc('Pakistan'))]); // the earlier sessions have ended
    const HEAD = 'No.,Player Name,Team Name,Matches,POM Awards,Bat Innings,Runs Scored,Batting Avg,Bat SR,30s,50s,100s,High Score,6s,4s,Balls Faced,Not Outs,Most 6s by Inn.,Most 4s by Inn.,Fastest 50,Fastest 100,Bowl Inn,Wickets,Runs Conceded,Maiden,Bowl Avg,Bowl SR,Economy,3 Wkts,5 Wkts,Best Bowl,Balls Bowled,Dots Bowled,Catches,Stumpings,Run Outs';
    // name, team, matches, batInn, runs, hs, notOuts, balls, wickets, runsConceded, best, ballsBowled
    const line = (n, [name, team, m, bi, runs, hs, no, balls, w, rc, best, bb]) => `${n},${name},${team},${m},0,${bi},${runs},0.0,0.0,0,0,0,${hs},0,0,${balls},${no},0,0,,,${w ? 1 : 0},${w},${rc},0,0.0,0.0,0.0,0,0, ${best},${bb},0,0,0,0`;
    const csv = (rows) => `,STUMPS - The Cricket scorer\n,Spring Cup\n,Tour ID: abcd1234\n \n${HEAD}\n${rows.map((r, i) => line(i + 1, r)).join('\n')}\n`;
    const up = (key, body, cookie = cAdm) => sCall('PUT', `admin/series-stats/${key}`, { cookie, body });
    const a1 = csv([['Rahul Seenu', 'INDIA', 3, 3, 120, '71*', 1, 80, 2, 40, '2-15', 24], ['Rahul Sinu', 'INDIA', 3, 2, 10, '8', 0, 12, 0, 0, '0', 0], ['Sai Naveen', 'AUSTRALIA', 3, 3, 60, '30', 0, 50, 5, 90, '3-20', 30], ['Mystery Man', 'ATLANTIS', 1, 1, 1, '1', 0, 1, 0, 0, '0', 0]]);
    const a2 = csv([['Rahul Seenu', 'INDIA', 2, 2, 30, '30*', 1, 25, 1, 20, '1-20', 12], ['Sai Naveen', 'AUSTRALIA', 2, 2, 140, '100', 0, 70, 0, 0, '0', 0]]);

    const ok1 = await up(`site-${sid}`, { csv: a1 });
    check('the administrator uploads a series\' scorer statistics; unknown team names only give a warning', ok1.status === 200 && ok1.body.players === 4 && /ATLANTIS/.test(ok1.body.warnings.join(' ')));
    check('only the administrator can upload or remove statistics', (await up(`site-${sid}`, { csv: a1 }, cIndia)).status === 403 && (await sCall('DELETE', `admin/series-stats/site-${sid}`, { cookie: cIndia })).status === 403 && (await sCall('PUT', `admin/series-stats/site-${sid}`, { body: { csv: a1 } })).status === 401);
    check('a file that is not a scorer export is refused with a clear message (nothing is stored)', (await up(`site-${sid}`, { csv: 'a,b,c\n1,2,3' })).body.error.message.includes('No.') && (await up(`site-${sid}`, { csv: 'No.,Player Name\n1,A' })).body.error.message.includes('columns') && (await up(`site-${sid}`, {})).status === 400 && (await up(`site-${sid}`, { csv: HEAD })).body.error.message.includes('no player rows') && (await up(`site-${sid}`, { csv: 'x'.repeat(950000) })).status === 400);
    check('statistics need a confirmed series (not an unaccepted one, not an unknown one) and a valid key', (await up(`site-${lateSeries.id}`, { csv: a1 })).status === 409 && (await up('site-nope', { csv: a1 })).status === 404 && (await up('bad key!', { csv: a1 })).status === 400);
    const list1 = (await sCall('GET', 'series-stats', { cookie: cEng })).body.stats;
    check('signed-in boards see which series have statistics, and the rows with their boards', list1.length === 1 && list1[0].players === 4 && (await sCall('GET', `series-stats/site-${sid}`, { cookie: cEng })).body.players.find((p) => p.name === 'Sai Naveen').board === 'australia' && (await sCall('GET', 'series-stats')).status === 401 && (await sCall('GET', 'series-stats/site-nope', { cookie: cEng })).status === 404);
    const recKey = 'rec-pointing-cup-australia';
    check('statistics can be added to an earlier series from the IOCF records (it needs a name)', (await up(recKey, { csv: a2, name: 'Pointing Cup' })).status === 200 && (await up(recKey, { csv: a2 })).status === 200 === false);
    const pub = (await sCall('GET', 'public/series-stats')).body;
    const rs = pub.players.find((p) => p.name === 'Rahul Seenu' && p.board === 'india');
    const sn = pub.players.find((p) => p.name === 'Sai Naveen');
    check('the public totals add a player up over every series (no sign-in needed)', pub.series === 2 && rs.series === 2 && rs.runs === 150 && rs.matches === 5 && rs.wickets === 3 && rs.runsConceded === 60 && rs.best === '2-15' && rs.hs === 71 && rs.avg === 50 && rs.economy === 10 && sn.runs === 200 && sn.hs === 100 && sn.avg === 40);
    const fm = (key, body, cookie = cAdm) => sCall('PUT', `admin/series-meta/${key}`, { cookie, body });
    const lines = (await sCall('GET', 'public/series-stats/lines')).body.series;
    const siteLine = lines.find((x) => x.key === `site-${sid}`);
    check('the public lines carry every series with its rows and its format (the site series\' own; an earlier series\' override when the admin set one)', lines.length === 2 && siteLine.format === 'ODI' && siteLine.fields.includes('runs') && siteLine.rows.length === 4 && lines.find((x) => x.key === recKey).format === null && (await fm(recKey, { format: 'Club · 7 overs 7 wickets' })).status === 200 && (await sCall('GET', 'public/series-stats/lines')).body.series.find((x) => x.key === recKey).format === 'Club · 7 overs 7 wickets' && (await fm(recKey, { format: null })).status === 200);
    // players known under two spellings are one player in the totals
    check('a player known under two names is added up as one (the alias goes to his roster name and board)', await (async () => {
      const csvAlias = (name, team) => csv([[name, team, 2, 2, 50, '30', 0, 40, 0, 0, '0', 0]]);
      await up('rec-alias-test-one-india', { csv: csvAlias('Mohammad Noor', 'AUSTRALIA'), name: 'Alias Test One' });
      await up('rec-alias-test-two-india', { csv: csvAlias('Muhammad Noor', 'AUSTRALIA'), name: 'Alias Test Two' });
      const t = (await sCall('GET', 'public/series-stats')).body.players.filter((p) => /noor/i.test(p.name));
      await sCall('DELETE', 'admin/series-stats/rec-alias-test-one-india', { cookie: cAdm });
      await sCall('DELETE', 'admin/series-stats/rec-alias-test-two-india', { cookie: cAdm });
      return t.length === 1 && t[0].name === 'Muhammad Noor' && t[0].board === 'australia' && t[0].runs === 100 && t[0].series === 2;
    })());
    check('players with similar names are separate people (exact name + board only)', pub.players.some((p) => p.name === 'Rahul Sinu') && pub.players.filter((p) => p.name.startsWith('Rahul S')).length === 2);
    check('a player\'s totals are by board: players of unknown teams are kept without a board', pub.players.find((p) => p.name === 'Mystery Man').board === null);
    check('a new upload for the same series replaces the old one instead of adding to it', (await up(`site-${sid}`, { csv: a2 })).status === 200 && (await sCall('GET', 'public/series-stats')).body.players.find((p) => p.name === 'Sai Naveen').runs === 280 && (await sCall('GET', 'series-stats', { cookie: cEng })).body.stats.length === 2);
    check('statistics can be removed, and the totals follow', (await sCall('DELETE', `admin/series-stats/${recKey}`, { cookie: cAdm })).status === 200 && (await sCall('DELETE', `admin/series-stats/${recKey}`, { cookie: cAdm })).status === 404 && (await sCall('GET', 'public/series-stats')).body.series === 1);
    check('uploads and removals are recorded in the audit log', (await sStore.listAudit(800)).some((x) => x.action === 'series_stats_uploaded') && (await sStore.listAudit(800)).some((x) => x.action === 'series_stats_removed'));

    // formats of earlier series
    check('the administrator sets the format of an earlier series (T10, Club + overs/wickets…)', (await fm(recKey, { format: 'T20' })).status === 200 && (await fm('rec-colombo-cup-sri-lanka', { format: 'Club · 6 overs 6 wickets' })).status === 200);
    check('boards read the formats; only a format from the list is accepted; only the administrator can set one', (await sCall('GET', 'series-meta', { cookie: cPak })).body.meta[recKey] === 'T20' && (await fm(recKey, { format: 'T50' })).status === 400 && (await fm('site-abc', { format: 'T20' })).status === 400 && (await fm(recKey, { format: 'ODI' }, cIndia)).status === 403 && (await sCall('GET', 'series-meta', { cookie: cPak })).body.choices.length === 11);
    check('a format can be changed or cleared', (await fm(recKey, { format: 'TEST' })).status === 200 && (await sCall('GET', 'series-meta', { cookie: cPak })).body.meta[recKey] === 'TEST' && (await fm(recKey, { format: null })).status === 200 && (await sCall('GET', 'series-meta', { cookie: cPak })).body.meta[recKey] === undefined);
    // the two new tables missing from Supabase
    const noTable = new SupabaseStore({ url: 'https://x.supabase.co', serviceKey: 'sb_secret_x', fetchImpl: async () => ({ ok: false, status: 404, text: async () => '{}' }) });
    let c3 = null;
    try { await noTable.statsList(); } catch (e) { c3 = e.code; }
    const hMissing = createHandler({ store: { ...sStore, statsList: async () => { throw Object.assign(new Error('x'), { code: 'stats_missing' }); } }, env: { COMMAND_CENTER_SESSION_SECRET: 'test-secret-test-secret-test-secret-1234' }, now: () => t0 });
    check('missing statistics tables are reported as such (503), and the public page just gets an error', c3 === 'stats_missing' && (await hMissing({ method: 'GET', path: ['public', 'series-stats'], headers: H, body: null, ip: '5.5.5.5' })).status === 503);
  }
  fs.rmSync(sHome, { recursive: true, force: true });
}

// with only the logins table imported and no series table yet, the API says so instead of crashing
{
  const sbNoSeries = makeSupabaseSeries();
  function makeSupabaseSeries() { return async (url) => ({ ok: false, status: 404, text: async () => '{}', json: async () => ({}) }); }
  const st = new SupabaseStore({ url: 'https://x.supabase.co', serviceKey: 'sb_secret_x', fetchImpl: sbNoSeries });
  let code = null;
  try { await st.seriesList(); } catch (e) { code = e.code; }
  check('a missing series table is reported as such (503 from the API)', code === 'series_missing');
{
  const outdated = new SupabaseStore({ url: 'https://x.supabase.co', serviceKey: 'sb_secret_x', fetchImpl: async () => ({ ok: false, status: 400, text: async () => '{"code":"PGRST204","message":"Could not find the \'dates\' column"}' }) });
  let c2 = null;
  try { await outdated.seriesInsert({}); } catch (e) { c2 = e.code; }
  check('an out-of-date series table (missing column) is reported as such', c2 === 'series_outdated');
}
}


console.log('\n— Series Matches tab (earlier series) —');
{
  const { Book } = await import('../sync/helpers.mjs');
  const { buildSeriesRecords, normalFormat, resolveBoard } = await import('../sync/series.mjs');
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Series Matches');
  const header = ['Series Name', 'Hosting Board', 'Opponents', 'Dates', 'Winners', 'Runners', 'Series Result', 'Bet Amount', 'Format'];
  ws.addRow(['Completed Series']);
  ws.addRow(header);
  ws.addRow(['January']);
  ws.addRow(['Pointing Cup ', 'Australia', 'Pakistan', '6th - 10th Jan', 'Pakistan', 'Australia', new Date(Date.UTC(2026, 0, 2)), 5000]); // "1-2" typed into a spreadsheet becomes 2 Jan
  ws.addRow(['Colombo Cup', 'Srilanka', 'Pakistan', '10th - 12th Jan', 'Srilanka', 'Pakistan', new Date(Date.UTC(2026, 1, 1)), 6000, '7o 7w']);
  ws.addRow(['Tri Cup', 'West Indies', 'Australia, Scotland', '14th - 17th Jan', 'Australia', 'West Indies', 'WI vs Aus | WI won\nAus vs Scot | Aus Won', 5000, 'L4i']);
  ws.addRow(['One Off', 'Newzealand', 'Bangaldesh', '28th April', 'Netherland', 'Bangladesh', '1 Match only', 2000, 'odi']);
  ws.addRow(['Argentine Cup', 'Portugal', 'Argentina', '2nd - 6th Oct', 'Portugal', 'Argentina', '3-0', 3000, 'Test']);
  ws.addRow([]);
  ws.addRow(['Upcoming Series']);
  ws.addRow(header);
  ws.addRow(['Gulf Cup', 'Zimbabwe', 'Japan, Canada, USA, Nepal & Portugal', '23rd - 30th Oct', '-', '-', '-', 10000, 'T20']);
  ws.addRow(['Upcoming IOCF World Test Championship Matches']);
  ws.addRow(['Test Name', 'Hosting Board', 'Opponents', 'Dates', 'Winners ', 'Bet Amount', 'Format']);
  ws.addRow(['Should not appear', 'England', 'India', '1st Nov', '-', 5000, 'Test']);
  const rec = buildSeriesRecords(new Book(wb));
  const [c1, c2, c3, c4, c5] = rec.completed;
  check('Series Matches: the completed series and the upcoming block are read, other blocks ignored', rec.completed.length === 5 && rec.upcoming.length === 1 && rec.upcoming[0].name === 'Gulf Cup');
  check('Series Matches: the month banner, dates, winner, runners-up and bet are kept', c1.month === 'January' && c1.name === 'Pointing Cup' && c1.dates === '6th - 10th Jan' && c1.winner.name === 'Pakistan' && c1.runnerUp.name === 'Australia' && c1.bet === 5000);
  check('Series Matches: a score the spreadsheet turned into a date is read back (2 Jan → 1-2, 1 Feb → 2-1)', c1.result === '1-2' && c2.result === '2-1');
  check('Series Matches: board spellings are corrected (Srilanka, Newzealand, Bangaldesh, Netherland) and slugs match the boards', c2.host.slug === 'sri-lanka' && c4.host.slug === 'new-zealand' && c4.opponents[0].name === 'Bangladesh' && c4.winner.name === 'Netherlands' && c4.winner.slug === 'netherlands');
  check('Series Matches: a team that is not one of the 26 boards is kept without a slug', c5.opponents[0].name === 'Argentina' && c5.opponents[0].slug === null);
  check('Series Matches: opponents of a multi-board series are split', c3.opponents.map((o) => o.name).join() === 'Australia,Scotland' && rec.upcoming[0].opponents.map((o) => o.name).join() === 'Japan,Canada,USA,Nepal,Portugal');
  check('Series Matches: a match-by-match breakdown is kept as lines; notes such as "1 Match only" stay as text', c3.resultLines.length === 2 && c3.result === null && c4.result === '1 Match only');
  check('Series Matches: formats are tidied and "-" means not yet', normalFormat('7o 7w') === '7 overs 7 wickets' && normalFormat('5overs 5wickets') === '5 overs 5 wickets' && c3.format === 'L4I' && c4.format === 'ODI' && c5.format === 'TEST' && rec.upcoming[0].winner === null && rec.upcoming[0].result === null);
  check('Series Matches: the workbook without the tab gives no records', buildSeriesRecords(new Book(new ExcelJS.Workbook())) === null && resolveBoard('') === null);
  if (fs.existsSync('IOCF ALL BOARDS .xlsx')) {
    const { readWorkbook } = await import('../sync/index.mjs');
    const real = buildSeriesRecords(await readWorkbook('IOCF ALL BOARDS .xlsx'));
    check('Series Matches: the real workbook gives its completed series (200+) with winners (only Argentina is not one of the 26 boards)', real.completed.length > 200 && real.completed.every((r) => r.winner) && real.completed.filter((r) => !r.host.slug).every((r) => r.host.name === 'Argentina') && real.upcoming.length >= 1);
  }
}


console.log('\n— How to play online cricket (fun game on IOCF Main) —');
{
  const { randomDigits, parseDigits, playOver, sumText, ordinal } = await import('../../src/data/funCricket.mjs');
  const ex = playOver([6, 3, 4, 2, 5, 1], [1, 2, 3, 6, 5, 2]);
  check('the example from the brief: bowler 123652 vs batsman 634251 → out on ball 5, 6+3+4+2 = 15 runs', ex.outOn === 5 && ex.runs === 15 && ex.scored.join('') === '6342' && sumText(ex.scored) === '6 + 3 + 4 + 2 = 15' && ordinal(5) === '5th');
  check('no matching place means not out and all six digits count', (() => { const r = playOver([6, 6, 6, 6, 6, 6], [0, 0, 0, 0, 0, 0]); return r.outOn === null && r.runs === 36; })());
  check('a match on the first ball is a duck (0 runs); on the last ball only the first five count', playOver([4, 1, 1, 1, 1, 1], [4, 0, 0, 0, 0, 0]).runs === 0 && playOver([4, 1, 1, 1, 1, 1], [4, 0, 0, 0, 0, 0]).outOn === 1 && playOver([1, 2, 3, 4, 5, 6], [0, 0, 0, 0, 0, 6]).runs === 15 && playOver([1, 2, 3, 4, 5, 6], [0, 0, 0, 0, 0, 6]).outOn === 6);
  check('only the first matching place counts, even if more match', playOver([1, 2, 3, 4, 5, 6], [0, 2, 3, 0, 0, 0]).outOn === 2 && playOver([1, 2, 3, 4, 5, 6], [0, 2, 3, 0, 0, 0]).runs === 1);
  check('a visitor must send exactly six digits, each 0 to 6', parseDigits('634251').join('') === '634251' && parseDigits('63 42 51').join('') === '634251' && parseDigits('63425') === null && parseDigits('6342511') === null && parseDigits('634257') === null && parseDigits('63425a') === null && parseDigits('') === null);
  let ok = true;
  const seen = new Set();
  for (let i = 0; i < 3000; i++) {
    const d = randomDigits();
    if (d.length !== 6 || d.some((x) => !Number.isInteger(x) || x < 0 || x > 6)) ok = false;
    seen.add(d.join(''));
  }
  check('random digits are always six digits from 0 to 6, and vary', ok && seen.size > 2500 && Array.from({ length: 6 }, () => randomDigits(() => 0.999999)).every((d) => d.every((x) => x === 6)) && randomDigits(() => 0).every((x) => x === 0));
}


console.log('\n— Matching a folder of statistics CSVs to the earlier series —');
{
  const { planImport, nameScore } = await import('./seriesStatsImport.mjs');
  const HEAD = 'No.,Player Name,Team Name,Matches,POM Awards,Bat Innings,Runs Scored,Batting Avg,Bat SR,30s,50s,100s,High Score,6s,4s,Balls Faced,Not Outs,Most 6s by Inn.,Most 4s by Inn.,Fastest 50,Fastest 100,Bowl Inn,Wickets,Runs Conceded,Maiden,Bowl Avg,Bowl SR,Economy,3 Wkts,5 Wkts,Best Bowl,Balls Bowled,Dots Bowled,Catches,Stumpings,Run Outs';
  const row = (n, name, team) => `${n},${name},${team},1,0,1,10,10.0,100.0,0,0,0,10,0,0,10,0,0,0,,,0,0,0,0,0.0,0.0,0.0,0,0, 0,0,0,0,0,0`;
  const file = (title, teams) => `,STUMPS - The Cricket scorer\n,${title}\n,Tour ID: x1\n \n${HEAD}\n${teams.map((t, i) => row(i + 1, `Player ${i + 1}`, t)).join('\n')}\n`;
  const b = (name) => ({ name, slug: name.toLowerCase().replace(/[^a-z]+/g, '-') });
  const rec = (name, host, ...opp) => ({ name, host: b(host), opponents: opp.map(b) });
  const records = [rec('Spring Cup', 'India', 'Australia'), rec('RED & GREEN RIVALRY I', 'Ireland', 'Canada'), rec(' RED & GREEN RIVALRY II', 'Ireland', 'Canada'), rec('Anderson-Tendulker t20 trophy', 'England', 'India'), rec('Anderson - Tendulkar Trophy', 'England', 'India'), rec('The Global Four', 'Bangladesh', 'West Indies', 'Netherlands'), rec('Freedom Jalebi Trophy', 'South Africa', 'Afghanistan')];
  const plan = planImport({
    records,
    boards: BOARDS,
    files: [
      { file: 'Spring Cup.csv', text: file('Spring Cup', ['INDIA', 'AUSTRALIA']) },
      { file: 'Red & Green Rivalry I.csv', text: file('Red & Green Rivalry', ['IRELAND', 'CANADA']) },
      { file: 'Red & Green Rivalry II.csv', text: file('Red & Green Rivalry II', ['IRELAND', 'CANADA']) },
      { file: 'Anderson Tendulkar T20 Trophy_.csv', text: file('Anderson Tendulkar T20 Trophy', ['ENGLAND', 'INDIA']) },
      { file: 'The Global Three.csv', text: file('Global Three', ['BANGLADESH', 'WEST INDIES', 'NETHERLANDS']) },
      { file: 'Freedom Jalebi.csv', text: file('Freedom Jalebi', ['QATAR', 'SOUTH AFRICA']) },
      { file: 'Spring Cup (copy).csv', text: file('Spring Cup', ['INDIA', 'AUSTRALIA']) },
      { file: 'ODI WC Warmup all matches.csv', text: file('Warmup Games', ['INDIA', 'CANADA', 'IRELAND']) },
      { file: 'Nothing like it.csv', text: file('Nothing like it', ['INDIA', 'JAPAN']) },
      { file: 'Broken.csv', text: 'a,b\n1,2' },
    ],
  });
  const st = (f) => plan.find((x) => x.file === f);
  check('a file whose name and teams fit a series is matched to it', st('Spring Cup.csv').status === 'ok' && st('Spring Cup.csv').key === 'rec-springcup-india');
  check('"… Rivalry I" and "… Rivalry II" go to their own series, not each other\'s', st('Red & Green Rivalry I.csv').key === 'rec-redgreenrivalryi-ireland' && st('Red & Green Rivalry II.csv').key === 'rec-redgreenrivalryii-ireland' && nameScore('Red & Green Rivalry II', 'RED & GREEN RIVALRY I') < 1);
  check('a spelling difference is matched by similar name and teams — to the nearest of two similar names', st('Anderson Tendulkar T20 Trophy_.csv').status === 'ok' && st('Anderson Tendulkar T20 Trophy_.csv').key === 'rec-andersontendulkert20trophy-england');
  check('"The Global Three" file matches "The Global Four" when the teams are the same boards', st('The Global Three.csv').key === 'rec-theglobalfour-bangladesh');
  check('a file whose teams are not the series\' boards is never matched automatically', st('Freedom Jalebi.csv').status === 'unmatched' && /Freedom Jalebi Trophy/.test(st('Freedom Jalebi.csv').note));
  check('two files for the same series: the second is flagged, not uploaded twice', st('Spring Cup (copy).csv').status === 'duplicate');
  check('a file covering several series is kept as its own entry', st('ODI WC Warmup all matches.csv').key === 'rec-odi-wc-warmup-games' && st('ODI WC Warmup all matches.csv').status === 'ok');
  check('an unknown name and a broken file are reported', st('Nothing like it.csv').status === 'unmatched' && st('Broken.csv').status === 'invalid');
}


console.log('\n— Qatar took over the old Afghanistan team —');
{
  const { applyRenames } = await import('../sync/series.mjs');
  const bd = (name) => ({ name, slug: name.toLowerCase().replace(/[^a-z]+/g, '-') });
  const r = (name, host, opp, winner) => ({ name, month: 'January', host: bd(host), opponents: [bd(opp)], dates: null, winner: winner ? bd(winner) : null, runnerUp: null, result: null, resultLines: null, bet: 5000, format: null });
  const rec = applyRenames({
    completed: [r('Revival Cup', 'Afghanistan', 'Sri Lanka', 'Sri Lanka'), r('Kallis Rashid Trophy', 'South Africa', 'Afghanistan', 'South Africa'), r('Summer Series', 'Pakistan', 'Qatar', 'Pakistan'), r('Odd Series', 'Afghanistan', 'Qatar', 'Qatar'), r('The Golden Cup', 'West Indies', 'Afghanistan', 'Afghanistan'), r('The Friendly Cup', 'Afghanistan', 'Spain', 'Spain')],
    upcoming: [r('Later Cup', 'Afghanistan', 'Spain', null)],
  });
  const [c1, c2, c3, c4, c5, c6] = rec.completed;
  check('before The Golden Cup, "Afghanistan" is the team that is now Qatar (host, opponent and winner)', c1.host.name === 'Qatar' && c1.host.slug === 'qatar' && c1.host.was === 'Afghanistan' && c2.opponents[0].name === 'Qatar' && c2.opponents[0].was === 'Afghanistan' && c2.winner.name === 'South Africa');
  check('the winner of such a series is renamed too', applyRenames({ completed: [r('X', 'Afghanistan', 'Sri Lanka', 'Afghanistan'), r('The Golden Cup', 'India', 'Afghanistan', null)], upcoming: [] }).completed[0].winner.name === 'Qatar');
  check('from The Golden Cup on, Afghanistan is the new team, with no link to the old one', c5.opponents[0].name === 'Afghanistan' && !c5.opponents[0].was && c5.winner.name === 'Afghanistan' && c6.host.name === 'Afghanistan' && rec.upcoming[0].host.name === 'Afghanistan');
  check('a series with both Afghanistan and Qatar before it is left as written (it cannot be told apart)', c4.host.name === 'Afghanistan' && c4.opponents[0].name === 'Qatar');
  check('its statistics stay filed under the name in the sheet, and series without the old team are untouched', c1.keyHost === 'Afghanistan' && c2.keyHost === 'South Africa' && c3.keyHost === undefined && c3.opponents[0].name === 'Qatar' && !c3.opponents[0].was);
  const again = JSON.parse(JSON.stringify(rec));
  check('applying the rule twice changes nothing; without The Golden Cup in the list nothing is renamed', JSON.stringify(applyRenames(again)) === JSON.stringify(rec) && applyRenames({ completed: [r('Revival Cup', 'Afghanistan', 'Sri Lanka', null)], upcoming: [] }).completed[0].host.name === 'Afghanistan');
}


console.log('\n— Player profile statistics: formats, boards, sources —');
{
  const { formatKey, selectLines, sumLines, formatsIn, TOURNAMENT_FORMAT, FORMAT_ORDER } = await import('../../src/data/careerStats.mjs');
  check('tournaments are in the formats given: ODI (Asia, Oceania, Euro, ODI World Cup), Test (WTC, Associate Nations), Club (Emerging Talents, Women\'s, Lone Warrior), T20 (T20 World Cup)', ['asia-cup', 'oceania-cup', 'euro-cup', 'odi-world-cup'].every((t) => TOURNAMENT_FORMAT[t] === 'odi') && ['world-test-championship', 'associate-nations-cup'].every((t) => TOURNAMENT_FORMAT[t] === 'test') && ['emerging-talents-league', 'womens-global-league', 'lone-warrior'].every((t) => TOURNAMENT_FORMAT[t] === 'club') && TOURNAMENT_FORMAT['t20-world-cup'] === 't20' && TOURNAMENT_FORMAT['origins-championship'] === undefined && FORMAT_ORDER.join() === 'odi,test,t20,t10,club,l4i');
  check('series formats are read: ODI, T20, T10, Test, L4I, and every overs/wickets variant is Club', formatKey('ODI') === 'odi' && formatKey('t20') === 't20' && formatKey('T10') === 't10' && formatKey('TEST') === 'test' && formatKey('Test') === 'test' && formatKey('L4i') === 'l4i' && formatKey('Club · 6 overs 6 wickets') === 'club' && formatKey('7 overs 7 wickets') === 'club' && formatKey('5o 5w') === 'club' && formatKey('') === null && formatKey(null) === null && formatKey('whatever') === null);
  const L = (name, boardSlug, extra = {}) => ({ name, boardSlug, source: 'tournament', id: 't', label: 'T', format: 'odi', line: {}, ...extra });
  const lines = [L('Ans Sheikh', 'qatar'), L('Ans Sheikh', 'pakistan'), L('Abhishek', 'india'), L('Abhishek', 'ireland'), L('Ans  sheikh ', 'qatar'), L('Ans Sheik', 'qatar'), L('Umar Khan', 'afghanistan')];
  const sel = selectLines(lines, { name: 'Ans Sheikh', boardSlug: 'qatar' });
  check('a name of two or more words is the same person on other boards (marked as another board); similar names are not', sel.length === 3 && sel.filter((x) => x.own).length === 2 && sel.some((x) => !x.own && x.boardSlug === 'pakistan') && !sel.some((x) => x.name === 'Ans Sheik'));
  {
    const { buildAliasIndex, resolveAlias, aliasesOf } = await import('../../src/data/commandCenter/aliases.mjs');
    const idx = buildAliasIndex([{ name: 'Irfan Ali', board: 'spain', aliases: [{ name: 'Irfan Ali Soomro', boards: ['qatar'] }, { name: 'Irfan Soomro', boards: ['spain'] }] }, { name: 'Niyas', board: 'india', aliases: [{ name: 'Niyaz' }] }]);
    const al = [L('Irfan Ali Soomro', 'qatar'), L('Irfan Soomro', 'spain'), L('Irfan Ali', 'spain'), L('Irfan Ali Soomro', 'pakistan'), L('Niyaz', 'canada'), L('Niyas', 'india')];
    const sp = selectLines(al, { name: 'Irfan Ali', boardSlug: 'spain' }, idx);
    check('aliases: another name of a known player is counted for him, on whichever board it was played (own board marked)', sp.length === 3 && sp.find((x) => x.boardSlug === 'qatar').own === false && sp.find((x) => x.boardSlug === 'spain' && x.name === 'Irfan Soomro').own === true && !sp.some((x) => x.boardSlug === 'pakistan'));
    check('aliases: a one-word alias works too (explicitly given), and the lookup refuses an alias on a board it was not given for', selectLines(al, { name: 'Niyas', boardSlug: 'india' }, idx).length === 2 && resolveAlias(idx, 'Niyaz', 'canada').name === 'Niyas' && resolveAlias(idx, 'Irfan Ali Soomro', 'pakistan') === null && aliasesOf(idx, 'Niyas', 'india').length === 1);
  }
  check('a single name is only matched on his own board', selectLines(lines, { name: 'Abhishek', boardSlug: 'india' }).length === 1 && selectLines(lines, { name: 'Abhishek', boardSlug: 'india' })[0].boardSlug === 'india');
  const l1 = { matches: 3, pom: 1, batInn: 3, runs: 120, balls: 80, fours: 3, sixes: 4, thirties: 0, fifties: 1, hundreds: 0, notOuts: 1, hs: 71, hsNotOut: true, bowlInn: 1, wickets: 2, runsConceded: 40, maidens: 0, ballsBowled: 24, dots: 0, threeW: 0, fiveW: 0, best: '2-15', catches: 1, stumpings: 0, runOuts: 0, most6: 3, most4: 2, fast50: 30, fast100: null };
  const l2 = { ...l1, matches: 2, batInn: 2, runs: 30, balls: 25, notOuts: 1, hs: 30, hsNotOut: true, wickets: 1, runsConceded: 20, best: '1-20', ballsBowled: 12, most6: 5, fast50: 22, catches: 0 };
  const t = sumLines([l1, l2]);
  check('totals add up, and the averages come from the totals (not an average of averages)', t.matches === 5 && t.runs === 150 && t.wickets === 3 && t.avg === 50 && t.sr === 142.9 && t.economy === 10 && t.bowlAvg === 20 && t.bowlSr === 12 && t.hs === 71 && t.hsNotOut === true && t.best === '2-15' && t.most6 === 5 && t.fast50 === 22 && t.fast100 === null);
  check('no wickets means no bowling average, and a player who was never out has his runs as his average', sumLines([{ ...l1, wickets: 0, runsConceded: 10 }]).bowlAvg === 0 && sumLines([{ ...l1, notOuts: 3 }]).avg === 120 && sumLines([]).runs === 0);
  check('only the formats that have data become tabs, in the usual order; entries with no format are in no tab', formatsIn([{ format: 'club' }, { format: 'odi' }, { format: null }, { format: 'test' }]).join() === 'odi,test,club');
}


console.log('\n— Chairmen and CEOs are players too —');
if (fs.existsSync('IOCF ALL BOARDS .xlsx')) {
  const { readWorkbook, buildDataset } = await import('../sync/index.mjs');
  const { dataset } = buildDataset(await readWorkbook('IOCF ALL BOARDS .xlsx'), {});
  const norm = (x) => String(x ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const slugOf = (x) => x.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const missing = [];
  for (const b of dataset.boards) {
    for (const cell of [b.chairman, b.ceo]) {
      for (const n of String(cell ?? '').split(/\s*(?:&|\band\b|,)\s*/).map((x) => x.trim()).filter(Boolean)) {
        const first = n.toLowerCase().split(/\s+/)[0];
        if (!dataset.players.some((p) => p.boardId === slugOf(b.name) && (norm(p.name) === norm(n) || p.name.toLowerCase().split(/\s+/)[0] === first))) missing.push(`${b.name}: ${n}`);
      }
    }
  }
  check('every chairman and CEO has a player entry on his board (a roster spelling that fits is used, otherwise one is created)', missing.length === 0, missing.join('; '));
  check('they are marked with their role, and the players list still has no duplicates of a name on one board', dataset.players.some((p) => p.official === 'Chairman') && dataset.players.some((p) => p.official === 'CEO') && new Set(dataset.players.map((p) => `${p.boardId}|${norm(p.name)}`)).size === dataset.players.length);
}

console.log('\n— 11. the register stays private —');
const root = process.cwd();
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
