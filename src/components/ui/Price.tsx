import * as React from 'react';
import { cn } from '@/lib/design/cn';
import styles from './Price.module.css';

export type PriceSize = 'sm' | 'md' | 'lg' | 'xl';

export interface PriceProps extends Omit<React.HTMLAttributes<HTMLSpanElement>, 'children'> {
  /** The amount actually charged, in major units (dollars, not cents). */
  value: number;
  /** Was-price. Renders struck through, and unlocks the savings badge. */
  compareAt?: number | null;
  /** ISO 4217 code. @default 'USD' */
  currency?: string;
  /** BCP 47 locale. Pinned so server and client format identically. @default 'en-US' */
  locale?: string;
  /** @default 'md' */
  size?: PriceSize;
  /** Shows a mint "Save $X" pill when `compareAt` is higher than `value`. @default true */
  showSavings?: boolean;
  /** Renders the savings as a percentage instead of an amount. */
  savingsAsPercent?: boolean;
  /** Stacks the compare-at price above the live price instead of inline. */
  stacked?: boolean;
  /** Renders `0` as "Free" rather than a zero amount. @default false */
  freeWhenZero?: boolean;
}

interface PriceParts {
  symbol: string;
  integer: string;
  fraction: string;
  decimal: string;
}

/**
 * Splits a formatted currency amount into its symbol / integer / fraction so
 * each part can be typeset separately.
 *
 * @param value - Amount in major units.
 * @param currency - ISO 4217 code.
 * @param locale - BCP 47 locale.
 * @returns The pieces of the formatted amount.
 */
function splitCurrency(value: number, currency: string, locale: string): PriceParts {
  const parts = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).formatToParts(value);

  let symbol = '';
  let integer = '';
  let fraction = '';
  let decimal = '.';

  for (const part of parts) {
    switch (part.type) {
      case 'currency':
        symbol += part.value;
        break;
      case 'integer':
      case 'group':
        integer += part.value;
        break;
      case 'decimal':
        decimal = part.value;
        break;
      case 'fraction':
        fraction = part.value;
        break;
      case 'minusSign':
        integer = `${part.value}${integer}`;
        break;
      default:
        break;
    }
  }

  return { symbol, integer, fraction, decimal };
}

/**
 * Formats a whole currency amount for the savings badge and the `aria-label`.
 *
 * @param value - Amount in major units.
 * @param currency - ISO 4217 code.
 * @param locale - BCP 47 locale.
 * @returns A localised currency string, dropping cents when they are zero.
 */
function formatWhole(value: number, currency: string, locale: string): string {
  const hasCents = Math.round(value * 100) % 100 !== 0;
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: hasCents ? 2 : 0,
    maximumFractionDigits: hasCents ? 2 : 0,
  }).format(value);
}

/**
 * Renders a price in the display face with tabular numerals, optionally with a
 * struck-through was-price and a mint savings badge.
 *
 * @param props - {@link PriceProps}
 * @param ref - Forwarded to the wrapping `<span>`.
 * @returns An accessible, typographically-tuned price.
 */
export const Price = React.forwardRef<HTMLSpanElement, PriceProps>(function Price(
  {
    value,
    compareAt,
    currency = 'USD',
    locale = 'en-US',
    size = 'md',
    showSavings = true,
    savingsAsPercent = false,
    stacked = false,
    freeWhenZero = false,
    className,
    ...rest
  },
  ref
) {
  const isFree = freeWhenZero && value === 0;
  const onSale = typeof compareAt === 'number' && compareAt > value;
  const savings = onSale ? compareAt - value : 0;
  const savingsPercent = onSale && compareAt > 0 ? Math.round((savings / compareAt) * 100) : 0;

  const { symbol, integer, fraction, decimal } = splitCurrency(value, currency, locale);

  const label = onSale
    ? `${formatWhole(value, currency, locale)}, reduced from ${formatWhole(compareAt, currency, locale)}`
    : formatWhole(value, currency, locale);

  return (
    <span
      ref={ref}
      className={cn(styles.root, styles[size], stacked && styles.stacked, onSale && styles.onSale, className)}
      aria-label={isFree ? 'Free' : label}
      {...rest}
    >
      {onSale ? (
        <span className={styles.compare} aria-hidden="true">
          {formatWhole(compareAt, currency, locale)}
        </span>
      ) : null}

      {isFree ? (
        <span className={cn(styles.amount, styles.free)} aria-hidden="true">
          Free
        </span>
      ) : (
        <span className={styles.amount} aria-hidden="true">
          <span className={styles.symbol}>{symbol}</span>
          {integer}
          <span className={styles.fraction}>
            {decimal}
            {fraction}
          </span>
        </span>
      )}

      {onSale && showSavings ? (
        <span className={styles.save} aria-hidden="true">
          {savingsAsPercent
            ? `Save ${savingsPercent}%`
            : `Save ${formatWhole(savings, currency, locale)}`}
        </span>
      ) : null}
    </span>
  );
});

export default Price;
