/**
 * `CreateCouponModal`'s percent-off / card-collection interlock (staff review finding 7).
 *
 * Repro from the review: Percent off = 100 → toggle card collection off → change Percent off to
 * 50. Before the fix, `disabled={!canSkipCard && !form.collectPaymentMethod}` froze the switch off
 * the instant it was already `false` and could no longer legally become `true` through the UI —
 * `validate()` then refused every submit, and Cancel (which wipes the form) was the only way out.
 * These tests exercise the actual DOM interaction rather than `validate()` in isolation, since the
 * bug was in *reachability*, not in what the validator itself decides.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import { CreateCouponModal } from '../CreateCouponModal';

function renderModal(): void {
  render(
    <MantineProvider>
      <CreateCouponModal opened onClose={jest.fn()} onCreated={jest.fn()} />
    </MantineProvider>
  );
}

describe('CreateCouponModal: the percent-off / card-collection interlock', () => {
  it('never leaves the switch stuck off and unreachable after percent off leaves 100', async () => {
    const user = userEvent.setup();
    renderModal();

    const percentOff = screen.getByLabelText(/percent off/i);
    const cardSwitch = screen.getByRole('switch', { name: /collect a payment method at signup/i });

    // Starts at 100% off, card collection on, switch enabled.
    expect(percentOff).toHaveValue(100);
    expect(cardSwitch).toBeChecked();
    expect(cardSwitch).toBeEnabled();

    // Turn card collection off — legal at 100% off.
    await user.click(cardSwitch);
    expect(cardSwitch).not.toBeChecked();

    // Drop the percentage below 100 — the combination the schema forbids.
    await user.clear(percentOff);
    await user.type(percentOff, '50');

    // The fix: forced back to `true` in the same update, and now correctly unreachable — not
    // frozen on the forbidden `false` from before the edit.
    expect(cardSwitch).toBeChecked();
    expect(cardSwitch).toBeDisabled();
  });

  it('re-enables the switch the moment percent off returns to 100', async () => {
    const user = userEvent.setup();
    renderModal();

    const percentOff = screen.getByLabelText(/percent off/i);
    const cardSwitch = screen.getByRole('switch', { name: /collect a payment method at signup/i });

    await user.clear(percentOff);
    await user.type(percentOff, '50');
    expect(cardSwitch).toBeDisabled();

    await user.clear(percentOff);
    await user.type(percentOff, '100');
    expect(cardSwitch).toBeEnabled();
    // Switching to 50 forced it to `true`; returning to 100 leaves the operator's choice intact
    // rather than guessing at a new one.
    expect(cardSwitch).toBeChecked();
  });
});
