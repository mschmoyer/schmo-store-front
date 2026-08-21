/**
 * Draft storefront theme API (spec section 9).
 *
 *   GET  /api/admin/storefront-theme  - read the authenticated store's draft
 *   PUT  /api/admin/storefront-theme  - save the draft
 *
 * Both require a session; drafts are unpublished work and are never readable
 * without one. Every payload goes through Zod before it reaches the database,
 * so bad input is a 400 with field errors, never a 500.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { requireAuth } from '@/lib/auth/session';
import { getDraftTheme, getPublishedTheme, saveDraft } from '@/lib/storefront-theme/db';
import { mintPreviewToken } from '@/lib/storefront-theme/preview';
import { PRESET_LIST } from '@/lib/storefront-theme/presets';
import { auditContrast } from '@/lib/storefront-theme/resolve';
import { SECTION_LIST, normalizeSections } from '@/lib/storefront-theme/sections';
import { FONT_LIST } from '@/lib/storefront-theme/fonts';
import { saveDraftBodySchema } from '@/lib/storefront-theme/types';

import { badRequest, resolveStoreId, unauthorized, zodFieldErrors } from './auth';

export const dynamic = 'force-dynamic';

/**
 * Read the authenticated store's draft theme, plus everything the customizer
 * needs to render its panels: the preset gallery, the font registry and the
 * section registry.
 * @param request - Incoming request
 * @returns The draft theme, sections, registries and a fresh preview token
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  let storeId: string;
  let storeSlug = '';
  let storeName = '';
  try {
    const user = await requireAuth(request);
    const resolved = resolveStoreId(user);
    if (!resolved) return badRequest('This account is not linked to a store.');
    storeId = resolved;
    // The customizer needs the slug to build its preview iframe URL and the
    // name for its top bar. Both come from the session, like the store id.
    storeSlug = user.storeSlug ?? '';
    storeName = user.storeName ?? '';
  } catch {
    return unauthorized();
  }

  try {
    const draft = await getDraftTheme(storeId);
    const previewToken = await mintPreviewToken(storeId);
    // The published row is what the customizer diffs the draft against in its
    // publish confirmation, so the merchant sees what is about to change.
    const published = await getPublishedTheme(storeId);

    return NextResponse.json({
      success: true,
      data: {
        storeId,
        storeSlug,
        storeName,
        theme: draft?.raw ?? {},
        resolvedTheme: draft?.theme ?? null,
        sections: draft?.sections ?? [],
        navigation: draft?.navigation ?? {},
        version: draft?.version ?? 0,
        updatedAt: draft?.updatedAt ?? null,
        contrast: draft ? auditContrast(draft.theme) : [],
        previewToken,
        published: published
          ? {
              theme: published.raw,
              sections: published.sections,
              navigation: published.navigation,
              version: published.version,
              publishedAt: published.publishedAt,
            }
          : null,
        registries: {
          presets: PRESET_LIST,
          fonts: FONT_LIST,
          sections: SECTION_LIST,
        },
      },
    });
  } catch (error) {
    console.error('Failed to read storefront theme draft:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to load the storefront theme.' },
      { status: 500 },
    );
  }
}

/**
 * Save the authenticated store's draft theme and/or sections.
 * @param request - Incoming request with a `{ theme?, sections? }` JSON body
 * @returns The saved draft
 */
export async function PUT(request: NextRequest): Promise<NextResponse> {
  let storeId: string;
  try {
    const user = await requireAuth(request);
    const resolved = resolveStoreId(user);
    if (!resolved) return badRequest('This account is not linked to a store.');
    storeId = resolved;
  } catch {
    return unauthorized();
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return badRequest('Request body must be valid JSON.');
  }

  const parsed = saveDraftBodySchema.safeParse(body);
  if (!parsed.success) {
    return badRequest('The theme payload is not valid.', zodFieldErrors(parsed.error));
  }

  // Sections are additionally normalised: unknown types and over-limit
  // duplicates are dropped rather than rejected, so a stale customizer build
  // cannot lock a merchant out of saving.
  let sections = parsed.data.sections;
  let problems: string[] = [];
  if (sections !== undefined) {
    const normalized = normalizeSections(sections);
    sections = normalized.sections;
    problems = normalized.problems;
  }

  try {
    const draft = await saveDraft(storeId, parsed.data.theme, sections, parsed.data.navigation);
    return NextResponse.json({
      success: true,
      data: {
        storeId,
        theme: draft.raw,
        resolvedTheme: draft.theme,
        sections: draft.sections,
        version: draft.version,
        updatedAt: draft.updatedAt,
        contrast: auditContrast(draft.theme),
        warnings: problems,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return badRequest('The theme payload is not valid.', zodFieldErrors(error));
    }
    console.error('Failed to save storefront theme draft:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to save the storefront theme.' },
      { status: 500 },
    );
  }
}
