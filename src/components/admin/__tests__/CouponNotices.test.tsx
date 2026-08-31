/**
 * `CouponNotices`'s failure state (staff review finding 11).
 *
 * Before this fix, `!response.ok` and every throw from `GET /api/billing/coupon/notice` returned
 * silently, rendering nothing — invariant 14 says a no-card redemption with a `discount_ends_at`
 * must *always* render the banner, and a `500` making it vanish with no trace is precisely the
 * violation that finding calls out. These tests assert the inline failure notice appears (with a
 * working retry) instead of `null`, and that a genuine "nothing to show" response still renders
 * nothing, so the fix does not turn every merchant's dashboard into a permanent gray banner.
 *
 * `global.fetch` is already a `jest.fn()` from `jest.setup.js`; each test configures its own
 * resolution/rejection.
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import { CouponNotices } from '../CouponNotices';

const mockedFetch = global.fetch as ReturnType<typeof jest.fn>;

function renderNotices(): void {
  render(
    <MantineProvider>
      <CouponNotices />
    </MantineProvider>
  );
}

beforeEach(() => {
  mockedFetch.mockReset();
});

describe('CouponNotices: rendering a fetch failure instead of nothing', () => {
  it('renders an inline retry notice on a non-OK response, never silently nothing', async () => {
    mockedFetch.mockResolvedValueOnce({ ok: false, json: async () => ({}) });

    renderNotices();

    expect(await screen.findByRole('alert')).toHaveTextContent(/couldn.t check your offer status/i);
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
  });

  it('renders the same notice when the request throws', async () => {
    mockedFetch.mockRejectedValueOnce(new Error('network down'));

    renderNotices();

    expect(await screen.findByRole('alert')).toHaveTextContent(/couldn.t check your offer status/i);
  });

  it('renders the same notice on a { success: false } body', async () => {
    mockedFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ success: false }) });

    renderNotices();

    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });

  it('retry re-fetches and replaces the failure notice with the real one on success', async () => {
    const user = userEvent.setup();
    mockedFetch
      .mockResolvedValueOnce({ ok: false, json: async () => ({}) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: { kind: 'reservation', code: 'FRIENDS12', name: 'Launch friends', attributedAt: '2026-08-01T00:00:00Z' },
        }),
      });

    renderNotices();

    await screen.findByRole('alert');
    await user.click(screen.getByRole('button', { name: /retry/i }));

    await waitFor(() => expect(screen.queryByText(/couldn.t check your offer status/i)).not.toBeInTheDocument());
    expect(mockedFetch).toHaveBeenCalledTimes(2);
  });

  it('renders nothing for a genuine "nothing to show" response — the fix must not turn every dashboard into a permanent banner', async () => {
    mockedFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, data: { kind: 'none' } }) });

    const { container } = render(
      <MantineProvider>
        <CouponNotices />
      </MantineProvider>
    );

    await waitFor(() => expect(mockedFetch).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    // Mantine injects a `<style>` element even when this component renders `null`, so
    // `toBeEmptyDOMElement()` never passes — assert there is no alert/status content instead.
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });

  it('shows nothing when the caller is not signed in — a 401 is not a failure to report here', async () => {
    // There is no client-readable credential any more: the session is an httpOnly cookie, so
    // "signed out" can only be learned from the response. The banner must not appear for it.
    mockedFetch.mockResolvedValueOnce({ status: 401, ok: false, json: async () => ({}) });

    renderNotices();

    await waitFor(() => expect(mockedFetch).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
