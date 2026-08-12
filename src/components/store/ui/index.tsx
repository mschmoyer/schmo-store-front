import * as React from 'react';
import Link from 'next/link';

import { formatMoney, savingsPercent, stockLabel } from '@/app/store/_lib/present';
import type { StockState } from '@/app/store/_lib/types';

import styles from './StoreUI.module.css';

/**
 * The storefront primitive kit.
 *
 * These are deliberately *not* the RebelShops primitives in `src/components/ui`.
 * Those consume RebelShops' own chrome tokens, which is right for the admin and
 * the marketing site and wrong for a merchant's shop — a shopper must never see
 * our ink on someone else's storefront. Everything here consumes `--st-*` only.
 *
 * Where a shared primitive is genuinely theme-neutral (`ProductImage`'s
 * generated fallback mark, `Skeleton`'s shimmer) the storefront reuses it and
 * lets the token bridge in `StorefrontStyle` re-point its variables at the
 * merchant's palette instead of forking it.
 *
 * All of these are server components. Nothing here needs state.
 */

/**
 * Join class names, dropping anything falsy.
 * @param values - Class names or falsy placeholders
 * @returns A className string
 */
export function cx(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(' ');
}

/* ------------------------------------------------------------------ *
 * Layout
 * ------------------------------------------------------------------ */

export interface StoreContainerProps extends React.HTMLAttributes<HTMLDivElement> {
  /** `narrow` for prose, `wide` for full-bleed grids. @default 'default' */
  width?: 'narrow' | 'default' | 'wide';
}

/**
 * Centred content column, capped at the theme's `--st-container`.
 * @param props - {@link StoreContainerProps}
 * @returns A width-constrained wrapper
 */
export function StoreContainer({
  width = 'default',
  className,
  ...rest
}: StoreContainerProps) {
  return (
    <div
      className={cx(
        styles.container,
        width === 'wide' && styles.containerWide,
        width === 'narrow' && styles.containerNarrow,
        className,
      )}
      {...rest}
    />
  );
}

export interface StoreBandProps extends React.HTMLAttributes<HTMLElement> {
  /** Which surface the band sits on. @default 'surface' */
  tone?: 'surface' | 'sunken' | 'raised' | 'brand';
  /** Reduce the vertical rhythm. */
  tight?: boolean;
  as?: 'section' | 'div' | 'footer' | 'header';
}

/**
 * A full-width horizontal band of page. The unit home-page sections are built from.
 * @param props - {@link StoreBandProps}
 * @returns A full-bleed section element
 */
export function StoreBand({
  tone = 'surface',
  tight = false,
  as: Tag = 'section',
  className,
  ...rest
}: StoreBandProps) {
  const toneClass = {
    surface: styles.bandSurface,
    sunken: styles.bandSunken,
    raised: styles.bandRaised,
    brand: styles.bandBrand,
  }[tone];

  return (
    <Tag
      className={cx(styles.band, tight && styles.bandTight, toneClass, className)}
      {...rest}
    />
  );
}

export interface SectionHeadingProps {
  eyebrow?: string;
  heading?: string;
  subheading?: string;
  align?: 'left' | 'center';
  /** Rendered opposite the heading — typically a "view all" link. */
  action?: React.ReactNode;
  /** Heading level. Home-page sections are `h2` under the page's single `h1`. */
  level?: 2 | 3;
}

/**
 * The heading block every section shares.
 *
 * Renders nothing at all when there is no heading, no subheading and no action,
 * so a merchant who clears the heading gets clean space rather than an empty
 * box with leftover margin.
 *
 * @param props - {@link SectionHeadingProps}
 * @returns A section header, or null
 */
export function SectionHeading({
  eyebrow,
  heading,
  subheading,
  align = 'left',
  action,
  level = 2,
}: SectionHeadingProps) {
  if (!heading && !subheading && !action && !eyebrow) return null;
  const Tag = level === 2 ? 'h2' : 'h3';

  return (
    <div className={cx(styles.sectionHead, align === 'center' && styles.sectionHeadCenter)}>
      <div className={styles.sectionHeadText}>
        {eyebrow ? <span className={styles.eyebrow}>{eyebrow}</span> : null}
        {heading ? <Tag>{heading}</Tag> : null}
        {subheading ? <p className={styles.sectionSub}>{subheading}</p> : null}
      </div>
      {action}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Actions
 * ------------------------------------------------------------------ */

type ButtonVariant = 'primary' | 'secondary' | 'ghost';
type ButtonSize = 'sm' | 'md' | 'lg';

/**
 * Resolve the class list shared by the button and the button-shaped link.
 * @param variant - Visual weight
 * @param size - Control height
 * @param block - Stretch to the container width
 * @param className - Caller additions
 * @returns A className string
 */
function buttonClass(
  variant: ButtonVariant,
  size: ButtonSize,
  block: boolean,
  className?: string,
): string {
  return cx(
    styles.btn,
    variant === 'secondary' && styles.btnSecondary,
    variant === 'ghost' && styles.btnGhost,
    size === 'sm' && styles.btnSmall,
    size === 'lg' && styles.btnLarge,
    block && styles.btnBlock,
    className,
  );
}

export interface StoreButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
}

/**
 * A themed button. `primary` follows the merchant's `buttons.style` exactly.
 * @param props - {@link StoreButtonProps}
 * @returns A button element
 */
export function StoreButton({
  variant = 'primary',
  size = 'md',
  block = false,
  className,
  type = 'button',
  ...rest
}: StoreButtonProps) {
  return <button type={type} className={buttonClass(variant, size, block, className)} {...rest} />;
}

export interface StoreLinkButtonProps
  extends Omit<React.ComponentProps<typeof Link>, 'className'> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
  className?: string;
}

/**
 * A link that looks like a button. Used wherever the action is navigation, so
 * shoppers keep middle-click, "open in new tab" and a real `href`.
 * @param props - {@link StoreLinkButtonProps}
 * @returns An anchor styled as a button
 */
export function StoreLinkButton({
  variant = 'primary',
  size = 'md',
  block = false,
  className,
  ...rest
}: StoreLinkButtonProps) {
  return <Link className={buttonClass(variant, size, block, className)} {...rest} />;
}

/* ------------------------------------------------------------------ *
 * Commerce
 * ------------------------------------------------------------------ */

export interface StorePriceProps {
  value: number;
  compareAt?: number | null;
  currency?: string;
  size?: 'md' | 'lg';
  /** Show the "Save N%" note next to a discounted price. @default true */
  showSavings?: boolean;
}

/**
 * A price, with an honest compare-at.
 *
 * The was-price only renders when it is genuinely higher than what we charge —
 * the query layer already refuses to report anything else — and the saving is
 * derived from the two numbers rather than stored, so the two can never
 * disagree.
 *
 * @param props - {@link StorePriceProps}
 * @returns A price display
 */
export function StorePrice({
  value,
  compareAt = null,
  currency = 'USD',
  size = 'md',
  showSavings = true,
}: StorePriceProps) {
  const percent = savingsPercent(value, compareAt);

  return (
    <span className={cx(styles.price, size === 'lg' && styles.priceLarge)}>
      <span className={styles.priceNow}>{formatMoney(value, currency)}</span>
      {percent !== null && compareAt ? (
        <>
          <span className={styles.priceWas}>
            <span className={styles.srOnly}>Regular price </span>
            {formatMoney(compareAt, currency)}
          </span>
          {showSavings ? <span className={styles.priceSave}>Save {percent}%</span> : null}
        </>
      ) : null}
    </span>
  );
}

export interface StockIndicatorProps {
  state: StockState;
  quantity?: number;
  className?: string;
}

/**
 * Stock as a dot **and** a word.
 *
 * The dot alone would fail the accessibility floor, so the label is always
 * present and the dot shapes differ between states — a filled circle for in
 * stock, a square for backorder, a hollow ring for out of stock — which keeps
 * the states apart in greyscale too.
 *
 * @param props - {@link StockIndicatorProps}
 * @returns An inline availability indicator
 */
export function StockIndicator({ state, quantity = 0, className }: StockIndicatorProps) {
  const toneClass = {
    'in-stock': styles.stockIn,
    'low-stock': styles.stockLow,
    backorder: styles.stockBackorder,
    'out-of-stock': styles.stockOut,
    untracked: styles.stockUntracked,
  }[state];

  return (
    <span className={cx(styles.stock, toneClass, className)}>
      <span className={styles.stockDot} aria-hidden="true" />
      {stockLabel(state, quantity)}
    </span>
  );
}

export interface PillProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** Fill with the brand color. Use for the one thing that matters most. */
  brand?: boolean;
}

/**
 * A small metadata chip.
 * @param props - {@link PillProps}
 * @returns An inline pill
 */
export function Pill({ brand = false, className, ...rest }: PillProps) {
  return <span className={cx(styles.pill, brand && styles.pillBrand, className)} {...rest} />;
}

/* ------------------------------------------------------------------ *
 * Misc
 * ------------------------------------------------------------------ */

/**
 * An inset explanatory note. Used for the shipping disclosure in the cart and
 * the shipping facts on a product.
 * @param props - Standard div props plus an optional leading `icon`
 * @returns A bordered note block
 */
export function Notice({
  icon,
  children,
  className,
  ...rest
}: React.HTMLAttributes<HTMLDivElement> & { icon?: React.ReactNode }) {
  return (
    <div className={cx(styles.notice, className)} {...rest}>
      {icon ? (
        <span className={styles.noticeIcon} aria-hidden="true">
          {icon}
        </span>
      ) : null}
      <div>{children}</div>
    </div>
  );
}

export { styles as storeUi };
