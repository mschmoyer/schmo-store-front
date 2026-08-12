import { IconStar, IconStarFilled } from '@tabler/icons-react';

import { bool, list, pick, str } from '@/app/store/_lib/settings';

import { SectionHeading, StoreBand, StoreContainer, cx } from '../ui';
import type { SectionProps } from './types';
import styles from './Sections.module.css';

/**
 * Render a star rating that is readable without colour.
 *
 * The numeric value is exposed to assistive technology through the label; the
 * stars themselves are decorative, which avoids a screen reader announcing
 * "star star star star star".
 *
 * @param rating - A rating from 1 to 5
 * @returns A star row
 */
function Stars({ rating }: { rating: number }) {
  const filled = Math.round(Math.min(Math.max(rating, 0), 5));
  return (
    <span className={styles.stars} aria-label={`Rated ${filled} out of 5`}>
      {[1, 2, 3, 4, 5].map((index) =>
        index <= filled ? (
          <IconStarFilled key={index} size={15} aria-hidden="true" />
        ) : (
          <IconStar key={index} size={15} aria-hidden="true" />
        ),
      )}
    </span>
  );
}

/**
 * Customer quotes.
 *
 * These are *merchant-authored marketing copy*, not verified reviews, and they
 * are deliberately kept out of the product's structured data — emitting them as
 * `AggregateRating` would be fabricating review signal for search engines.
 *
 * The `carousel` layout is a scroll-snap rail rather than a JavaScript
 * slideshow, so every quote stays in the DOM, reachable by keyboard and by
 * find-in-page.
 *
 * @param props - {@link SectionProps}
 * @returns The band, or null when there are no quotes
 */
export function Testimonials({ section }: SectionProps) {
  const { settings } = section;
  const items = list(settings, 'items', 12);
  if (items.length === 0) return null;

  const layout = pick(settings, 'layout', ['grid', 'carousel', 'single'] as const, 'grid');
  const showRatings = bool(settings, 'showRatings', true);
  const shown = layout === 'single' ? items.slice(0, 1) : items;

  const layoutClass = {
    grid: styles.quotes,
    carousel: styles.quotesRail,
    single: cx(styles.quotes, styles.quotesSingle),
  }[layout];

  return (
    <StoreBand tone="sunken">
      <StoreContainer>
        <SectionHeading
          heading={str(settings, 'heading', 'What customers say')}
          align="center"
        />
        <div className={layoutClass}>
          {shown.map((item, index) => {
            const quote = typeof item.quote === 'string' ? item.quote : '';
            if (!quote) return null;
            const author = typeof item.author === 'string' ? item.author : '';
            const rating = typeof item.rating === 'number' ? item.rating : 0;

            return (
              <figure key={index} className={styles.quote}>
                {showRatings && rating > 0 ? <Stars rating={rating} /> : null}
                <blockquote className={styles.quoteText}>{quote}</blockquote>
                {author ? <figcaption className={styles.quoteAuthor}>{author}</figcaption> : null}
              </figure>
            );
          })}
        </div>
      </StoreContainer>
    </StoreBand>
  );
}
