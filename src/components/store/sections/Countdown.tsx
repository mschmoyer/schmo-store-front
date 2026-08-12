import { bool, pick, str } from '@/app/store/_lib/settings';
import { resolveStoreHref } from '@/app/store/_lib/present';

import { StoreBand, StoreContainer, StoreLinkButton } from '../ui';
import { CountdownClock } from './CountdownClock';
import type { SectionProps } from './types';
import styles from './Sections.module.css';

/**
 * A deadline timer for a sale or a drop.
 *
 * An unparseable or missing `endsAt` renders nothing at all — a countdown with
 * no deadline is a broken promise, and showing zeros would be worse than
 * showing nothing. A deadline already in the past is dropped server-side when
 * the merchant asked for it to hide, which saves shipping the section's markup
 * to every visitor for a sale that finished last month.
 *
 * @param props - {@link SectionProps}
 * @returns The countdown band, or null
 */
export function Countdown({ section, ctx }: SectionProps) {
  const { settings } = section;

  const endsAtRaw = str(settings, 'endsAt');
  if (!endsAtRaw) return null;

  const endsAt = Date.parse(endsAtRaw);
  if (!Number.isFinite(endsAt)) return null;

  const hideWhenExpired = bool(settings, 'hideWhenExpired', true);
  if (hideWhenExpired && endsAt <= Date.now()) return null;

  const ctaLabel = str(settings, 'ctaLabel', 'Shop the sale');
  const ctaHref = resolveStoreHref(ctx.store.storeSlug, str(settings, 'ctaHref', '/products'));
  const background = pick(settings, 'background', ['surface', 'sunken', 'brand'] as const, 'brand');

  return (
    <StoreBand tone={background}>
      <StoreContainer>
        <div className={styles.countdown}>
          <h2>{str(settings, 'heading', 'Sale ends soon')}</h2>
          <CountdownClock endsAt={endsAt} hideWhenExpired={hideWhenExpired}>
            {ctaLabel ? <StoreLinkButton href={ctaHref}>{ctaLabel}</StoreLinkButton> : null}
          </CountdownClock>
        </div>
      </StoreContainer>
    </StoreBand>
  );
}
