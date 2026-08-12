import * as React from 'react';
import { cn } from '@/lib/design/cn';
import styles from './Card.module.css';

export type CardTone = 'raised' | 'sunken' | 'flat';
export type CardPadding = 'none' | 'sm' | 'md' | 'lg';

const PAD_CLASS: Record<CardPadding, string> = {
  none: styles.padNone,
  sm: styles.padSm,
  md: styles.padMd,
  lg: styles.padLg,
};

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Surface treatment. @default 'raised' */
  tone?: CardTone;
  /** Padding applied to the header/body/footer slots. @default 'md' */
  padding?: CardPadding;
  /**
   * Adds hover elevation, a pointer cursor and a focus ring. Pair with `as`
   * (`'a'` / `'button'`) so it is actually reachable by keyboard (§7).
   */
  interactive?: boolean;
  /** Draws an ember hairline across the top edge to mark a promoted card. */
  accent?: boolean;
  /** Element to render. @default 'div' */
  as?: React.ElementType;
  /** Convenience passthrough when `as` renders an anchor. */
  href?: string;
}

/**
 * The container primitive: `--surface-raised`, hairline border, `--radius-lg`
 * and layered `--shadow-sm`. Compose with `CardHeader` / `CardBody` /
 * `CardFooter` so padding stays consistent across the app.
 *
 * @param props - {@link CardProps}
 * @param ref - Forwarded to the rendered element.
 * @returns A surface container.
 */
export const Card = React.forwardRef<HTMLDivElement, CardProps>(function Card(
  { tone = 'raised', padding = 'md', interactive = false, accent = false, as, className, ...rest },
  ref
) {
  const Component: React.ElementType = as ?? 'div';

  return (
    <Component
      ref={ref}
      // A <button> with no type defaults to submit. An interactive card that
      // silently submits its enclosing form is a real bug waiting for its
      // first form, so default it explicitly.
      type={Component === 'button' ? ((rest as { type?: string }).type ?? 'button') : undefined}
      className={cn(
        styles.root,
        tone === 'sunken' && styles.sunken,
        tone === 'flat' && styles.flat,
        interactive && styles.interactive,
        accent && styles.accent,
        PAD_CLASS[padding],
        className
      )}
      {...rest}
    />
  );
});

export interface CardHeaderProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
  /** Card title. Rendered in the display font at `--text-h3`. */
  title?: React.ReactNode;
  /** One line of supporting context under the title. */
  subtitle?: React.ReactNode;
  /** Trailing slot — a menu, a badge, a secondary action. */
  action?: React.ReactNode;
  /** Heading level for `title`. @default 'h3' */
  titleAs?: React.ElementType;
}

/**
 * Card header with an optional title/subtitle pair and a trailing action slot.
 * Passing `children` replaces the built-in text layout entirely.
 *
 * @param props - {@link CardHeaderProps}
 * @returns The header row of a card.
 */
export const CardHeader = React.forwardRef<HTMLDivElement, CardHeaderProps>(function CardHeader(
  { title, subtitle, action, titleAs, className, children, ...rest },
  ref
) {
  const TitleTag: React.ElementType = titleAs ?? 'h3';

  return (
    <div ref={ref} className={cn(styles.header, className)} {...rest}>
      {children ?? (
        <div className={styles.headerText}>
          {title ? <TitleTag className={styles.title}>{title}</TitleTag> : null}
          {subtitle ? <p className={styles.subtitle}>{subtitle}</p> : null}
        </div>
      )}
      {action ? <div className={styles.headerAction}>{action}</div> : null}
    </div>
  );
});

export type CardBodyProps = React.HTMLAttributes<HTMLDivElement>;

/**
 * Card content region. Grows to fill the card so footers stay pinned.
 *
 * @param props - Native `div` attributes.
 * @returns The body region of a card.
 */
export const CardBody = React.forwardRef<HTMLDivElement, CardBodyProps>(function CardBody(
  { className, ...rest },
  ref
) {
  return <div ref={ref} className={cn(styles.body, className)} {...rest} />;
});

export interface CardFooterProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Horizontal distribution of the footer's children. @default 'end' */
  align?: 'start' | 'end' | 'between';
  /** Drops the sunken background, leaving only the top hairline. */
  plain?: boolean;
}

/**
 * Card footer — the place for actions. Sits on `--surface-sunken` by default so
 * the action row reads as a distinct tray.
 *
 * @param props - {@link CardFooterProps}
 * @returns The footer row of a card.
 */
export const CardFooter = React.forwardRef<HTMLDivElement, CardFooterProps>(function CardFooter(
  { align = 'end', plain = false, className, ...rest },
  ref
) {
  return (
    <div
      ref={ref}
      className={cn(
        styles.footer,
        align === 'end' && styles.footerEnd,
        align === 'between' && styles.footerBetween,
        plain && styles.footerPlain,
        className
      )}
      {...rest}
    />
  );
});

export default Card;
