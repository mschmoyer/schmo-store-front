/**
 * Every price and competitor figure the marketing site quotes, in one place.
 *
 * VERIFY BEFORE PUBLISH — docs/marketing-copy.md §3.11 and §4.3 require every
 * Shopify and Stripe figure below to be re-checked against the vendor's own
 * published pricing page on the day the site goes live. If a figure has moved,
 * change it here and nowhere else: the homepage comparison, the pricing page
 * comparison and the FAQ all read these constants, so the arithmetic and the
 * prose stay in agreement automatically.
 *
 * Sources to re-read on publish day:
 *   - https://www.shopify.com/pricing  (Basic monthly, Basic annual, the
 *     additional fee charged on Basic for third-party payment gateways)
 *   - https://stripe.com/pricing       (US standard online card rate)
 */

/** RebelShops monthly price after the introductory period, in USD. */
export const MONTHLY_PRICE = 19.99;

/** Total cost of the introductory period, in USD (not per month). */
export const INTRO_TOTAL = 1;

/** Length of the introductory period, in months. */
export const INTRO_MONTHS = 3;

/** Shopify Basic, billed monthly, USD per month. [VERIFY at publish] */
export const SHOPIFY_BASIC_MONTHLY = 39;

/** Shopify Basic, billed annually, USD per month equivalent. [VERIFY at publish] */
export const SHOPIFY_BASIC_ANNUAL_MONTHLY = 29;

/** Stripe's published US standard online card rate. [VERIFY at publish] */
export const STRIPE_CARD_RATE = '2.9% + 30¢';

/** Vendor pricing pages, cited rather than paraphrased. */
export const VENDOR_LINKS = {
  shopify: 'https://www.shopify.com/pricing',
  stripe: 'https://stripe.com/pricing',
} as const;

/** Rounds to cents so floating-point noise never reaches the page. */
const cents = (n: number): number => Math.round(n * 100) / 100;

/** Derived twelve-month arithmetic. Nothing here is typed by hand. */
export const TWELVE_MONTH = {
  /** RebelShops, months 1–3. */
  rebelIntro: INTRO_TOTAL,
  /** RebelShops, months 4–12. */
  rebelRemainder: cents(MONTHLY_PRICE * (12 - INTRO_MONTHS)),
  /** RebelShops, full first year. */
  rebelTotal: cents(INTRO_TOTAL + MONTHLY_PRICE * (12 - INTRO_MONTHS)),
  /** Shopify Basic, months 1–3, monthly billing. */
  shopifyIntro: SHOPIFY_BASIC_MONTHLY * INTRO_MONTHS,
  /** Shopify Basic, months 4–12, monthly billing. */
  shopifyRemainder: SHOPIFY_BASIC_MONTHLY * (12 - INTRO_MONTHS),
  /** Shopify Basic, full first year, monthly billing. */
  shopifyTotal: SHOPIFY_BASIC_MONTHLY * 12,
  /** Shopify Basic, full first year, annual prepay. */
  shopifyAnnualTotal: SHOPIFY_BASIC_ANNUAL_MONTHLY * 12,
} as const;

/** Saving against Shopify Basic on monthly billing, first year. */
export const SAVING_VS_MONTHLY = Math.round(TWELVE_MONTH.shopifyTotal - TWELVE_MONTH.rebelTotal);

/** Saving against Shopify Basic's annual prepay, first year. */
export const SAVING_VS_ANNUAL = Math.round(
  TWELVE_MONTH.shopifyAnnualTotal - TWELVE_MONTH.rebelTotal
);

/**
 * Formats a USD amount for display, dropping cents when there are none so
 * `$117` and `$182.91` sit in the same column without a dangling `.00`.
 *
 * @param value - Amount in dollars.
 * @returns A `$`-prefixed string with tabular-friendly digits.
 */
export function usd(value: number): string {
  const hasCents = Math.round(value * 100) % 100 !== 0;
  return `$${value.toLocaleString('en-US', {
    minimumFractionDigits: hasCents ? 2 : 0,
    maximumFractionDigits: hasCents ? 2 : 0,
  })}`;
}
