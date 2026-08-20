/**
 * Shared types for the billing and payments layer.
 */

/** A cart line as supplied by the browser. Only identity and quantity are trusted. */
export interface ClientCartItem {
  /** Product identity: a `products.id` UUID, a SKU, or a ShipStation product id. */
  readonly product_id: string | number;
  /** Requested quantity. Coerced to a positive integer server-side. */
  readonly quantity: number;
  /**
   * The chosen variant, when the product has options.
   *
   * Identity only, like `product_id` — the server looks the variant up in this
   * store and takes the price from the row it finds. A variant id belonging to
   * another merchant resolves to nothing and the line is rejected; it can never
   * price a line here.
   */
  readonly variant_id?: string | null;
}

/** A cart line after the server has re-priced it from the database. */
export interface PricedLineItem {
  /** Canonical `products.id`. */
  readonly productId: string;
  /** Canonical `product_variants.id`, or null when the product has no options. */
  readonly variantId: string | null;
  /**
   * "Alpine Green / Medium", or null when there are no options.
   *
   * Carried through to `order_items.variant_title` so an order confirmation
   * still reads correctly after the variant has been deleted.
   */
  readonly variantTitle: string | null;
  /** The variant's SKU when one was chosen, otherwise the product's. */
  readonly sku: string;
  readonly name: string;
  /** Authoritative unit price in cents, read from the database. */
  readonly unitPriceCents: number;
  readonly quantity: number;
  /** `unitPriceCents * quantity`. */
  readonly lineTotalCents: number;
  readonly imageUrl: string | null;
  readonly categoryId: string | null;
  readonly requiresShipping: boolean;
}

/** Why a requested cart line could not be honoured. */
export type CartLineRejectionReason =
  | 'not_found'
  | 'inactive'
  | 'out_of_stock'
  | 'insufficient_stock'
  | 'invalid_quantity';

/** A cart line the server refused, with enough detail for the shopper to fix it. */
export interface RejectedLineItem {
  readonly requestedId: string;
  readonly reason: CartLineRejectionReason;
  readonly message: string;
  readonly available?: number;
}

/** Totals for a storefront order, all in integer cents. */
export interface CartTotals {
  readonly subtotalCents: number;
  readonly discountCents: number;
  readonly shippingCents: number;
  readonly taxCents: number;
  readonly totalCents: number;
}

/** A validated storefront coupon plus the discount it produces for a specific cart. */
export interface AppliedCoupon {
  readonly couponId: string;
  readonly code: string;
  readonly description: string;
  readonly discountType: 'percentage' | 'fixed_amount';
  readonly discountValue: number;
  readonly discountCents: number;
}

/** Result of validating a coupon against a cart. */
export type CouponValidation =
  | { readonly valid: true; readonly coupon: AppliedCoupon }
  | { readonly valid: false; readonly error: string };

/** Contact and shipping details captured at checkout. */
export interface CheckoutCustomerDetails {
  readonly firstName: string;
  readonly lastName: string;
  readonly email: string;
  readonly phone: string;
}

/** A US shipping address captured at checkout. */
export interface CheckoutShippingAddress {
  readonly addressLine1: string;
  readonly addressLine2?: string;
  readonly city: string;
  readonly state: string;
  readonly postalCode: string;
  readonly country: string;
}

/** The complete, server-priced snapshot persisted to `checkout_sessions`. */
export interface PricedCart {
  readonly items: PricedLineItem[];
  readonly rejected: RejectedLineItem[];
  readonly totals: CartTotals;
  readonly coupon: AppliedCoupon | null;
  readonly shippingMethod: string;
  readonly currency: string;
}
