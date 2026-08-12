import type * as React from 'react';
import {
  IconAward,
  IconClock,
  IconCreditCard,
  IconHeadset,
  IconLeaf,
  IconLock,
  IconPackage,
  IconRotateClockwise,
  IconShieldCheck,
  IconSparkles,
  IconTag,
  IconTruck,
} from '@tabler/icons-react';

import { list, num, pick, str } from '@/app/store/_lib/settings';

import { SectionHeading, StoreBand, StoreContainer, cx } from '../ui';
import type { SectionProps } from './types';
import styles from './Sections.module.css';

/**
 * The icons a value prop may name.
 *
 * A curated map rather than a dynamic lookup across the whole Tabler set: the
 * icon name is merchant input, and `import(...)` on an arbitrary string is both
 * a bundle-size problem and an easy way to get a runtime crash from a typo.
 * Anything unrecognised falls back to a neutral mark.
 */
const ICONS: Record<string, React.ComponentType<{ size?: number }>> = {
  IconTruck,
  IconRotateClockwise,
  IconShieldCheck,
  IconPackage,
  IconClock,
  IconAward,
  IconLeaf,
  IconLock,
  IconCreditCard,
  IconHeadset,
  IconSparkles,
  IconTag,
};

/**
 * Short reasons to buy here.
 *
 * Three styles: `plain` and `cards` are grids; `bar` is a compact reassurance
 * strip that hides the body copy and shows only icon plus title, which is what
 * makes it read as chrome rather than as a feature section.
 *
 * @param props - {@link SectionProps}
 * @returns The band, or null when no items are configured
 */
export function ValueProps({ section }: SectionProps) {
  const { settings } = section;
  const items = list(settings, 'items', 8);
  if (items.length === 0) return null;

  const style = pick(settings, 'style', ['plain', 'cards', 'bar'] as const, 'plain');
  const heading = str(settings, 'heading');
  const columns = num(settings, 'columns', 3, 2, 4);
  const isBar = style === 'bar';

  const props = items.map((item, index) => {
    const iconName = typeof item.icon === 'string' ? item.icon : '';
    const Icon = ICONS[iconName] ?? IconSparkles;
    const title = typeof item.title === 'string' ? item.title : '';
    const body = typeof item.body === 'string' ? item.body : '';
    if (!title && !body) return null;

    return (
      <div key={index} className={cx(styles.prop, style === 'cards' && styles.propCard)}>
        <span className={styles.propIcon} aria-hidden="true">
          <Icon size={isBar ? 20 : 26} />
        </span>
        {title ? <span className={styles.propTitle}>{title}</span> : null}
        {body ? <span className={styles.propBody}>{body}</span> : null}
      </div>
    );
  });

  return (
    <StoreBand tone="surface" tight={isBar}>
      <StoreContainer>
        <SectionHeading heading={heading} align="center" />
        <div
          className={isBar ? styles.propsBar : styles.props}
          style={isBar ? undefined : ({ '--_cols': columns } as React.CSSProperties)}
        >
          {props}
        </div>
      </StoreContainer>
    </StoreBand>
  );
}
