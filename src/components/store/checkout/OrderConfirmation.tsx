'use client';

/**
 * Order confirmation.
 *
 * Reached from Stripe with `?session_id=cs_...`, or from the checkout page with
 * `?session_id=free_...` when the order cost nothing and no payment was needed.
 * That query string is never treated as evidence that anything was paid: the
 * page confirms the session against `GET /api/checkout/confirm`, which resolves
 * it to a real order row, and polls briefly while the webhook is still in
 * flight (a free order is already written, so it resolves on the first call).
 *
 * Presentationally this is a rewrite. The previous version rendered an orphaned
 * white Mantine card with no header, no footer, no store name and twenty dead
 * `var(--theme-*)` references — and on its error branch, no link out of the page
 * at all, which left a shopper who had possibly just been charged with nowhere
 * to go. It now renders inside the merchant's shell, and every branch offers a
 * way back into the shop.
 */

import * as React from 'react';
import { IconAlertTriangle, IconArrowRight, IconCheck, IconClock } from '@tabler/icons-react';
import Confetti from 'react-confetti';

import { useCart } from '../cart/CartProvider';
import { StoreLinkButton, cx, storeUi } from '../ui';
import styles from './Checkout.module.css';

/** A confirmed order line. */
interface ConfirmedItem {
  name: string;
  sku: string;
  quantity: number;
  unitPrice: string;
  totalPrice: string;
  imageUrl: string | null;
}

/** A confirmed order. */
interface ConfirmedOrder {
  orderNumber: string;
  paymentStatus: string | null;
  total: string;
  currency: string;
  email: string | null;
  placedAt: string | null;
  items: ConfirmedItem[];
}

/** States the confirmation endpoint can report. */
type ConfirmationStatus = 'loading' | 'paid' | 'processing' | 'open' | 'expired' | 'not_found';

/** How long to keep polling for the webhook before giving up. */
const POLL_WINDOW_MS = 30_000;
const POLL_INTERVAL_MS = 2_000;

/**
 * Format an amount the server already rounded.
 * @param amount - Decimal string such as `"49.98"`
 * @param currency - ISO-4217 code
 * @returns A localized currency string
 */
function formatAmount(amount: string, currency: string): string {
  const numeric = Number.parseFloat(amount);
  if (!Number.isFinite(numeric)) return amount;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: (currency || 'USD').toUpperCase(),
  }).format(numeric);
}

/**
 * Viewport size, for the confetti canvas.
 *
 * Local rather than Mantine's `useViewportSize`, because a shopper's page has
 * no business pulling in admin-chrome hooks.
 *
 * @returns The current viewport width and height
 */
function useViewport(): { width: number; height: number } {
  const [size, setSize] = React.useState({ width: 0, height: 0 });

  React.useEffect(() => {
    const measure = (): void =>
      setSize({ width: window.innerWidth, height: window.innerHeight });
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  return size;
}

export interface OrderConfirmationProps {
  storeSlug: string;
  storeName: string;
  /** The Stripe session id from the query string, if present. */
  sessionId: string | null;
}

/**
 * The order confirmation body.
 *
 * @param props - {@link OrderConfirmationProps}
 * @returns The confirmation screen
 */
export function OrderConfirmation({ storeSlug, storeName, sessionId }: OrderConfirmationProps) {
  const { clear } = useCart();
  const { width, height } = useViewport();

  const [status, setStatus] = React.useState<ConfirmationStatus>('loading');
  const [order, setOrder] = React.useState<ConfirmedOrder | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [showConfetti, setShowConfetti] = React.useState(false);

  /*
   * A ref's initial value is re-evaluated on every render even though only the
   * first one is kept, so `useRef(Date.now())` reads the clock during render.
   * A lazily-initialised state slot reads it exactly once, which is what this
   * poll deadline always meant; the value is never written again.
   */
  const [startedAt] = React.useState<number>(() => Date.now());
  const base = `/store/${storeSlug}`;

  const confirm = React.useCallback(async (): Promise<ConfirmationStatus> => {
    if (!sessionId) {
      setStatus('not_found');
      return 'not_found';
    }

    try {
      const response = await fetch(
        `/api/checkout/confirm?session_id=${encodeURIComponent(sessionId)}`,
      );
      const json = await response.json();

      if (!json.success) {
        setError(json.error ?? 'We could not confirm your order.');
        setStatus('not_found');
        return 'not_found';
      }

      const next = json.data.status as ConfirmationStatus;
      setStatus(next);

      if (next === 'paid' && json.data.order) {
        setOrder(json.data.order as ConfirmedOrder);
        // The order exists server-side, so the local cart is now safe to clear.
        clear();
        window.localStorage.removeItem('appliedCoupon');
        setShowConfetti(true);
      }

      return next;
    } catch {
      setError('We could not reach the store to confirm your order.');
      setStatus('not_found');
      return 'not_found';
    }
  }, [sessionId, clear]);

  React.useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const poll = async (): Promise<void> => {
      const result = await confirm();
      if (cancelled) return;

      const keepPolling =
        (result === 'processing' || result === 'open') &&
        Date.now() - startedAt < POLL_WINDOW_MS;

      if (keepPolling) timer = setTimeout(() => void poll(), POLL_INTERVAL_MS);
    };

    void poll();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
    // `startedAt` is fixed at first render, so listing it never re-runs the poll.
  }, [confirm, startedAt]);

  React.useEffect(() => {
    if (!showConfetti) return;
    const timer = setTimeout(() => setShowConfetti(false), 5000);
    return () => clearTimeout(timer);
  }, [showConfetti]);

  const reducedMotion =
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  // A zero-total order never went near Stripe, so "Total paid" and "Paid" would both be lies.
  const wasFree = order !== null && Number.parseFloat(order.total) === 0;

  /** Every branch ends with a way back into the shop. */
  const backToShop = (
    <div className={styles.confirmActions}>
      <StoreLinkButton href={`${base}/products`} size="lg">
        Continue shopping
        <IconArrowRight size={18} aria-hidden="true" />
      </StoreLinkButton>
      <StoreLinkButton href={base} variant="secondary" size="lg">
        Back to {storeName}
      </StoreLinkButton>
    </div>
  );

  if (!sessionId) {
    return (
      <div className={styles.confirm}>
        <span className={cx(styles.confirmMark, styles.confirmMarkQuiet)} aria-hidden="true">
          <IconAlertTriangle size={34} />
        </span>
        <h1>Nothing to confirm</h1>
        <p className={styles.confirmLead}>
          This page needs a completed checkout to confirm an order. If you were charged, contact
          the store with your email address and we will find it.
        </p>
        {backToShop}
      </div>
    );
  }

  if (status === 'loading') {
    return (
      <div className={styles.confirm} role="status">
        <span className={styles.spinner} aria-hidden="true" />
        <p className={styles.confirmLead}>Confirming your order…</p>
      </div>
    );
  }

  if (status === 'processing' || status === 'open') {
    return (
      <div className={styles.confirm} role="status">
        <span className={cx(styles.confirmMark, styles.confirmMarkQuiet)} aria-hidden="true">
          <IconClock size={34} />
        </span>
        <h1>{status === 'processing' ? 'Payment received' : 'Waiting for payment'}</h1>
        <p className={styles.confirmLead}>
          {status === 'processing'
            ? 'Your payment went through and we are finishing your order now. This page will update by itself.'
            : 'We have not seen a completed payment for this checkout yet. If you closed the Stripe page, nothing was charged.'}
        </p>
        <span className={styles.spinner} aria-hidden="true" />
        {backToShop}
      </div>
    );
  }

  if (status === 'expired' || status === 'not_found') {
    return (
      <div className={styles.confirm}>
        <span className={cx(styles.confirmMark, styles.confirmMarkQuiet)} aria-hidden="true">
          <IconAlertTriangle size={34} />
        </span>
        <h1>{status === 'expired' ? 'This checkout expired' : 'We could not find this order'}</h1>
        <p className={styles.confirmLead}>
          {error ??
            (status === 'expired'
              ? 'The payment window closed before it was completed. Nothing was charged — start checkout again when you are ready.'
              : 'This confirmation link does not match an order in our records. If you were charged, contact the store with your email address and we will find it.')}
        </p>
        <div className={styles.confirmActions}>
          <StoreLinkButton href={`${base}/cart`} size="lg">
            Back to your cart
          </StoreLinkButton>
          <StoreLinkButton href={`${base}/products`} variant="secondary" size="lg">
            Keep shopping
          </StoreLinkButton>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.confirm}>
      {showConfetti && !reducedMotion && width > 0 ? (
        <Confetti width={width} height={height} recycle={false} numberOfPieces={200} gravity={0.3} />
      ) : null}

      <span className={styles.confirmMark} aria-hidden="true">
        <IconCheck size={38} />
      </span>

      <h1>Order confirmed</h1>
      <p className={styles.confirmLead}>
        {order?.email
          ? `A receipt is on its way to ${order.email}.`
          : 'A receipt is on its way to your inbox.'}
      </p>

      <div className={styles.confirmFacts}>
        <div className={styles.row}>
          <span>Order number</span>
          <span className={styles.mono}>{order?.orderNumber}</span>
        </div>
        <div className={styles.row}>
          <span>{wasFree ? 'Total' : 'Total paid'}</span>
          <span className={styles.rowValue}>
            {order ? formatAmount(order.total, order.currency) : '—'}
          </span>
        </div>
        <div className={styles.row}>
          <span>Payment</span>
          <span className={styles.rowValue}>
            {wasFree
              ? 'Nothing due'
              : order?.paymentStatus === 'paid'
                ? 'Paid'
                : (order?.paymentStatus ?? '—')}
          </span>
        </div>
      </div>

      {order && order.items.length > 0 ? (
        <ul className={cx(styles.confirmItems, storeUi.muted)}>
          {order.items.map((item) => (
            <li key={`${item.sku}-${item.name}`} className={styles.row}>
              <span>
                {item.name} × {item.quantity}
              </span>
              <span className={styles.rowValue}>
                {formatAmount(item.totalPrice, order.currency)}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      {backToShop}
    </div>
  );
}
