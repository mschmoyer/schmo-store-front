/**
 * What "needs attention" means on a product, in words a merchant can act on.
 *
 * Both the product page and its performance panel render this list, and they used to word it
 * differently: one title-cased the raw key with `issue.replace('_', ' ')`, which replaces only the
 * *first* underscore — so `out_of_stock` rendered as "Out Of_stock". Naming the issues once fixes
 * the wording and keeps the two surfaces from drifting.
 */

/** The problems the product route reports, and how each is phrased. */
export const ATTENTION_LABELS: Record<string, string> = {
  /* First because it is the only one that puts a product on sale for nothing. `base_price` is NOT
   * NULL and the sync defaults it to zero, and the cart treats zero as a deliberate giveaway. */
  no_price: 'No price — this would sell for nothing',
  no_image: 'No image',
  no_description: 'No description',
  no_category: 'Not in a category',
  no_cost: 'No cost recorded, so margin cannot be calculated',
  no_seo: 'No SEO title or description',
  out_of_stock: 'Out of stock',
  negative_margin: 'Selling at or below cost'
};

/**
 * Phrase one listing problem.
 *
 * @param issue - The key the API reported.
 * @returns A sentence, falling back to the key with every underscore replaced.
 */
export function attentionLabel(issue: string): string {
  return ATTENTION_LABELS[issue] ?? issue.replace(/_/g, ' ');
}
