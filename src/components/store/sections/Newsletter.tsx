import { pick, str } from '@/app/store/_lib/settings';

import { StoreBand, StoreContainer } from '../ui';
import { NewsletterForm } from './NewsletterForm';
import type { SectionProps } from './types';
import styles from './Sections.module.css';

/**
 * The newsletter band.
 * @param props - {@link SectionProps}
 * @returns An email capture band
 */
export function Newsletter({ section }: SectionProps) {
  const { settings } = section;
  const background = pick(
    settings,
    'background',
    ['surface', 'sunken', 'brand'] as const,
    'sunken',
  );

  return (
    <StoreBand tone={background}>
      <StoreContainer>
        <div className={styles.newsletter}>
          <h2>{str(settings, 'heading', 'Get restock alerts')}</h2>
          {str(settings, 'body') ? <p>{str(settings, 'body')}</p> : null}
          <NewsletterForm
            buttonLabel={str(settings, 'buttonLabel', 'Subscribe')}
            placeholder={str(settings, 'placeholder', 'you@example.com')}
            consentText={str(settings, 'consentText', 'Unsubscribe any time.')}
          />
        </div>
      </StoreContainer>
    </StoreBand>
  );
}
