'use client';

/**
 * Does this box scroll sideways, and is the reader at either end of it?
 *
 * A horizontally scrolling table is only usable if the reader knows it scrolls. The merchant list
 * is 1,320px of intrinsic width in a ~1,120px column, so at a 1440px viewport the Clicks column was
 * cut through the middle of a number and Products and the storefront link were off-screen entirely
 * — with no fade, no shadow and no scrollbar until the pointer entered the region. A clipped digit
 * does not read as "there is more to the right"; it reads as a rendering bug.
 *
 * This hook reports the two facts a scroll affordance needs — whether the content overflows, and
 * which edge the viewport is against — so the shadow appears only when there is genuinely something
 * hidden behind it. A permanent edge on a table that fits is the opposite mistake: it teaches the
 * reader that the shadow means nothing.
 *
 * `ResizeObserver` rather than a window resize listener: the column can change width without the
 * window doing anything at all — the sidebar collapses, a filter widens the toolbar, the row set
 * changes and the intrinsic width with it.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

/** Which edges of a scrolling box currently have content beyond them. */
export interface ScrollEdges {
  /** True when the content is wider than the box. */
  scrollable: boolean;
  /** True when there is content hidden off the left edge. */
  atStart: boolean;
  /** True when there is content hidden off the right edge. */
  atEnd: boolean;
}

/** Sub-pixel layout means an "end" comparison needs a tolerance, or `atEnd` never becomes true. */
const EPSILON = 2;

/** What {@link useScrollEdges} hands back. */
export interface ScrollEdgesApi<T extends HTMLElement> {
  /** Attach to the element that actually scrolls. */
  ref: React.RefObject<T | null>;
  /** The current reading. Safe to render directly; it starts as "not scrollable". */
  edges: ScrollEdges;
}

/**
 * Tracks horizontal overflow and scroll position on an element.
 *
 * @typeParam T - The element type being observed.
 * @returns A ref to attach and the current {@link ScrollEdges}. Before the first measurement the
 *   reading is "not scrollable", so a server render and a fitting table both draw no affordance.
 */
export function useScrollEdges<T extends HTMLElement>(): ScrollEdgesApi<T> {
  const ref = useRef<T | null>(null);
  const [edges, setEdges] = useState<ScrollEdges>({
    scrollable: false,
    atStart: false,
    atEnd: false,
  });

  const measure = useCallback(() => {
    const node = ref.current;
    if (!node) return;

    const overflow = node.scrollWidth - node.clientWidth;
    const next: ScrollEdges = {
      scrollable: overflow > EPSILON,
      atStart: node.scrollLeft > EPSILON,
      atEnd: overflow - node.scrollLeft > EPSILON,
    };

    /* Compare before setting: `scroll` fires per frame while dragging, and re-rendering a table on
       every frame of a swipe is how a list starts feeling heavy on a phone. */
    setEdges((previous) =>
      previous.scrollable === next.scrollable &&
      previous.atStart === next.atStart &&
      previous.atEnd === next.atEnd
        ? previous
        : next
    );
  }, []);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    measure();
    node.addEventListener('scroll', measure, { passive: true });

    /* Guarded: jsdom and older Safari have no ResizeObserver, and a missing affordance is a much
       smaller problem than a component that throws during a unit test. */
    const observer =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => measure());
    observer?.observe(node);

    return () => {
      node.removeEventListener('scroll', measure);
      observer?.disconnect();
    };
  }, [measure]);

  return { ref, edges };
}
