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
import { provision, resetCredentials, reveal, verifyRegister, readRegister, syncStatuses, REGISTER_FILE, PLAIN_FILE, backup, writePlain, importPlain, pushAccounts, applyCredentials, parseCredentialSheet, recordPassword } from './lib.mjs';

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
check('a password under 8 characters is refused', (await putLogin('uganda', { password: 'short' })).status === 400);
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
