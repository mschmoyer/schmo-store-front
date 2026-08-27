'use client';

/**
 * Merchant billing screen.
 *
 * Shows the current plan, what the merchant pays now versus once any discount window closes, the
 * next charge date, the Stripe Connect payout status, and the actions to subscribe, manage, or
 * cancel.
 *
 * **Vocabulary (plan `docs/plans/platform-coupons.md` §5.3):** this page used to describe every
 * discount as "the intro offer" — a `100`% off, 12-month platform coupon would have rendered
 * "Intro pricing · 12 months" and a Subscribe button reading "Subscribe for $1.00" on a checkout
 * that actually charges $0.00, which is the **Honest results** rule in the root `CLAUDE.md` broken
 * in the UI. Every price and label below is read from `GET /api/billing/status`'s `pendingOffer` /
 * `subscription.discount` — never from the `PLATFORM_INTRO_*` constants — so the copy always
 * matches what Stripe will actually do. "Your offer" / "Offer ends" / "Then" are neutral on
 * purpose: they render identically whether the live discount is the standard intro offer or a
 * named platform coupon, because the plan asks that no screen describe a coupon in the intro
 * offer's vocabulary specifically, and the simplest way to guarantee that is one vocabulary for
 * both.
 *
 * Design note: colours come from the RebelShops tokens in `docs/design-system.md`, written as
 * `var(--token, #fallback)` so the page renders correctly whether or not the global token sheet has
 * landed yet. No invented colours.
 */

import React, { Suspense, useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';

/**
 * What a not-yet-subscribed merchant will actually be charged today — `pendingOffer` from
 * `GET /api/billing/status`. `kind` is `'platform_coupon'` when a coupon is already attributed to
 * this merchant (a `/join` link at signup, or an applied code from the box below); otherwise the
 * standard intro offer.
 */
interface PendingOffer {
  kind: 'intro' | 'platform_coupon';
  label: string;
  description: string;
  amountDueTodayCents: number;
  amountDueTodayFormatted: string;
  listAmountFormatted: string;
  requiresPaymentMethod: boolean;
  code: string | null;
}

/** Which discount is live on an existing subscription, and when it ends — never a bare boolean. */
interface DiscountSummary {
  kind: 'intro' | 'platform_coupon';
  label: string;
  description: string;
  active: boolean;
  endsAt: string | null;
}

/** Subscription state returned by `GET /api/billing/status`. */
interface SubscriptionState {
  id: string;
  status: string;
  currency: string;
  listAmountFormatted: string;
  currentAmountFormatted: string;
  discount: DiscountSummary | null;
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
  plan: { key: string };
  pendingOffer: PendingOffer | null;
  subscription: SubscriptionState | null;
}

/** A validated coupon, as `POST /api/billing/coupon/preview` describes it. */
interface CouponPreview {
  redeemable: true;
  code: string;
  name: string;
  offer: string;
  requiresPaymentMethod: boolean;
  amountDueTodayCents: number;
  amountDueTodayFormatted: string;
}

/** Human copy for each reason `POST /api/billing/coupon/preview` can refuse a code. */
const COUPON_REASON_COPY: Record<string, string> = {
  unknown: 'That code was not found.',
  expired: 'That code has expired.',
  exhausted: 'That code has reached its redemption limit.',
  inactive: 'That code is no longer active.',
};

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
  // Distinct from `loading` (which only covers the very first fetch, for the full-page skeleton):
  // this tracks a manual retry from the "Your plan" panel's error state (finding 5) so that button
  // can show its own busy state without resurrecting the skeleton over content that may still be
  // valid (e.g. the "Getting paid" panel, which loads independently).
  const [retryingBilling, setRetryingBilling] = useState(false);

  // The "Have a coupon code?" box (plan §4B). Collapsed by default; `couponPreview` is only ever
  // set by a successful, explicit `POST /api/billing/coupon/preview` call — never inferred — so
  // Subscribe only ever sends a `couponCode` the merchant has actually seen described.
  const [couponBoxOpen, setCouponBoxOpen] = useState(false);
  const [couponInput, setCouponInput] = useState('');
  const [couponPreview, setCouponPreview] = useState<CouponPreview | null>(null);
  const [couponError, setCouponError] = useState<string | null>(null);
  const [couponBusy, setCouponBusy] = useState(false);

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

  /** Retries the failed initial load from the "Your plan" panel's own error state (finding 5). */
  const retryBilling = useCallback(async () => {
    setRetryingBilling(true);
    try {
      await load();
    } finally {
      setRetryingBilling(false);
    }
  }, [load]);

  const post = useCallback(
    async (url: string, kind: 'checkout' | 'portal' | 'connect', body?: Record<string, unknown>) => {
      setBusy(kind);
      setError(null);

      try {
        const token = readToken();
        const headers: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {};
        if (body) {
          headers['Content-Type'] = 'application/json';
        }
        const response = await fetch(url, {
          method: 'POST',
          headers,
          body: body ? JSON.stringify(body) : undefined,
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

  /**
   * Validate the typed coupon code — writes nothing (plan §4B). On success, `couponPreview` holds
   * the offer Subscribe will apply; the merchant sees it before committing to anything.
   */
  const checkCoupon = useCallback(async () => {
    const code = couponInput.trim();
    if (!code) return;

    setCouponBusy(true);
    setCouponError(null);
    setCouponPreview(null);

    try {
      const token = readToken();
      const headers: HeadersInit = { 'Content-Type': 'application/json' };
      if (token) headers.Authorization = `Bearer ${token}`;

      const response = await fetch('/api/billing/coupon/preview', {
        method: 'POST',
        headers,
        body: JSON.stringify({ code }),
      });
      const json = await response.json();

      if (!json.success) {
        setCouponError(json.error ?? 'Could not check that code right now.');
        return;
      }

      const data = json.data as CouponPreview | { redeemable: false; reason: string };
      if (data.redeemable) {
        setCouponPreview(data);
      } else {
        setCouponError(COUPON_REASON_COPY[data.reason] ?? 'That code could not be applied.');
      }
    } catch {
      setCouponError('Could not reach the billing service. Try again in a moment.');
    } finally {
      setCouponBusy(false);
    }
  }, [couponInput]);

  const checkoutFlag = searchParams.get('checkout');

  if (loading) {
    return <BillingSkeleton />;
  }

  const pendingOffer = billing?.pendingOffer ?? null;
  const subscription = billing?.subscription ?? null;
  const discount = subscription?.discount ?? null;

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
        description={
          !billing
            ? 'We could not load your plan.'
            : subscription
              ? undefined
              : (pendingOffer?.description ?? 'RebelShops Storefront')
        }
      >
        {/* Finding 5 of the staff review: when `GET /api/billing/status` fails, `billing` stays
            `null` and — before this — the error banner above rendered *and* this panel fell through
            to the not-yet-subscribed branch with every field on a `??` fallback, including a
            "Subscribe for $1.00" button on a checkout that would have charged whatever the real,
            unknown price is. Nobody should ever see a specific price this page has no evidence for,
            coupon merchant or not, so a failed load gets a retry here instead of a guess. */}
        {!billing ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'flex-start' }}>
            <p style={{ color: TOKENS.ink700, fontSize: '0.9375rem', margin: 0 }}>
              Something went wrong loading your billing status. Your plan and price are not shown
              until this succeeds — nothing below was charged or changed.
            </p>
            <SecondaryButton onClick={() => void retryBilling()} disabled={retryingBilling}>
              {retryingBilling ? 'Retrying…' : 'Retry'}
            </SecondaryButton>
          </div>
        ) : subscription ? (
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
              {discount?.active ? <StatusPill tone="neutral">{discount.label}</StatusPill> : null}
              {subscription.cancelAtPeriodEnd ? (
                <StatusPill tone="warn">Cancels at period end</StatusPill>
              ) : null}
            </div>

            <DetailRow label="Paying now">
              {subscription.currentAmountFormatted} / month
            </DetailRow>
            {/* Neutral vocabulary driven by the discount actually on the subscription (plan §5.3) —
                "Your offer" / "Then" / "Offer ends" render the same whether the live discount is the
                standard intro offer or a named platform coupon. Nothing at all is shown once the
                discount has closed: §5.1's "it simply charged; ordinary subscription row". */}
            {discount?.active ? (
              <>
                <DetailRow label="Your offer">{discount.label}</DetailRow>
                <DetailRow label="Then">{subscription.listAmountFormatted} / month</DetailRow>
                <DetailRow label="Offer ends">
                  {discount.endsAt ? formatDate(discount.endsAt) : 'Never'}
                </DetailRow>
              </>
            ) : null}
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
            <div
              style={{
                display: 'flex',
                alignItems: 'baseline',
                gap: 12,
                margin: '4px 0 20px',
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
                {pendingOffer?.amountDueTodayFormatted ?? '—'}
              </span>
              <span style={{ color: TOKENS.ink500 }}>
                today, then {pendingOffer?.listAmountFormatted ?? '—'} / month once your offer ends
              </span>
            </div>

            {pendingOffer?.kind === 'platform_coupon' ? (
              <p style={{ color: TOKENS.ink700, fontSize: '0.875rem', margin: '0 0 20px' }}>
                Applying <strong>{pendingOffer.label}</strong>
                {pendingOffer.requiresPaymentMethod ? '' : ' — no card required'}.
              </p>
            ) : null}

            {/* The "Have a coupon code?" box (plan §4B). Two endpoints on purpose: preview never
                writes, so a typo-and-retry never burns a single-use code (§4B). Subscribe only ever
                sends a code the merchant has seen described by a successful preview. */}
            <div style={{ marginBottom: 20 }}>
              {!couponBoxOpen ? (
                <button
                  type="button"
                  onClick={() => setCouponBoxOpen(true)}
                  style={{
                    background: 'none',
                    border: 'none',
                    padding: 0,
                    color: TOKENS.accent,
                    fontSize: '0.875rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Have a coupon code?
                </button>
              ) : (
                <div
                  style={{
                    border: `1px solid ${TOKENS.ink200}`,
                    borderRadius: TOKENS.radiusSm,
                    padding: 16,
                    background: TOKENS.sunken,
                  }}
                >
                  {/* Visually hidden, not absent: the placeholder alone left this input with no
                      accessible name once a screen reader hides placeholder text on focus, or a
                      browser that never announces it in the first place (finding 10). */}
                  <label
                    htmlFor="billing-coupon-code"
                    style={{
                      position: 'absolute',
                      width: 1,
                      height: 1,
                      padding: 0,
                      margin: -1,
                      overflow: 'hidden',
                      clip: 'rect(0, 0, 0, 0)',
                      whiteSpace: 'nowrap',
                      border: 0,
                    }}
                  >
                    Coupon code
                  </label>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <input
                      id="billing-coupon-code"
                      type="text"
                      value={couponInput}
                      onChange={(event) => {
                        setCouponInput(event.target.value);
                        setCouponPreview(null);
                        setCouponError(null);
                      }}
                      placeholder="Coupon code"
                      style={{
                        flex: '1 1 180px',
                        height: 40,
                        padding: '0 12px',
                        borderRadius: TOKENS.radiusSm,
                        border: `1px solid ${TOKENS.ink200}`,
                        background: TOKENS.raised,
                        color: TOKENS.ink900,
                        fontSize: '0.9375rem',
                      }}
                    />
                    <SecondaryButton
                      onClick={() => void checkCoupon()}
                      disabled={couponBusy || !couponInput.trim()}
                    >
                      {couponBusy ? 'Checking…' : 'Apply'}
                    </SecondaryButton>
                  </div>
                  {/* Announced, not just visible: this text is the whole reason the box exists —
                      "did that code work" — so a screen-reader user gets the same answer a sighted
                      one sees appear, without polling (finding 10). */}
                  {couponPreview ? (
                    <p
                      role="status"
                      style={{ color: TOKENS.mint500, fontSize: '0.875rem', margin: '10px 0 0' }}
                    >
                      {couponPreview.name}: {couponPreview.offer}
                      {couponPreview.requiresPaymentMethod ? '' : ' — no card required'}.
                    </p>
                  ) : null}
                  {couponError ? (
                    <p
                      role="alert"
                      style={{ color: TOKENS.rose500, fontSize: '0.875rem', margin: '10px 0 0' }}
                    >
                      {couponError}
                    </p>
                  ) : null}
                </div>
              )}
            </div>

            <PrimaryButton
              onClick={() =>
                void post(
                  '/api/billing/checkout',
                  'checkout',
                  couponPreview ? { couponCode: couponPreview.code } : undefined
                )
              }
              disabled={busy !== null || !billing?.configured}
            >
              {(() => {
                if (busy === 'checkout') return 'Starting…';
                // No hardcoded price (finding 5: the old `?? '$1.00'` fallback was the exact
                // "Subscribe for $1.00" on a $0.00 checkout the plan's §5.3 was written to close,
                // and it is wrong for every non-default offer, not just a coupon). Reaching this
                // branch at all means `billing` loaded successfully, so `pendingOffer` should be
                // present — but if it somehow is not, the honest label is one with no invented
                // number on it, never a guessed price.
                const amount = couponPreview?.amountDueTodayFormatted ?? pendingOffer?.amountDueTodayFormatted;
                return amount ? `Subscribe for ${amount}` : 'Subscribe';
              })()}
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
