import type { Account } from './access';

/**
 * Command Center logins: salted password hashes only, never the passwords.
 * Add one with `npm run account -- admin <username>` or `npm run account -- board <username> "<Board name>"`
 * and paste the line it prints here.
 */
export const accounts: Account[] = [
  { role: 'admin', username: 'admin', salt: '3c843655f697f5dfe43bf6d621e49958', hash: 'eeda71c25fed67611225dae96fe223bf5aec3b840963fd0fd22b5eaf1fe230c3' },
];
