// Creates a Command Center login and prints the line to paste into src/data/accounts.ts.
//
//   npm run account -- admin <username> [password]
//   npm run account -- board <username> "<Board name>" [password]
//
// Without a password a strong random one is generated and printed once. Only the salted hash goes into the code.
import { pbkdf2Sync, randomBytes } from 'node:crypto';

const ITERATIONS = 120000; // keep in step with src/data/access.ts
const [role, username, ...rest] = process.argv.slice(2);
if (!['admin', 'board'].includes(role) || !username) {
  console.error('Usage: npm run account -- admin <username> [password]\n       npm run account -- board <username> "<Board name>" [password]');
  process.exit(1);
}
const board = role === 'board' ? rest.shift() : undefined;
if (role === 'board' && !board) {
  console.error('A board login needs the board name, e.g. "India".');
  process.exit(1);
}
const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
const generated = [...randomBytes(16)].map((b) => alphabet[b % alphabet.length]).join('');
const password = rest[0] ?? generated;
const salt = randomBytes(16).toString('hex');
const hash = pbkdf2Sync(password, Buffer.from(salt, 'hex'), ITERATIONS, 32, 'sha256').toString('hex');

console.log('\nAdd this to the list in src/data/accounts.ts:\n');
console.log(`  { role: '${role}', username: '${username}',${board ? ` board: '${board}',` : ''} salt: '${salt}', hash: '${hash}' },`);
console.log(`\nUsername: ${username}\nPassword: ${password}${rest[0] ? '' : '   (generated — shown only now)'}\n`);
