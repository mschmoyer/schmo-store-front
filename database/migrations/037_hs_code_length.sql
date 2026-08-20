-- 037: `hs_code VARCHAR(6)` cannot hold a real tariff code.
--
-- Migration 017 sized the column at six characters, which fits a bare HS-6 heading and nothing
-- anyone actually writes down. The standard dotted form is eight characters (`8517.62`); every
-- national tariff code that a customs declaration needs is eight or ten digits, often dotted, so
-- ten to thirteen characters. This platform calls the HS code part of "the customs triple" and
-- could not store one.
--
-- The symptom an adversarial review found was worse than a rejected field: `coerceValue` in the
-- product route validates type but never length, so `{"hs_code":"8517.62","vendor":"Acme"}` reached
-- Postgres, raised `value too long for type character varying(6)`, and failed the whole statement —
-- so the vendor in the same save was discarded too, under a generic "Something went wrong on our
-- end". The route now checks lengths before writing; this makes the column able to hold the answer.

BEGIN;

ALTER TABLE public.products ALTER COLUMN hs_code TYPE VARCHAR(16);

COMMENT ON COLUMN public.products.hs_code IS
  'Harmonised System tariff code. Wide enough for a dotted ten-digit national code (1234.56.78.90).';

INSERT INTO public.schema_migrations (version, description)
VALUES ('037', 'Widen hs_code to hold a real tariff code')
ON CONFLICT (version) DO NOTHING;

COMMIT;
