/**
 * AI page composer.
 *
 *   POST /api/admin/ai/compose-page   { prompt, apply?, preset? }
 *
 * The goal for this platform named "using AI to help craft your site — prompt +
 * fix up" as a headline feature, and this is the "prompt" half. A merchant
 * describes their shop in a sentence or two; a model proposes a home-page
 * composition; the result is validated hard and returned (and, when `apply` is
 * set, saved as the store's *draft* so the merchant reviews it in the customizer
 * before it ever goes live — the "fix up" half).
 *
 * Three properties matter here and are the reason this route is more than a
 * thin passthrough:
 *
 *  - **The model is never trusted.** Its output goes through `composeSections`,
 *    which drops section types this renderer cannot draw, coerces every setting
 *    against the registry schema, rejects a `javascript:` image, and clamps the
 *    page to one screen. What is returned always satisfies the same contract a
 *    hand-built page does. This was the goal's "LIMITED SECURE" requirement.
 *  - **It degrades, it does not crash.** With no `OPENAI_API_KEY` the route
 *    returns a labelled "not configured" state, never a 500 — the same rule the
 *    rest of the platform's unconfigured integrations follow, and the reason
 *    CI's keyless build stays green.
 *  - **It is rate limited and input capped.** A paid model call on a merchant's
 *    behalf is a cost and a DoS surface; the prompt is bounded and the caller is
 *    limited per store.
 */

import { NextRequest, NextResponse } from 'next/server';

import { requireAuth } from '@/lib/auth/session';
import { OpenAIService } from '@/lib/services/openai';
import { rateLimit } from '@/lib/ai/rate-limit';
import { composeSections, COMPOSER_SECTION_GUIDE } from '@/lib/storefront-theme/compose';
import { saveDraft } from '@/lib/storefront-theme/db';
import { SECTION_TYPES } from '@/lib/storefront-theme/types';

import { badRequest, resolveStoreId, unauthorized } from '../../storefront-theme/auth';

export const dynamic = 'force-dynamic';

/** Longest prompt accepted. A merchant describes a shop, not writes an essay. */
const MAX_PROMPT_CHARS = 2_000;

/** Compositions a store may request per window, and the window length. */
const RATE_LIMIT = 8;
const RATE_WINDOW_MS = 60_000;

/**
 * The function schema the model must fill: an ordered list of sections, each a
 * known type plus a free-form settings object. Settings are validated after the
 * call by `composeSections`, so the schema keeps them open rather than trying to
 * describe every section's fields to the model.
 */
const COMPOSE_FUNCTION_SCHEMA = {
  type: 'object',
  properties: {
    sections: {
      type: 'array',
      description: 'The home page, top to bottom.',
      items: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: [...SECTION_TYPES] },
          settings: {
            type: 'object',
            description: 'Section settings such as heading, subheading, layout. Copy in plain text.',
            additionalProperties: true,
          },
        },
        required: ['type'],
      },
    },
  },
  required: ['sections'],
} as const;

/** What a section is for, given to the model so it composes sensibly. */
const SECTION_GUIDE_TEXT = SECTION_TYPES.map(
  (type) => `- ${type}: ${COMPOSER_SECTION_GUIDE[type]}`,
).join('\n');

const SYSTEM_PROMPT = `You design e-commerce storefront home pages as an ordered list of sections.

Rules you must follow:
- Use only these section types:
${SECTION_GUIDE_TEXT}
- Open with exactly one hero.
- Write real, specific copy in the merchant's voice — headlines, supporting lines, value props. Never use placeholder text like "Lorem ipsum" or "[Your headline]".
- Do not promise anything a merchant could be held to that you were not told: no delivery times, no free-shipping thresholds, no return windows, no discounts. Reassurances must be things any shop can honestly say.
- Point buttons at real store paths such as /products or /pages/about. Never invent an external URL.
- Keep it to a focused page: 5 to 8 sections is usually right.
- Put image fields as empty strings unless the merchant gave you a URL; the merchant adds photography afterwards.`;

/**
 * Build the user prompt from the merchant's description.
 * @param description - The merchant's sentence(s) about their shop
 * @returns The user message for the model
 */
function buildUserPrompt(description: string): string {
  return `Design a storefront home page for this business:\n\n${description}\n\nReturn the sections in display order.`;
}

interface ComposeResponse {
  sections?: unknown;
}

/**
 * Compose a home page from a prompt.
 * @param request - Carries `{ prompt, apply?, preset? }`
 * @returns The validated sections, what was corrected, and whether it was saved
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

  let body: { prompt?: unknown; apply?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return badRequest('Request body must be valid JSON.');
  }

  const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
  if (prompt.length === 0) {
    return badRequest('Describe your business so the generator has something to work from.');
  }
  if (prompt.length > MAX_PROMPT_CHARS) {
    return badRequest(`Keep the description under ${MAX_PROMPT_CHARS} characters.`);
  }
  const apply = body.apply === true;

  // Rate limit before spending a model call.
  const gate = rateLimit(`compose-page:${storeId}`, RATE_LIMIT, RATE_WINDOW_MS);
  if (!gate.ok) {
    return NextResponse.json(
      {
        success: false,
        error: `You have generated a lot of pages just now. Try again in ${gate.retryAfterSeconds}s.`,
      },
      { status: 429, headers: { 'Retry-After': String(gate.retryAfterSeconds) } },
    );
  }

  // Degrade rather than crash when the integration is not configured.
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json(
      {
        success: false,
        error: 'AI page generation is not configured on this store. Ask your administrator to set OPENAI_API_KEY.',
        data: { configured: false },
      },
      { status: 503 },
    );
  }

  let proposed: unknown;
  try {
    const ai = OpenAIService.getInstance();
    const result = await ai.generateWithFunctionCalling<ComposeResponse>(
      SYSTEM_PROMPT,
      buildUserPrompt(prompt),
      COMPOSE_FUNCTION_SCHEMA,
      'compose_page',
    );
    proposed = result.sections;
  } catch (error) {
    console.error('AI page composition failed:', error);
    return NextResponse.json(
      { success: false, error: 'The generator could not produce a page. Try rephrasing your description.' },
      { status: 502 },
    );
  }

  const { sections, problems } = composeSections(proposed);

  let applied = false;
  if (apply) {
    try {
      // Saved as a draft, never published. The merchant reviews and publishes
      // from the customizer — the AI proposes, the merchant decides.
      await saveDraft(storeId, undefined, sections);
      applied = true;
    } catch (error) {
      console.error('Failed to save AI-composed draft:', error);
      return NextResponse.json(
        { success: false, error: 'The page was generated but could not be saved as a draft.' },
        { status: 500 },
      );
    }
  }

  return NextResponse.json({
    success: true,
    data: {
      sections,
      // Named `notes` rather than `problems`: to the merchant these are "what I
      // adjusted", not errors they caused.
      notes: problems.map((problem) => problem.message),
      applied,
      message: applied
        ? 'Generated and saved as a draft. Open the customizer to review and publish.'
        : 'Generated a draft page. Review it, then apply it to your store.',
    },
  });
}
