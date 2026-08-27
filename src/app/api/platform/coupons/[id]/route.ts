/**
 * `PATCH /api/platform/coupons/[id]` — edit a coupon's name, notes, `redeemBy` or `isActive`
 * (plan §9, phase 3). This is also how the console deactivates a code: `{ isActive: false }`, no
 * separate endpoint — there is no `DELETE` here, matching the schema's `ON DELETE RESTRICT` on
 * redemption history (plan §3 rule 2).
 *
 * Economics (`percentOff`, `durationMonths`, `collectPaymentMethod`) are never written. A patch
 * that names one of them is passed through to `updatePlatformCoupon` anyway — see
 * `./validation.ts` — specifically so that function's typed `economics_immutable` refusal reaches
 * the caller as a 409 naming the field, rather than the request either silently dropping the
 * attempt or hitting a database error.
 *
 * Like `POST /api/platform/coupons`, this is a write surface: the audit row is inserted on the same
 * transaction client as the update, uncaught, so a failed audit write fails the whole request
 * instead of leaving an unaccountable change on the table.
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  platformErrorResponse,
  requirePlatformAdmin,
} from '@/lib/auth/platform-admin';
import { db, validateUUID } from '@/lib/database/connection';
import { updatePlatformCoupon } from '@/lib/platform/coupons';
import { resolveCreatorNames } from '../creators';
import { serializeCoupon } from '../serialize';
import { validatePatchCouponBody } from '../validation';

/**
 * Edit a coupon.
 *
 * @param request - The incoming request; the JSON body carries the fields to change.
 * @param context - Route context whose `params` promise resolves to the coupon's `id`.
 * @returns `200` with the updated coupon, `400` for a malformed id or body, `404` for an unknown
 *          coupon, or `409` when the patch tried to touch the coupon's economics.
 */
export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const admin = await requirePlatformAdmin(request);
    const { id } = await context.params;

    if (!validateUUID(id)) {
      return NextResponse.json({ success: false, error: 'Invalid coupon id' }, { status: 400 });
    }

    const body = await request.json().catch(() => null);
    const validation = validatePatchCouponBody(body);
    if (!validation.ok) {
      return NextResponse.json(
        { success: false, error: validation.error.message, field: validation.error.field },
        { status: 400 }
      );
    }
    const { patch } = validation;

    const action = patch.isActive === false ? 'deactivate_coupon' : 'update_coupon';

    const outcome = await db.transaction(async (client) => {
      const result = await updatePlatformCoupon(id, patch, client);

      if (result.reason === 'ok') {
        // In-transaction, fail-hard audit write — see the module note and the sibling `POST` route.
        await client.query(
          `INSERT INTO platform_admin_audit (admin_user_id, action, target_type, target_id, metadata)
           VALUES ($1, $2, $3, $4, $5)`,
          [
            admin.userId,
            action,
            'platform_coupon',
            id,
            JSON.stringify({
              name: patch.name,
              notes: patch.notes,
              redeemBy: patch.redeemBy,
              isActive: patch.isActive,
            }),
          ]
        );
      }

      return result;
    });

    if (outcome.reason === 'not_found') {
      return NextResponse.json({ success: false, error: 'Coupon not found' }, { status: 404 });
    }

    if (outcome.reason === 'economics_immutable') {
      return NextResponse.json(
        {
          success: false,
          error: `${outcome.fields.join(', ')} cannot be changed once a coupon exists — deactivate this code and create a new one instead.`,
          fields: outcome.fields,
        },
        { status: 409 }
      );
    }

    const creators = await resolveCreatorNames([outcome.coupon.createdBy]);
    const createdByName = outcome.coupon.createdBy
      ? (creators.get(outcome.coupon.createdBy) ?? null)
      : null;

    return NextResponse.json({
      success: true,
      data: { coupon: serializeCoupon(outcome.coupon, createdByName) },
    });
  } catch (error) {
    return platformErrorResponse(error, 'update coupon');
  }
}
