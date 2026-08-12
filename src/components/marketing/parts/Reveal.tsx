'use client';

import * as React from 'react';
import { motion, useReducedMotion } from 'framer-motion';

export interface RevealProps {
  children: React.ReactNode;
  /** Seconds of delay before this element starts. @default 0 */
  delay?: number;
  /** Travel distance in pixels. Ignored under reduced motion. @default 16 */
  distance?: number;
  /** Render as something other than a `div`. @default 'div' */
  as?: 'div' | 'li' | 'section' | 'article' | 'tr';
  className?: string;
}

/**
 * A scroll-triggered entrance. Fades and lifts once, when the element first
 * enters the viewport.
 *
 * Under `prefers-reduced-motion: reduce` the transform is dropped entirely and
 * the element cross-fades in place, per design-system §4.
 *
 * @param props - {@link RevealProps}
 * @returns The children wrapped in an entrance animation.
 */
export function Reveal({
  children,
  delay = 0,
  distance = 16,
  as = 'div',
  className,
}: RevealProps): React.JSX.Element {
  const reduced = useReducedMotion();
  const Component = motion[as];

  return (
    <Component
      className={className}
      initial={{ opacity: 0, y: reduced ? 0 : distance }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.18, margin: '0px 0px -60px 0px' }}
      transition={{
        duration: reduced ? 0.2 : 0.42,
        delay: reduced ? 0 : delay,
        ease: [0.16, 1, 0.3, 1],
      }}
    >
      {children}
    </Component>
  );
}

export default Reveal;
