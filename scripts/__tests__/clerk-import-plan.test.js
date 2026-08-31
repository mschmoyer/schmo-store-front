/**
 * @jest-environment node
 */

/**
 * The decisions `scripts/import-users-to-clerk.mjs` makes before it writes anything.
 *
 * The script itself cannot be exercised here — it needs a database, a Clerk secret and egress to
 * clerk.com, and a session container has none of them — but these rules are the part that decides
 * which rows are touched at all, including the offline half of the account-takeover guard.
 */

const { classifyUser, planLink } = require('../lib/clerk-import-plan');

/** A real bcrypt hash (of an arbitrary string), as `password.ts` writes them. */
const BCRYPT = '$2b$04$tAhHKfwFlrwJAonArthQLOnXLf6lzHm4QnfTm..TptNjehgGmbcam';

/** An importable row. */
function row(overrides = {}) {
  return {
    id: 'u1',
    email: 'merchant@example.com',
    password_hash: BCRYPT,
    clerk_user_id: null,
    is_active: true,
    ...overrides,
  };
}

describe('classifyUser', () => {
  it('imports an active, unlinked user with a real bcrypt hash', () => {
    expect(classifyUser(row())).toEqual({ action: 'import' });
  });

  it('skips the seed sentinel, which can never verify', () => {
    expect(classifyUser(row({ password_hash: '!' }))).toEqual({
      action: 'skip',
      reason: 'no-usable-password',
    });
  });

  it('skips anything that is not a bcrypt hash', () => {
    for (const hash of [null, '', 'plaintext', '$1$abc', BCRYPT.slice(0, 20)]) {
      expect(classifyUser(row({ password_hash: hash })).action).toBe('skip');
    }
  });

  it('skips a row that is already linked, so a re-run imports nobody twice', () => {
    expect(classifyUser(row({ clerk_user_id: 'user_abc' }))).toEqual({
      action: 'skip',
      reason: 'already-linked',
    });
  });

  it('skips deactivated users and rows with no address', () => {
    expect(classifyUser(row({ is_active: false })).reason).toBe('inactive');
    expect(classifyUser(row({ email: null })).reason).toBe('no-email');
  });
});

describe('planLink', () => {
  it('links an unlinked row', () => {
    expect(planLink({ id: 'u1', clerk_user_id: null }, 'user_abc')).toEqual({ action: 'link' });
  });

  it('is a no-op when the row already carries exactly that id', () => {
    expect(planLink({ id: 'u1', clerk_user_id: 'user_abc' }, 'user_abc')).toEqual({
      action: 'noop',
      reason: 'already-linked',
    });
  });

  it('refuses to re-point a row at a different Clerk account', () => {
    expect(planLink({ id: 'u1', clerk_user_id: 'user_other' }, 'user_abc')).toEqual({
      action: 'refuse',
      reason: 'linked-to-another-clerk-account',
    });
  });

  it('refuses an unknown address and a value that is not a Clerk id', () => {
    expect(planLink(null, 'user_abc').reason).toBe('no-such-user');
    expect(planLink({ id: 'u1', clerk_user_id: null }, 'abc').reason).toBe('not-a-clerk-user-id');
    expect(planLink({ id: 'u1', clerk_user_id: null }, '').reason).toBe('not-a-clerk-user-id');
  });
});
