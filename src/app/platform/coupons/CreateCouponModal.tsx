'use client';

/**
 * The coupon creation form.
 *
 * Mirrors every server-side rule so an operator sees a named field error instead of a round-trip;
 * the server (`validateCreateCouponBody`) re-checks regardless (`CLAUDE.md`: "Server truth"). The
 * one rule worth flagging: `collectPaymentMethod: false` is only valid at `percentOff === 100`
 * (plan §3 — a partial discount still charges something), enforced here, server-side, and by a DB
 * `CHECK` constraint.
 *
 * The offer preview renders through {@link describePlatformCoupon}, the same function the console
 * list and merchant-facing surfaces use, so it can't drift from what actually gets quoted.
 */

import React, { useCallback, useMemo, useState } from 'react';
import { IconTicket } from '@tabler/icons-react';
import { Button, Input, Modal, Switch, Textarea } from '@/components/ui';
import { describePlatformCoupon } from '@/lib/billing/platform-coupons';
import type { CreatePlatformCouponRequest, PlatformCouponApiItem } from './types';
import styles from './coupons.module.css';

export interface CreateCouponModalProps {
  /** Whether the dialog is open. */
  opened: boolean;
  /** Called when the dialog should close without creating anything. */
  onClose: () => void;
  /** Called with the created coupon once the request succeeds. */
  onCreated: (coupon: PlatformCouponApiItem) => void;
}

/** The form's own state — all strings, so a blank input and an invalid one are distinguishable. */
interface FormState {
  code: string;
  name: string;
  notes: string;
  percentOff: string;
  durationMonths: string;
  maxRedemptions: string;
  collectPaymentMethod: boolean;
  redeemBy: string;
}

const EMPTY_FORM: FormState = {
  code: '',
  name: '',
  notes: '',
  percentOff: '100',
  durationMonths: '12',
  maxRedemptions: '',
  collectPaymentMethod: true,
  redeemBy: '',
};

type FieldErrors = Partial<Record<string, string>>;

type ValidationResult =
  | { ok: true; payload: CreatePlatformCouponRequest }
  | { ok: false; field: string; message: string };

/**
 * Validate the form and, on success, produce the request body.
 *
 * @param form - The current form state.
 * @returns The request payload, or the first field that failed.
 */
function validate(form: FormState): ValidationResult {
  const name = form.name.trim();
  if (!name) {
    return { ok: false, field: 'name', message: 'Name is required.' };
  }
  if (name.length > 120) {
    return { ok: false, field: 'name', message: 'Name must be 120 characters or fewer.' };
  }

  const percentOff = Number.parseInt(form.percentOff, 10);
  if (!Number.isInteger(percentOff) || percentOff < 1 || percentOff > 100) {
    return { ok: false, field: 'percentOff', message: 'Enter a whole number between 1 and 100.' };
  }

  let durationMonths: number | null = null;
  if (form.durationMonths.trim() !== '') {
    const parsed = Number.parseInt(form.durationMonths, 10);
    if (!Number.isInteger(parsed) || parsed < 1) {
      return {
        ok: false,
        field: 'durationMonths',
        message: 'Enter a whole number of 1 or more, or leave blank for forever.',
      };
    }
    durationMonths = parsed;
  }

  let maxRedemptions: number | null = null;
  if (form.maxRedemptions.trim() !== '') {
    const parsed = Number.parseInt(form.maxRedemptions, 10);
    if (!Number.isInteger(parsed) || parsed < 1) {
      return {
        ok: false,
        field: 'maxRedemptions',
        message: 'Enter a whole number of 1 or more, or leave blank for unlimited.',
      };
    }
    maxRedemptions = parsed;
  }

  if (!form.collectPaymentMethod && percentOff !== 100) {
    return {
      ok: false,
      field: 'collectPaymentMethod',
      message: 'Skipping card collection only works at 100% off.',
    };
  }

  let redeemBy: string | null = null;
  if (form.redeemBy.trim() !== '') {
    const date = new Date(form.redeemBy);
    if (Number.isNaN(date.getTime())) {
      return { ok: false, field: 'redeemBy', message: 'Enter a valid date.' };
    }
    redeemBy = date.toISOString();
  }

  const code = form.code.trim();

  return {
    ok: true,
    payload: {
      name,
      notes: form.notes.trim() || null,
      percentOff,
      durationMonths,
      maxRedemptions,
      collectPaymentMethod: form.collectPaymentMethod,
      redeemBy,
      ...(code ? { code } : {}),
    },
  };
}

/**
 * The live offer sentence for whatever is currently in the percent/duration/card fields, or `null`
 * while the percentage is not yet a valid 1-100 integer.
 *
 * @param form - The current form state.
 * @returns The sentence {@link describePlatformCoupon} would render, or `null`.
 */
function previewOffer(form: FormState): string | null {
  const percentOff = Number.parseInt(form.percentOff, 10);
  if (!Number.isInteger(percentOff) || percentOff < 1 || percentOff > 100) return null;

  let durationMonths: number | null = null;
  if (form.durationMonths.trim() !== '') {
    const parsed = Number.parseInt(form.durationMonths, 10);
    if (!Number.isInteger(parsed) || parsed < 1) return null;
    durationMonths = parsed;
  }

  return describePlatformCoupon({
    code: '',
    name: '',
    percentOff,
    durationMonths,
    collectPaymentMethod: form.collectPaymentMethod,
    maxRedemptions: null,
    redeemedCount: 0,
    redeemBy: null,
    isActive: true,
  });
}

/**
 * The coupon creation dialog.
 *
 * @param props - {@link CreateCouponModalProps}
 * @returns The modal.
 */
export function CreateCouponModal({ opened, onClose, onCreated }: CreateCouponModalProps): React.ReactElement {
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const offer = useMemo(() => previewOffer(form), [form]);
  // Only gates *turning the switch off*; `handlePercentOffChange` is what forces it back to `true`
  // when percentage leaves 100 (see that function — finding 7).
  const canSkipCard = Number.parseInt(form.percentOff, 10) === 100;

  const set = useCallback(<K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setFieldErrors((prev) => (prev[key as string] ? { ...prev, [key as string]: undefined } : prev));
  }, []);

  /**
   * Percent-off gets its own handler because leaving `100` invalidates `collectPaymentMethod:
   * false` (the `platform_coupons_no_card_needs_full_discount` CHECK) — forced back to `true` here,
   * in the same update, rather than left for the disabled switch to freeze in an illegal state
   * with only Cancel (which wipes the form) as the way out (finding 7).
   *
   * @param value - The raw input value.
   */
  const handlePercentOffChange = useCallback((value: string) => {
    setForm((prev) => {
      const parsed = Number.parseInt(value, 10);
      const stillSkippable = Number.isInteger(parsed) && parsed === 100;
      return {
        ...prev,
        percentOff: value,
        collectPaymentMethod: stillSkippable ? prev.collectPaymentMethod : true,
      };
    });
    setFieldErrors((prev) =>
      prev.percentOff || prev.collectPaymentMethod
        ? { ...prev, percentOff: undefined, collectPaymentMethod: undefined }
        : prev
    );
  }, []);

  const handleClose = useCallback(() => {
    if (submitting) return;
    setForm(EMPTY_FORM);
    setFieldErrors({});
    setSubmitError(null);
    onClose();
  }, [onClose, submitting]);

  const handleSubmit = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setSubmitError(null);

      const validation = validate(form);
      if (!validation.ok) {
        setFieldErrors({ [validation.field]: validation.message });
        return;
      }
      setFieldErrors({});
      setSubmitting(true);

      try {
        const token = typeof window === 'undefined' ? null : window.localStorage.getItem('admin_token');
        const response = await fetch('/api/platform/coupons', {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify(validation.payload),
        });
        const payload = (await response.json().catch(() => null)) as
          | { success?: boolean; data?: { coupon: PlatformCouponApiItem }; error?: string; field?: string }
          | null;

        if (!response.ok || payload?.success !== true || !payload.data) {
          const message = payload?.error || 'Could not create the coupon.';
          if (payload?.field) {
            setFieldErrors({ [payload.field]: message });
          } else {
            setSubmitError(message);
          }
          return;
        }

        onCreated(payload.data.coupon);
        setForm(EMPTY_FORM);
        onClose();
      } catch {
        setSubmitError('Could not reach the server. Check your connection and try again.');
      } finally {
        setSubmitting(false);
      }
    },
    [form, onClose, onCreated]
  );

  return (
    <Modal
      opened={opened}
      onClose={handleClose}
      title="New signup coupon"
      description="Issues a platform-wide discount on RebelShops subscriptions — not a storefront discount code."
      size="lg"
    >
      <form onSubmit={handleSubmit} className={styles.form} noValidate>
        <Input
          label="Name"
          hint='Shown in the console, e.g. "Launch friends, 1 year".'
          value={form.name}
          onChange={(event) => set('name', event.target.value)}
          error={fieldErrors.name}
          required
          maxLength={120}
        />

        <Textarea
          label="Notes"
          optionalLabel
          hint="Who this is for, or where it will be posted. Only operators see this."
          value={form.notes}
          onChange={(event) => set('notes', event.target.value)}
          error={fieldErrors.notes}
          rows={2}
        />

        <div className={styles.formRow}>
          <Input
            label="Percent off"
            type="number"
            inputMode="numeric"
            min={1}
            max={100}
            value={form.percentOff}
            onChange={(event) => handlePercentOffChange(event.target.value)}
            error={fieldErrors.percentOff}
            rightSection="%"
            required
          />
          <Input
            label="Duration (months)"
            hint="Blank means the discount never ends."
            optionalLabel
            type="number"
            inputMode="numeric"
            min={1}
            value={form.durationMonths}
            onChange={(event) => set('durationMonths', event.target.value)}
            error={fieldErrors.durationMonths}
          />
        </div>

        <div className={styles.formRow}>
          <Input
            label="Max redemptions"
            hint="Blank means unlimited."
            optionalLabel
            type="number"
            inputMode="numeric"
            min={1}
            value={form.maxRedemptions}
            onChange={(event) => set('maxRedemptions', event.target.value)}
            error={fieldErrors.maxRedemptions}
          />
          <Input
            label="Redeem by"
            hint="Blank means the link never expires on its own."
            optionalLabel
            type="date"
            value={form.redeemBy}
            onChange={(event) => set('redeemBy', event.target.value)}
            error={fieldErrors.redeemBy}
          />
        </div>

        <Input
          label="Code"
          hint="Leave blank to generate one automatically."
          optionalLabel
          value={form.code}
          onChange={(event) => set('code', event.target.value)}
          error={fieldErrors.code}
          mono
          maxLength={48}
        />

        <Switch
          label="Collect a payment method at signup"
          hint={
            canSkipCard
              ? 'Turn off for a friends-and-family link that asks for nothing. Only works at 100% off.'
              : 'Only optional at 100% off — a partial discount still charges something today.'
          }
          checked={form.collectPaymentMethod}
          onChange={(event) => set('collectPaymentMethod', event.target.checked)}
          disabled={!canSkipCard}
        />
        {fieldErrors.collectPaymentMethod ? (
          <p className={styles.formFieldError} role="alert">
            {fieldErrors.collectPaymentMethod}
          </p>
        ) : null}

        {offer ? (
          <p className={styles.offerPreview}>
            <IconTicket size={15} aria-hidden="true" />
            <span>{offer}</span>
          </p>
        ) : null}

        {submitError ? (
          <p className={styles.formError} role="alert">
            {submitError}
          </p>
        ) : null}

        <div className={styles.formActions}>
          <Button type="button" variant="secondary" onClick={handleClose} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" loading={submitting}>
            Create coupon
          </Button>
        </div>
      </form>
    </Modal>
  );
}
