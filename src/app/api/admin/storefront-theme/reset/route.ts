/**
 * POST /api/admin/storefront-theme/reset
 *
 * Throws away the draft and restores it from the published theme. When nothing
 * has ever been published, the draft resets to the shipped defaults, so a
 * merchant can always get back to a good-looking store.
 *
 * Optional body: `{ "preset": "voltage" }` resets to a named preset instead,
 * which is what the customizer's "start from a preset" action calls.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { requireAuth } from '@/lib/auth/session';
import { resetDraft, saveDraft } from '@/lib/storefront-theme/db';
import { getPreset } from '@/lib/storefront-theme/presets';
import { auditContrast } from '@/lib/storefront-theme/resolve';
import { defaultSections } from '@/lib/storefront-theme/sections';

import { badRequest, resolveStoreId, unauthorized, zodFieldErrors } from '../auth';

export const dynamic = 'force-dynamic';

const resetBodySchema = z
  .object({ preset: z.string().min(1).max(64).optional() })
  .strict();

/**
 * Reset the draft to the published theme, or to a named preset.
 * @param request - Incoming request, optionally carrying `{ preset }`
 * @returns The restored draft
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  let storeId: string;
  try {
    const user = await requireAuth(request);
    const resolved = resolveStoreId(user);
    if (!resolved) return badRequest('This account is not linked to a store.');
    storeId = resolved;
  } catch {
    return unauthorized();
  }

  // An empty body is the common case; treat unparseable bodies as empty rather
  // than failing a destructive-but-recoverable action on a technicality.
  let body: unknown = {};
  try {
    const text = await request.text();
    if (text.trim().length > 0) body = JSON.parse(text);
  } catch {
    return badRequest('Request body must be valid JSON.');
  }

  const parsed = resetBodySchema.safeParse(body);
  if (!parsed.success) {
    return badRequest('The reset payload is not valid.', zodFieldErrors(parsed.error));
  }

  try {
    let draft;
    if (parsed.data.preset) {
      const preset = getPreset(parsed.data.preset);
      if (!preset) {
        return badRequest(`Unknown preset "${parsed.data.preset}".`, {
          preset: ['Not one of the available presets.'],
        });
      }
      draft = await saveDraft(storeId, { preset: preset.id }, defaultSections());
    } else {
      draft = await resetDraft(storeId);
    }

    return NextResponse.json({
      success: true,
      data: {
        storeId,
        theme: draft.raw,
        resolvedTheme: draft.theme,
        sections: draft.sections,
        version: draft.version,
        contrast: auditContrast(draft.theme),
      },
    });
  } catch (error) {
    console.error('Failed to reset storefront theme draft:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to reset the storefront theme.' },
      { status: 500 },
    );
  }
}
