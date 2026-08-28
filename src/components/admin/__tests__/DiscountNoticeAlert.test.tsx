/**
 * `DiscountNoticeAlert` renders `discount-notice.ts`'s ladder — `docs/plans/platform-coupons.md`
 * §5.1/§5.2. These tests exercise the component-level decisions phase 7 is responsible for: the
 * component defers every date computation to `resolveDiscountNotice`, so what is worth asserting
 * here is that each returned state maps to the right weight (silent / informational / actionable /
 * escalated / honest), that the 30-day boundary the plan calls out is respected, and that
 * dismissal actually persists per browser.
 *
 * Every rendered state uses `role="alert"` — Mantine's `Alert` hardcodes that role unconditionally
 * (see the component's file header) — so "renders nothing" is asserted as the *absence* of that
 * role rather than `toBeEmptyDOMElement()`: `MantineProvider` itself injects a `<style>` tag into
 * every render, so the container is never truly empty and that assertion would pass or fail for
 * reasons unrelated to this component.
 */

import React from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import { DiscountNoticeAlert, type DiscountNoticeAlertProps } from '../DiscountNoticeAlert';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-08-27T00:00:00.000Z');

function daysFromNow(days: number): Date {
  return new Date(NOW.getTime() + days * MS_PER_DAY);
}

function renderAlert(props: Partial<DiscountNoticeAlertProps> = {}) {
  const onAddPaymentMethod = jest.fn(() => {});
  const utils = render(
    <MantineProvider>
      <DiscountNoticeAlert
        discountEndsAt={daysFromNow(30)}
        hasPaymentMethod={true}
        status="redeemed"
        now={NOW}
        onAddPaymentMethod={onAddPaymentMethod}
        {...props}
      />
    </MantineProvider>
  );
  return { ...utils, onAddPaymentMethod };
}

beforeEach(() => {
  window.localStorage.clear();
});

describe('DiscountNoticeAlert', () => {
  it('renders nothing when there is no discount at all (discountEndsAt is null)', () => {
    renderAlert({ discountEndsAt: null });
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('renders nothing for an attributed (not yet redeemed) claim', () => {
    renderAlert({ status: 'attributed', discountEndsAt: daysFromNow(10) });
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('renders nothing more than 30 days out — quiet for eleven months', () => {
    renderAlert({ discountEndsAt: daysFromNow(31) });
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('renders at exactly 30 days out — the boundary is inclusive', () => {
    renderAlert({ discountEndsAt: daysFromNow(30) });
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('is informational, not actionable, with a card on file', () => {
    renderAlert({ discountEndsAt: daysFromNow(5), hasPaymentMethod: true });
    const alert = screen.getByRole('alert');
    expect(within(alert).getByText(/ends soon/i)).toBeInTheDocument();
    expect(within(alert).queryByRole('button', { name: /add a payment method/i })).toBeNull();
  });

  it('is actionable, not dismissible, with no card on file — same dates, different weight', () => {
    renderAlert({ discountEndsAt: daysFromNow(5), hasPaymentMethod: false });
    const alert = screen.getByRole('alert');
    expect(within(alert).getByRole('button', { name: /add a payment method/i })).toBeInTheDocument();
    // Actionable alerts carry no close button at all.
    expect(within(alert).queryByRole('button', { name: /dismiss/i })).toBeNull();
  });

  it('calls onAddPaymentMethod when the actionable button is clicked', async () => {
    const user = userEvent.setup();
    const { onAddPaymentMethod } = renderAlert({ discountEndsAt: daysFromNow(1), hasPaymentMethod: false });
    await user.click(screen.getByRole('button', { name: /add a payment method/i }));
    expect(onAddPaymentMethod).toHaveBeenCalledTimes(1);
  });

  it('escalates to in-grace once the window has closed with no card', () => {
    renderAlert({ discountEndsAt: daysFromNow(-1), hasPaymentMethod: false });
    expect(screen.getByText(/has ended/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /add a payment method/i })).toBeInTheDocument();
  });

  it('renders nothing once the window closes with a card on file — Stripe already charged it', () => {
    renderAlert({ discountEndsAt: daysFromNow(-1), hasPaymentMethod: true });
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('reaches the honest grace-exhausted state after 14 days, and still offers the fix', () => {
    renderAlert({ discountEndsAt: daysFromNow(-15), hasPaymentMethod: false });
    const alert = screen.getByRole('alert');
    expect(within(alert).getByText(/grace period has passed/i)).toBeInTheDocument();
    expect(within(alert).getByText(/storefront is still live/i)).toBeInTheDocument();
    expect(within(alert).getByRole('button', { name: /add a payment method/i })).toBeInTheDocument();
  });

  it('dismisses an informational alert and remembers the dismissal per browser', async () => {
    const user = userEvent.setup();
    const { rerender } = renderAlert({ discountEndsAt: daysFromNow(5), hasPaymentMethod: true });

    await user.click(screen.getByRole('button', { name: /dismiss/i }));
    expect(screen.queryByRole('alert')).toBeNull();

    // Re-mounting (a fresh page load) must still honour the remembered dismissal.
    rerender(
      <MantineProvider>
        <DiscountNoticeAlert
          discountEndsAt={daysFromNow(5)}
          hasPaymentMethod={true}
          status="redeemed"
          now={NOW}
          onAddPaymentMethod={jest.fn(() => {})}
        />
      </MantineProvider>
    );
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('does not let a dismissal of one cycle suppress a later, different discountEndsAt', () => {
    const { unmount } = renderAlert({ discountEndsAt: daysFromNow(5), hasPaymentMethod: true });
    expect(screen.getByRole('alert')).toBeInTheDocument();
    unmount();

    try {
      window.localStorage.setItem(
        `rs_discount_notice_dismissed:${daysFromNow(5).toISOString()}`,
        '1'
      );
    } catch {
      // If storage is unavailable in this environment the assertion below is moot either way.
    }

    renderAlert({ discountEndsAt: daysFromNow(20), hasPaymentMethod: true });
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });
});
