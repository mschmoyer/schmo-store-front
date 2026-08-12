import * as React from 'react';
import { cn } from '@/lib/design/cn';
import styles from './Layout.module.css';

/* ============================================================== Container */

export type ContainerWidth = 'content' | 'wide' | 'prose' | 'full';

const WIDTH_CLASS: Record<ContainerWidth, string> = {
  content: styles.widthContent,
  wide: styles.widthWide,
  prose: styles.widthProse,
  full: styles.widthFull,
};

export interface ContainerProps extends React.HTMLAttributes<HTMLDivElement> {
  /** `content` = 1200px, `wide` = 1440px for bleeding marketing bands (§6). @default 'content' */
  width?: ContainerWidth;
  /** Drops the 24/16px gutters. */
  flush?: boolean;
  /** @default 'div' */
  as?: React.ElementType;
}

/**
 * Centres content at a token width and applies the gutters from §6.
 *
 * @param props - {@link ContainerProps}
 * @param ref - Forwarded to the rendered element.
 * @returns A width-constrained wrapper.
 */
export const Container = React.forwardRef<HTMLDivElement, ContainerProps>(function Container(
  { width = 'content', flush = false, as, className, ...rest },
  ref
) {
  const Component: React.ElementType = as ?? 'div';
  return (
    <Component
      ref={ref}
      className={cn(styles.container, WIDTH_CLASS[width], flush && styles.flush, className)}
      {...rest}
    />
  );
});

/* ================================================================ Section */

export type SectionTone = 'surface' | 'sunken' | 'raised' | 'inverse';
export type SectionRhythm = 'marketing' | 'compact' | 'app';

const TONE_CLASS: Record<SectionTone, string> = {
  surface: styles.toneSurface,
  sunken: styles.toneSunken,
  raised: styles.toneRaised,
  inverse: styles.toneInverse,
};

export interface SectionProps extends React.HTMLAttributes<HTMLElement> {
  /** Ground colour for the band. @default 'surface' */
  tone?: SectionTone;
  /**
   * Vertical rhythm. `marketing` is the `clamp(5rem, 10vw, 8rem)` from §4,
   * `app` is the 24/16px app-shell padding. @default 'marketing'
   */
  rhythm?: SectionRhythm;
  /** Hairline rule on the top and/or bottom edge. */
  divided?: 'top' | 'bottom' | 'both';
  /** Wraps children in a `Container` of this width. Pass `false` to opt out. @default 'content' */
  container?: ContainerWidth | false;
  /** @default 'section' */
  as?: React.ElementType;
}

/**
 * A full-bleed horizontal band with the correct vertical rhythm and an
 * optional inner `Container`.
 *
 * @param props - {@link SectionProps}
 * @param ref - Forwarded to the rendered element.
 * @returns A page section.
 */
export const Section = React.forwardRef<HTMLElement, SectionProps>(function Section(
  { tone = 'surface', rhythm = 'marketing', divided, container = 'content', as, className, children, ...rest },
  ref
) {
  const Component: React.ElementType = as ?? 'section';

  return (
    <Component
      ref={ref}
      className={cn(
        styles.section,
        rhythm === 'compact' && styles.sectionSm,
        rhythm === 'app' && styles.sectionApp,
        TONE_CLASS[tone],
        (divided === 'top' || divided === 'both') && styles.dividedTop,
        (divided === 'bottom' || divided === 'both') && styles.dividedBottom,
        className
      )}
      {...rest}
    >
      {container === false ? children : <Container width={container}>{children}</Container>}
    </Component>
  );
});

/* ================================================================ Eyebrow */

export interface EyebrowProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** Draws a short rule before the label instead of leading with bare text. */
  rule?: boolean;
  /** Uses secondary ink rather than the ember accent. */
  muted?: boolean;
  /** @default 'span' */
  as?: React.ElementType;
}

/**
 * The uppercase section label from §3 — `--text-eyebrow`, 600 weight, 0.14em
 * tracking. Sits above an `h2`, never used as a heading itself.
 *
 * @param props - {@link EyebrowProps}
 * @param ref - Forwarded to the rendered element.
 * @returns A small caps-style label.
 */
export const Eyebrow = React.forwardRef<HTMLSpanElement, EyebrowProps>(function Eyebrow(
  { rule = false, muted = false, as, className, children, ...rest },
  ref
) {
  const Component: React.ElementType = as ?? 'span';
  return (
    <Component
      ref={ref}
      className={cn(styles.eyebrow, muted && styles.eyebrowMuted, className)}
      {...rest}
    >
      {rule ? <span className={styles.eyebrowRule} aria-hidden="true" /> : null}
      {children}
    </Component>
  );
});

/* ================================================================== Stack */

export interface StackProps extends React.HTMLAttributes<HTMLDivElement> {
  /** @default 'vertical' */
  direction?: 'vertical' | 'horizontal';
  /** Gap in pixels, from the 4px scale in §4. @default 16 */
  gap?: number;
  /** Cross-axis alignment. */
  align?: 'start' | 'center' | 'end' | 'stretch' | 'baseline';
  /** Main-axis distribution. */
  justify?: 'start' | 'center' | 'end' | 'between';
  /** Allows horizontal stacks to wrap. */
  wrap?: boolean;
  /** @default 'div' */
  as?: React.ElementType;
}

/**
 * A flex helper for the common "things in a row/column with a token gap" case.
 * Reach for CSS Grid directly when a layout is actually two-dimensional.
 *
 * @param props - {@link StackProps}
 * @param ref - Forwarded to the rendered element.
 * @returns A flex container.
 */
export const Stack = React.forwardRef<HTMLDivElement, StackProps>(function Stack(
  { direction = 'vertical', gap = 16, align, justify, wrap = false, as, className, style, ...rest },
  ref
) {
  const Component: React.ElementType = as ?? 'div';

  const alignClass =
    align === 'start'
      ? styles.alignStart
      : align === 'center'
        ? styles.alignCenter
        : align === 'end'
          ? styles.alignEnd
          : align === 'stretch'
            ? styles.alignStretch
            : align === 'baseline'
              ? styles.alignBaseline
              : undefined;

  const justifyClass =
    justify === 'start'
      ? styles.justifyStart
      : justify === 'center'
        ? styles.justifyCenter
        : justify === 'end'
          ? styles.justifyEnd
          : justify === 'between'
            ? styles.justifyBetween
            : undefined;

  return (
    <Component
      ref={ref}
      className={cn(
        styles.stack,
        direction === 'vertical' ? styles.stackVertical : styles.stackHorizontal,
        wrap && styles.stackWrap,
        alignClass,
        justifyClass,
        className
      )}
      style={{ gap: `${gap}px`, ...style }}
      {...rest}
    />
  );
});

/* ================================================================ Divider */

export interface DividerProps extends React.HTMLAttributes<HTMLDivElement> {
  /** @default 'horizontal' */
  orientation?: 'horizontal' | 'vertical';
  /** Caption rendered between two rules. Horizontal only. */
  label?: React.ReactNode;
  /** Fades the rule out at both ends. Horizontal only. */
  soft?: boolean;
}

/**
 * A hairline rule. With `label`, becomes a captioned separator ("or", "Older").
 *
 * @param props - {@link DividerProps}
 * @param ref - Forwarded to the rendered element.
 * @returns A separator.
 */
export const Divider = React.forwardRef<HTMLDivElement, DividerProps>(function Divider(
  { orientation = 'horizontal', label, soft = false, className, ...rest },
  ref
) {
  if (label && orientation === 'horizontal') {
    return (
      <div ref={ref} className={cn(styles.dividerLabelled, className)} role="separator" {...rest}>
        <span className={styles.dividerLine} />
        <span className={styles.dividerLabel}>{label}</span>
        <span className={styles.dividerLine} />
      </div>
    );
  }

  return (
    <div
      ref={ref}
      role="separator"
      aria-orientation={orientation}
      className={cn(
        styles.divider,
        orientation === 'vertical' ? styles.dividerVertical : styles.dividerHorizontal,
        soft && orientation === 'horizontal' && styles.dividerSoft,
        className
      )}
      {...rest}
    />
  );
});
