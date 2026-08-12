/**
 * The RebelShops intro offer, expressed as pure integer arithmetic.
 *
 * This module has no dependencies (no Stripe, no database) so the money model can be unit tested
 * directly and so both the server and any server-rendered page can quote the same numbers.
 *
 * ## The offer
 *
 * "$1 for the first 3 months, then $19.99/month."
 *
 * It is modelled in Stripe as **one recurring monthly price of $19.99** plus **one Coupon with
 * `amount_off = 1899`, `duration = 'repeating'`, `duration_in_months = 3`**. See
 * `docs/payments.md` for why this representation was chosen over a subscription schedule.
 *
 * All amounts are integers in the smallest currency unit (cents). Floating point never touches a
 * money value in this file.
 */

/** Currency for the platform plan. Stripe expects a lowercase ISO-4217 code. */
export const PLATFORM_CURRENCY = 'usd';

/** Recurring list price after the intro window: $19.99/month. */
export const PLATFORM_LIST_AMOUNT_CENTS = 1999;

/** Effective price during the intro window: $1.00/month. */
export const PLATFORM_INTRO_AMOUNT_CENTS = 100;

/** Number of monthly invoices the intro discount applies to. */
export const PLATFORM_INTRO_MONTHS = 3;

/** A single invoice in the modelled billing timeline. */
export interface IntroInvoice {
  /** 1-based invoice number: 1 is the charge taken at checkout. */
  readonly month: number;
  /** Undiscounted amount for the period, in cents. */
  readonly listAmount: number;
  /** Discount applied to this invoice, in cents. */
  readonly discountAmount: number;
  /** What the customer is actually charged, in cents. */
  readonly amountDue: number;
  /** Whether this invoice falls inside the intro window. */
  readonly isIntro: boolean;
}

/** Inputs for {@link buildIntroInvoiceSchedule}. */
export interface IntroOfferSpec {
  /** Undiscounted recurring amount in cents. */
  readonly listAmountCents: number;
  /** Amount the customer pays per invoice during the intro window, in cents. */
  readonly introAmountCents: number;
  /** How many invoices the intro discount covers. */
  readonly introMonths: number;
}

/** The default RebelShops plan spec. */
export const PLATFORM_INTRO_OFFER: IntroOfferSpec = {
  listAmountCents: PLATFORM_LIST_AMOUNT_CENTS,
  introAmountCents: PLATFORM_INTRO_AMOUNT_CENTS,
  introMonths: PLATFORM_INTRO_MONTHS,
};

/**
 * Compute the `amount_off` a Stripe Coupon needs so that each intro invoice settles at exactly the
 * intro amount.
 *
 * @param spec - The offer definition.
 * @returns The coupon `amount_off` in cents.
 * @throws Error when the amounts are not usable integers or the intro price exceeds list price.
 */
export function computeIntroCouponAmountOff(spec: IntroOfferSpec = PLATFORM_INTRO_OFFER): number {
  const { listAmountCents, introAmountCents } = spec;

  if (!Number.isInteger(listAmountCents) || !Number.isInteger(introAmountCents)) {
    throw new Error('Intro offer amounts must be integer cents');
  }
  if (listAmountCents <= 0) {
    throw new Error('List amount must be greater than zero');
  }
  if (introAmountCents < 0) {
    throw new Error('Intro amount cannot be negative');
  }
  if (introAmountCents > listAmountCents) {
    throw new Error('Intro amount cannot exceed the list amount');
  }

  return listAmountCents - introAmountCents;
}

/**
 * Build the invoice-by-invoice billing timeline for the offer.
 *
 * @param months - How many invoices to project. Defaults to two months past the intro window.
 * @param spec - The offer definition.
 * @returns One {@link IntroInvoice} per month, in order.
 */
export function buildIntroInvoiceSchedule(
  months = PLATFORM_INTRO_MONTHS + 2,
  spec: IntroOfferSpec = PLATFORM_INTRO_OFFER
): IntroInvoice[] {
  const discount = computeIntroCouponAmountOff(spec);
  const schedule: IntroInvoice[] = [];

  for (let month = 1; month <= months; month += 1) {
    const isIntro = month <= spec.introMonths;
    const discountAmount = isIntro ? discount : 0;

    schedule.push({
      month,
      listAmount: spec.listAmountCents,
      discountAmount,
      amountDue: spec.listAmountCents - discountAmount,
      isIntro,
    });
  }

  return schedule;
}

/**
 * Total the customer pays across the whole intro window.
 *
 * @param spec - The offer definition.
 * @returns Total in cents ($3.00 for the default plan).
 */
export function computeIntroWindowTotal(spec: IntroOfferSpec = PLATFORM_INTRO_OFFER): number {
  return spec.introAmountCents * spec.introMonths;
}

/**
 * Amount charged the moment the merchant completes Checkout.
 *
 * @param spec - The offer definition.
 * @returns The first invoice amount in cents.
 */
export function computeFirstChargeAmount(spec: IntroOfferSpec = PLATFORM_INTRO_OFFER): number {
  return buildIntroInvoiceSchedule(1, spec)[0].amountDue;
}

/**
 * The date the intro discount stops applying, given when the subscription started.
 *
 * @param startedAt - Subscription start date.
 * @param introMonths - Length of the intro window in months.
 * @returns The first date at which the list price applies.
 */
export function computeIntroEndDate(
  startedAt: Date,
  introMonths: number = PLATFORM_INTRO_MONTHS
): Date {
  const end = new Date(startedAt.getTime());
  end.setUTCMonth(end.getUTCMonth() + introMonths);
  return end;
}

/**
 * Format an integer cent amount as a currency string.
 *
 * @param cents - Amount in the smallest currency unit.
 * @param currency - ISO-4217 currency code.
 * @returns A localized currency string such as `$19.99`.
 */
export function formatCents(cents: number, currency: string = PLATFORM_CURRENCY): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency.toUpperCase(),
  }).format(cents / 100);
}

/** Human-readable summary of the offer, safe to render anywhere. */
export interface IntroOfferSummary {
  readonly introPrice: string;
  readonly listPrice: string;
  readonly introMonths: number;
  readonly introWindowTotal: string;
  readonly firstCharge: string;
  readonly headline: string;
  readonly finePrint: string;
}

/**
 * Describe the offer in copy the UI can render without doing any math of its own.
 *
 * @param spec - The offer definition.
 * @param currency - ISO-4217 currency code.
 * @returns A {@link IntroOfferSummary}.
 */
export function describeIntroOffer(
  spec: IntroOfferSpec = PLATFORM_INTRO_OFFER,
  currency: string = PLATFORM_CURRENCY
): IntroOfferSummary {
  const introPrice = formatCents(spec.introAmountCents, currency);
  const listPrice = formatCents(spec.listAmountCents, currency);

  return {
    introPrice,
    listPrice,
    introMonths: spec.introMonths,
    introWindowTotal: formatCents(computeIntroWindowTotal(spec), currency),
    firstCharge: formatCents(computeFirstChargeAmount(spec), currency),
    headline: `${introPrice} a month for ${spec.introMonths} months, then ${listPrice} a month`,
    finePrint:
      `You are charged ${introPrice} today and ${introPrice} on each of the next ` +
      `${spec.introMonths - 1} monthly renewals. From month ${spec.introMonths + 1} the price is ` +
      `${listPrice} a month. Cancel any time.`,
  };
}
