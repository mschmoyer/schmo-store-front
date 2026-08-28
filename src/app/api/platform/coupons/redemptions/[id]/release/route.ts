/**
 * `POST /api/platform/coupons/redemptions/[id]/release` — the operator kill switch for a pending
 * claim: releasing a coupon that leaked publicly stops further redemptions while claims still sit
 * `attributed`, without touching anyone already converted.
 *
 * Only an `attributed` claim can be released; releasing a `redeemed` one would misrepresent money
 * that already changed hands as a reservation that quietly expired, so {@link releaseClaim} refuses
 * it and this route surfaces that as a `409`, never a `500`. Releasing an already-`released` claim
 * is a no-op success, the same idempotency the sibling coupon routes give their own operations.
 *
 * Like the other mutating routes under `/api/platform/coupons`, the audit row is written on the
 * same transaction client as the release, uncaught, so a failed audit write rolls back the release.
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
        // In-transaction, fail-hard audit write — see the module note and the sibling coupon routes.
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

    // 'ok' and 'already_released' both respond as success — the seat is (now, or already)
    // released, which is the one fact an operator cares about.
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
