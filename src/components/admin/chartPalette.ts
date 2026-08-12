import { chartSeries, ink, mint, rose } from '@/lib/design/tokens';

/**
 * Chart colours for the admin's Chart.js surfaces.
 *
 * Every report shipped Chart.js's own demo palette — `rgb(255, 99, 132)`,
 * `rgb(54, 162, 235)`, `rgb(153, 102, 255)` — copied between three files. Those
 * six colours are a fourth palette living inside a product that has one, and
 * they are the reason an inventory report looked like a different application
 * from the page it was embedded in.
 *
 * `chartSeries` in `src/lib/design/tokens.ts` is the sanctioned order: ink
 * leads, because on a near-monochrome product the first series should read as
 * "the main line" rather than as a brand colour.
 */

/** Ordered categorical series. Index 0 is the primary line. */
export const SERIES: readonly string[] = chartSeries;

/**
 * Picks a series colour, wrapping when a chart has more series than the ramp.
 *
 * @param index - Zero-based series index.
 * @returns A hex colour from the sanctioned ramp.
 */
export function seriesColor(index: number): string {
  return SERIES[index % SERIES.length];
}

/**
 * The same colour as a translucent area fill.
 *
 * @param index - Zero-based series index.
 * @param alpha - Fill opacity. @default 0.1
 * @returns An `rgb(r g b / a)` string.
 */
export function seriesFill(index: number, alpha = 0.1): string {
  return withAlpha(seriesColor(index), alpha);
}

/**
 * Adds an alpha channel to a `#rrggbb` colour.
 *
 * @param hex - A six-digit hex colour.
 * @param alpha - 0–1.
 * @returns An `rgb(r g b / a)` string.
 */
export function withAlpha(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgb(${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255} / ${alpha})`;
}

/** Chart furniture — axes, gridlines, tooltips — in the token colours. */
export const CHART_INK = {
  /** Axis labels and legend text. */
  label: ink[500],
  /** Gridlines. Deliberately faint; the data is the ink. */
  grid: ink[100],
  /** Axis lines. */
  axis: ink[200],
  /** Tooltip ground and its type. */
  tooltipBg: ink[900],
  tooltipFg: '#FFFFFF',
} as const;

/** Semantic series, for charts where a line means money or a problem. */
export const CHART_SEMANTIC = {
  signal: mint[500],
  danger: rose[500],
  neutral: ink[900],
  muted: ink[400],
} as const;
