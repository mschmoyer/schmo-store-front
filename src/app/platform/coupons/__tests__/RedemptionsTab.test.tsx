/**
 * `RedemptionsTab`'s two staff-review fixes:
 *
 * - **Finding 6**: "Discount ends" must read `—` for anything that is not `redeemed`, never
 *   "Forever" — `discount_ends_at` is `NULL` for every `attributed`/`released` row for the
 *   unrelated reason that it was never set, not because the offer runs forever.
 * - **Finding 2**: an `attributed` row gets a "Release" action that calls the new release route
 *   and reloads the list; a `redeemed` or `released` row gets none.
 *
 * `global.fetch` is the `jest.fn()` from `jest.setup.js`.
 */

import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import { RedemptionsTab } from '../RedemptionsTab';
import type { PlatformRedemptionApiItem, PlatformRedemptionsPayload } from '../types';

const mockedFetch = global.fetch as ReturnType<typeof jest.fn>;

function redemption(overrides: Partial<PlatformRedemptionApiItem> = {}): PlatformRedemptionApiItem {
  return {
    id: 'redemption-1',
    status: 'attributed',
    source: 'link',
    attributedAt: '2026-08-01T00:00:00Z',
    redeemedAt: null,
    releasedAt: null,
    releaseReason: null,
    discountEndsAt: null,
    subscriptionStatus: null,
    coupon: { id: 'coupon-1', code: 'FRIENDS12', name: 'Launch friends, 1 year' },
    user: { id: 'user-1', email: 'friend@example.com', name: 'Friend Person' },
    store: null,
    ...overrides,
  };
}

function payload(redemptions: PlatformRedemptionApiItem[]): PlatformRedemptionsPayload {
  return {
    redemptions,
    pagination: { page: 1, pageSize: 25, total: redemptions.length, totalPages: 1 },
    scope: { includeDemo: false, demoStoresHidden: 0 },
  };
}

function renderTab(): void {
  render(
    <MantineProvider>
      <RedemptionsTab
        status="all"
        onStatusChange={jest.fn()}
        page={1}
        onPageChange={jest.fn()}
        includeDemo={false}
        onIncludeDemoChange={jest.fn()}
      />
    </MantineProvider>
  );
}

beforeEach(() => {
  mockedFetch.mockReset();
});

describe('finding 6: "Discount ends" only ever says Forever for a redeemed claim', () => {
  it('shows an em dash for an attributed claim with no discount_ends_at, never "Forever"', async () => {
    mockedFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, data: payload([redemption({ status: 'attributed' })]) }),
    });

    renderTab();

    const row = (await screen.findByText('friend@example.com')).closest('tr');
    expect(row).not.toBeNull();
    expect(within(row as HTMLElement).queryByText('Forever')).not.toBeInTheDocument();
    // "Discount ends" is the 7th cell; "Redeemed" (the 6th) is also legitimately "—" for an
    // unredeemed claim, so at least two dashes are expected — the assertion above is what actually
    // proves the fix (no "Forever").
    expect(within(row as HTMLElement).getAllByText('—').length).toBeGreaterThanOrEqual(2);
  });

  it('shows an em dash for a released claim with no discount_ends_at', async () => {
    mockedFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        data: payload([redemption({ status: 'released', releaseReason: 'reservation_expired' })]),
      }),
    });

    renderTab();

    await screen.findByText('friend@example.com');
    expect(screen.queryByText('Forever')).not.toBeInTheDocument();
  });

  it('still shows "Forever" for a genuinely-forever redeemed claim', async () => {
    mockedFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        data: payload([redemption({ status: 'redeemed', redeemedAt: '2026-08-02T00:00:00Z', discountEndsAt: null })]),
      }),
    });

    renderTab();

    expect(await screen.findByText('Forever')).toBeInTheDocument();
  });

  it('shows the real date for a redeemed claim with a discount_ends_at', async () => {
    mockedFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        data: payload([
          redemption({ status: 'redeemed', redeemedAt: '2026-08-02T00:00:00Z', discountEndsAt: '2027-08-02T00:00:00Z' }),
        ]),
      }),
    });

    renderTab();

    expect(await screen.findByText('2 Aug 2027')).toBeInTheDocument();
  });
});

describe('finding 2: the release action', () => {
  it('offers Release only for an attributed row', async () => {
    mockedFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        data: payload([
          redemption({ id: 'r-attributed', status: 'attributed', user: { id: 'u1', email: 'a@example.com', name: 'A' } }),
          redemption({
            id: 'r-redeemed',
            status: 'redeemed',
            redeemedAt: '2026-08-02T00:00:00Z',
            user: { id: 'u2', email: 'b@example.com', name: 'B' },
          }),
        ]),
      }),
    });

    renderTab();

    await screen.findByText('a@example.com');
    expect(screen.getAllByRole('button', { name: /^release$/i })).toHaveLength(1);
  });

  it('releases the claim and reloads the list on confirm', async () => {
    const user = userEvent.setup();
    const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(true);

    mockedFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: payload([redemption({ status: 'attributed' })]) }),
      })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, data: { redemption: { id: 'redemption-1', status: 'released', releasedAt: null, releaseReason: 'operator_released' } } }) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: payload([redemption({ status: 'released', releaseReason: 'operator_released' })]) }),
      });

    renderTab();

    const releaseButton = await screen.findByRole('button', { name: /^release$/i });
    await user.click(releaseButton);

    await waitFor(() => expect(mockedFetch).toHaveBeenCalledTimes(3));

    const releaseCall = mockedFetch.mock.calls[1];
    expect(releaseCall[0]).toBe('/api/platform/coupons/redemptions/redemption-1/release');
    expect(releaseCall[1]).toMatchObject({ method: 'POST' });

    // The list reloaded and now shows the released state — no "Release" button left for this row.
    await waitFor(() => expect(screen.queryByRole('button', { name: /^release$/i })).not.toBeInTheDocument());

    confirmSpy.mockRestore();
  });

  it('does not call the release route when the confirm dialog is declined', async () => {
    const user = userEvent.setup();
    const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(false);

    mockedFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, data: payload([redemption({ status: 'attributed' })]) }),
    });

    renderTab();

    const releaseButton = await screen.findByRole('button', { name: /^release$/i });
    await user.click(releaseButton);

    // Only the initial GET — no second call for a declined confirm.
    expect(mockedFetch).toHaveBeenCalledTimes(1);

    confirmSpy.mockRestore();
  });

  it('shows a row-level error and leaves the row releasable again when the release fails', async () => {
    const user = userEvent.setup();
    const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(true);

    mockedFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: payload([redemption({ status: 'attributed' })]) }),
      })
      .mockResolvedValueOnce({
        ok: false,
        json: async () => ({ success: false, error: 'This claim has already been redeemed.' }),
      });

    renderTab();

    const releaseButton = await screen.findByRole('button', { name: /^release$/i });
    await user.click(releaseButton);

    expect(await screen.findByRole('alert')).toHaveTextContent(/already been redeemed/i);
    // The row is untouched — still attributed, still offering Release.
    expect(screen.getByRole('button', { name: /^release$/i })).toBeInTheDocument();

    confirmSpy.mockRestore();
  });
});
