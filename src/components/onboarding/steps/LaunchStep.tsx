'use client';

import * as React from 'react';
import Link from 'next/link';
import confetti from 'canvas-confetti';
import { Button, type ButtonProps } from '@/components/ui';
import { STEPS, TOTAL_STEPS } from '../lib/steps';
import type { OnboardingApi } from '../useOnboarding';
import wizardStyles from '@/components/wizard/Wizard.module.css';
import styles from '../Onboarding.module.css';

/**
 * `target`/`rel` are valid on the anchor `Button` renders via `as="a"`, but they
 * are not in `ButtonProps` (which is modelled on `<button>`). Widening the
 * primitive's public type is out of scope here, so the two attributes are
 * passed through this typed passthrough instead of casting at the call site.
 */
const NEW_TAB = {
  target: '_blank',
  rel: 'noopener noreferrer',
} as unknown as Partial<ButtonProps>;

/** Ember, ink and mint — the brand palette, not a party-supply rainbow. */
// Palette C: the ink ramp plus the single signal green. A launch is the one
// moment the product is allowed to be celebratory, but not off-brand.
const CONFETTI_COLORS = ['#111214', '#0F7B4A', '#6B6F76', '#D2D3D6', '#8A8E96'];

/**
 * Fire one restrained burst of confetti.
 *
 * Two short bursts from the lower corners, ~1.2s, then done. Skipped entirely
 * under `prefers-reduced-motion` — the design system requires it, and a full
 * screen of moving particles is a genuine problem for some people.
 */
function celebrate(): void {
  if (typeof window === 'undefined') return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const shared = {
    colors: CONFETTI_COLORS,
    startVelocity: 42,
    gravity: 1.05,
    ticks: 160,
    scalar: 0.9,
    disableForReducedMotion: true,
  } as const;

  void confetti({ ...shared, particleCount: 46, spread: 62, angle: 62, origin: { x: 0.08, y: 0.9 } });
  void confetti({ ...shared, particleCount: 46, spread: 62, angle: 118, origin: { x: 0.92, y: 0.9 } });
}

function TrophyMark(): React.ReactElement {
  return (
    <svg viewBox="0 0 20 20" width="20" height="20" fill="none" aria-hidden="true">
      <path
        d="M4 9.2 8.4 13.6l7.6-8"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * The finish: their real URL, a button that opens it, and honest next steps.
 *
 * @param props.api - The onboarding API
 * @returns The launch screen
 */
export default function LaunchStep({ api }: { api: OnboardingApi }): React.ReactElement {
  const store = api.state.store;
  const url = api.state.storeUrl ?? '';
  const published = Boolean(store?.isPublic);
  const imported = api.state.importProgress.imported;
  const connected = api.state.shipstation.connected;
  const [copied, setCopied] = React.useState(false);

  /*
   * What is actually true about this store, said out loud.
   *
   * This screen used to claim "Anyone with this address can shop it right now"
   * sixty pixels above a bullet explaining that the store "can show products
   * but not take payments" — and, when ShipStation was skipped, above a store
   * with nothing in it at all. Both statements cannot be true. "Shop it" means
   * "buy something", and nothing here can be bought until there is a catalogue
   * and a payment account, neither of which onboarding sets up.
   *
   * Payments are deliberately not part of this wizard: `docs/payments.md`
   * ships the merchant's own $1 intro plan at `/admin/billing` and Stripe
   * Connect for taking money from shoppers, both post-launch. That is a
   * defensible product decision. Silently launching a merchant into a store
   * that cannot sell, having never mentioned either, is not.
   */
  const sellable = imported > 0;
  const headline = !published
    ? 'Saved as a draft. Only you can see it until you publish from the dashboard.'
    : sellable
      ? 'It is live at this address. Two things left before it can take money — both below.'
      : 'It is live at this address, but there is nothing in it to sell yet.';

  React.useEffect(() => {
    if (published) celebrate();
  }, [published]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className={wizardStyles.card}>
      <span className={wizardStyles.stepEyebrow}>
        {connected && imported > 0
          ? `${TOTAL_STEPS} of ${TOTAL_STEPS} done`
          : `${TOTAL_STEPS - (connected ? 1 : 2)} of ${TOTAL_STEPS} done · ${connected ? 1 : 2} skipped`}
      </span>

      <div className={styles.launchHead}>
        <span className={styles.launchBadge} aria-hidden="true">
          <TrophyMark />
        </span>
        <h1 className={wizardStyles.stepTitle} style={{ margin: 0 }}>
          {published ? `${store?.name ?? 'Your store'} is live` : `${store?.name ?? 'Your store'} is ready`}
        </h1>
      </div>

      <p className={wizardStyles.stepHelper}>{headline}</p>

      <p className={styles.sectionLabel}>{STEPS.launch.helper}</p>

      <div className={styles.urlCard}>
        <span className={styles.urlText}>{url}</span>
        <Button variant="ghost" size="sm" onClick={copy}>
          {copied ? 'Copied' : 'Copy link'}
        </Button>
      </div>

      <p className={styles.sectionLabel}>What to do next</p>

      <ul className={styles.nextList}>
        {connected ? (
          imported > 0 ? (
            <li className={styles.nextItem}>
              <span className={styles.nextDot} aria-hidden="true" />
              <span>
                <strong>
                  {imported} product{imported === 1 ? '' : 's'} are in.
                </strong>{' '}
                Stock levels refresh from ShipStation on every sync.
              </span>
            </li>
          ) : (
            <li className={styles.nextItem}>
              <span className={styles.nextDot} aria-hidden="true" />
              <span>
                <strong>Your catalog came back empty.</strong> The connection worked, but
                ShipStation returned no products. Check that products exist on the account tied to
                this API key.
              </span>
            </li>
          )
        ) : (
          <li className={styles.nextItem}>
            <span className={styles.nextDot} aria-hidden="true" />
            <span>
              <strong>Connect ShipStation to import your products.</strong> Your store works
              without it — it just has nothing to sell yet.
            </span>
          </li>
        )}

        <li className={styles.nextItem}>
          <span className={styles.nextDot} aria-hidden="true" />
          <span>
            <strong>Connect Stripe to take payments.</strong> Nothing on the storefront can be
            bought until you do — a visitor can browse, but there is no checkout. It lives under{' '}
            <Link href="/admin/billing" className={styles.inlineLink}>
              Billing
            </Link>{' '}
            in your dashboard.
          </span>
        </li>

        <li className={styles.nextItem}>
          <span className={styles.nextDot} aria-hidden="true" />
          <span>
            <strong>We haven’t charged you anything.</strong> Setup asked for no card. RebelShops is
            $1/month for your first three months and $19.99/month after that, and you start it
            yourself from{' '}
            <Link href="/admin/billing" className={styles.inlineLink}>
              Billing
            </Link>{' '}
            when you are ready.
          </span>
        </li>

        <li className={styles.nextItem}>
          <span className={styles.nextDot} aria-hidden="true" />
          <span>
            <strong>Make it yours.</strong> Fonts, colours, sections and hero copy all live in
            Design.
          </span>
        </li>
      </ul>

      <div className={styles.launchActions}>
        <Button as="a" href={url} {...NEW_TAB} variant="primary" size="lg">
          View my store
        </Button>
        <Button as={Link} href={`/admin?store=${store?.slug ?? ''}`} variant="secondary" size="lg">
          Go to my dashboard
        </Button>
      </div>
    </div>
  );
}
