/**
 * Wire validation for the variant editor.
 *
 * Kept out of the route so the rules can be unit-tested without a request, and
 * so the editor can run the same schema client-side to show inline errors
 * before anything is sent.
 *
 * The cross-field rules are the ones that matter. A payload can be perfectly
 * well-typed and still describe an impossible product — a variant naming a
 * colour the colour axis does not offer, two variants claiming the same
 * combination, a SKU used twice. Each of those is a merchant mistake that would
 * otherwise surface as a database constraint error with no field attached to
 * it, so they are checked here where they can be pointed at an input.
 */

import { z } from 'zod';

import { isRenderableImageUrl } from '@/lib/images/renderable';
import { MAX_OPTION_AXES, MAX_OPTION_VALUES } from './variants';

/** Hex colour for a swatch. Same shape the theme engine accepts. */
const swatchSchema = z
  .string()
  .trim()
  .regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, 'Use a hex colour such as #4a5d4f');

const optionValueMetaSchema = z
  .object({
    swatch: swatchSchema,
    image: z.string().trim().max(2048),
  })
  .partial()
  .strict();

export const optionInputSchema = z
  .object({
    name: z.string().trim().min(1, 'An option needs a name').max(60),
    position: z.number().int().min(1).max(MAX_OPTION_AXES),
    values: z
      .array(z.string().trim().min(1).max(120))
      .min(1, 'An option needs at least one value')
      .max(MAX_OPTION_VALUES)
      .superRefine((values, ctx) => {
        // Case-insensitively, because "Green" and "green" are one colour to a
        // shopper and two rows to Postgres.
        const seen = new Set<string>();
        for (const [index, value] of values.entries()) {
          const key = value.toLowerCase();
          if (seen.has(key)) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: [index],
              message: `"${value}" is listed twice`,
            });
          }
          seen.add(key);
        }
      }),
    valueMeta: z.record(optionValueMetaSchema).optional(),
  })
  .strict();

export const variantInputSchema = z
  .object({
    id: z.string().uuid().optional(),
    sku: z.string().trim().min(1, 'Every variant needs a SKU').max(255),
    options: z.array(z.string().trim().max(120).nullable()).max(MAX_OPTION_AXES),
    // Money crosses the wire as integer cents, like everywhere else in the
    // application. `null` means "inherit the product", which is a different
    // statement from 0 and must survive the round trip.
    priceCents: z.number().int().min(0).max(100_000_000).nullable(),
    salePriceCents: z.number().int().min(0).max(100_000_000).nullable(),
    stockQuantity: z.number().int().min(0).max(1_000_000),
    trackInventory: z.boolean().nullable(),
    allowBackorder: z.boolean().nullable(),
    // A variant image ends up in `next/image`, so an unrenderable value here —
    // `javascript:`, `data:`, a protocol-relative `//host` — is rejected on the
    // way in rather than silently dropped at render. Empty is normalised to null.
    imageUrl: z
      .string()
      .trim()
      .max(2048)
      .nullable()
      .transform((value) => (value === '' ? null : value))
      .refine(
        (value) => value === null || isRenderableImageUrl(value),
        'Image must be an https URL or a store path such as /uploads/green.jpg',
      ),
    position: z.number().int().min(1).max(10_000),
    isActive: z.boolean(),
  })
  .strict();

/** Cap on variants for one product. Three axes of 10, 10 and 5 is already 500. */
export const MAX_VARIANTS_PER_PRODUCT = 500;

export const saveVariantsBodySchema = z
  .object({
    options: z.array(optionInputSchema).max(MAX_OPTION_AXES),
    variants: z.array(variantInputSchema).max(MAX_VARIANTS_PER_PRODUCT),
  })
  .strict()
  .superRefine((body, ctx) => {
    // Axis positions must run 1..n with no gaps and no repeats: they map onto
    // option1/option2/option3, and a gap would leave a variant column no axis
    // explains.
    const positions = body.options.map((option) => option.position).sort((a, b) => a - b);
    const expected = body.options.map((_, index) => index + 1);
    if (positions.join(',') !== expected.join(',')) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['options'],
        message: 'Option positions must run 1, 2, 3 with no gaps or repeats',
      });
    }

    const names = new Set<string>();
    for (const [index, option] of body.options.entries()) {
      const key = option.name.trim().toLowerCase();
      if (names.has(key)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['options', index, 'name'],
          message: `"${option.name}" is used by another option`,
        });
      }
      names.add(key);
    }

    // A product either has options and variants, or neither. Variants with no
    // axes cannot be selected; axes with no variants offer a shopper nothing to
    // buy. Both are silent dead ends on the storefront.
    if (body.options.length === 0 && body.variants.length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['options'],
        message: 'Add at least one option, or remove the variants',
      });
    }
    if (body.options.length > 0 && body.variants.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['variants'],
        message: 'Add at least one variant, or remove the options',
      });
    }

    // Values a variant may name, per axis, in position order.
    const allowed = body.options
      .slice()
      .sort((a, b) => a.position - b.position)
      .map((option) => new Set(option.values.map((value) => value.toLowerCase())));

    const skus = new Set<string>();
    const combinations = new Set<string>();

    for (const [index, variant] of body.variants.entries()) {
      const sku = variant.sku.trim().toLowerCase();
      if (skus.has(sku)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['variants', index, 'sku'],
          message: `SKU "${variant.sku}" is used by another variant`,
        });
      }
      skus.add(sku);

      for (let axis = 0; axis < allowed.length; axis += 1) {
        const value = variant.options[axis];
        if (!value) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['variants', index, 'options', axis],
            message: `Choose a value for "${body.options[axis]?.name ?? `option ${axis + 1}`}"`,
          });
          continue;
        }
        if (!allowed[axis].has(value.toLowerCase())) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['variants', index, 'options', axis],
            message: `"${value}" is not one of the values for "${body.options[axis]?.name}"`,
          });
        }
      }

      // JSON rather than a joined string: option values are free text, and any
      // separator a merchant could also type would make "Red/Blue" collide with
      // ["Red", "Blue"].
      const key = JSON.stringify(
        variant.options.slice(0, allowed.length).map((value) => (value ?? '').toLowerCase()),
      );
      if (combinations.has(key)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['variants', index, 'options'],
          message: 'Another variant already covers this combination',
        });
      }
      combinations.add(key);

      // A sale price at or above the regular price is not a sale. The renderer
      // ignores it rather than showing a fake discount, so accepting it here
      // would store a value that silently does nothing.
      if (
        variant.salePriceCents !== null &&
        variant.priceCents !== null &&
        variant.salePriceCents >= variant.priceCents
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['variants', index, 'salePriceCents'],
          message: 'A sale price must be below the variant price',
        });
      }
    }
  });

export type SaveVariantsBody = z.infer<typeof saveVariantsBodySchema>;
