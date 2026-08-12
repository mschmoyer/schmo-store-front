import * as React from 'react';
import { cn } from '@/lib/design/cn';
import styles from './Skeleton.module.css';

export type SkeletonShape = 'rect' | 'circle' | 'pill' | 'card';

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  /** CSS width. Numbers are treated as pixels. @default '100%' */
  width?: number | string;
  /** CSS height. Numbers are treated as pixels. @default 16 */
  height?: number | string;
  /** Corner treatment. @default 'rect' */
  shape?: SkeletonShape;
  /** Explicit radius override, e.g. `'var(--radius-md)'`. */
  radius?: string;
  /** Drops the shimmer for dense lists where movement becomes noise. */
  motionless?: boolean;
}

interface SkeletonComponent
  extends React.ForwardRefExoticComponent<SkeletonProps & React.RefAttributes<HTMLDivElement>> {
  Text: typeof SkeletonText;
  Card: typeof SkeletonCard;
}

const toCss = (value: number | string | undefined): string | undefined =>
  typeof value === 'number' ? `${value}px` : value;

const SkeletonBase = React.forwardRef<HTMLDivElement, SkeletonProps>(function Skeleton(
  { width = '100%', height = 16, shape = 'rect', radius, motionless = false, className, style, ...rest },
  ref
) {
  return (
    <div
      ref={ref}
      className={cn(
        styles.root,
        shape === 'circle' && styles.circle,
        shape === 'pill' && styles.pill,
        shape === 'card' && styles.card,
        motionless && styles.static,
        className
      )}
      style={{
        width: toCss(width),
        height: shape === 'circle' ? toCss(width) : toCss(height),
        borderRadius: radius,
        ...style,
      }}
      aria-hidden="true"
      {...rest}
    />
  );
});

export interface SkeletonTextProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Number of lines. @default 3 */
  lines?: number;
  /** Line height in pixels. @default 12 */
  lineHeight?: number;
  /**
   * Width of the last line, so a paragraph does not end in a suspiciously
   * perfect rectangle. @default '62%'
   */
  lastLineWidth?: string;
}

/**
 * A paragraph-shaped skeleton.
 *
 * @param props - {@link SkeletonTextProps}
 * @returns A stack of shimmering lines with a ragged final line.
 */
export function SkeletonText({
  lines = 3,
  lineHeight = 12,
  lastLineWidth = '62%',
  className,
  ...rest
}: SkeletonTextProps): React.ReactElement {
  return (
    <div className={cn(styles.textBlock, className)} {...rest}>
      {Array.from({ length: lines }, (_, index) => (
        <SkeletonBase
          key={index}
          height={lineHeight}
          shape="pill"
          width={index === lines - 1 && lines > 1 ? lastLineWidth : '100%'}
        />
      ))}
    </div>
  );
}

export interface SkeletonCardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Renders the image block above the text. @default true */
  media?: boolean;
  /** Aspect ratio for the media block. @default '4 / 3' */
  mediaRatio?: string;
  /** Number of body lines. @default 2 */
  lines?: number;
}

/**
 * A product-card-shaped skeleton: image block, title, body lines and a
 * price/action row. Matches the real card's geometry so nothing shifts on load.
 *
 * @param props - {@link SkeletonCardProps}
 * @returns A card-shaped loading placeholder.
 */
export function SkeletonCard({
  media = true,
  mediaRatio = '4 / 3',
  lines = 2,
  className,
  ...rest
}: SkeletonCardProps): React.ReactElement {
  return (
    <div className={cn(styles.cardPreset, className)} {...rest}>
      {media ? <SkeletonBase className={styles.cardMedia} style={{ aspectRatio: mediaRatio }} height="auto" /> : null}
      <SkeletonBase height={18} width="72%" shape="pill" />
      <SkeletonText lines={lines} />
      <div className={styles.cardFooter}>
        <SkeletonBase height={22} width={84} shape="pill" />
        <SkeletonBase height={32} width={104} radius="var(--radius-sm)" />
      </div>
    </div>
  );
}

/**
 * Loading placeholder that mirrors the geometry of the content it replaces.
 * §5 forbids centred spinners on full pages — use these instead.
 */
export const Skeleton = SkeletonBase as SkeletonComponent;
Skeleton.Text = SkeletonText;
Skeleton.Card = SkeletonCard;

export default Skeleton;
