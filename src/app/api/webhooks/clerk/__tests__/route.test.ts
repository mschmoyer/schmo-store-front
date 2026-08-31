/**
 * @jest-environment node
 */

/**
 * The Clerk webhook: unconfigured, unsigned, and the three events it acts on.
 *
 * `svix` is published ESM-only and `next/jest` hard-codes `/node_modules/` into
 * `transformIgnorePatterns`, so it cannot be loaded here. The stub below is not a rubber stamp: it
 * implements the Standard Webhooks HMAC over `id.timestamp.body` with real `node:crypto`, which is
 * what makes the interesting assertions honest — a delivery signed with another secret is
 * rejected, and the route must hand the verifier the *raw* body it received rather than a
 * re-serialised copy. The cryptography itself is svix's problem; the plumbing is this route's.
 *
 * Only the database is mocked besides — importing it for real pulls in `pg`.
 */

jest.mock('../../../../../lib/database/connection', () => ({
  db: { query: jest.fn(), transaction: jest.fn(), initialize: jest.fn() },
}));

jest.mock('svix', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const crypto = require('node:crypto') as typeof import('node:crypto');

  /** Standard Webhooks: base64 HMAC-SHA256 of `id.timestamp.payload`, keyed by the raw secret. */
  function signature(secret: string, id: string, timestamp: string, payload: string): string {
    const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
    return crypto.createHmac('sha256', key).update(`${id}.${timestamp}.${payload}`).digest('base64');
  }

  class Webhook {
    private readonly secret: string;

    constructor(secret: string) {
      this.secret = secret;
    }

    sign(id: string, timestamp: Date, payload: string): string {
      const seconds = String(Math.floor(timestamp.getTime() / 1000));
      return `v1,${signature(this.secret, id, seconds, payload)}`;
    }

    verify(payload: string, headers: Record<string, string>): unknown {
      const id = headers['svix-id'];
      const timestamp = headers['svix-timestamp'];
      const expected = signature(this.secret, id, timestamp, payload);
      const provided = (headers['svix-signature'] ?? '')
        .split(' ')
        .map((part) => part.split(',')[1]);
      if (!id || !timestamp || !provided.includes(expected)) {
        throw new Error('No matching signature found');
      }
      return JSON.parse(payload);
    }
  }

  return { Webhook };
});

import { Webhook } from 'svix';
import { db } from '@/lib/database/connection';
import { POST } from '../route';

type Mock = ReturnType<typeof jest.fn>;
const mockQuery = db.query as unknown as Mock;

/** A syntactically valid Svix signing secret. Not a real one — nothing here reaches Clerk. */
const SECRET = 'whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw';

const CLERK_ID = 'user_2abcdef';

/** Build a signed delivery for `body`, exactly as Svix would. */
function signedRequest(body: unknown, secret = SECRET): Request {
  const payload = JSON.stringify(body);
  const id = 'msg_2abc';
  const timestamp = new Date();
  const signature = new Webhook(secret).sign(id, timestamp, payload);

  return new Request('https://example.com/api/webhooks/clerk', {
    method: 'POST',
    body: payload,
    headers: {
      'svix-id': id,
      'svix-timestamp': String(Math.floor(timestamp.getTime() / 1000)),
      'svix-signature': signature,
    },
  });
}

/** A `user.updated` payload with a verified primary address. */
function userEvent(type: string) {
  return {
    type,
    data: {
      id: CLERK_ID,
      primary_email_address_id: 'idn_1',
      email_addresses: [
        { id: 'idn_0', email_address: 'old@example.com', verification: { status: 'verified' } },
        { id: 'idn_1', email_address: 'New@Example.com', verification: { status: 'verified' } },
      ],
      first_name: 'Mer',
      last_name: 'Chant',
    },
  };
}

describe('POST /api/webhooks/clerk', () => {
  const savedSecret = process.env.CLERK_WEBHOOK_SIGNING_SECRET;

  beforeEach(() => {
    jest.clearAllMocks();
    mockQuery.mockResolvedValue({ rows: [], rowCount: 1 });
    process.env.CLERK_WEBHOOK_SIGNING_SECRET = SECRET;
  });

  afterEach(() => {
    if (savedSecret === undefined) delete process.env.CLERK_WEBHOOK_SIGNING_SECRET;
    else process.env.CLERK_WEBHOOK_SIGNING_SECRET = savedSecret;
  });

  it('returns a labelled 503 when the signing secret is not configured', async () => {
    delete process.env.CLERK_WEBHOOK_SIGNING_SECRET;

    const response = await POST(signedRequest(userEvent('user.updated')));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ error: expect.stringMatching(/not configured/i) });
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('rejects an unsigned delivery', async () => {
    const logged = jest.spyOn(console, 'error').mockImplementation(() => {});
    const response = await POST(
      new Request('https://example.com/api/webhooks/clerk', {
        method: 'POST',
        body: JSON.stringify(userEvent('user.updated')),
      })
    );

    expect(response.status).toBe(400);
    expect(mockQuery).not.toHaveBeenCalled();
    logged.mockRestore();
  });

  it('rejects a delivery signed with a different secret', async () => {
    const logged = jest.spyOn(console, 'error').mockImplementation(() => {});
    const response = await POST(
      signedRequest(userEvent('user.updated'), 'whsec_ZDZjNDgyZDFmMGY1ZTM4NzQ1YmYyZjEy')
    );

    expect(response.status).toBe(400);
    expect(mockQuery).not.toHaveBeenCalled();
    logged.mockRestore();
  });

  it('applies user.updated to the linked row, keyed on clerk_user_id', async () => {
    const response = await POST(signedRequest(userEvent('user.updated')));

    expect(response.status).toBe(200);
    const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('WHERE clerk_user_id = $1');
    expect(params).toEqual([CLERK_ID, 'new@example.com', 'Mer', 'Chant']);
  });

  it('does not write an unverified primary email, only the name', async () => {
    const event = userEvent('user.updated');
    event.data.email_addresses[1].verification = { status: 'unverified' };

    const response = await POST(signedRequest(event));

    expect(response.status).toBe(200);
    const [, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    // COALESCE keeps the existing email when the payload carries no verified primary.
    expect(params).toEqual([CLERK_ID, null, 'Mer', 'Chant']);
  });

  it('ignores an unverified address even when it is the primary id', async () => {
    const event = userEvent('user.updated');
    event.data.email_addresses = [
      { id: 'idn_1', email_address: 'attacker@evil.com', verification: { status: 'unverified' } },
    ];

    const response = await POST(signedRequest(event));

    expect(response.status).toBe(200);
    const [, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(params[1]).toBeNull();
  });

  it('clamps an over-long name so the write cannot 500 and loop Clerk retries', async () => {
    const event = userEvent('user.updated');
    event.data.first_name = 'x'.repeat(250);

    const response = await POST(signedRequest(event));

    expect(response.status).toBe(200);
    const [, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect((params[2] as string).length).toBe(100);
  });

  it('answers 200 when an email change collides, rather than making Clerk retry forever', async () => {
    mockQuery.mockRejectedValueOnce(Object.assign(new Error('duplicate key'), { code: '23505' }));
    const logged = jest.spyOn(console, 'error').mockImplementation(() => {});

    const response = await POST(signedRequest(userEvent('user.updated')));

    expect(response.status).toBe(200);
    expect(logged).toHaveBeenCalled();
    logged.mockRestore();
  });

  it('deactivates on user.deleted and never deletes the row', async () => {
    const response = await POST(
      signedRequest({ type: 'user.deleted', data: { id: CLERK_ID, deleted: true } })
    );

    expect(response.status).toBe(200);
    const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('is_active = FALSE');
    expect(sql).not.toMatch(/DELETE/i);
    expect(params).toEqual([CLERK_ID]);
  });

  it('acknowledges user.created without writing — provisioning is just-in-time', async () => {
    const info = jest.spyOn(console, 'info').mockImplementation(() => {});

    const response = await POST(signedRequest(userEvent('user.created')));

    expect(response.status).toBe(200);
    expect(mockQuery).not.toHaveBeenCalled();
    info.mockRestore();
  });

  it('acknowledges an event type it does not handle', async () => {
    const response = await POST(signedRequest({ type: 'session.created', data: { id: 'sess_1' } }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ handled: false });
    expect(mockQuery).not.toHaveBeenCalled();
  });
});
