import type Stripe from 'stripe';
import {
  CONNECT_RETURN_PATHS,
  createConnectedAccount,
  createOnboardingLink,
  deriveOnboardingStatus,
  resolveConnectReturnPath,
} from '../connect';

/**
 * Build a Stripe account fixture for {@link deriveOnboardingStatus}.
 *
 * @param overrides - Fields that matter to the case under test.
 * @returns An object shaped like a Stripe account.
 */
function account(overrides: {
  charges?: boolean;
  payouts?: boolean;
  submitted?: boolean;
  disabledReason?: string | null;
}): Stripe.Account {
  return {
    id: 'acct_test',
    object: 'account',
    charges_enabled: overrides.charges ?? false,
    payouts_enabled: overrides.payouts ?? false,
    details_submitted: overrides.submitted ?? false,
    requirements: { disabled_reason: overrides.disabledReason ?? null, currently_due: [] },
  } as unknown as Stripe.Account;
}

/**
 * A Stripe double that records the params it was called with.
 *
 * The network boundary is injectable on both functions under test, so the real argument-building
 * logic runs rather than being mocked out.
 *
 * @returns The double plus the captured params.
 */
function stripeDouble(): {
  stripe: Stripe;
  captured: { accountParams?: Stripe.AccountCreateParams; linkParams?: Stripe.AccountLinkCreateParams };
} {
  const captured: {
    accountParams?: Stripe.AccountCreateParams;
    linkParams?: Stripe.AccountLinkCreateParams;
  } = {};

  const stripe = {
    accounts: {
      create: (params: Stripe.AccountCreateParams) => {
        captured.accountParams = params;
        return Promise.resolve({ id: 'acct_created' } as Stripe.Account);
      },
    },
    accountLinks: {
      create: (params: Stripe.AccountLinkCreateParams) => {
        captured.linkParams = params;
        return Promise.resolve({ url: 'https://connect.stripe.com/setup/x' } as Stripe.AccountLink);
      },
    },
  } as unknown as Stripe;

  return { stripe, captured };
}

const INPUT = { storeId: 'store-1', storeName: 'Basecamp Audio', storeSlug: 'demo-electronics' };

describe('createConnectedAccount business_profile.url', () => {
  const originalUrl = process.env.NEXT_PUBLIC_APP_URL;

  afterEach(() => {
    process.env.NEXT_PUBLIC_APP_URL = originalUrl;
  });

  it('omits the URL on localhost, because Stripe rejects it as "Not a valid URL"', async () => {
    process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000';
    const { stripe, captured } = stripeDouble();

    await createConnectedAccount(INPUT, stripe);

    expect(captured.accountParams?.business_profile?.name).toBe('Basecamp Audio');
    expect(captured.accountParams?.business_profile).not.toHaveProperty('url');
  });

  it.each(['http://127.0.0.1:3000', 'http://0.0.0.0:3000', 'https://box.local'])(
    'omits the URL for the non-resolvable origin %s',
    async (origin) => {
      process.env.NEXT_PUBLIC_APP_URL = origin;
      const { stripe, captured } = stripeDouble();

      await createConnectedAccount(INPUT, stripe);

      expect(captured.accountParams?.business_profile).not.toHaveProperty('url');
    }
  );

  it('sends the storefront URL when the origin is publicly resolvable', async () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://rebelshops.com';
    const { stripe, captured } = stripeDouble();

    await createConnectedAccount(INPUT, stripe);

    expect(captured.accountParams?.business_profile?.url).toBe(
      'https://rebelshops.com/store/demo-electronics'
    );
  });
});

describe('deriveOnboardingStatus', () => {
  it('reports a brand-new account as not_started, despite requirements.past_due', () => {
    // Stripe disables every fresh Express account this way. Testing disabled_reason first made
    // 'not_started' unreachable and told untouched merchants they were restricted.
    expect(
      deriveOnboardingStatus(account({ submitted: false, disabledReason: 'requirements.past_due' }))
    ).toBe('not_started');
  });

  it('reports a submitted account awaiting review as pending', () => {
    expect(
      deriveOnboardingStatus(
        account({ submitted: true, disabledReason: 'requirements.pending_verification' })
      )
    ).toBe('pending');
  });

  it('reports a genuine Stripe restriction as restricted', () => {
    expect(
      deriveOnboardingStatus(account({ submitted: true, disabledReason: 'rejected.fraud' }))
    ).toBe('restricted');
  });

  it('treats a rejection as restricted even before details are submitted', () => {
    expect(
      deriveOnboardingStatus(account({ submitted: false, disabledReason: 'platform_paused' }))
    ).toBe('restricted');
  });

  it('reports a fully enabled account as complete', () => {
    expect(
      deriveOnboardingStatus(account({ charges: true, payouts: true, submitted: true }))
    ).toBe('complete');
  });
});

describe('resolveConnectReturnPath', () => {
  it.each(CONNECT_RETURN_PATHS)('accepts the allowed path %s', (path) => {
    expect(resolveConnectReturnPath(path)).toBe(path);
  });

  it.each([null, undefined, '', '/admin/evil', 'https://evil.com', '//evil.com', '/admin/billing '])(
    'falls back to the default for %p',
    (candidate) => {
      expect(resolveConnectReturnPath(candidate)).toBe(CONNECT_RETURN_PATHS[0]);
    }
  );
});

describe('createOnboardingLink', () => {
  const originalUrl = process.env.NEXT_PUBLIC_APP_URL;

  beforeEach(() => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://rebelshops.com';
  });

  afterEach(() => {
    process.env.NEXT_PUBLIC_APP_URL = originalUrl;
  });

  it('carries the return destination through both round-trip URLs', async () => {
    const { stripe, captured } = stripeDouble();

    await createOnboardingLink('acct_1', 'account_onboarding', stripe, '/admin/integrations');

    expect(captured.linkParams?.return_url).toBe(
      'https://rebelshops.com/api/connect/return?account=acct_1&next=%2Fadmin%2Fintegrations'
    );
    expect(captured.linkParams?.refresh_url).toBe(
      'https://rebelshops.com/api/connect/refresh?account=acct_1&next=%2Fadmin%2Fintegrations'
    );
  });

  it('defaults to billing when no destination is given', async () => {
    const { stripe, captured } = stripeDouble();

    await createOnboardingLink('acct_1', 'account_onboarding', stripe);

    expect(captured.linkParams?.return_url).toContain('next=%2Fadmin%2Fbilling');
  });
});
