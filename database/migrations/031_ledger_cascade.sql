-- Migration 031: let a ledger row die with the thing it describes.
--
-- The append-only trigger from 027 refused every DELETE, which is right for the case it was written
-- for — nobody edits history to make a discrepancy go away — but it also blocked the cascade when a
-- product or a whole store is deleted. Re-running the demo seed failed on it, and so would any
-- genuine tenant erasure.
--
-- The distinction that matters is not "is this a delete" but "does the thing this row describes
-- still exist". A movement record for a product that has been removed audits nothing; it is
-- orphaned data, and a platform that has to be able to erase a merchant's account cannot have a
-- table that refuses to let go. A movement record for a product that is still on the shelf is
-- evidence, and deleting it is exactly the tampering the trigger exists to prevent.
--
-- Postgres deletes the parent row before cascading to children, so within a cascade the product is
-- already gone from the transaction's view by the time this trigger runs. That makes "the parent no
-- longer exists" an exact and cheap discriminator between a cascade and a direct delete — no depth
-- counting, no session flags, nothing a caller could spoof from outside.

BEGIN;

CREATE OR REPLACE FUNCTION public.inventory_transactions_are_immutable()
RETURNS TRIGGER AS $$
BEGIN
  -- An UPDATE is never legitimate. There is no cascade that rewrites a movement, and a correction
  -- is posted as its own opposing entry so the original stays visible.
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION
      'inventory_transactions is append-only; post a reversing entry instead of an UPDATE'
      USING ERRCODE = 'restrict_violation';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.products WHERE id = OLD.product_id) THEN
    -- Cascading from a deleted product or store. Nothing left to audit.
    RETURN OLD;
  END IF;

  RAISE EXCEPTION
    'inventory_transactions is append-only; post a reversing entry instead of deleting movement %',
    OLD.id
    USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;

INSERT INTO public.schema_migrations (version, description)
VALUES ('031', 'Ledger rows cascade with their product; direct deletes and all updates still refused')
ON CONFLICT (version) DO NOTHING;

COMMIT;
