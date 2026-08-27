/**
 * Request validation for the `/api/platform/coupons` surface.
 *
 * Everything here turns an untyped JSON body or query string into either a validated value or a
 * named {@link FieldError} — never a thrown exception a route would have to translate, and never a
 * value that reaches `src/lib/platform/coupons.ts` unchecked. Two refusals matter enough to call
 * out:
 *
 * - **`collectPaymentMethod: false` with `percentOff !== 100`** is rejected here, before any SQL
 *   runs. The schema also refuses it (`platform_coupons_no_card_needs_full_discount`), but a client
 *   hitting that CHECK constraint is a 500 with a raw Postgres message — see plan §7 and invariant
 *   13. This module is what turns it into a 400 with a field name instead.
 * - **A `PATCH` that names `percentOff`, `durationMonths` or `collectPaymentMethod` is deliberately
 *   *not* stripped.** Those fields are threaded through to `updatePlatformCoupon`, which is what
 *   returns the typed `economics_immutable` refusal the route turns into a 409 — see plan §11
 *   invariant 5. Validating them away here would silently swallow the attempt instead.
 */

import type { PlatformCouponFilter, PlatformCouponPatch } from '@/lib/platform/coupons';
import { PLATFORM_COUPON_STATUSES } from '@/lib/platform/coupons';

/** Longest `code` this route accepts, matching `platform_coupons.code VARCHAR(48)`. */
export const MAX_COUPON_CODE_LENGTH = 48;

/**
 * Shortest `code` an operator may type in by hand.
 *
 * Generated codes (`coupon-codes.ts`) carry ~49.5 bits of entropy and are safe against
 * `/join/[code]`'s rate limit however short they read; a human-chosen code like `FRIENDS12` is not
 * — before this floor, this validator accepted anything from 1 to 48 characters, and a short,
 * guessable operator code plus an unauthenticated, previously-unrated `/join` (staff review
 * finding 4) made a year-long discount reachable by brute force at bandwidth speed. Six characters
 * over `COUPON_CODE_PATTERN`'s alphabet is `36^6` ≈ 2.2 billion combinations — not generated-code
 * entropy, but enough that guessing it through a rate-limited endpoint is not the easy path, and
 * short enough not to reject the kind of code an operator actually wants to type.
 */
export const MIN_COUPON_CODE_LENGTH = 6;

/**
 * Characters an operator-supplied `code` may contain: letters, digits, hyphens and underscores.
 * Excludes whitespace and other punctuation, which would either need URL-encoding in `/join/<code>`
 * or invite a code that looks different than it is (leading/trailing space, a stray control
 * character) on the one surface that logs it only by shape, never in full (invariant 12).
 */
const COUPON_CODE_PATTERN = /^[A-Za-z0-9_-]+$/;
/** Longest `name` this route accepts, matching `platform_coupons.name VARCHAR(120)`. */
export const MAX_COUPON_NAME_LENGTH = 120;

/** A single named field failure, shaped for a form to point at the right input. */
export interface FieldError {
  field: string;
  message: string;
}

/**
 * Parse `?filter=` into a validated {@link PlatformCouponFilter}.
 *
 * @param value - The raw query-string value, or `null` when absent.
 * @returns The matching filter, or `'all'` for anything absent or unrecognised — an unknown filter
 *          value is a request for "show me everything", never a 400 on a page load.
 */
export function parseCouponFilter(value: string | null): PlatformCouponFilter {
  if (value && (PLATFORM_COUPON_STATUSES as readonly string[]).includes(value)) {
    return value as PlatformCouponFilter;
  }
  return 'all';
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

type FieldResult<T> = { ok: true; value: T } | { ok: false; error: FieldError };

/**
 * Parse an optional positive integer field: blank, `null` or absent all mean "uncapped" /
 * "forever" depending on the field, which every optional integer on this schema means.
 */
function optionalPositiveInt(value: unknown, field: string, label: string): FieldResult<number | null> {
  if (value === undefined || value === null || value === '') {
    return { ok: true, value: null };
  }
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(numeric) || numeric < 1) {
    return { ok: false, error: { field, message: `${label} must be a whole number of 1 or more, or left blank.` } };
  }
  return { ok: true, value: numeric };
}

/** Parse an optional ISO date-ish string into a `Date`, or `null` for blank/absent. */
function optionalDate(value: unknown, field: string, label: string): FieldResult<Date | null> {
  if (value === undefined || value === null || value === '') {
    return { ok: true, value: null };
  }
  if (typeof value !== 'string') {
    return { ok: false, error: { field, message: `${label} must be a date.` } };
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return { ok: false, error: { field, message: `${label} is not a valid date.` } };
  }
  return { ok: true, value: parsed };
}

/** The economics and metadata {@link validateCreateCouponBody} extracts, ready for `createPlatformCoupon`. */
export interface ValidatedCreateCouponInput {
  /** `null` means the operator left the code blank; the route generates one. */
  code: string | null;
  name: string;
  notes: string | null;
  percentOff: number;
  durationMonths: number | null;
  collectPaymentMethod: boolean;
  maxRedemptions: number | null;
  redeemBy: Date | null;
}

export type CreateCouponValidationResult =
  | { ok: true; input: ValidatedCreateCouponInput }
  | { ok: false; error: FieldError };

/**
 * Validate a `POST /api/platform/coupons` body.
 *
 * @param body - The parsed JSON body (or `null` when parsing failed upstream).
 * @returns The validated economics, or the first field error encountered.
 */
export function validateCreateCouponBody(body: unknown): CreateCouponValidationResult {
  if (!isPlainObject(body)) {
    return { ok: false, error: { field: 'body', message: 'Request body must be a JSON object.' } };
  }

  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name) {
    return { ok: false, error: { field: 'name', message: 'Name is required.' } };
  }
  if (name.length > MAX_COUPON_NAME_LENGTH) {
    return {
      ok: false,
      error: { field: 'name', message: `Name must be ${MAX_COUPON_NAME_LENGTH} characters or fewer.` },
    };
  }

  let notes: string | null = null;
  if (body.notes !== undefined && body.notes !== null) {
    if (typeof body.notes !== 'string') {
      return { ok: false, error: { field: 'notes', message: 'Notes must be text.' } };
    }
    const trimmed = body.notes.trim();
    notes = trimmed === '' ? null : trimmed;
  }

  const percentOffRaw = body.percentOff;
  const percentOff = typeof percentOffRaw === 'number' ? percentOffRaw : Number(percentOffRaw);
  if (!Number.isInteger(percentOff) || percentOff < 1 || percentOff > 100) {
    return {
      ok: false,
      error: { field: 'percentOff', message: 'Percent off must be a whole number between 1 and 100.' },
    };
  }

  const durationResult = optionalPositiveInt(body.durationMonths, 'durationMonths', 'Duration (months)');
  if (!durationResult.ok) return durationResult;

  const maxRedemptionsResult = optionalPositiveInt(body.maxRedemptions, 'maxRedemptions', 'Max redemptions');
  if (!maxRedemptionsResult.ok) return maxRedemptionsResult;

  const redeemByResult = optionalDate(body.redeemBy, 'redeemBy', 'Redeem by');
  if (!redeemByResult.ok) return redeemByResult;

  const collectPaymentMethod = body.collectPaymentMethod === undefined ? true : Boolean(body.collectPaymentMethod);

  // Plan §3 / invariant 13 / the schema CHECK `platform_coupons_no_card_needs_full_discount`: a
  // coupon cannot promise no card and then need one. Refusing it here, by field, is what keeps a
  // merchant's typo from reaching that CHECK constraint as a 500.
  if (!collectPaymentMethod && percentOff !== 100) {
    return {
      ok: false,
      error: {
        field: 'collectPaymentMethod',
        message:
          'Skipping card collection only works at 100% off — a partial discount still charges something today, so Stripe takes a card regardless.',
      },
    };
  }

  let code: string | null = null;
  if (body.code !== undefined && body.code !== null && body.code !== '') {
    if (typeof body.code !== 'string') {
      return { ok: false, error: { field: 'code', message: 'Code must be text.' } };
    }
    const trimmed = body.code.trim();
    if (trimmed.length > MAX_COUPON_CODE_LENGTH) {
      return {
        ok: false,
        error: { field: 'code', message: `Code must be ${MAX_COUPON_CODE_LENGTH} characters or fewer.` },
      };
    }
    if (trimmed.length > 0 && trimmed.length < MIN_COUPON_CODE_LENGTH) {
      return {
        ok: false,
        error: { field: 'code', message: `Code must be at least ${MIN_COUPON_CODE_LENGTH} characters.` },
      };
    }
    if (trimmed.length > 0 && !COUPON_CODE_PATTERN.test(trimmed)) {
      return {
        ok: false,
        error: { field: 'code', message: 'Code may only contain letters, numbers, hyphens and underscores.' },
      };
    }
    code = trimmed.length > 0 ? trimmed : null;
  }

  return {
    ok: true,
    input: {
      code,
      name,
      notes,
      percentOff,
      durationMonths: durationResult.value,
      collectPaymentMethod,
      maxRedemptions: maxRedemptionsResult.value,
      redeemBy: redeemByResult.value,
    },
  };
}

export type PatchCouponValidationResult =
  | { ok: true; patch: PlatformCouponPatch }
  | { ok: false; error: FieldError };

/**
 * Validate a `PATCH /api/platform/coupons/[id]` body.
 *
 * Only fields actually present in the body are placed on the patch — an absent field means "leave
 * it alone", matching {@link import('@/lib/platform/coupons').updatePlatformCoupon}'s own contract.
 * `percentOff`, `durationMonths` and `collectPaymentMethod` are validated for *type* only (a string
 * where a number belongs is still a 400 here) and then passed through unchanged so the persistence
 * layer's `economics_immutable` refusal is what the caller sees — see the module note.
 *
 * @param body - The parsed JSON body (or `null` when parsing failed upstream).
 * @returns The validated patch, or the first field error encountered.
 */
export function validatePatchCouponBody(body: unknown): PatchCouponValidationResult {
  if (!isPlainObject(body)) {
    return { ok: false, error: { field: 'body', message: 'Request body must be a JSON object.' } };
  }

  const patch: PlatformCouponPatch = {};

  if ('name' in body) {
    if (typeof body.name !== 'string' || body.name.trim() === '') {
      return { ok: false, error: { field: 'name', message: 'Name cannot be blank.' } };
    }
    if (body.name.trim().length > MAX_COUPON_NAME_LENGTH) {
      return {
        ok: false,
        error: { field: 'name', message: `Name must be ${MAX_COUPON_NAME_LENGTH} characters or fewer.` },
      };
    }
    patch.name = body.name.trim();
  }

  if ('notes' in body) {
    if (body.notes !== null && typeof body.notes !== 'string') {
      return { ok: false, error: { field: 'notes', message: 'Notes must be text.' } };
    }
    patch.notes = body.notes === null ? null : (body.notes as string).trim() || null;
  }

  if ('redeemBy' in body) {
    const result = optionalDate(body.redeemBy, 'redeemBy', 'Redeem by');
    if (!result.ok) return result;
    patch.redeemBy = result.value;
  }

  if ('isActive' in body) {
    if (typeof body.isActive !== 'boolean') {
      return { ok: false, error: { field: 'isActive', message: 'isActive must be true or false.' } };
    }
    patch.isActive = body.isActive;
  }

  // Deliberately not validated beyond "is this the right primitive type" — see the module note.
  // These exist on the patch only so `updatePlatformCoupon` can name them in a 409, never so they
  // get written.
  if ('percentOff' in body) {
    if (typeof body.percentOff !== 'number') {
      return { ok: false, error: { field: 'percentOff', message: 'percentOff must be a number.' } };
    }
    patch.percentOff = body.percentOff;
  }
  if ('durationMonths' in body) {
    if (body.durationMonths !== null && typeof body.durationMonths !== 'number') {
      return { ok: false, error: { field: 'durationMonths', message: 'durationMonths must be a number or null.' } };
    }
    patch.durationMonths = body.durationMonths as number | null;
  }
  if ('collectPaymentMethod' in body) {
    if (typeof body.collectPaymentMethod !== 'boolean') {
      return {
        ok: false,
        error: { field: 'collectPaymentMethod', message: 'collectPaymentMethod must be true or false.' },
      };
    }
    patch.collectPaymentMethod = body.collectPaymentMethod;
  }

  if (Object.keys(patch).length === 0) {
    return { ok: false, error: { field: 'body', message: 'Nothing to update.' } };
  }

  return { ok: true, patch };
}
