/**
 * @jest-environment node
 */

/**
 * The linking rule, which is the only thing standing between "anyone can register a Clerk account
 * claiming any email" and "anyone can take over any merchant's store".
 *
 * The database module is mocked the way the neighbouring API suites do it — importing it for real
 * pulls in `pg`. The Clerk profile fetch is injected rather than mocked: `resolveUserByClerkId`
 * takes the fetcher as a parameter for exactly this reason, since no Clerk key and no egress to
 * clerk.com exist in CI or in a session container.
 */

jest.mock('../../database/connection', () => ({
  db: { query: jest.fn(), transaction: jest.fn(), initialize: jest.fn() },
}));

import { db } from '@/lib/database/connection';
import {
  ClerkUserLinkError,
  NO_PASSWORD_SENTINEL,
  resolveUserByClerkId,
  type ClerkProfile,
} from '@/lib/auth/clerk-user';

/** `@types/jest` is not a dependency here, so use the value type. */
type Mock = ReturnType<typeof jest.fn>;
const mockQuery = db.query as unknown as Mock;

const CLERK_ID = 'user_2abcdef';

const PROFILE: ClerkProfile = {
  email: 'merchant@example.com',
  firstName: 'Mer',
  lastName: 'Chant',
};

/** The joined row `selectByClerkId` reads. */
const LINKED_ROW = {
  id: '11111111-1111-1111-1111-111111111111',
  email: PROFILE.email,
  first_name: 'Mer',
  last_name: 'Chant',
  store_id: '22222222-2222-2222-2222-222222222222',
  store_slug: 'chantry',
  store_name: 'Chantry',
};

/** A fetcher that hands back a fixed profile, standing in for Clerk. */
const fetchProfile = async (): Promise<ClerkProfile> => PROFILE;

describe('resolveUserByClerkId', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns the linked user without touching Clerk', async () => {
    const fetcher = jest.fn();
    mockQuery.mockResolvedValueOnce({ rows: [LINKED_ROW] });

    const session = await resolveUserByClerkId(CLERK_ID, fetcher as never);

    expect(session).toEqual({
      userId: LINKED_ROW.id,
      email: LINKED_ROW.email,
      firstName: 'Mer',
      lastName: 'Chant',
      storeId: LINKED_ROW.store_id,
      storeSlug: 'chantry',
      storeName: 'Chantry',
    });
    expect(fetcher).not.toHaveBeenCalled();
    // userId is our UUID. The Clerk id must never leak into a session.
    expect(session.userId).not.toContain('user_');
  });

  it('provisions a row when the Clerk account is new to us', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] }) // no linked row
      .mockResolvedValueOnce({ rows: [] }) // no row on that email
      .mockResolvedValueOnce({ rows: [] }) // the insert
      .mockResolvedValueOnce({ rows: [LINKED_ROW] }); // re-select

    const session = await resolveUserByClerkId(CLERK_ID, fetchProfile);
    expect(session.userId).toBe(LINKED_ROW.id);

    const insert = mockQuery.mock.calls[2] as [string, unknown[]];
    expect(insert[0]).toContain('INSERT INTO users');
    expect(insert[1]).toEqual([
      PROFILE.email,
      NO_PASSWORD_SENTINEL,
      'Mer',
      'Chant',
      CLERK_ID,
    ]);
  });

  it('refuses to auto-link an existing row that carries no Clerk id', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: LINKED_ROW.id, clerk_user_id: null }] });

    await expect(resolveUserByClerkId(CLERK_ID, fetchProfile)).rejects.toMatchObject({
      name: 'ClerkUserLinkError',
      reason: 'email_unlinked',
    });
    // Refused *before* any write.
    expect(mockQuery).toHaveBeenCalledTimes(2);

    // And the message names the one tool that can make the link deliberately.
    mockQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: LINKED_ROW.id, clerk_user_id: null }] });
    await expect(resolveUserByClerkId(CLERK_ID, fetchProfile)).rejects.toThrow(
      /import-users-to-clerk/
    );
  });

  it('refuses when the address belongs to a different Clerk account', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: LINKED_ROW.id, clerk_user_id: 'user_someoneelse' }] });

    await expect(resolveUserByClerkId(CLERK_ID, fetchProfile)).rejects.toMatchObject({
      reason: 'email_linked_elsewhere',
    });
    expect(mockQuery).toHaveBeenCalledTimes(2);
  });

  it('refuses to link when case-variant rows share the address, rather than guessing rows[0]', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] }) // no linked row
      .mockResolvedValueOnce({
        rows: [
          { id: LINKED_ROW.id, clerk_user_id: null },
          { id: 'other-uuid', clerk_user_id: null },
        ],
      });

    await expect(resolveUserByClerkId(CLERK_ID, fetchProfile)).rejects.toMatchObject({
      reason: 'email_linked_elsewhere',
    });
    // Refused at the lookup — no INSERT attempted.
    expect(mockQuery).toHaveBeenCalledTimes(2);
  });

  it('propagates a refusal from the profile fetch, and writes nothing', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const unverified = async (): Promise<ClerkProfile> => {
      throw new ClerkUserLinkError('unverified_email', 'no verified primary email');
    };

    await expect(resolveUserByClerkId(CLERK_ID, unverified)).rejects.toMatchObject({
      reason: 'unverified_email',
    });
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });

  it('re-reads the winner when two requests provision the same user at once', async () => {
    const raced = Object.assign(new Error('duplicate key'), { code: '23505' });
    mockQuery
      .mockResolvedValueOnce({ rows: [] }) // no linked row
      .mockResolvedValueOnce({ rows: [] }) // no row on that email — yet
      .mockRejectedValueOnce(raced) // the other request got there first
      .mockResolvedValueOnce({ rows: [LINKED_ROW] }); // its row

    await expect(resolveUserByClerkId(CLERK_ID, fetchProfile)).resolves.toMatchObject({
      userId: LINKED_ROW.id,
    });
  });

  it('refuses when the race was lost to a row linked to somebody else', async () => {
    const raced = Object.assign(new Error('duplicate key'), { code: '23505' });
    mockQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockRejectedValueOnce(raced)
      .mockResolvedValueOnce({ rows: [] }); // still nothing linked to us

    await expect(resolveUserByClerkId(CLERK_ID, fetchProfile)).rejects.toMatchObject({
      reason: 'email_unlinked',
    });
  });
});
