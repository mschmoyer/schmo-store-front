'use strict';

/**
 * The decisions `scripts/import-users-to-clerk.mjs` makes, with no I/O.
 *
 * Separate from the script so they can be unit-tested: the import itself needs a database, a Clerk
 * secret and network egress, none of which exist in CI or in a Claude session container, but the
 * rules that decide *which rows are touched at all* are exactly the part worth pinning down. They
 * are also the part that enforces the linking rule (docs/plans/clerk-integration.md §3).
 *
 * CommonJS because the tests and the other `scripts/lib` helper are, and Node resolves these named
 * exports fine from the ESM script that consumes them.
 */

/**
 * A bcrypt hash, as `src/lib/auth/password.ts` writes them.
 *
 * The `'!'` sentinel that `seed-demo.js` and Clerk-native provisioning write fails this
 * deliberately: importing a row whose password can never verify would create a Clerk account
 * nobody can sign into, and would burn a Clerk MAU on an invented merchant.
 */
const BCRYPT_HASH = /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/;

/**
 * Decide what to do with one candidate user row.
 *
 * @param {{ id?: string, email?: string|null, password_hash?: string|null,
 *           clerk_user_id?: string|null, is_active?: boolean }} row - A `users` row.
 * @returns {{ action: 'import'|'skip', reason?: string }} `import` when the row can be created in
 *   Clerk; `skip` with a short, greppable reason otherwise.
 */
function classifyUser(row) {
  if (!row.is_active) return { action: 'skip', reason: 'inactive' };
  if (row.clerk_user_id) return { action: 'skip', reason: 'already-linked' };
  if (!row.email) return { action: 'skip', reason: 'no-email' };
  if (!row.password_hash || !BCRYPT_HASH.test(row.password_hash)) {
    return { action: 'skip', reason: 'no-usable-password' };
  }
  return { action: 'import' };
}

/**
 * Decide what `--link-owner` should do for one row.
 *
 * Refusing to re-point an existing link is the offline half of the account-takeover guard: this
 * script is the only place a link is ever made from an email address, and even here a row that
 * already belongs to a Clerk account is never handed to a different one.
 *
 * @param {{ id?: string, clerk_user_id?: string|null }|null} row - The row for the given email, or
 *   `null` when no user has that address.
 * @param {string} clerkUserId - The Clerk id to link.
 * @returns {{ action: 'link'|'noop'|'refuse', reason?: string }} `noop` when the row already
 *   carries exactly this id, so re-running the command is harmless.
 */
function planLink(row, clerkUserId) {
  if (!clerkUserId || !String(clerkUserId).startsWith('user_')) {
    return { action: 'refuse', reason: 'not-a-clerk-user-id' };
  }
  if (!row) return { action: 'refuse', reason: 'no-such-user' };
  if (row.clerk_user_id === clerkUserId) return { action: 'noop', reason: 'already-linked' };
  if (row.clerk_user_id) return { action: 'refuse', reason: 'linked-to-another-clerk-account' };
  return { action: 'link' };
}

module.exports = { classifyUser, planLink, BCRYPT_HASH };
