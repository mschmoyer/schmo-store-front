/**
 * The console's fleet-health cards.
 *
 * What is asserted here is the thing the block exists to do: put four numbers in triage order and
 * name the stores behind each one. The store names are read out of the card's text rather than out
 * of an opened tooltip on purpose — a tooltip is supplementary by design, and the assertion that
 * matters is that the detail reaches a reader who never hovers anything.
 */

import React from 'react';
import { render, within } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { HealthCards } from '../HealthCards';
import type { PlatformHealth, PlatformHealthState, PlatformHealthStore } from '../types';

/**
 * Builds one store row.
 *
 * @param id - Unique id; also seeds the name when none is given.
 * @param state - The sync state the row lands in.
 * @param overrides - Anything else the case needs.
 * @returns A store row shaped like `/api/platform/health` sends it.
 */
function store(
  id: string,
  state: PlatformHealthState,
  overrides: Partial<PlatformHealthStore> = {},
): PlatformHealthStore {
  return {
    storeId: id,
    storeName: `Store ${id}`,
    syncStatus: null,
    lastSyncAt: null,
    errorMessage: null,
    state,
    ...overrides,
  };
}

/**
 * Builds a health payload whose counts agree with its rows, as the API's do.
 *
 * @param stores - The store rows.
 * @returns The payload.
 */
function health(stores: PlatformHealthStore[]): PlatformHealth {
  return {
    counts: {
      healthy: stores.filter((row) => row.state === 'healthy').length,
      stale: stores.filter((row) => row.state === 'stale').length,
      failing: stores.filter((row) => row.state === 'failing').length,
      notConnected: stores.filter((row) => row.state === 'not_connected').length,
    },
    jobs: { pending: 0, processing: 0, failed: 0 },
    unfulfilledOver48h: 0,
    stores,
    alerts: [],
  };
}

/**
 * Renders the cards inside the provider Mantine's tooltip needs.
 *
 * @param payload - The health payload to render.
 * @returns The four card elements, in document order.
 */
function renderCards(payload: PlatformHealth): HTMLLIElement[] {
  const { container } = render(
    <MantineProvider>
      <HealthCards health={payload} />
    </MantineProvider>,
  );
  return Array.from(container.querySelectorAll('li'));
}

describe('HealthCards', () => {
  it('renders four cards in triage order, worst first', () => {
    const cards = renderCards(health([store('a', 'healthy')]));

    expect(cards).toHaveLength(4);
    expect(cards.map((card) => card.textContent?.slice(0, 20))).toEqual([
      expect.stringContaining('Failing'),
      expect.stringContaining('Stale'),
      expect.stringContaining('Not connected'),
      expect.stringContaining('Healthy'),
    ]);
  });

  it('shows each state count from the payload', () => {
    const cards = renderCards(
      health([
        store('a', 'failing'),
        store('b', 'failing'),
        store('c', 'stale'),
        store('d', 'healthy'),
      ]),
    );

    expect(within(cards[0]).getByText('2')).toBeInTheDocument();
    expect(within(cards[1]).getByText('1')).toBeInTheDocument();
    expect(within(cards[2]).getByText('0')).toBeInTheDocument();
    expect(within(cards[3]).getByText('1')).toBeInTheDocument();
  });

  it('names the stores behind a number in text, not only in the tooltip', () => {
    const cards = renderCards(
      health([
        store('a', 'failing', {
          storeName: 'Basecamp Audio',
          errorMessage: 'ShipStation returned 401.',
        }),
        store('b', 'healthy', { storeName: 'Ironline Fitness' }),
      ]),
    );

    expect(cards[0].textContent).toContain('Basecamp Audio');
    expect(cards[0].textContent).toContain('ShipStation returned 401.');
    expect(cards[3].textContent).toContain('Ironline Fitness');
  });

  it('does not terminate a sync error that already ends in a full stop twice', () => {
    const cards = renderCards(
      health([store('a', 'failing', { errorMessage: 'Reconnect the integration.' })]),
    );

    expect(cards[0].textContent).toContain('Reconnect the integration.');
    expect(cards[0].textContent).not.toContain('integration..');
  });

  it('says a store never synced rather than ageing a missing timestamp', () => {
    const cards = renderCards(health([store('a', 'stale', { lastSyncAt: null })]));

    expect(cards[1].textContent).toContain('never synced');
  });

  it('names six stores and counts the rest', () => {
    const rows = Array.from({ length: 9 }, (_, index) => store(`s${index}`, 'not_connected'));
    const cards = renderCards(health(rows));

    expect(cards[2].textContent).toContain('Store s5');
    expect(cards[2].textContent).not.toContain('Store s6');
    expect(cards[2].textContent).toContain('And 3 more.');
  });

  it('writes out an empty reading instead of leaving a card with nothing to say', () => {
    const cards = renderCards(health([store('a', 'healthy')]));

    expect(cards[0].textContent).toContain('No store is reporting a ShipStation error.');
    expect(cards[0].textContent).not.toContain('of 1 store');
  });

  it('reports each count against the number of stores tracked', () => {
    const cards = renderCards(health([store('a', 'failing'), store('b', 'healthy')]));

    expect(cards[0].textContent).toContain('1 of 2 stores');
  });

  it('takes focus so a keyboard can open the tooltip', () => {
    const cards = renderCards(health([store('a', 'healthy')]));

    cards.forEach((card) => expect(card).toHaveAttribute('tabindex', '0'));
  });
});
