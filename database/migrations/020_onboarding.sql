-- Migration 020: Durable onboarding progress
--
-- The signup wizard used to live entirely in React state: close the tab at the
-- ShipStation step and you started over from "enter your email". This table is
-- the server-side record of where a merchant got to, so `/create-store` can
-- resume instead of restart.
--
-- Design notes:
--   * One row per user. The user row is created at step 1, so every subsequent
--     step has a durable owner to hang progress from.
--   * `current_step` / `completed_steps` are the state machine; `data` carries
--     the per-step payload we need to rehydrate the form (never secrets — the
--     ShipStation key lives in `store_integrations`, masked here at most).
--   * `import_state` is the catalog import job: cursor, counters, last error.
--     Kept separate from `data` because it is written by a background task
--     while the wizard is polling it.
--   * Everything is idempotent so re-running the migration is a no-op.

BEGIN;

CREATE TABLE IF NOT EXISTS public.onboarding_sessions (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id            uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    store_id           uuid REFERENCES public.stores(id) ON DELETE CASCADE,

    -- 'account' | 'store' | 'shipstation' | 'import' | 'style' | 'launch'
    current_step       varchar(32)  NOT NULL DEFAULT 'store',
    completed_steps    text[]       NOT NULL DEFAULT ARRAY[]::text[],
    -- 'in_progress' | 'completed'
    status             varchar(20)  NOT NULL DEFAULT 'in_progress',

    -- Rehydration payload for the wizard (no secrets).
    data               jsonb        NOT NULL DEFAULT '{}'::jsonb,
    -- Catalog import job state: {status, page, found, imported, failed, error, startedAt, finishedAt}
    import_state       jsonb        NOT NULL DEFAULT '{}'::jsonb,

    created_at         timestamp    DEFAULT CURRENT_TIMESTAMP,
    updated_at         timestamp    DEFAULT CURRENT_TIMESTAMP,
    completed_at       timestamp
);

-- One onboarding run per user; the wizard upserts against this.
CREATE UNIQUE INDEX IF NOT EXISTS onboarding_sessions_user_id_key
    ON public.onboarding_sessions (user_id);

CREATE INDEX IF NOT EXISTS idx_onboarding_sessions_store_id
    ON public.onboarding_sessions (store_id);

CREATE INDEX IF NOT EXISTS idx_onboarding_sessions_status
    ON public.onboarding_sessions (status);

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'trigger_set_timestamp') THEN
        DROP TRIGGER IF EXISTS set_timestamp_onboarding_sessions ON public.onboarding_sessions;
        CREATE TRIGGER set_timestamp_onboarding_sessions BEFORE UPDATE ON public.onboarding_sessions
            FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();
    END IF;
END
$$;

-- Record migration
INSERT INTO public.schema_migrations (version, description)
VALUES ('020', 'Durable onboarding progress: onboarding_sessions state machine, import job state')
ON CONFLICT (version) DO NOTHING;

COMMIT;
