'use client';

/**
 * Storefront traffic for one merchant, and what it turned into.
 *
 * Clicks and orders are drawn on one chart because the only useful question
 * about traffic here is the relationship between them: a merchant with a
 * thousand clicks and no orders has a shop problem, and a merchant with forty
 * clicks and four orders has a marketing problem. Two separate charts make the
 * reader hold one shape in their head while looking at the other.
 *
 * They are on two axes because they differ by two orders of magnitude, and a
 * shared axis flattens the order line onto zero. That is a real trade — a dual
 * axis can imply a correlation the data does not support — so the axes are
 * labelled, each series is named in its own axis colour, and the underlying
 * numbers are available to every reader as a table rather than only to the ones
 * who can see the picture.
 */

import React, { useMemo } from 'react';
import {
  CategoryScale,
  Chart as ChartJS,
  Filler,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip as ChartTooltip,
  type ChartOptions,
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import { format, parseISO } from 'date-fns';
import { EmptyState } from '@/components/ui';
import { CHART_INK, seriesColor, withAlpha } from '@/components/admin/chartPalette';
import { Panel, Metrics } from './Panel';
import { formatCount } from './format';
import type { PlatformTraffic } from './types';
import tables from './detailTables.module.css';
import styles from './trafficPanel.module.css';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, ChartTooltip, Filler);

/** Clicks. Index 0 of the sanctioned ramp — the primary line reads as "the main line". */
const CLICKS_COLOR = seriesColor(0);
/** Orders. The second series. */
const ORDERS_COLOR = seriesColor(1);

export interface TrafficPanelProps {
  /** The store's traffic, daily series and top lists. */
  traffic: PlatformTraffic;
}

/**
 * Renders the traffic panel: headline counts, the daily chart with its text
 * alternative, and the top pages and referrers.
 *
 * @param props - {@link TrafficPanelProps}
 * @returns The traffic panel.
 */
export function TrafficPanel({ traffic }: TrafficPanelProps): React.ReactElement {
  const { daily } = traffic;

  const labels = useMemo(() => daily.map((day) => format(parseISO(day.day), 'd MMM')), [daily]);

  const chartData = useMemo(
    () => ({
      labels,
      datasets: [
        {
          label: 'Clicks',
          data: daily.map((day) => day.clicks),
          borderColor: CLICKS_COLOR,
          backgroundColor: withAlpha(CLICKS_COLOR, 0.08),
          fill: true,
          /* Straight segments, not a spline. These are daily integers, and a
             smoothed curve draws values on days that have none — on the orders
             series, which spends most of its month at zero and spikes to two,
             the overshoot is visible enough to read as data. */
          tension: 0,
          borderWidth: 2,
          pointRadius: 0,
          pointHoverRadius: 4,
          yAxisID: 'clicks',
        },
        {
          label: 'Orders',
          data: daily.map((day) => day.orders),
          borderColor: ORDERS_COLOR,
          backgroundColor: 'transparent',
          fill: false,
          tension: 0,
          borderWidth: 2,
          borderDash: [4, 3],
          pointRadius: 0,
          pointHoverRadius: 4,
          yAxisID: 'orders',
        },
      ],
    }),
    [daily, labels],
  );

  const options = useMemo<ChartOptions<'line'>>(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        /* The legend is rendered as HTML below the canvas instead: Chart.js's
           own legend is canvas text, so it is invisible to a screen reader and
           does not respect the type scale. */
        legend: { display: false },
        tooltip: {
          backgroundColor: CHART_INK.tooltipBg,
          titleColor: CHART_INK.tooltipFg,
          bodyColor: CHART_INK.tooltipFg,
          borderColor: CHART_INK.axis,
          borderWidth: 1,
          padding: 10,
        },
      },
      scales: {
        x: {
          grid: { display: false },
          border: { color: CHART_INK.axis },
          ticks: {
            color: CHART_INK.label,
            maxTicksLimit: 8,
            font: { size: 11 },
          },
        },
        clicks: {
          type: 'linear',
          position: 'left',
          beginAtZero: true,
          grid: { color: CHART_INK.grid },
          border: { display: false },
          ticks: { color: CLICKS_COLOR, precision: 0, font: { size: 11 } },
        },
        orders: {
          type: 'linear',
          position: 'right',
          beginAtZero: true,
          grid: { display: false },
          border: { display: false },
          ticks: { color: ORDERS_COLOR, precision: 0, font: { size: 11 } },
        },
      },
    }),
    [],
  );

  const summary = useMemo(() => {
    if (daily.length === 0) return 'No daily traffic has been recorded.';
    const clicks = daily.reduce((total, day) => total + day.clicks, 0);
    const orders = daily.reduce((total, day) => total + day.orders, 0);
    const busiest = daily.reduce((best, day) => (day.clicks > best.clicks ? day : best), daily[0]);
    return `${formatCount(clicks)} clicks and ${formatCount(orders)} orders across ${daily.length} days, busiest on ${format(parseISO(busiest.day), 'd MMM')} with ${formatCount(busiest.clicks)} clicks.`;
  }, [daily]);

  return (
    <Panel
      title="Traffic"
      description="Storefront events recorded by the click tracker, against orders placed the same day."
    >
      <Metrics
        items={[
          {
            label: 'Clicks, all time',
            value: formatCount(traffic.clicksAllTime),
          },
          {
            label: 'Clicks, last 30 days',
            value: formatCount(traffic.clicksLast30d),
          },
          {
            label: 'Unique visitors, 30 days',
            value: formatCount(traffic.uniqueVisitorsLast30d),
            hint: 'Distinct visitor ids',
          },
        ]}
      />

      <div className={tables.tableBlock}>
        <h3 className={tables.subhead}>Clicks and orders by day</h3>

        {daily.length === 0 ? (
          <EmptyState
            compact
            title="No traffic recorded"
            description="Nothing has been tracked on this storefront yet. Traffic appears once a visitor loads a page."
          />
        ) : (
          <figure className={styles.figure}>
            <div
              className={styles.canvas}
              role="img"
              aria-label={`Clicks and orders by day. ${summary}`}
            >
              <Line data={chartData} options={options} />
            </div>

            <ul className={styles.legend}>
              <li className={styles.legendItem}>
                <span className={styles.swatchClicks} aria-hidden="true" />
                Clicks (left axis)
              </li>
              <li className={styles.legendItem}>
                <span className={styles.swatchOrders} aria-hidden="true" />
                Orders (right axis)
              </li>
            </ul>

            <figcaption className={styles.caption}>{summary}</figcaption>

            {/*
              The same numbers as a table. A chart is an image, and an image is
              not a data source for anyone reading with a screen reader or
              copying a figure into a ticket. This is visually hidden rather
              than absent.
            */}
            {/* The wrapper carries the visually-hidden geometry, not the table.
                `width: 1px` on a `<table>` is only a suggestion — a table sizes
                to its content unless `table-layout` is fixed — so a hidden
                table laid itself out at full data width and pushed the document
                7px wider than the viewport at 390px. A block wrapper genuinely
                collapses to 1px and clips it. */}
            <div className={styles.srOnly}>
              <table>
                <caption>Daily storefront clicks, unique visitors and orders</caption>
                <thead>
                  <tr>
                    <th scope="col">Day</th>
                    <th scope="col">Clicks</th>
                    <th scope="col">Unique visitors</th>
                    <th scope="col">Orders</th>
                  </tr>
                </thead>
                <tbody>
                  {daily.map((day) => (
                    <tr key={day.day}>
                      <th scope="row">{format(parseISO(day.day), 'd MMM yyyy')}</th>
                      <td>{formatCount(day.clicks)}</td>
                      <td>{formatCount(day.uniqueVisitors)}</td>
                      <td>{formatCount(day.orders)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </figure>
        )}
      </div>

      <div className={styles.lists}>
        <div>
          <h3 className={tables.subhead}>Top pages</h3>
          {traffic.topPages.length === 0 ? (
            <p className={styles.none}>No page views recorded.</p>
          ) : (
            <ul className={tables.rankList}>
              {traffic.topPages.map((page) => (
                <li className={tables.rankItem} key={page.path}>
                  <span className={tables.rankLabel}>{page.path || '/'}</span>
                  <span className={tables.rankValue}>{formatCount(page.clicks)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <h3 className={tables.subhead}>Top referrers</h3>
          {traffic.topReferrers.length === 0 ? (
            <p className={styles.none}>No referrers recorded — all traffic arrived direct.</p>
          ) : (
            <ul className={tables.rankList}>
              {traffic.topReferrers.map((referrer) => (
                <li className={tables.rankItem} key={referrer.domain}>
                  <span className={tables.rankLabel}>{referrer.domain || 'Direct'}</span>
                  <span className={tables.rankValue}>{formatCount(referrer.clicks)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Panel>
  );
}
