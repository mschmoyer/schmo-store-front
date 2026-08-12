import { sanitizeRichText, toParagraphs } from '@/app/store/_lib/html';
import { pick, str } from '@/app/store/_lib/settings';

import { SectionHeading, StoreBand, StoreContainer, cx } from '../ui';
import type { SectionProps } from './types';
import styles from './Sections.module.css';

/**
 * A block of merchant copy.
 *
 * The body is a `richtext` field, so it may contain markup — which means it is
 * an XSS boundary and is treated as one: everything goes through
 * `sanitizeRichText` before it can reach `dangerouslySetInnerHTML`. Copy that
 * contains no markup at all is rendered as escaped paragraphs instead, so the
 * common case never touches the HTML path.
 *
 * @param props - {@link SectionProps}
 * @returns A prose band, or null when there is nothing to say
 */
export function RichText({ section }: SectionProps) {
  const { settings } = section;
  const heading = str(settings, 'heading');
  const body = str(settings, 'body');
  if (!heading && !body) return null;

  const align = pick(settings, 'align', ['left', 'center'] as const, 'center');
  const width = pick(settings, 'width', ['narrow', 'full'] as const, 'narrow');

  const looksLikeHtml = /<[a-z][\s\S]*>/i.test(body);
  const html = looksLikeHtml ? sanitizeRichText(body) : '';

  return (
    <StoreBand tone="surface">
      <StoreContainer width={width === 'narrow' ? 'narrow' : 'default'}>
        <SectionHeading heading={heading} align={align} />
        <div
          className={cx(
            styles.prose,
            align === 'center' && styles.proseCenter,
            width === 'narrow' && styles.proseNarrow,
          )}
        >
          {html ? (
            <div dangerouslySetInnerHTML={{ __html: html }} />
          ) : (
            toParagraphs(body).map((paragraph, index) => <p key={index}>{paragraph}</p>)
          )}
        </div>
      </StoreContainer>
    </StoreBand>
  );
}
