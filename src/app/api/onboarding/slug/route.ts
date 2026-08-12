/**
 * `GET /api/onboarding/slug?slug=northgate-supply` — live availability.
 *
 * Called (debounced) as the merchant types their store name, so "that address
 * is taken" arrives while they are still choosing rather than on submit. The
 * merchant's own store is never reported as a conflict with itself, so going
 * back to step 2 and saving again does not suddenly claim the address is gone.
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/database/connection';
import { suggestSlugs, validateSlug } from '@/components/onboarding/lib/slug';
import { requireOnboarding } from '../_lib/state';

export interface SlugAvailability {
  slug: string;
  available: boolean;
  /** Why not, in merchant-facing words. */
  message?: string;
  /** Alternatives, only when the address is taken. */
  suggestions?: string[];
}

/**
 * Check whether a store address is free.
 *
 * @param request - Query string: `slug`
 * @returns 200 with {@link SlugAvailability}
 */
export async function GET(request: NextRequest) {
  try {
    const context = await requireOnboarding(request);
    if (!context) {
      return NextResponse.json(
        { message: 'You’ve been signed out. Sign in to pick up where you left off.' },
        { status: 401 }
      );
    }

    const slug = (new URL(request.url).searchParams.get('slug') ?? '').trim().toLowerCase();
    const validation = validateSlug(slug);
    if (!validation.valid) {
      const payload: SlugAvailability = {
        slug,
        available: false,
        message: validation.message,
        ...(validation.problem === 'reserved' ? { suggestions: suggestSlugs(slug) } : {}),
      };
      return NextResponse.json(payload);
    }

    const taken = await db.query<{ id: string }>(
      'SELECT id FROM stores WHERE store_slug = $1 AND ($2::uuid IS NULL OR id <> $2::uuid) LIMIT 1',
      [slug, context.row.store_id]
    );

    if (taken.rows.length > 0) {
      const payload: SlugAvailability = {
        slug,
        available: false,
        message: 'That address is taken. Try another.',
        suggestions: await freeSuggestions(slug, context.row.store_id),
      };
      return NextResponse.json(payload);
    }

    return NextResponse.json({ slug, available: true } satisfies SlugAvailability);
  } catch (error) {
    console.error('[onboarding/slug] failed:', error);
    return NextResponse.json(
      { message: 'We couldn’t check that address. Check your connection and try again.' },
      { status: 500 }
    );
  }
}

/**
 * Filter the deterministic suggestion list down to addresses that are actually
 * free — offering a taken alternative would be worse than offering none.
 *
 * @param slug - The rejected slug
 * @param ownStoreId - The merchant's own store, which never counts as a clash
 * @returns Up to three free suggestions
 */
async function freeSuggestions(slug: string, ownStoreId: string | null): Promise<string[]> {
  const candidates = suggestSlugs(slug, 5);
  if (candidates.length === 0) return [];
  const result = await db.query<{ store_slug: string }>(
    'SELECT store_slug FROM stores WHERE store_slug = ANY($1) AND ($2::uuid IS NULL OR id <> $2::uuid)',
    [candidates, ownStoreId]
  );
  const taken = new Set(result.rows.map((row) => row.store_slug));
  return candidates.filter((candidate) => !taken.has(candidate)).slice(0, 3);
}
