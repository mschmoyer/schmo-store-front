/**
 * `POST /api/onboarding/store` — step 2.
 *
 * Creates the store on first save and renames it on subsequent saves, so a
 * merchant who walks back to step 2 edits their store rather than creating a
 * second one.
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/database/connection';
import { slugify, validateSlug } from '@/components/onboarding/lib/slug';
import { backfillStoreId } from '@/lib/billing/coupon-claims';
import { buildState, originOf, persist, requireOnboarding } from '../_lib/state';

const UNIQUE_VIOLATION = '23505';
const SLUG_TAKEN = 'That address is taken. Try another.';

interface StoreRequest {
  name?: string;
  slug?: string;
  description?: string;
}

/**
 * Create or update the merchant's store.
 *
 * @param request - JSON body: name, slug, description
 * @returns 200 with the updated onboarding state, or a field-level 400/409
 */
export async function POST(request: NextRequest) {
  try {
    const context = await requireOnboarding(request);
    if (!context) {
      return NextResponse.json(
        { message: 'You’ve been signed out. Sign in to pick up where you left off.' },
        { status: 401 }
      );
    }

    const body = (await request.json().catch(() => ({}))) as StoreRequest;
    const name = (body.name ?? '').trim();
    const description = (body.description ?? '').trim();
    const slug = (body.slug ?? '').trim().toLowerCase() || slugify(name);

    const fieldErrors: Record<string, string> = {};
    if (!name) fieldErrors.name = 'Enter a store name';
    else if (name.length > 255) fieldErrors.name = 'Keep this under 256 characters';
    const slugValidation = validateSlug(slug);
    if (!slugValidation.valid) fieldErrors.slug = slugValidation.message ?? 'Enter a store address';
    if (description.length > 500) fieldErrors.description = 'Keep this under 501 characters';

    if (Object.keys(fieldErrors).length > 0) {
      return NextResponse.json(
        { message: 'Check the highlighted fields.', fieldErrors },
        { status: 400 }
      );
    }

    const heroTitle = name;
    const heroDescription = description || `Everything ${name} sells, in one place.`;

    let storeId = context.row.store_id;

    try {
      if (storeId) {
        await db.query(
          `UPDATE stores
              SET store_name = $2, store_slug = $3, store_description = $4,
                  hero_title = $5, hero_description = $6,
                  meta_title = $2, meta_description = $4, updated_at = NOW()
            WHERE id = $1`,
          [storeId, name, slug, description, heroTitle, heroDescription]
        );
      } else {
        const inserted = await db.query<{ id: string }>(
          `INSERT INTO stores (
              owner_id, store_name, store_slug, store_description, hero_title, hero_description,
              theme_name, currency, is_active, is_public, allow_guest_checkout,
              meta_title, meta_description
           ) VALUES ($1, $2, $3, $4, $5, $6, 'default', 'USD', true, false, true, $2, $4)
           RETURNING id`,
          [context.session.userId, name, slug, description, heroTitle, heroDescription]
        );
        storeId = String(inserted.rows[0].id);
      }
    } catch (error) {
      if ((error as { code?: string })?.code === UNIQUE_VIOLATION) {
        return NextResponse.json(
          { message: SLUG_TAKEN, fieldErrors: { slug: SLUG_TAKEN } },
          { status: 409 }
        );
      }
      throw error;
    }

    // Coupon attribution happens at account creation, before any store exists; backfill it now.
    // Best-effort — must never fail store creation. A merchant with no live claim is a no-op.
    if (storeId) {
      try {
        await backfillStoreId(context.session.userId, storeId);
      } catch (error) {
        console.error('[onboarding/store] coupon store backfill failed:', error);
      }
    }

    const row = await persist(context.row, {
      complete: 'store',
      storeId: storeId ?? undefined,
      data: { storeName: name, storeSlug: slug, storeDescription: description },
    });

    return NextResponse.json({
      state: await buildState({ session: context.session, row }, originOf(request)),
    });
  } catch (error) {
    console.error('[onboarding/store] failed:', error);
    return NextResponse.json(
      { message: 'We couldn’t save that. Check your connection and try again.' },
      { status: 500 }
    );
  }
}
