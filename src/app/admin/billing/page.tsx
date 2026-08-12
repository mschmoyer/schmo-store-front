'use client';

/**
 * Merchant billing screen.
 *
 * Shows the current plan, what the merchant pays now versus after the intro window, the next charge
 * date, the Stripe Connect payout status, and the actions to subscribe, manage, or cancel.
 *
 * Design note: colours come from the RebelShops tokens in `docs/design-system.md`, written as
 * `var(--token, #fallback)` so the page renders correctly whether or not the global token sheet has
 * landed yet. No invented colours.
 */

import React, { Suspense, useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';

/** Copy describing the intro offer, computed server-side. */
interface OfferSummary {
  introPrice: string;
  listPrice: string;
  introMonths: number;
  introWindowTotal: string;
  firstCharge: string;
  headline: string;
  finePrint: string;
}

/** Subscription state returned by `GET /api/billing/status`. */
interface SubscriptionState {
  id: string;
  status: string;
  currency: string;
  listAmountFormatted: string;
  currentAmountFormatted: string;
  inIntroPeriod: boolean;
  introMonths: number;
  introEndsAt: string | null;
  currentPeriodEnd: string | null;
  nextChargeAt: string | null;
  cancelAtPeriodEnd: boolean;
  canceledAt: string | null;
  lastPaymentStatus: string | null;
}

/** Full payload of `GET /api/billing/status`. */
interface BillingStatus {
  configured: boolean;
  subscribed: boolean;
  entitled: boolean;
  plan: { key: string; offer: OfferSummary };
  subscription: SubscriptionState | null;
}

/** Connect account state returned by `GET /api/connect/status`. */
interface ConnectStatus {
  configured: boolean;
  connected: boolean;
  account: {
    stripeAccountId: string;
    onboardingStatus: 'not_started' | 'pending' | 'complete' | 'restricted';
    chargesEnabled: boolean;
    payoutsEnabled: boolean;
    detailsSubmitted: boolean;
    requirementsCurrentlyDue: string[];
    disabledReason: string | null;
  } | null;
}

/*
 * Semantic tokens, referenced by name only.
 *
 * These entries used to carry `var(--token, #FALLBACK)` pairs whose fallbacks
 * were the PREVIOUS palette: `#FBFAF8` warm paper, `#0FA871` mint, `#D92D20`
 * rose, and a `--shadow-ember` default of `rgba(249,78,27,.24)` — vermilion,
 * from a ramp §2 decommissioned. A stale fallback is worse than no fallback:
 * it is invisible while the token exists and silently repaints the screen in
 * last year's colours the moment one gets renamed. Every token below is
 * defined in `globals.css`, so there is nothing to fall back to.
 */
const TOKENS = {
  paper: 'var(--surface)',
  raised: 'var(--surface-raised)',
  sunken: 'var(--surface-2)',
  ink900: 'var(--text-primary)',
  ink700: 'var(--ink-700)',
  ink500: 'var(--text-secondary)',
  ink200: 'var(--border-strong)',
  accent: 'var(--accent-solid)',
  accentHover: 'var(--accent-solid-hover)',
  mint500: 'var(--success-text)',
  mint50: 'var(--success-subtle)',
  amber500: 'var(--warning-text)',
  amber50: 'var(--warning-subtle)',
  rose500: 'var(--danger-text)',
  rose50: 'var(--danger-subtle)',
  radiusLg: 'var(--radius-lg)',
  radiusSm: 'var(--radius-sm)',
  shadowSm: 'var(--shadow-sm)',
  display: 'var(--font-display)',
};

/**
 * Read the admin bearer token the admin shell stores after login.
 *
 * @returns The token, or `null` when signed out.
 */
function readToken(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem('admin_token');
}

/**
 * Format an ISO date for display.
 *
 * @param iso - ISO-8601 timestamp, or `null`.
 * @returns A long-form date, or an em dash when unknown.
 */
function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

/** Props for {@link StatusPill}. */
interface StatusPillProps {
  tone: 'good' | 'warn' | 'bad' | 'neutral';
  children: React.ReactNode;
}

/**
 * A small labelled status pill. Colour is never the only signal - the text carries the meaning.
 *
 * @param props - Tone and label.
 * @returns The pill element.
 */
function StatusPill({ tone, children }: StatusPillProps): React.ReactElement {
  const palette = {
    good: { bg: TOKENS.mint50, fg: TOKENS.mint500 },
    warn: { bg: TOKENS.amber50, fg: TOKENS.amber500 },
    bad: { bg: TOKENS.rose50, fg: TOKENS.rose500 },
    neutral: { bg: TOKENS.sunken, fg: TOKENS.ink700 },
  }[tone];

  return (
    <span
      style={{
        display: 'inline-block',
        padding: '4px 10px',
        borderRadius: 'var(--radius-full, 999px)',
        background: palette.bg,
        color: palette.fg,
        fontSize: '0.75rem',
        fontWeight: 600,
        letterSpacing: '0.01em',
      }}
    >
      {children}
    </span>
  );
}

/** Props for {@link Panel}. */
interface PanelProps {
  title: string;
  description?: string;
  children: React.ReactNode;
}

/**
 * A titled card panel.
 *
 * @param props - Title, optional description, and body content.
 * @returns The panel element.
 */
function Panel({ title, description, children }: PanelProps): React.ReactElement {
  return (
    <section
      style={{
        background: TOKENS.raised,
        border: `1px solid ${TOKENS.ink200}`,
        borderRadius: TOKENS.radiusLg,
        boxShadow: TOKENS.shadowSm,
        padding: 24,
        marginBottom: 24,
      }}
    >
      <h2
        style={{
          fontFamily: TOKENS.display,
          fontSize: '1.375rem',
          lineHeight: 1.25,
          letterSpacing: '-0.015em',
          color: TOKENS.ink900,
          margin: 0,
        }}
      >
        {title}
      </h2>
      {description ? (
        <p style={{ color: TOKENS.ink500, fontSize: '0.875rem', margin: '8px 0 0' }}>
          {description}
        </p>
      ) : null}
      <div style={{ marginTop: 20 }}>{children}</div>
    </section>
  );
}

/** Props for {@link PrimaryButton}. */
interface PrimaryButtonProps {
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}

/**
 * The single primary action on the page: ember fill, white label.
 *
 * @param props - Click handler, disabled state, label.
 * @returns The button element.
 */
function PrimaryButton({ onClick, disabled, children }: PrimaryButtonProps): React.ReactElement {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        height: 48,
        padding: '0 24px',
        border: 'none',
        borderRadius: TOKENS.radiusSm,
        background: disabled ? 'var(--ink-300)' : TOKENS.accent,
        color: 'var(--accent-fg)',
        fontSize: '1rem',
        fontWeight: 600,
        cursor: disabled ? 'not-allowed' : 'pointer',
        boxShadow: disabled ? 'none' : 'var(--shadow-sm)',
      }}
    >
      {children}
    </button>
  );
}

/** Props for {@link SecondaryButton}. */
interface SecondaryButtonProps {
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}

/**
 * A secondary action: paper fill with an ink hairline.
 *
 * @param props - Click handler, disabled state, label.
 * @returns The button element.
 */
function SecondaryButton({
  onClick,
  disabled,
  children,
}: SecondaryButtonProps): React.ReactElement {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        height: 40,
        padding: '0 18px',
        borderRadius: TOKENS.radiusSm,
        border: `1px solid ${TOKENS.ink200}`,
        background: TOKENS.raised,
        color: TOKENS.ink900,
        fontSize: '0.875rem',
        fontWeight: 600,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.6 : 1,
      }}
    >
      {children}
    </button>
  );
}

/** Props for {@link DetailRow}. */
interface DetailRowProps {
  label: string;
  children: React.ReactNode;
}

/**
 * A label/value pair in the plan summary.
 *
 * @param props - Label and value.
 * @returns The row element.
 */
function DetailRow({ label, children }: DetailRowProps): React.ReactElement {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'baseline',
        gap: 16,
        padding: '10px 0',
        borderBottom: `1px solid ${TOKENS.ink200}`,
      }}
    >
      <span style={{ color: TOKENS.ink500, fontSize: '0.875rem' }}>{label}</span>
      <span style={{ color: TOKENS.ink900, fontSize: '0.9375rem', fontWeight: 600 }}>
        {children}
      </span>
    </div>
  );
}

/**
 * Skeleton matching the billing screen's geometry, shown while data loads.
 *
 * @returns The placeholder element.
 */
function BillingSkeleton(): React.ReactElement {
  return (
    <main style={{ maxWidth: 900, margin: '0 auto', padding: 24 }}>
      <div
        aria-busy="true"
        aria-label="Loading billing"
        style={{
          height: 220,
          borderRadius: TOKENS.radiusLg,
          background: TOKENS.sunken,
          border: `1px solid ${TOKENS.ink200}`,
        }}
      />
    </main>
  );
}

/**
 * The merchant-facing billing screen.
 *
 * @returns The billing content.
 */
function BillingContent(): React.ReactElement {
  const searchParams = useSearchParams();

  const [billing, setBilling] = useState<BillingStatus | null>(null);
  const [connect, setConnect] = useState<ConnectStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<null | 'checkout' | 'portal' | 'connect'>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const token = readToken();
    const headers: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {};

    try {
      const [billingResponse, connectResponse] = await Promise.all([
        fetch('/api/billing/status', { headers }),
        fetch('/api/connect/status', { headers }),
      ]);

      if (billingResponse.status === 401 || connectResponse.status === 401) {
        setError('Your session expired. Sign in again to manage billing.');
        return;
      }

      const billingJson = await billingResponse.json();
      const connectJson = await connectResponse.json();

      if (billingJson.success) setBilling(billingJson.data as BillingStatus);
      if (connectJson.success) setConnect(connectJson.data as ConnectStatus);
      if (!billingJson.success) setError(billingJson.error ?? 'Could not load billing status');
    } catch {
      setError('Could not reach the billing service. Try again in a moment.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const post = useCallback(
    async (url: string, kind: 'checkout' | 'portal' | 'connect') => {
      setBusy(kind);
      setError(null);

      try {
        const token = readToken();
        const response = await fetch(url, {
          method: 'POST',
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        const json = await response.json();

        if (json.success && json.data?.url) {
          window.location.href = json.data.url as string;
          return;
        }

        setError(json.message ?? json.error ?? 'Something went wrong. Try again.');
      } catch {
        setError('Could not reach Stripe. Try again in a moment.');
      } finally {
        setBusy(null);
      }
    },
    []
  );

  const checkoutFlag = searchParams.get('checkout');

  if (loading) {
    return <BillingSkeleton />;
  }

  const offer = billing?.plan.offer;
  const subscription = billing?.subscription ?? null;

  return (
    /* `padding: 0` — the admin shell already pads to 24px (§4). This page used
       to add its own 24 on top, so Billing's content sat 48px in while every
       other route sat at 24. */
    <main style={{ maxWidth: 900, margin: '0 auto', background: TOKENS.paper }}>
      <AdminPageHeader
        title="Billing"
        description="Your RebelShops subscription and the Stripe account your shoppers pay into."
      />

      {checkoutFlag === 'success' ? (
        <div
          role="status"
          style={{
            background: TOKENS.mint50,
            color: TOKENS.ink900,
            border: `1px solid ${TOKENS.mint500}`,
            borderRadius: TOKENS.radiusSm,
            padding: '12px 16px',
            marginBottom: 24,
          }}
        >
          Payment received. Your subscription may take a few seconds to appear here.
        </div>
      ) : null}

      {checkoutFlag === 'cancelled' ? (
        <div
          role="status"
          style={{
            background: TOKENS.amber50,
            color: TOKENS.ink900,
            border: `1px solid ${TOKENS.amber500}`,
            borderRadius: TOKENS.radiusSm,
            padding: '12px 16px',
            marginBottom: 24,
          }}
        >
          Checkout cancelled. Nothing was charged.
        </div>
      ) : null}

      {error ? (
        <div
          role="alert"
          style={{
            background: TOKENS.rose50,
            color: TOKENS.ink900,
            border: `1px solid ${TOKENS.rose500}`,
            borderRadius: TOKENS.radiusSm,
            padding: '12px 16px',
            marginBottom: 24,
          }}
        >
          {error}
        </div>
      ) : null}

      {billing && !billing.configured ? (
        <Panel
          title="Payments are not configured"
          description="This environment has no Stripe keys, so subscriptions and storefront checkout are switched off."
        >
          <p style={{ color: TOKENS.ink700, fontSize: '0.9375rem', margin: 0 }}>
            Set <code>STRIPE_SECRET_KEY</code> and <code>STRIPE_WEBHOOK_SECRET</code> on the server,
            then reload this page. Everything else in the admin keeps working in the meantime.
          </p>
        </Panel>
      ) : null}

      <Panel
        title="Your plan"
        description={offer?.headline ?? 'RebelShops Storefront'}
      >
        {subscription ? (
          <>
            <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
              <StatusPill
                tone={
                  billing?.entitled
                    ? subscription.status === 'past_due'
                      ? 'warn'
                      : 'good'
                    : 'bad'
                }
              >
                {subscription.status.replace(/_/g, ' ')}
              </StatusPill>
              {subscription.inIntroPeriod ? (
                <StatusPill tone="neutral">
                  Intro pricing · {subscription.introMonths} months
                </StatusPill>
              ) : null}
              {subscription.cancelAtPeriodEnd ? (
                <StatusPill tone="warn">Cancels at period end</StatusPill>
              ) : null}
            </div>

            <DetailRow label="Paying now">
              {subscription.currentAmountFormatted} / month
            </DetailRow>
            <DetailRow label={`After the intro period`}>
              {subscription.listAmountFormatted} / month
            </DetailRow>
            <DetailRow label="Intro pricing ends">
              {formatDate(subscription.introEndsAt)}
            </DetailRow>
            <DetailRow label={subscription.cancelAtPeriodEnd ? 'Access ends' : 'Next charge'}>
              {formatDate(
                subscription.cancelAtPeriodEnd
                  ? subscription.currentPeriodEnd
                  : subscription.nextChargeAt
              )}
            </DetailRow>
            {subscription.lastPaymentStatus === 'failed' ? (
              <p style={{ color: TOKENS.rose500, fontSize: '0.875rem', marginTop: 16 }}>
                Your last payment failed. Update your card in the billing portal to keep your
                storefront live.
              </p>
            ) : null}

            <div style={{ marginTop: 24, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <SecondaryButton
                onClick={() => void post('/api/billing/portal', 'portal')}
                disabled={busy !== null || !billing?.configured}
              >
                {busy === 'portal' ? 'Opening…' : 'Manage or cancel'}
              </SecondaryButton>
            </div>
          </>
        ) : (
          <>
            <p style={{ color: TOKENS.ink700, fontSize: '1.125rem', lineHeight: 1.6, margin: 0 }}>
              {offer?.finePrint ??
                'Start your storefront for $1 a month for the first three months.'}
            </p>
            <div
              style={{
                display: 'flex',
                alignItems: 'baseline',
                gap: 12,
                margin: '20px 0',
              }}
            >
              <span
                style={{
                  fontFamily: TOKENS.display,
                  fontVariantNumeric: 'tabular-nums',
                  fontSize: '2.25rem',
                  letterSpacing: '-0.025em',
                  color: TOKENS.ink900,
                }}
              >
                {offer?.introPrice ?? '$1.00'}
              </span>
              <span style={{ color: TOKENS.ink500 }}>
                / month for {offer?.introMonths ?? 3} months, then{' '}
                {offer?.listPrice ?? '$19.99'} / month
              </span>
            </div>
            <PrimaryButton
              onClick={() => void post('/api/billing/checkout', 'checkout')}
              disabled={busy !== null || !billing?.configured}
            >
              {busy === 'checkout' ? 'Starting…' : `Subscribe for ${offer?.introPrice ?? '$1.00'}`}
            </PrimaryButton>
          </>
        )}
      </Panel>

      <Panel
        title="Getting paid"
        description="Shopper payments settle into your own Stripe account. RebelShops never holds your money."
      >
        {!connect?.configured ? (
          <p style={{ color: TOKENS.ink700, fontSize: '0.9375rem', margin: 0 }}>
            Stripe is not configured in this environment, so payouts cannot be set up yet.
          </p>
        ) : connect.connected && connect.account ? (
          <>
            <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
              <StatusPill
                tone={
                  connect.account.onboardingStatus === 'complete'
                    ? 'good'
                    : connect.account.onboardingStatus === 'restricted'
                      ? 'bad'
                      : 'warn'
                }
              >
                {connect.account.onboardingStatus.replace(/_/g, ' ')}
              </StatusPill>
              <StatusPill tone={connect.account.chargesEnabled ? 'good' : 'warn'}>
                {connect.account.chargesEnabled ? 'Charges enabled' : 'Charges disabled'}
              </StatusPill>
              <StatusPill tone={connect.account.payoutsEnabled ? 'good' : 'warn'}>
                {connect.account.payoutsEnabled ? 'Payouts enabled' : 'Payouts disabled'}
              </StatusPill>
            </div>

            <p
              style={{
                fontFamily: 'var(--font-mono, monospace)',
                fontSize: '0.8125rem',
                color: TOKENS.ink500,
                margin: '0 0 16px',
              }}
            >
              {connect.account.stripeAccountId}
            </p>

            {connect.account.requirementsCurrentlyDue.length > 0 ? (
              <div style={{ marginBottom: 16 }}>
                <p style={{ color: TOKENS.ink700, fontSize: '0.875rem', margin: '0 0 8px' }}>
                  Stripe still needs:
                </p>
                <ul style={{ color: TOKENS.ink500, fontSize: '0.875rem', margin: 0, paddingLeft: 20 }}>
                  {connect.account.requirementsCurrentlyDue.slice(0, 6).map((requirement) => (
                    <li key={requirement}>{requirement.replace(/[._]/g, ' ')}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            <SecondaryButton
              onClick={() => void post('/api/connect/onboard', 'connect')}
              disabled={busy !== null}
            >
              {busy === 'connect'
                ? 'Opening…'
                : connect.account.onboardingStatus === 'complete'
                  ? 'Update payout details'
                  : 'Finish payout setup'}
            </SecondaryButton>
          </>
        ) : (
          <>
            <p style={{ color: TOKENS.ink700, fontSize: '0.9375rem', margin: '0 0 20px' }}>
              Connect a Stripe account to take payments on your storefront. Until you do, checkout
              stays switched off for shoppers.
            </p>
            <SecondaryButton
              onClick={() => void post('/api/connect/onboard', 'connect')}
              disabled={busy !== null}
            >
              {busy === 'connect' ? 'Opening…' : 'Set up payouts with Stripe'}
            </SecondaryButton>
          </>
        )}
      </Panel>
    </main>
  );
}

/**
 * Billing route entry point. The content reads search params, so it is wrapped in a Suspense
 * boundary as Next 15 requires.
 *
 * @returns The billing page.
 */
export default function AdminBillingPage(): React.ReactElement {
  return (
    <Suspense fallback={<BillingSkeleton />}>
      <BillingContent />
    </Suspense>
  );
}
