/**
 * @jest-environment node
 */

/**
 * `syncSubscriptionFromCheckout`'s wiring: the subscription mirror sync, and the platform-coupon
 * redemption close-out layered on top of it.
 *
 * Everything this function's own module (`../route.ts`) imports transitively reaches
 * `@/lib/database/connection`, which pulls in `pg` and crashes under jsdom - hence `node`
 * environment (see the test notes this repo has burned other agents on) *and* a relative-path
 * `jest.mock` of the connection module as a second line of defense. `@/lib/billing/subscriptions`,
 * `@/lib/stripe/client` and the local `_lib/platform-coupon-redemption` module are mocked directly
 * so this test exercises only the wiring in `route.ts` - not `upsertSubscriptionFromStripe`'s SQL
 * (covered in `billing/subscriptions`'s own tests), not `markRedeemed`'s state machine (covered in
 * `coupon-claims.test.ts`), and not `closeOutPlatformCouponRedemption`'s own resolution logic
 * (covered in this directory's `_lib/__tests__/platform-coupon-redemption.test.ts`).
 */
jest.mock('../../../../../lib/database/connection', () => ({
  db: { query: jest.fn(), transaction: jest.fn(), initialize: jest.fn() },
}));
jest.mock('../../../../../lib/billing/subscriptions', () => ({
  upsertSubscriptionFromStripe: jest.fn(),
  markSubscriptionCanceled: jest.fn(),
  recordInvoiceOutcome: jest.fn(),
}));
jest.mock('../../../../../lib/stripe/client', () => ({
  getStripe: jest.fn(),
  isStripeConfigured: jest.fn(() => true),
}));
jest.mock('../_lib/platform-coupon-redemption', () => ({
  closeOutPlatformCouponRedemption: jest.fn(),
}));

import type Stripe from 'stripe';
import { upsertSubscriptionFromStripe } from '@/lib/billing/subscriptions';
import { getStripe } from '@/lib/stripe/client';
import { closeOutPlatformCouponRedemption } from '../_lib/platform-coupon-redemption';
import { syncSubscriptionFromCheckout } from '../route';

/** `@types/jest` is not a dependency here, so `jest.Mock` does not exist at type level even though
 * the global value does - use `ReturnType<typeof jest.fn>` instead, per this repo's test notes. */
type Mock = ReturnType<typeof jest.fn>;

const mockUpsert = upsertSubscriptionFromStripe as unknown as Mock;
const mockGetStripe = getStripe as unknown as Mock;
const mockCloseOut = closeOutPlatformCouponRedemption as unknown as Mock;

/** A minimal completed Checkout Session for the platform-billing flow. */
function checkoutSession(overrides: Partial<Stripe.Checkout.Session> = {}): Stripe.Checkout.Session {
  return {
    id: 'cs_test_123',
    object: 'checkout.session',
    mode: 'subscription',
    subscription: 'sub_123',
    client_reference_id: 'user-1',
    metadata: { flow: 'platform_billing', owner_id: 'user-1', store_id: 'store-1' },
    ...overrides,
  } as unknown as Stripe.Checkout.Session;
}

/** A minimal Stripe subscription, as returned by `subscriptions.retrieve`. */
function subscriptionFixture(overrides: Partial<Stripe.Subscription> = {}): Stripe.Subscription {
  return {
    id: 'sub_123',
    object: 'subscription',
    discounts: [],
    ...overrides,
  } as unknown as Stripe.Subscription;
}

describe('syncSubscriptionFromCheckout', () => {
  let retrieve: Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    retrieve = jest.fn();
    mockGetStripe.mockReturnValue({ subscriptions: { retrieve } });
  });

  it('syncs the subscription mirror and closes out a platform coupon redemption', async () => {
    const subscription = subscriptionFixture();
    retrieve.mockResolvedValue(subscription);
    mockUpsert.mockResolvedValue({ id: 'local-sub-1' });
    mockCloseOut.mockResolvedValue({ outcome: 'redeemed' });

    const session = checkoutSession();
    await syncSubscriptionFromCheckout(session);

    expect(retrieve).toHaveBeenCalledWith('sub_123', { expand: ['discounts'] });
    expect(mockUpsert).toHaveBeenCalledWith(subscription, { ownerId: 'user-1', storeId: 'store-1' });
    expect(mockCloseOut).toHaveBeenCalledWith({ ownerId: 'user-1', subscription });
  });

  it('falls back to client_reference_id for the owner when metadata carries none', async () => {
    const subscription = subscriptionFixture();
    retrieve.mockResolvedValue(subscription);
    mockUpsert.mockResolvedValue(null);
    mockCloseOut.mockResolvedValue({ outcome: 'no_platform_coupon' });

    const session = checkoutSession({ metadata: {}, client_reference_id: 'user-9' });
    await syncSubscriptionFromCheckout(session);

    expect(mockUpsert).toHaveBeenCalledWith(subscription, { ownerId: 'user-9', storeId: null });
    expect(mockCloseOut).toHaveBeenCalledWith({ ownerId: 'user-9', subscription });
  });

  it('does nothing when the session carries no subscription id', async () => {
    await syncSubscriptionFromCheckout(checkoutSession({ subscription: null }));

    expect(retrieve).not.toHaveBeenCalled();
    expect(mockUpsert).not.toHaveBeenCalled();
    expect(mockCloseOut).not.toHaveBeenCalled();
  });

  it('a repeated call for the same session keeps the subscription mirror in sync each time ' +
    '(event-level de-duplication happens one layer up, in the webhook_events ledger)', async () => {
    const subscription = subscriptionFixture();
    retrieve.mockResolvedValue(subscription);
    mockUpsert.mockResolvedValue({ id: 'local-sub-1' });
    mockCloseOut
      .mockResolvedValueOnce({ outcome: 'redeemed' })
      .mockResolvedValueOnce({ outcome: 'already_redeemed' });

    const session = checkoutSession();
    await syncSubscriptionFromCheckout(session);
    await syncSubscriptionFromCheckout(session);

    expect(mockUpsert).toHaveBeenCalledTimes(2);
    expect(mockCloseOut).toHaveBeenCalledTimes(2);
  });

  it('a coupon close-out that rejects never fails the sync - the subscription mirror write already stood', async () => {
    const subscription = subscriptionFixture();
    retrieve.mockResolvedValue(subscription);
    mockUpsert.mockResolvedValue({ id: 'local-sub-1' });
    mockCloseOut.mockRejectedValue(new Error('boom'));
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    await expect(syncSubscriptionFromCheckout(checkoutSession())).resolves.toBeUndefined();

    expect(mockUpsert).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it('a coupon close-out reporting a typed error outcome is logged, not thrown', async () => {
    const subscription = subscriptionFixture();
    retrieve.mockResolvedValue(subscription);
    mockUpsert.mockResolvedValue({ id: 'local-sub-1' });
    mockCloseOut.mockResolvedValue({ outcome: 'error', errorMessage: 'Stripe is down' });
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    await expect(syncSubscriptionFromCheckout(checkoutSession())).resolves.toBeUndefined();

    expect(mockUpsert).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Stripe is down'));
    errorSpy.mockRestore();
  });
});
