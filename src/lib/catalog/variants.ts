/**
 * Product options and variants — the domain rules.
 *
 * Pure functions only: no database, no React. The persistence layer
 * (`variants.db.ts`), the storefront renderer and the admin editor all agree on
 * pricing, availability and naming by importing from here, which is the only
 * way three surfaces stay consistent about "what does this variant cost".
 *
 * The inheritance rule is the load-bearing one. A variant's `price`,
 * `salePrice`, `trackInventory` and `allowBackorder` are all nullable, and NULL
 * means *inherit the product*. A merchant selling ten sizes at one price sets
 * that price once, on the product; a merchant charging more for XXL overrides
 * that single row. Copying the product's price onto every variant at write time
 * would have made a price change a ten-row update that a failure could leave
 * half-applied — and it would have stopped inheriting the moment somebody
 * edited the product.
 *
 * Money is in **integer cents** throughout, per the working rules. The database
 * columns are `DECIMAL(10,2)` dollars, and that conversion belongs in the
 * persistence layer, not here.
 */

/** Maximum option axes on one product. Matches `option1..3` in migration 026. */
export const MAX_OPTION_AXES = 3;

/** Maximum choices on a single axis. Beyond this a selector stops being usable. */
export const MAX_OPTION_VALUES = 100;

/** Presentation for one choice on an axis. */
export interface OptionValueMeta {
  /** Hex colour, when the axis should render as swatches rather than a dropdown. */
  swatch?: string;
  /** Image to show when this value is picked. */
  image?: string;
}

/** One option axis: "Size", with its ordered choices. */
export interface ProductOption {
  id: string;
  name: string;
  /** 1-based, and which of `option1..3` on a variant this axis fills. */
  position: number;
  /** Ordered choices. Order is merchandising — sizes must read small-to-large. */
  values: string[];
  /** Per-value presentation, keyed by value. */
  valueMeta: Record<string, OptionValueMeta>;
}

/** One purchasable combination. Nullable money fields inherit from the product. */
export interface ProductVariant {
  id: string;
  sku: string;
  /** Chosen value per axis, index 0 = option1. `null` where the axis is unused. */
  options: (string | null)[];
  /** Cents. `null` inherits the product's price. */
  priceCents: number | null;
  /** Cents. `null` means "no sale price on this variant". */
  salePriceCents: number | null;
  stockQuantity: number;
  /** `null` inherits the product's setting. */
  trackInventory: boolean | null;
  allowBackorder: boolean | null;
  imageUrl: string | null;
  position: number;
  isActive: boolean;
}

/** The product-level fallbacks a variant inherits. */
export interface VariantInheritanceContext {
  basePriceCents: number;
  salePriceCents: number | null;
  trackInventory: boolean;
  allowBackorder: boolean;
}

/** A variant with inheritance applied — everything the renderer needs, no nulls. */
export interface ResolvedVariant {
  id: string;
  sku: string;
  options: (string | null)[];
  /** What the shopper pays, in cents. */
  priceCents: number;
  /** The struck-through price, or `null` when the variant is not on offer. */
  compareAtCents: number | null;
  inStock: boolean;
  /** Remaining units, or `null` when this variant does not track inventory. */
  stockQuantity: number | null;
  imageUrl: string | null;
  isActive: boolean;
  /** "Alpine Green / Medium". Empty when the product has no options. */
  title: string;
}

/**
 * Join a variant's option values into the label shown in the cart, the order
 * confirmation and the selector summary.
 *
 * " / " is the separator every commerce platform uses, so shoppers already read
 * it correctly. Unused axes are dropped rather than rendered as blanks.
 *
 * @param options - Chosen value per axis, `null` for unused axes
 * @returns A human label, or an empty string when nothing is set
 */
export function variantTitle(options: readonly (string | null)[]): string {
  return options
    .filter((value): value is string => typeof value === 'string' && value.trim() !== '')
    .join(' / ');
}

/**
 * Apply product-level inheritance to one variant.
 *
 * The pricing rule matches the rest of the catalogue: the lower of the two
 * prices is what the shopper pays, and the higher becomes the struck-through
 * `compareAt`. A "sale price" above the regular price is a data error, and
 * showing it as a discount would be a lie told in the merchant's name — so it
 * is ignored rather than rendered.
 *
 * @param variant - The stored variant
 * @param context - The product's fallbacks
 * @returns The variant with every value resolved
 */
export function resolveVariant(
  variant: ProductVariant,
  context: VariantInheritanceContext,
): ResolvedVariant {
  const regularCents = variant.priceCents ?? context.basePriceCents;

  // A variant's own sale price wins; otherwise it inherits the product's, but
  // only when the variant has not overridden the regular price -- inheriting a
  // sale price meant for a $20 product onto a $60 variant would invent a
  // discount nobody set.
  const inheritedSale = variant.priceCents === null ? context.salePriceCents : null;
  const saleCents = variant.salePriceCents ?? inheritedSale;

  const onOffer = saleCents !== null && saleCents < regularCents;
  const priceCents = onOffer ? saleCents : regularCents;
  const compareAtCents = onOffer ? regularCents : null;

  const tracks = variant.trackInventory ?? context.trackInventory;
  const backorder = variant.allowBackorder ?? context.allowBackorder;

  return {
    id: variant.id,
    sku: variant.sku,
    options: variant.options,
    priceCents,
    compareAtCents,
    inStock: !tracks || backorder || variant.stockQuantity > 0,
    stockQuantity: tracks ? variant.stockQuantity : null,
    imageUrl: variant.imageUrl,
    isActive: variant.isActive,
    title: variantTitle(variant.options),
  };
}

/**
 * Find the variant matching a shopper's selection.
 *
 * Compares only the axes the product actually declares, so a two-axis product
 * is not required to send a `null` third value. Returns null when the
 * combination does not exist — which is normal, since a merchant need not
 * stock every intersection of every axis.
 *
 * @param variants - The product's variants
 * @param selection - Chosen value per axis, index 0 = option1
 * @param axisCount - How many axes the product declares
 * @returns The matching variant, or null
 */
export function findVariant<T extends { options: (string | null)[] }>(
  variants: readonly T[],
  selection: readonly (string | null)[],
  axisCount: number,
): T | null {
  const axes = Math.min(Math.max(axisCount, 0), MAX_OPTION_AXES);
  if (axes === 0) return null;

  return (
    variants.find((variant) => {
      for (let index = 0; index < axes; index += 1) {
        if ((variant.options[index] ?? null) !== (selection[index] ?? null)) return false;
      }
      return true;
    }) ?? null
  );
}

/**
 * The variant a product page should open on.
 *
 * Prefers the first in-stock variant over the first variant, because opening on
 * a sold-out size shows a disabled buy button to a shopper who has not chosen
 * anything yet — which reads as "this shop has nothing" rather than "that one
 * size is gone". Falls back to the first variant when everything is out of
 * stock, so the page still renders a price.
 *
 * @param variants - Resolved variants in display order
 * @returns The variant to select initially, or null when there are none
 */
export function defaultVariant(variants: readonly ResolvedVariant[]): ResolvedVariant | null {
  const sellable = variants.filter((variant) => variant.isActive);
  if (sellable.length === 0) return null;
  return sellable.find((variant) => variant.inStock) ?? sellable[0];
}

/**
 * Which values on one axis can still be reached, given what is chosen on the others.
 *
 * Drives the greyed-out states in the selector: with "Alpine Green" picked, the
 * sizes that exist in Alpine Green are the ones offered. Availability is
 * computed against *other* axes only, so choosing a value never greys out the
 * axis you are choosing on — the bug that makes a selector feel broken.
 *
 * Values that exist but are sold out are still reachable and marked
 * `inStock: false`: a shopper is entitled to see that their size exists and is
 * gone, rather than watching it vanish from the page.
 *
 * @param variants - Resolved variants for the product
 * @param axisIndex - Which axis is being rendered, 0-based
 * @param selection - The shopper's current selection across all axes
 * @param values - The axis's declared values, in merchandising order
 * @returns One entry per declared value, in order
 */
export function availableValues(
  variants: readonly ResolvedVariant[],
  axisIndex: number,
  selection: readonly (string | null)[],
  values: readonly string[],
): { value: string; exists: boolean; inStock: boolean }[] {
  return values.map((value) => {
    const matching = variants.filter((variant) => {
      if (!variant.isActive) return false;
      if ((variant.options[axisIndex] ?? null) !== value) return false;

      for (let index = 0; index < MAX_OPTION_AXES; index += 1) {
        if (index === axisIndex) continue;
        const chosen = selection[index] ?? null;
        if (chosen === null) continue;
        if ((variant.options[index] ?? null) !== chosen) return false;
      }
      return true;
    });

    return {
      value,
      exists: matching.length > 0,
      inStock: matching.some((variant) => variant.inStock),
    };
  });
}

/**
 * The price range across a product's variants, for the catalogue card.
 *
 * A card showing one price for a product whose variants run $18-$44 is
 * misleading in the direction that costs trust at checkout, so the grid needs
 * both ends. `from === to` means a single price and the card should show one
 * figure rather than a range of one.
 *
 * @param variants - Resolved variants
 * @returns The lowest and highest sellable price in cents, or null when nothing is sellable
 */
export function priceRange(
  variants: readonly ResolvedVariant[],
): { fromCents: number; toCents: number } | null {
  const prices = variants
    .filter((variant) => variant.isActive)
    .map((variant) => variant.priceCents);
  if (prices.length === 0) return null;
  return { fromCents: Math.min(...prices), toCents: Math.max(...prices) };
}
