-- Migration 042: platform signup coupons — flow A, not flow B.
--
-- This is not `coupons`. The existing `coupons` table discounts a *shopper's* checkout on a
-- merchant's storefront (flow B, `store_id`-scoped, the merchant eats the discount). This table
-- discounts a *merchant's* subscription to RebelShops itself (flow A, platform-wide by definition,
-- RebelShops eats the discount). Every identifier here carries the `platform` prefix so the two
-- never get confused at a call site. See docs/plans/platform-coupons.md §1.
--
-- One table, two behaviours, no `kind` enum (§2 of the plan):
--
--   * `max_redemptions`: NULL is uncapped, 1 is a one-time code, N is capped at N.
--   * `percent_off` + `duration_months`: a year free is (100, 12); half off for six months is
--     (50, 6); a comp account is (100, NULL) — forever.
--   * `collect_payment_method`: FALSE skips taking a card at signup. It only does anything at
--     100% off — a partial discount still charges something today, so Stripe takes a card
--     regardless of the flag — which is why the schema refuses the dishonest combination outright
--     rather than trusting a form to catch it (invariant 13, `platform_coupons_no_card_needs_
--     full_discount`).
--
-- `platform_coupon_redemptions` is a state machine, not a log of one thing happening once
-- (§6): attributed (a reservation, made at signup) → redeemed (Stripe confirms a subscription) or
-- released (the reservation lapsed, or an operator freed it). Only `attributed` and `redeemed` are
-- "live" — they hold capacity against `max_redemptions`; `released` gives it back. A coupon cannot
-- be deleted once it has redemption history (`ON DELETE RESTRICT` on `coupon_id`) — deactivate it
-- instead, which stops new redemptions without touching anyone already on it (§3 rule 2).
--
-- The capacity check is a trigger, not a call site, because a read-then-write check loses the race
-- when two friends click the same one-time link in the same second — exactly the class of bug
-- migrations 029 (`single_stock_writer`) and 030 (`stock_invariants`) exist to close for inventory,
-- and `npm run db:verify` treats these as behaviour the same way it treats those. The `BEFORE
-- INSERT` trigger below takes `SELECT … FOR UPDATE` on the parent coupon row before counting live
-- claims, so two concurrent inserts against the same coupon serialise on that row lock rather than
-- both reading "0 of 1 used" and both succeeding. It also refuses an insert against an inactive or
-- expired coupon, each with its own greppable error message, because those two things do not carry
-- a "grace" the way a reservation does (§5.2) — an expired link is meant to fail loudly.
--
-- `redeemed_count` is a rollup of live claims, maintained by an `AFTER INSERT OR UPDATE OR DELETE`
-- trigger so the console never runs `COUNT(*)` over the redemption table to render a list of
-- coupons. `rebuild_platform_coupon_counts()` recomputes it from source, the same shape as
-- `rebuild_storefront_click_daily()` in migration 040, for whenever it is suspected of drifting.
--
-- NOTE on the plan text (docs/plans/platform-coupons.md §7): the pseudocode there writes
-- `CONSTRAINT platform_coupons_no_card_needs_full_discount` inline in the middle of the column
-- list, which is not valid syntax for a table-level constraint. It is written here at the end of
-- the column list, where a table-level CONSTRAINT belongs — same name, same rule.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. The coupon itself
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS platform_coupons (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code                    VARCHAR(48)  NOT NULL,          -- as issued, for display
  code_normalized         VARCHAR(48)  NOT NULL,          -- upper(trim(code)); the lookup key
  name                    VARCHAR(120) NOT NULL,          -- "Launch friends, 1 year"
  notes                   TEXT,                           -- "given to Dave at the meetup"
  percent_off             SMALLINT     NOT NULL CHECK (percent_off BETWEEN 1 AND 100),
  duration_months         SMALLINT     CHECK (duration_months IS NULL OR duration_months > 0),
  -- FALSE skips card collection at signup. Only meaningful at 100% off: a partial discount still
  -- charges something today, so Stripe takes a card whatever this says. See migration header.
  collect_payment_method  BOOLEAN      NOT NULL DEFAULT TRUE,
  max_redemptions         INTEGER      CHECK (max_redemptions IS NULL OR max_redemptions > 0),
  redeemed_count          INTEGER      NOT NULL DEFAULT 0,   -- rollup, trigger-maintained
  redeem_by               TIMESTAMPTZ,                       -- link stops working, no grace (§5.2)
  is_active               BOOLEAN      NOT NULL DEFAULT TRUE,
  stripe_coupon_id        VARCHAR(255),                      -- resolved lazily, then fixed
  created_by              UUID REFERENCES users (id) ON DELETE SET NULL,
  created_at              TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CONSTRAINT platform_coupons_no_card_needs_full_discount
    CHECK (collect_payment_method OR percent_off = 100)
);

COMMENT ON TABLE platform_coupons IS
  'Platform signup coupons (flow A: RebelShops discounts a merchant''s own subscription). Not the '
  '`coupons` table, which discounts a shopper''s checkout on a merchant''s storefront (flow B). '
  'See docs/plans/platform-coupons.md.';
COMMENT ON COLUMN platform_coupons.code_normalized IS
  'upper(trim(code)). The unique lookup key; `code` keeps the operator''s original casing for display.';
COMMENT ON COLUMN platform_coupons.collect_payment_method IS
  'FALSE skips taking a card at Checkout. Only takes effect at percent_off = 100 — see the '
  'platform_coupons_no_card_needs_full_discount check.';
COMMENT ON COLUMN platform_coupons.redeemed_count IS
  'Count of live (status <> ''released'') redemption rows for this coupon. Maintained by '
  'trg_platform_coupon_redemptions_sync_count; rebuild_platform_coupon_counts() recomputes it '
  'from source if it is ever suspected of drifting.';
COMMENT ON COLUMN platform_coupons.max_redemptions IS
  'NULL = uncapped. Enforced under a row lock by trg_platform_coupon_redemptions_check_capacity, '
  'not by any call site — see the migration header for why.';

CREATE UNIQUE INDEX IF NOT EXISTS idx_platform_coupons_code ON platform_coupons (code_normalized);
CREATE INDEX IF NOT EXISTS idx_platform_coupons_active ON platform_coupons (is_active) WHERE is_active;

-- ---------------------------------------------------------------------------
-- 2. The redemption ledger
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS platform_coupon_redemptions (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coupon_id              UUID NOT NULL REFERENCES platform_coupons (id) ON DELETE RESTRICT,
  user_id                UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  store_id               UUID REFERENCES stores (id) ON DELETE SET NULL,
  status                 VARCHAR(16) NOT NULL
                           CHECK (status IN ('attributed', 'redeemed', 'released')),
  source                 VARCHAR(16) NOT NULL
                           CHECK (source IN ('link', 'billing_form', 'operator')),
  attributed_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  redeemed_at            TIMESTAMPTZ,
  released_at            TIMESTAMPTZ,
  release_reason         VARCHAR(64),
  stripe_subscription_id VARCHAR(255),
  stripe_coupon_id       VARCHAR(255),
  discount_ends_at       TIMESTAMPTZ,       -- when the free window closes; NULL = forever
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE platform_coupon_redemptions IS
  'The state machine behind a platform coupon claim: attributed (reservation at signup) -> '
  'redeemed (Stripe confirms the subscription) or released (reservation lapsed, or an operator '
  'freed it). Only attributed/redeemed count against a coupon''s max_redemptions — see '
  'trg_platform_coupon_redemptions_check_capacity. coupon_id is ON DELETE RESTRICT on purpose: a '
  'coupon with history cannot be deleted, only deactivated (docs/plans/platform-coupons.md §3).';
COMMENT ON COLUMN platform_coupon_redemptions.status IS
  'attributed = reserved at signup. redeemed = a Stripe subscription confirmed the coupon. '
  'released = the reservation lapsed or an operator freed it; released rows are kept, not '
  'deleted, so "clicked 40 times, redeemed twice" stays answerable.';
COMMENT ON COLUMN platform_coupon_redemptions.discount_ends_at IS
  'When the free window closes for this claim. NULL = forever (a comp account). Drives the §4D '
  'expiry banner; not enforced against access — see docs/plans/platform-coupons.md §5.2.';

-- One live claim per user per coupon, and one live claim per user overall (invariant 2).
CREATE UNIQUE INDEX IF NOT EXISTS idx_pcr_one_per_user_per_coupon
  ON platform_coupon_redemptions (coupon_id, user_id) WHERE status <> 'released';
CREATE UNIQUE INDEX IF NOT EXISTS idx_pcr_one_live_per_user
  ON platform_coupon_redemptions (user_id) WHERE status <> 'released';
CREATE INDEX IF NOT EXISTS idx_pcr_coupon_time ON platform_coupon_redemptions (coupon_id, attributed_at DESC);
CREATE INDEX IF NOT EXISTS idx_pcr_time ON platform_coupon_redemptions (attributed_at DESC);

-- ---------------------------------------------------------------------------
-- 3. Capacity, enforced under a row lock, not by a call site
-- ---------------------------------------------------------------------------

/**
 * Refuse a redemption row that the coupon cannot honour.
 *
 * Takes `SELECT ... FOR UPDATE` on the parent coupon before counting live claims, so two
 * concurrent inserts against the same coupon serialise on the row lock: the second transaction
 * blocks until the first commits or rolls back, then re-reads a count that already reflects the
 * first insert. A plain `SELECT` followed by an application-side `if count < max` check has no
 * such ordering and is exactly the race that oversells a one-time coupon.
 *
 * Three distinct, greppable failure reasons, because "the insert failed" is not an actionable
 * error message for an operator staring at a support ticket:
 *   - platform_coupon_not_found   — the coupon id does not exist (should be unreachable given the
 *     foreign key, kept as a defensive, clearly-labelled failure rather than a null-pointer style
 *     crash further down this function).
 *   - platform_coupon_inactive    — an operator deactivated the coupon.
 *   - platform_coupon_expired     — past `redeem_by`. No grace, by design (§5.2): a hidden fudge
 *     factor makes the printed expiry date a lie.
 *   - platform_coupon_exhausted   — `max_redemptions` reached by live (non-released) claims.
 */
CREATE OR REPLACE FUNCTION platform_coupon_redemptions_check_capacity()
RETURNS TRIGGER AS $$
DECLARE
  v_coupon     platform_coupons%ROWTYPE;
  v_live_count INTEGER;
BEGIN
  SELECT * INTO v_coupon
    FROM platform_coupons
   WHERE id = NEW.coupon_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'platform_coupon_not_found: coupon % does not exist', NEW.coupon_id;
  END IF;

  IF NOT v_coupon.is_active THEN
    RAISE EXCEPTION 'platform_coupon_inactive: coupon "%" (%) is not active', v_coupon.code, v_coupon.id;
  END IF;

  IF v_coupon.redeem_by IS NOT NULL AND v_coupon.redeem_by < NOW() THEN
    RAISE EXCEPTION 'platform_coupon_expired: coupon "%" (%) expired at %', v_coupon.code, v_coupon.id, v_coupon.redeem_by;
  END IF;

  IF v_coupon.max_redemptions IS NOT NULL THEN
    SELECT COUNT(*) INTO v_live_count
      FROM platform_coupon_redemptions
     WHERE coupon_id = NEW.coupon_id
       AND status <> 'released';

    IF v_live_count >= v_coupon.max_redemptions THEN
      RAISE EXCEPTION 'platform_coupon_exhausted: coupon "%" (%) has reached its limit of % redemption(s)',
        v_coupon.code, v_coupon.id, v_coupon.max_redemptions;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_platform_coupon_redemptions_check_capacity ON platform_coupon_redemptions;
CREATE TRIGGER trg_platform_coupon_redemptions_check_capacity
  BEFORE INSERT ON platform_coupon_redemptions
  FOR EACH ROW EXECUTE FUNCTION platform_coupon_redemptions_check_capacity();

-- ---------------------------------------------------------------------------
-- 4. The rollup
-- ---------------------------------------------------------------------------

/**
 * Keep `platform_coupons.redeemed_count` equal to the count of live claims against it.
 *
 * Recomputes from source on every write rather than incrementing/decrementing, so an insert, an
 * update that flips `status`, and a delete all converge on the same correct number regardless of
 * what path got there — the same reasoning migration 040 gives for not trying to increment a
 * distinct-visitor count. Handles the (currently unused, but not forbidden by the schema) case of
 * an update that moves a redemption to a different coupon by recomputing both sides.
 */
CREATE OR REPLACE FUNCTION platform_coupon_redemptions_sync_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    UPDATE platform_coupons
       SET redeemed_count = (
             SELECT COUNT(*) FROM platform_coupon_redemptions
              WHERE coupon_id = NEW.coupon_id AND status <> 'released'
           )
     WHERE id = NEW.coupon_id;
  END IF;

  IF TG_OP = 'DELETE' THEN
    UPDATE platform_coupons
       SET redeemed_count = (
             SELECT COUNT(*) FROM platform_coupon_redemptions
              WHERE coupon_id = OLD.coupon_id AND status <> 'released'
           )
     WHERE id = OLD.coupon_id;
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.coupon_id IS DISTINCT FROM NEW.coupon_id THEN
    UPDATE platform_coupons
       SET redeemed_count = (
             SELECT COUNT(*) FROM platform_coupon_redemptions
              WHERE coupon_id = OLD.coupon_id AND status <> 'released'
           )
     WHERE id = OLD.coupon_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_platform_coupon_redemptions_sync_count ON platform_coupon_redemptions;
CREATE TRIGGER trg_platform_coupon_redemptions_sync_count
  AFTER INSERT OR UPDATE OR DELETE ON platform_coupon_redemptions
  FOR EACH ROW EXECUTE FUNCTION platform_coupon_redemptions_sync_count();

-- Rebuild from source. Safe to run at any time; used below and available to an operator who
-- suspects the rollup has drifted. Same shape as rebuild_storefront_click_daily() in migration 040.
CREATE OR REPLACE FUNCTION rebuild_platform_coupon_counts() RETURNS BIGINT AS $$
DECLARE
  rows_written BIGINT;
BEGIN
  UPDATE platform_coupons c
     SET redeemed_count = COALESCE(counts.live, 0)
    FROM (
      SELECT c2.id AS coupon_id, COUNT(r.id) AS live
        FROM platform_coupons c2
        LEFT JOIN platform_coupon_redemptions r
          ON r.coupon_id = c2.id AND r.status <> 'released'
       GROUP BY c2.id
    ) counts
   WHERE counts.coupon_id = c.id;
  GET DIAGNOSTICS rows_written = ROW_COUNT;
  RETURN rows_written;
END;
$$ LANGUAGE plpgsql;

-- A database that already had redemptions (a re-run, or a branch that created the tables by hand)
-- gets a correct rollup rather than one that starts counting from zero.
SELECT rebuild_platform_coupon_counts();

INSERT INTO public.schema_migrations (version, description)
VALUES ('042', 'Platform signup coupons: platform_coupons, platform_coupon_redemptions, capacity trigger under row lock, redeemed_count rollup')
ON CONFLICT (version) DO NOTHING;

COMMIT;
