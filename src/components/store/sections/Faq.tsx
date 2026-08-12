import { IconChevronDown } from '@tabler/icons-react';

import { bool, list, str } from '@/app/store/_lib/settings';

import { SectionHeading, StoreBand, StoreContainer } from '../ui';
import type { SectionProps } from './types';
import styles from './Sections.module.css';

/**
 * An FAQ accordion.
 *
 * Built on `<details>` / `<summary>` rather than JavaScript state: it is
 * keyboard operable, announced correctly, searchable by the browser's
 * find-in-page, and it works before hydration — all of which matter for the
 * section whose job is answering the objection that stops a checkout.
 *
 * @param props - {@link SectionProps}
 * @returns The band, or null when there are no questions
 */
export function Faq({ section }: SectionProps) {
  const { settings } = section;
  const items = list(settings, 'items', 20);
  if (items.length === 0) return null;

  const openFirst = bool(settings, 'openFirst', true);

  return (
    <StoreBand tone="surface">
      <StoreContainer>
        <SectionHeading heading={str(settings, 'heading', 'Questions')} align="center" />
        <div className={styles.faq}>
          {items.map((item, index) => {
            const question = typeof item.question === 'string' ? item.question : '';
            const answer = typeof item.answer === 'string' ? item.answer : '';
            if (!question) return null;

            return (
              <details key={index} className={styles.faqItem} open={openFirst && index === 0}>
                <summary className={styles.faqSummary}>
                  {question}
                  <IconChevronDown size={18} className={styles.faqChevron} aria-hidden="true" />
                </summary>
                {answer ? <p className={styles.faqAnswer}>{answer}</p> : null}
              </details>
            );
          })}
        </div>
      </StoreContainer>
    </StoreBand>
  );
}
