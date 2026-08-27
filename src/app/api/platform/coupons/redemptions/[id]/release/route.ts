/**
 * `POST /api/platform/coupons/redemptions/[id]/release` — the operator kill switch for a pending
 * claim (plan `docs/plans/platform-coupons.md` §6: "an operator releases it").
 *
 * Before this route existed, {@link releaseClaim} was exported and unit-tested but reachable from
 * no route and no UI — the console had no way to stop 300 people redeeming a coupon that leaked
 * publicly while their claims sat `attributed`. This is the write surface that closes that gap.
 *
 * Only an `attributed` claim can be released; releasing a `redeemed` one would misrepresent money
 * that already changed hands as a reservation that quietly expired, so {@link releaseClaim} refuses
 * it and this route surfaces that refusal as a `409`, never a `500` (plan §11, and the finding this
 * route fixes). Releasing an already-`released` claim is a no-op success — the same idempotency
 * `POST /api/platform/coupons` and `PATCH /api/platform/coupons/[id]` already give their own
 * operations.
 *
 * Like the other mutating routes under `/api/platform/coupons`, the audit row is written on the
 * same transaction client as the release, uncaught, so a failed audit write rolls back the release
 * rather than leaving an unaccountable state change on the ledger.
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  platformErrorResponse,
  requirePlatformAdmin,
} from '@/lib/auth/platform-admin';
import { db, validateUUID } from '@/lib/database/connection';
import { releaseClaim, type ReleaseClaimResult } from '@/lib/billing/coupon-claims';

/** `release_reason` written when an operator releases a claim from the console. */
export const RELEASE_REASON_OPERATOR_RELEASED = 'operator_released';

/**
 * Release one `attributed` claim.
 *
 * @param request - The incoming request. No body is read — the id in the path is the whole input.
 * @param context - Route context whose `params` promise resolves to the redemption's `id`.
 * @returns `200` with the released claim (idempotent on an already-`released` one), `400` for a
 *          malformed id, `404` for an unknown redemption, or `409` when the claim is `redeemed` and
 *          the release is refused.
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const admin = await requirePlatformAdmin(request);
    const { id } = await context.params;

    if (!validateUUID(id)) {
      return NextResponse.json({ success: false, error: 'Invalid redemption id' }, { status: 400 });
    }

    const outcome = await db.transaction<ReleaseClaimResult>(async (client) => {
      const result = await releaseClaim(id, RELEASE_REASON_OPERATOR_RELEASED, client);

      if (result.reason === 'ok') {
        // In-transaction, fail-hard audit write — see the module note and the sibling coupon
        // routes. Not `recordAdminAction`: that helper swallows its own errors by design for the
        // console's read surfaces, and a write surface must not inherit that.
        await client.query(
          `INSERT INTO platform_admin_audit (admin_user_id, action, target_type, target_id, metadata)
           VALUES ($1, $2, $3, $4, $5)`,
          [
            admin.userId,
            'release_coupon_claim',
            'platform_coupon_redemption',
            id,
            JSON.stringify({ releaseReason: RELEASE_REASON_OPERATOR_RELEASED }),
          ]
        );
      }

      return result;
    });

    if (outcome.reason === 'not_found') {
      return NextResponse.json({ success: false, error: 'Redemption not found' }, { status: 404 });
    }

    if (outcome.reason === 'illegal_transition') {
      return NextResponse.json(
        {
          success: false,
          error:
            'This claim has already been redeemed — a paid subscription cannot be released as an expired reservation.',
        },
        { status: 409 }
      );
    }

    // 'ok' and 'already_released' both carry a claim and both are a success from the caller's
    // side: the seat is (now, or already) released. Distinguishing them in the response would ask
    // the console to render two success states for the one fact an operator cares about.
    return NextResponse.json({
      success: true,
      data: {
        redemption: {
          id: outcome.claim.id,
          status: outcome.claim.status,
          releasedAt: outcome.claim.releasedAt ? outcome.claim.releasedAt.toISOString() : null,
          releaseReason: outcome.claim.releaseReason,
        },
      },
    });
  } catch (error) {
    return platformErrorResponse(error, 'release coupon redemption');
  }
}
