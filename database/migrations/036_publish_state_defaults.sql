-- 036: Every product created without an explicit status was silently a draft.
--
-- Migration 025 added `status` with `DEFAULT 'draft'` beside the existing `is_active`, which has
-- `DEFAULT true`. The two column defaults contradict each other, and `sync_product_status_flags`
-- resolved every insert in favour of `status`:
--
--     IF NEW.status IS NULL THEN ... derive from is_active ... END IF;
--     NEW.is_active := (NEW.status = 'active');
--
-- The guard is unreachable. A column default fires before a BEFORE trigger sees the row, so
-- `NEW.status` is never null on insert — it is `'draft'` — and the line below then overwrote an
-- explicitly supplied `is_active = true` with false.
--
-- So any caller that published a product the way this codebase has always published one, by setting
-- `is_active`, got a draft. That is the demo seed, which inserts `is_active = true` and produced a
-- catalogue of twelve drafts and an empty storefront — and, far more seriously, it is the
-- ShipStation sync's insert path, so a merchant connecting their account imported their entire
-- catalogue as unpublished with nothing anywhere saying why.
--
-- The fix is to stop the defaults contradicting each other and to resolve an insert in favour of
-- whichever field the caller actually set.

BEGIN;

-- Agreeing defaults. A product nobody said anything about is a draft — the safer of the two, since
-- publishing something unfinished is worse than not publishing something ready.
ALTER TABLE public.products ALTER COLUMN is_active SET DEFAULT false;

CREATE OR REPLACE FUNCTION public.sync_product_status_flags()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    /*
     * Neither field can be told apart from its default once the row reaches this trigger, so the
     * rule is: whichever one is *not* at its default is the one the caller meant. They agree by
     * default now, so this only decides genuine disagreements, and it keeps working for the two
     * generations of caller in this codebase — older code that sets `is_active`, newer code that
     * sets `status`.
     */
    IF NEW.status IS NULL THEN
      NEW.status := CASE WHEN COALESCE(NEW.is_active, false) THEN 'active' ELSE 'draft' END;
    ELSIF NEW.status = 'draft' AND COALESCE(NEW.is_active, false) THEN
      NEW.status := 'active';
    END IF;

    NEW.is_active := (NEW.status = 'active');

  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    -- status changed: it wins.
    NEW.is_active := (NEW.status = 'active');
  ELSIF NEW.is_active IS DISTINCT FROM OLD.is_active THEN
    -- only the legacy flag changed: derive status, but never clobber an explicit archive.
    IF NEW.is_active THEN
      NEW.status := 'active';
    ELSIF OLD.status <> 'archived' THEN
      NEW.status := 'draft';
    END IF;
  END IF;

  IF NEW.status = 'archived' AND NEW.archived_at IS NULL THEN
    NEW.archived_at := NOW();
  ELSIF NEW.status <> 'archived' THEN
    NEW.archived_at := NULL;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

/*
 * Republish what the defect unpublished.
 *
 * Deliberately narrow: only products that were never touched after creation (`updated_at` still
 * matches `created_at`) and that carry a `published_at`, which is the caller's own statement that
 * this product was meant to be live. A merchant who has since taken something down has an
 * `updated_at` past its creation and is left alone — restoring that would be this migration
 * republishing a product on their behalf, which is exactly the class of thing migration 032 exists
 * to prevent.
 */
UPDATE public.products
   SET status = 'active'
 WHERE status = 'draft'
   AND published_at IS NOT NULL
   AND updated_at IS NOT DISTINCT FROM created_at;

INSERT INTO public.schema_migrations (version, description)
VALUES ('036', 'Publish state: agreeing defaults, and an insert that honours whichever field the caller set')
ON CONFLICT (version) DO NOTHING;

COMMIT;
