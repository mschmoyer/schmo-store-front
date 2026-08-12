-- Migration 018: Billing and Payments (Stripe)
--
-- Covers the two distinct money flows in RebelShops:
--   (A) Platform billing  - what the merchant pays RebelShops ($1/mo for 3 months, then $19.99/mo)
--   (B) Storefront checkout - what a shopper pays the MERCHANT, settled via Stripe Connect
--
-- Design notes:
--   * Money that Stripe owns is stored in the smallest currency unit (INTEGER cents) so it can be
--     compared byte-for-byte with Stripe objects. Money that the storefront owns keeps the existing
--     NUMERIC(10,2) convention already used by orders/order_items.
--   * `orders` already has `stripe_payment_intent_id`; this migration EXTENDS that table rather than
--     creating a parallel payments table.
--   * Everything is idempotent (IF NOT EXISTS / ON CONFLICT) so re-running is a no-op.

BEGIN;

-- ---------------------------------------------------------------------------
-- Flow A: platform billing
-- ---------------------------------------------------------------------------

-- One Stripe Customer per store owner. Created before a subscription exists so that the billing
-- portal and repeat checkouts always reuse the same customer.
CREATE TABLE IF NOT EXISTS public.billing_customers (
    owner_id            UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
    stripe_customer_id  VARCHAR(255) NOT NULL UNIQUE,
    email               VARCHAR(255),
    livemode            BOOLEAN DEFAULT false,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.billing_customers IS 'Maps a RebelShops store owner to their Stripe Customer (platform billing).';

CREATE TABLE IF NOT EXISTS public.subscriptions (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id                UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    store_id                UUID REFERENCES public.stores(id) ON DELETE SET NULL,

    stripe_customer_id      VARCHAR(255) NOT NULL,
    stripe_subscription_id  VARCHAR(255) NOT NULL UNIQUE,
    stripe_price_id         VARCHAR(255),
    plan_key                VARCHAR(64) NOT NULL DEFAULT 'rebelshops_standard',

    -- 'incomplete' | 'trialing' | 'active' | 'past_due' | 'canceled' | 'unpaid' | 'paused' ...
    status                  VARCHAR(32) NOT NULL DEFAULT 'incomplete',
    currency                VARCHAR(3)  NOT NULL DEFAULT 'usd',

    -- List price and the effective intro price, both in the smallest currency unit (cents).
    unit_amount             INTEGER,
    intro_amount            INTEGER,

    -- Intro-offer tracking. The offer is a repeating Stripe Coupon, not a trial, so `intro_*`
    -- describes the discount window and `trial_*` stays null unless a real trial is ever used.
    intro_coupon_id         VARCHAR(255),
    intro_discount_id       VARCHAR(255),
    intro_months            INTEGER NOT NULL DEFAULT 0,
    intro_started_at        TIMESTAMPTZ,
    intro_ends_at           TIMESTAMPTZ,

    trial_start             TIMESTAMPTZ,
    trial_end               TIMESTAMPTZ,

    current_period_start    TIMESTAMPTZ,
    current_period_end      TIMESTAMPTZ,
    cancel_at_period_end    BOOLEAN NOT NULL DEFAULT false,
    cancel_at               TIMESTAMPTZ,
    canceled_at             TIMESTAMPTZ,
    ended_at                TIMESTAMPTZ,

    latest_invoice_id       VARCHAR(255),
    last_payment_status     VARCHAR(32),
    last_payment_error      TEXT,

    metadata                JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.subscriptions IS 'Platform (flow A) subscriptions: what a merchant pays RebelShops.';
COMMENT ON COLUMN public.subscriptions.unit_amount IS 'Recurring list price in cents (1999 = $19.99/mo).';
COMMENT ON COLUMN public.subscriptions.intro_amount IS 'Effective amount charged per invoice during the intro window, in cents (100 = $1.00).';
COMMENT ON COLUMN public.subscriptions.intro_months IS 'Number of monthly invoices the intro discount applies to (3).';

CREATE INDEX IF NOT EXISTS idx_subscriptions_owner_id ON public.subscriptions (owner_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_store_id ON public.subscriptions (store_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON public.subscriptions (status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_customer ON public.subscriptions (stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_period_end ON public.subscriptions (current_period_end);

-- ---------------------------------------------------------------------------
-- Flow B: Stripe Connect accounts (funds settle to the merchant)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.payment_accounts (
    id                            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id                      UUID NOT NULL UNIQUE REFERENCES public.stores(id) ON DELETE CASCADE,
    provider                      VARCHAR(32) NOT NULL DEFAULT 'stripe',

    stripe_account_id             VARCHAR(255) NOT NULL UNIQUE,
    account_type                  VARCHAR(32) NOT NULL DEFAULT 'express',
    country                       VARCHAR(2)  NOT NULL DEFAULT 'US',
    default_currency              VARCHAR(3)  NOT NULL DEFAULT 'usd',

    charges_enabled               BOOLEAN NOT NULL DEFAULT false,
    payouts_enabled               BOOLEAN NOT NULL DEFAULT false,
    details_submitted             BOOLEAN NOT NULL DEFAULT false,

    -- 'not_started' | 'pending' | 'complete' | 'restricted'
    onboarding_status             VARCHAR(32) NOT NULL DEFAULT 'not_started',
    onboarding_started_at         TIMESTAMPTZ,
    onboarding_completed_at       TIMESTAMPTZ,

    requirements_currently_due    TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    requirements_disabled_reason  VARCHAR(255),

    -- Platform take rate applied to storefront charges, in basis points. 0 = no application fee.
    application_fee_bps           INTEGER NOT NULL DEFAULT 0,

    livemode                      BOOLEAN NOT NULL DEFAULT false,
    last_synced_at                TIMESTAMPTZ,
    created_at                    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at                    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.payment_accounts IS 'Stripe Connect account per store (flow B): where storefront funds settle.';
COMMENT ON COLUMN public.payment_accounts.application_fee_bps IS 'Platform application fee in basis points (100 bps = 1%).';

CREATE INDEX IF NOT EXISTS idx_payment_accounts_stripe_account ON public.payment_accounts (stripe_account_id);
CREATE INDEX IF NOT EXISTS idx_payment_accounts_status ON public.payment_accounts (onboarding_status);

-- ---------------------------------------------------------------------------
-- Flow B: storefront payment columns on the existing orders table
-- ---------------------------------------------------------------------------

ALTER TABLE public.orders
    ADD COLUMN IF NOT EXISTS stripe_checkout_session_id VARCHAR(255),
    ADD COLUMN IF NOT EXISTS stripe_charge_id           VARCHAR(255),
    ADD COLUMN IF NOT EXISTS stripe_account_id          VARCHAR(255),
    ADD COLUMN IF NOT EXISTS payment_provider           VARCHAR(32),
    ADD COLUMN IF NOT EXISTS amount_total               NUMERIC(10,2),
    ADD COLUMN IF NOT EXISTS currency                   VARCHAR(3) DEFAULT 'USD',
    ADD COLUMN IF NOT EXISTS refunded_amount            NUMERIC(10,2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS application_fee_amount     NUMERIC(10,2),
    ADD COLUMN IF NOT EXISTS paid_at                    TIMESTAMP,
    ADD COLUMN IF NOT EXISTS refunded_at                TIMESTAMP;

COMMENT ON COLUMN public.orders.amount_total IS 'Amount actually captured by the payment provider (authoritative over total_amount for reconciliation).';
COMMENT ON COLUMN public.orders.refunded_amount IS 'Cumulative amount refunded across all refunds on the charge.';
COMMENT ON COLUMN public.orders.stripe_account_id IS 'Connected account the charge settled to; NULL means platform-direct (dev).';

CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_stripe_checkout_session
    ON public.orders (stripe_checkout_session_id)
    WHERE stripe_checkout_session_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_stripe_payment_intent
    ON public.orders (stripe_payment_intent_id)
    WHERE stripe_payment_intent_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_orders_stripe_charge ON public.orders (stripe_charge_id)
    WHERE stripe_charge_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Flow B: server-side snapshot of a pending checkout
--
-- The cart is re-priced from the database when the Checkout Session is created and the result is
-- persisted here. The webhook then builds the order from THIS row, never from client input and
-- never from Stripe metadata (which is capped at 500 chars per value).
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.checkout_sessions (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id                    UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,

    stripe_checkout_session_id  VARCHAR(255) NOT NULL UNIQUE,
    stripe_payment_intent_id    VARCHAR(255),
    connected_account_id        VARCHAR(255),

    -- 'open' | 'completed' | 'expired' | 'failed'
    status                      VARCHAR(32) NOT NULL DEFAULT 'open',

    currency                    VARCHAR(3) NOT NULL DEFAULT 'USD',
    subtotal                    NUMERIC(10,2) NOT NULL,
    discount_amount             NUMERIC(10,2) NOT NULL DEFAULT 0,
    shipping_amount             NUMERIC(10,2) NOT NULL DEFAULT 0,
    tax_amount                  NUMERIC(10,2) NOT NULL DEFAULT 0,
    total_amount                NUMERIC(10,2) NOT NULL,

    coupon_id                   UUID REFERENCES public.coupons(id) ON DELETE SET NULL,
    coupon_code                 VARCHAR(100),

    customer_email              VARCHAR(255),
    customer                    JSONB NOT NULL DEFAULT '{}'::jsonb,
    shipping_address            JSONB NOT NULL DEFAULT '{}'::jsonb,
    shipping_method             VARCHAR(100),

    -- Server-priced line items: [{ product_id, sku, name, unit_price, quantity, total_price, image_url }]
    line_items                  JSONB NOT NULL DEFAULT '[]'::jsonb,

    order_id                    UUID REFERENCES public.orders(id) ON DELETE SET NULL,

    expires_at                  TIMESTAMPTZ,
    completed_at                TIMESTAMPTZ,
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.checkout_sessions IS 'Server-priced snapshot of a storefront Stripe Checkout Session, consumed by the webhook.';

CREATE INDEX IF NOT EXISTS idx_checkout_sessions_store ON public.checkout_sessions (store_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_checkout_sessions_status ON public.checkout_sessions (status);
CREATE INDEX IF NOT EXISTS idx_checkout_sessions_payment_intent ON public.checkout_sessions (stripe_payment_intent_id)
    WHERE stripe_payment_intent_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Webhook idempotency
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.webhook_events (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider      VARCHAR(32) NOT NULL DEFAULT 'stripe',
    event_id      VARCHAR(255) NOT NULL UNIQUE,
    event_type    VARCHAR(100) NOT NULL,
    api_version   VARCHAR(64),
    livemode      BOOLEAN NOT NULL DEFAULT false,
    account_id    VARCHAR(255),

    -- 'received' | 'processed' | 'ignored' | 'failed'
    status        VARCHAR(32) NOT NULL DEFAULT 'received',
    attempts      INTEGER NOT NULL DEFAULT 0,
    error         TEXT,
    payload       JSONB,

    received_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    processed_at  TIMESTAMPTZ
);

COMMENT ON TABLE public.webhook_events IS 'Stripe webhook idempotency ledger. event_id is unique; a duplicate delivery is a no-op.';

CREATE INDEX IF NOT EXISTS idx_webhook_events_type ON public.webhook_events (event_type, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_webhook_events_status ON public.webhook_events (status);

-- ---------------------------------------------------------------------------
-- updated_at triggers (trigger_set_timestamp() ships with migration 003)
-- ---------------------------------------------------------------------------

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'trigger_set_timestamp') THEN
        DROP TRIGGER IF EXISTS set_timestamp_billing_customers ON public.billing_customers;
        CREATE TRIGGER set_timestamp_billing_customers BEFORE UPDATE ON public.billing_customers
            FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();

        DROP TRIGGER IF EXISTS set_timestamp_subscriptions ON public.subscriptions;
        CREATE TRIGGER set_timestamp_subscriptions BEFORE UPDATE ON public.subscriptions
            FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();

        DROP TRIGGER IF EXISTS set_timestamp_payment_accounts ON public.payment_accounts;
        CREATE TRIGGER set_timestamp_payment_accounts BEFORE UPDATE ON public.payment_accounts
            FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();

        DROP TRIGGER IF EXISTS set_timestamp_checkout_sessions ON public.checkout_sessions;
        CREATE TRIGGER set_timestamp_checkout_sessions BEFORE UPDATE ON public.checkout_sessions
            FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();
    END IF;
END
$$;

-- Record migration
INSERT INTO public.schema_migrations (version, description)
VALUES ('018', 'Billing and payments: platform subscriptions, Stripe Connect accounts, storefront payment columns, checkout session snapshots, webhook idempotency')
ON CONFLICT (version) DO NOTHING;

COMMIT;
