'use client';

import React, { useMemo } from 'react';
import {
  CategoryScale,
  Chart as ChartJS,
  Filler,
  Legend,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip,
  type ChartOptions,
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import { EmptyState } from '@/components/ui';
import { CHART_INK, seriesColor, withAlpha } from '@/components/admin/chartPalette';
import type { PlatformTimeseriesDay } from './types';
import styles from './PlatformPanels.module.css';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Filler, Tooltip, Legend);

export interface PlatformTrendChartsProps {
  /** Zero-filled, ascending days from `/api/platform/timeseries`. */
  days: PlatformTimeseriesDay[];
  /** The window length, for the summary sentences. */
  windowDays: number;
}

/**
 * Formats an ISO `YYYY-MM-DD` day for an axis tick without pulling the value through a `Date`.
 *
 * A `new Date('2026-08-01')` is parsed as UTC midnight and then printed in the viewer's zone, which
 * silently shifts every label one day west of Greenwich. The API's `day` is a calendar date with no
 * time in it, so it is formatted as one.
 *
 * @param day - `YYYY-MM-DD`.
 * @returns A short label such as `Aug 1`.
 */
function formatDay(day: string): string {
  const [, month, date] = day.split('-');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const index = Number(month) - 1;
  if (!Number.isInteger(index) || index < 0 || index > 11 || !date) return day;
  return `${months[index]} ${Number(date)}`;
}

/** Shared axis and tooltip furniture, so the two charts read as one instrument. */
function baseOptions(): ChartOptions<'line'> {
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', axis: 'x', intersect: false },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: CHART_INK.tooltipBg,
        titleColor: CHART_INK.tooltipFg,
        bodyColor: CHART_INK.tooltipFg,
        borderColor: CHART_INK.axis,
        borderWidth: 1,
        padding: 10,
        displayColors: true,
      },
    },
    scales: {
      x: {
        grid: { display: false },
        border: { color: CHART_INK.axis },
        ticks: { color: CHART_INK.label, maxTicksLimit: 8, maxRotation: 0, autoSkip: true },
      },
      y: {
        beginAtZero: true,
        grid: { color: CHART_INK.grid },
        border: { display: false },
        ticks: {
          color: CHART_INK.label,
          precision: 0,
          callback: (value) => (typeof value === 'number' ? value.toLocaleString('en-US') : value),
        },
      },
    },
  };
}

interface SeriesSummary {
  total: number;
  peak: number;
  peakDay: string | null;
}

/**
 * Reduces one series to the numbers a text alternative needs.
 *
 * @param days - The time series.
 * @param pick - Which field to read from each day.
 * @returns The total, the peak value and the day it fell on.
 */
function summarise(
  days: PlatformTimeseriesDay[],
  pick: (day: PlatformTimeseriesDay) => number
): SeriesSummary {
  let total = 0;
  let peak = 0;
  let peakDay: string | null = null;

  for (const day of days) {
    const value = pick(day);
    total += value;
    if (value > peak) {
      peak = value;
      peakDay = day.day;
    }
  }

  return { total, peak, peakDay };
}

/**
 * The platform's traffic and order trends, as **two stacked charts rather than one dual-axis
 * chart**.
 *
 * Clicks run three orders of magnitude above orders. On a shared axis the order line lies flat on
 * the baseline and tells you nothing; on a second right-hand axis the two lines cross wherever the
 * scales were chosen to make them cross, which is a picture of an axis decision rather than of the
 * platform. Two panels, each with its own honest zero-based axis and the same x scale, let a reader
 * compare shapes without the chart implying a relationship it did not measure.
 *
 * Each chart carries a summary sentence directly under it. That sentence is also the canvas's
 * `aria-label`, so a screen-reader user gets the totals and the peak instead of "graphic".
 *
 * @param props - {@link PlatformTrendChartsProps}
 * @returns Two line charts, or a single empty state when the window has no activity at all.
 */
export function PlatformTrendCharts({
  days,
  windowDays,
}: PlatformTrendChartsProps): React.ReactElement {
  const labels = useMemo(() => days.map((day) => formatDay(day.day)), [days]);

  const clicks = useMemo(() => summarise(days, (day) => day.clicks), [days]);
  const orders = useMemo(() => summarise(days, (day) => day.orders), [days]);
  const shipped = useMemo(() => summarise(days, (day) => day.shipped), [days]);

  const options = useMemo(() => baseOptions(), []);
  const dense = days.length > 31;

  if (days.length === 0 || (clicks.total === 0 && orders.total === 0 && shipped.total === 0)) {
    return (
      <EmptyState
        title="No activity in this window"
        description={`No storefront clicks and no orders were recorded in the last ${windowDays} days. Charts appear here as soon as a shopper lands on a merchant's store.`}
        titleAs="p"
      />
    );
  }

  const clicksData = {
    labels,
    datasets: [
      {
        label: 'Buyer clicks',
        data: days.map((day) => day.clicks),
        borderColor: seriesColor(0),
        backgroundColor: withAlpha(seriesColor(0), 0.08),
        fill: true,
        borderWidth: 2,
        tension: 0.3,
        pointRadius: dense ? 0 : 3,
        pointHoverRadius: 5,
      },
    ],
  };

  const ordersData = {
    labels,
    datasets: [
      {
        label: 'Orders received',
        data: days.map((day) => day.orders),
        borderColor: seriesColor(0),
        backgroundColor: withAlpha(seriesColor(0), 0.08),
        fill: true,
        borderWidth: 2,
        tension: 0.3,
        pointRadius: dense ? 0 : 3,
        pointHoverRadius: 5,
      },
      {
        label: 'Orders shipped',
        data: days.map((day) => day.shipped),
        borderColor: seriesColor(1),
        backgroundColor: 'transparent',
        fill: false,
        borderWidth: 2,
        borderDash: [5, 4],
        tension: 0.3,
        pointRadius: dense ? 0 : 3,
        pointHoverRadius: 5,
      },
    ],
  };

  const clicksSummary =
    `Buyer clicks over the last ${windowDays} days: ${clicks.total.toLocaleString('en-US')} in total` +
    (clicks.peakDay ? `, peaking at ${clicks.peak.toLocaleString('en-US')} on ${formatDay(clicks.peakDay)}.` : '.');

  const ordersSummary =
    `Orders over the last ${windowDays} days: ${orders.total.toLocaleString('en-US')} received and ` +
    `${shipped.total.toLocaleString('en-US')} shipped` +
    (orders.peakDay ? `, peaking at ${orders.peak.toLocaleString('en-US')} received on ${formatDay(orders.peakDay)}.` : '.');

  return (
    <div className={styles.chartStack}>
      <figure className={styles.chartFigure}>
        <figcaption className={styles.chartCaption}>
          <span className={styles.chartCaptionTitle}>Buyer clicks per day</span>
        </figcaption>
        <div className={styles.chartBody} role="img" aria-label={clicksSummary}>
          <Line data={clicksData} options={options} />
        </div>
        <p className={styles.chartSummary}>{clicksSummary}</p>
      </figure>

      <figure className={styles.chartFigure}>
        <figcaption className={styles.chartCaption}>
          <span className={styles.chartCaptionTitle}>Orders per day</span>
          {/* The legend pairs a swatch with a line style, so the two series stay
              distinguishable in greyscale, in print and for a colour-blind reader. */}
          <span className={styles.legend}>
            <span className={styles.legendItem}>
              <span className={styles.legendSolid} aria-hidden="true" />
              Received
            </span>
            <span className={styles.legendItem}>
              <span className={styles.legendDashed} aria-hidden="true" />
              Shipped
            </span>
          </span>
        </figcaption>
        <div className={styles.chartBody} role="img" aria-label={ordersSummary}>
          <Line data={ordersData} options={options} />
        </div>
        <p className={styles.chartSummary}>{ordersSummary}</p>
      </figure>
    </div>
  );
}
