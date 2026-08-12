// The idempotency ledger is a database mechanism, so the driver is stubbed and the SQL that would
// run against Postgres is asserted directly. The logic under test - the claim/skip decision and the
// statement that enforces it - is real. (`jest.mock` specifiers must be relative; `next/jest` does
// not map the `@/` alias for them.)
jest.mock('../../database/connection', () => ({
  db: { query: jest.fn(), transaction: jest.fn(), initialize: jest.fn() },
}));

import { db } from '@/lib/database/connection';
import { asQueryMock } from '../test-support/query-mock';
import { claimWebhookEvent, markWebhookFailed, markWebhookHandled } from '../webhook-events';

const query = asQueryMock(db.query);

/** A Stripe event as the webhook route hands it to the ledger. */
const EVENT = {
  id: 'evt_1MqXyz2eZvKYlo2C',
  type: 'checkout.session.completed',
  apiVersion: '2026-07-29.dahlia',
  livemode: false,
  accountId: null,
  payload: { id: 'evt_1MqXyz2eZvKYlo2C', object: 'event' },
};

describe('webhook idempotency ledger', () => {
  beforeEach(() => {
    query.mockReset();
  });

  it('claims an event the first time it is delivered', async () => {
    query.mockResolvedValueOnce({
      rows: [{ id: 'ledger-1', attempts: 1, inserted: true }],
    });

    const claim = await claimWebhookEvent(EVENT);

    expect(claim).toEqual({
      status: 'claimed',
      recordId: 'ledger-1',
      attempt: 1,
      firstDelivery: true,
    });
  });

  it('skips a redelivery of an event that was already processed', async () => {
    // The ON CONFLICT ... WHERE clause filters the update out, so no row is returned.
    query.mockResolvedValueOnce({ rows: [] });

    const claim = await claimWebhookEvent(EVENT);

    expect(claim).toEqual({ status: 'duplicate' });
  });

  it('re-claims an event whose previous attempt failed, and counts the attempt', async () => {
    query.mockResolvedValueOnce({
      rows: [{ id: 'ledger-1', attempts: 2, inserted: false }],
    });

    const claim = await claimWebhookEvent(EVENT);

    expect(claim).toEqual({
      status: 'claimed',
      recordId: 'ledger-1',
      attempt: 2,
      firstDelivery: false,
    });
  });

  it('claims atomically: one statement, keyed on the unique event id', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: 'x', attempts: 1, inserted: true }] });

    await claimWebhookEvent(EVENT);

    expect(query).toHaveBeenCalledTimes(1);

    const [sql, params] = query.mock.calls[0] as [string, unknown[]];
    const normalized = sql.replace(/\s+/g, ' ');

    expect(normalized).toContain('INSERT INTO webhook_events');
    expect(normalized).toContain('ON CONFLICT (event_id) DO UPDATE');
    // Only a 'received' or 'failed' row may be re-claimed; 'processed'/'ignored' are terminal.
    expect(normalized).toContain("WHERE webhook_events.status IN ('received', 'failed')");
    expect(normalized).toContain('attempts = webhook_events.attempts + 1');
    expect(normalized).toContain('RETURNING id, attempts, (xmax = 0) AS inserted');

    expect(params[0]).toBe(EVENT.id);
    expect(params[1]).toBe(EVENT.type);
    expect(params[2]).toBe(EVENT.apiVersion);
    expect(params[3]).toBe(false);
  });

  it('serialises the payload for replay and tolerates a missing one', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: 'x', attempts: 1, inserted: true }] });
    await claimWebhookEvent(EVENT);
    expect((query.mock.calls[0] as [string, unknown[]])[1][5]).toBe(JSON.stringify(EVENT.payload));

    query.mockResolvedValueOnce({ rows: [{ id: 'y', attempts: 1, inserted: true }] });
    await claimWebhookEvent({ id: 'evt_2', type: 'invoice.paid' });
    expect((query.mock.calls[1] as [string, unknown[]])[1][5]).toBeNull();
  });

  it('marks a handled event terminal so a redelivery is skipped', async () => {
    query.mockResolvedValue({ rows: [] });

    await markWebhookHandled(EVENT.id, 'processed');
    await markWebhookHandled('evt_unknown_type', 'ignored');

    const first = query.mock.calls[0] as [string, unknown[]];
    const second = query.mock.calls[1] as [string, unknown[]];

    expect(first[0].replace(/\s+/g, ' ')).toContain('SET status = $2, processed_at = NOW()');
    expect(first[1]).toEqual([EVENT.id, 'processed']);
    expect(second[1]).toEqual(['evt_unknown_type', 'ignored']);
  });

  it('marks a failed event re-claimable and truncates the error', async () => {
    query.mockResolvedValue({ rows: [] });

    await markWebhookFailed(EVENT.id, 'x'.repeat(5000));

    const [sql, params] = query.mock.calls[0] as [string, unknown[]];
    expect(sql.replace(/\s+/g, ' ')).toContain("SET status = 'failed'");
    expect((params[1] as string).length).toBe(4000);
  });
});
