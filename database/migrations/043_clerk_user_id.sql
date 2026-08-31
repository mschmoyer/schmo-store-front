-- 043: `users.clerk_user_id` — the one join key between Clerk and this database.
--
-- Phase 2 of docs/plans/clerk-integration.md. The `users` table stays the identity spine: every FK
-- in the schema points at `users.id`, and `store_id`/`is_admin` authority stays in Postgres. Clerk
-- only answers "who is this", and this column is how that answer is spelled here.
--
-- **Nullable, and UNIQUE.** Nullable because the dual-read window is deliberate: legacy password
-- users authenticate through the JWT path until the import script (scripts/import-users-to-clerk.mjs)
-- has backfilled every active real user. It becomes NOT NULL in phase 5, once the old login dies.
-- UNIQUE because it is a lookup key on an authenticated path — two rows carrying the same Clerk id
-- would make "who is this" ambiguous, and the resolution code would silently pick one.
--
-- Postgres treats NULLs as distinct under a unique constraint, so the un-migrated majority is not
-- in each other's way.
--
-- Email is deliberately NOT a join key. See the linking rule in the plan (§3): an attacker who
-- registers a Clerk account claiming a merchant's address must never bind to that merchant's row,
-- so `src/lib/auth/clerk-user.ts` refuses to auto-link an existing un-linked row by email and the
-- import script refuses to overwrite a row that already carries a different Clerk id.

BEGIN;

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS clerk_user_id VARCHAR(255) UNIQUE;

COMMENT ON COLUMN public.users.clerk_user_id IS
  'Clerk user id (user_...). The only join key between a Clerk session and this row — email never '
  'is, on an authenticated path. NULL until the user is imported or signs up through Clerk; '
  'becomes NOT NULL when the legacy password login is removed.';

-- No separate index: the UNIQUE constraint already builds the btree that every lookup here uses
-- (`WHERE clerk_user_id = $1`).

INSERT INTO public.schema_migrations (version, description)
VALUES ('043', 'Add users.clerk_user_id (nullable, unique) for the Clerk migration')
ON CONFLICT (version) DO NOTHING;

COMMIT;
