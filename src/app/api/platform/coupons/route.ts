/**
 * `GET /api/platform/coupons` and `POST /api/platform/coupons` — the operator console's coupon
 * list and creator.
 *
 * Both delegate every query and every state transition to `src/lib/platform/coupons.ts`; this file
 * proves the caller is a platform operator, turns a request into validated input, and records what
 * happened — see `src/app/api/platform/customers/route.ts`, whose shape this mirrors.
 *
 * `POST` is a write, unlike the read-only routes on this console: its audit row is written on the
 * same transaction client as the insert, with no `try/catch`, so a failed audit write rolls back
 * the coupon it would have described rather than leaving an unaccountable row behind.
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  platformErrorResponse,
  recordAdminAction,
  requirePlatformAdmin,
} from '@/lib/auth/platform-admin';
import { db } from '@/lib/database/connection';
import {
  createPlatformCoupon,
  listPlatformCoupons,
  type CreatePlatformCouponResult,
} from '@/lib/platform/coupons';
import { generateCouponCode } from '@/lib/billing/coupon-codes';
import { resolveCreatorNames } from './creators';
import { serializeCoupon } from './serialize';
import { parseCouponFilter, validateCreateCouponBody } from './validation';

/**
 * How many server-generated codes to try before giving up.
 *
 * A collision is astronomically unlikely at ~49.5 bits of entropy (`coupon-codes.ts`) — this turns
 * "impossible" into "handled" rather than an unlucky collision surfacing as a 500.
 */
const MAX_CODE_GENERATION_ATTEMPTS = 5;

/**
 * List platform coupons, optionally narrowed by status.
 *
 * @param request - The incoming request. `?filter=` is one of `active | inactive | expired |
 *                  exhausted | all`; anything else is treated as `all`.
 * @returns `{ success: true, data: { coupons, counts } }`. `counts` covers every coupon regardless
 *          of the requested filter, so a filter tab's own label never disagrees with its count.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const admin = await requirePlatformAdmin(request);
    const filter = parseCouponFilter(request.nextUrl.searchParams.get('filter'));

    const { coupons, counts } = await listPlatformCoupons(filter);
    const creators = await resolveCreatorNames(coupons.map((coupon) => coupon.createdBy));

    const data = {
      coupons: coupons.map((coupon) =>
        serializeCoupon(coupon, coupon.createdBy ? (creators.get(coupon.createdBy) ?? null) : null)
      ),
      counts,
    };

    await recordAdminAction(admin.userId, 'view_coupons', undefined, { filter });

    return NextResponse.json({ success: true, data });
  } catch (error) {
    return platformErrorResponse(error, 'coupons list');
  }
}

/**
 * Create a platform coupon.
 *
 * When the operator leaves `code` blank, the server generates one (retrying on the vanishingly
 * unlikely collision — see {@link MAX_CODE_GENERATION_ATTEMPTS}). A duplicate of an
 * operator-supplied code is a typed refusal from `createPlatformCoupon`, surfaced here as a 409
 * naming the `code` field rather than a raw unique-constraint 500.
 *
 * @param request - The incoming request; the JSON body is the coupon to create (see
 *                  {@link import('./validation').validateCreateCouponBody}).
 * @returns `201` with the created coupon, `400` on a field validation failure, or `409` when the
 *          code collides and cannot be resolved.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const admin = await requirePlatformAdmin(request);

    const body = await request.json().catch(() => null);
    const validation = validateCreateCouponBody(body);
    if (!validation.ok) {
      return NextResponse.json(
        { success: false, error: validation.error.message, field: validation.error.field },
        { status: 400 }
      );
    }
    const { input } = validation;

    /**
     * One attempt: one transaction, one code. A unique-violation leaves the Postgres transaction
     * aborted, so a retry with a different code must open a new `BEGIN`, not reuse this one.
     */
    const attempt = (code: string): Promise<CreatePlatformCouponResult> =>
      db.transaction(async (client) => {
        const result = await createPlatformCoupon(
          {
            code,
            name: input.name,
            notes: input.notes,
            percentOff: input.percentOff,
            durationMonths: input.durationMonths,
            collectPaymentMethod: input.collectPaymentMethod,
            maxRedemptions: input.maxRedemptions,
            redeemBy: input.redeemBy,
          },
          admin.userId,
          client
        );

        if (result.reason === 'ok') {
          // In-transaction, fail-hard audit write — see the module note. Not `recordAdminAction`,
          // which swallows its own errors by design; a write surface must not inherit that.
          await client.query(
            `INSERT INTO platform_admin_audit (admin_user_id, action, target_type, target_id, metadata)
             VALUES ($1, $2, $3, $4, $5)`,
            [
              admin.userId,
              'create_coupon',
              'platform_coupon',
              result.coupon.id,
              JSON.stringify({
                code: result.coupon.code,
                name: result.coupon.name,
                percentOff: result.coupon.percentOff,
                durationMonths: result.coupon.durationMonths,
                collectPaymentMethod: result.coupon.collectPaymentMethod,
                maxRedemptions: result.coupon.maxRedemptions,
                redeemBy: result.coupon.redeemBy,
                codeGenerated: input.code === null,
              }),
            ]
          );
        }

        return result;
      });

    let outcome: CreatePlatformCouponResult | undefined;
    if (input.code) {
      outcome = await attempt(input.code);
    } else {
      for (let i = 0; i < MAX_CODE_GENERATION_ATTEMPTS; i += 1) {
        outcome = await attempt(generateCouponCode());
        if (outcome.reason !== 'duplicate_code') break;
      }
    }

    if (!outcome || outcome.reason === 'duplicate_code') {
      return NextResponse.json(
        {
          success: false,
          error: input.code
            ? 'That code is already in use. Choose a different one.'
            : 'Could not generate a unique code. Try creating the coupon again.',
          field: 'code',
        },
        { status: 409 }
      );
    }

    const creators = await resolveCreatorNames([outcome.coupon.createdBy]);
    const createdByName = outcome.coupon.createdBy
      ? (creators.get(outcome.coupon.createdBy) ?? null)
      : null;

    return NextResponse.json(
      { success: true, data: { coupon: serializeCoupon(outcome.coupon, createdByName) } },
      { status: 201 }
    );
  } catch (error) {
    return platformErrorResponse(error, 'create coupon');
  }
}
