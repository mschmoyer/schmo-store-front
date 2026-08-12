'use client';

import * as React from 'react';

import styles from './Sections.module.css';

interface SectionBoundaryProps {
  sectionId: string;
  sectionType: string;
  /** Show a visible failure card instead of nothing. Preview only. */
  showFailures: boolean;
  children: React.ReactNode;
}

interface SectionBoundaryState {
  failed: boolean;
}

/**
 * Contains a single section's failures.
 *
 * Spec section 8 is explicit: an unknown or throwing section renders nothing in
 * production and a visible failure card in the customizer preview, and one bad
 * section must never blank a merchant's storefront.
 *
 * This has to be a class component — `componentDidCatch` has no hook
 * equivalent — and it has to be a client component, because error boundaries
 * only exist on the client. Server-side throws are caught separately by the
 * registry's own try/catch, so a section that fails while fetching products is
 * handled before it ever reaches the browser.
 */
export class SectionBoundary extends React.Component<
  SectionBoundaryProps,
  SectionBoundaryState
> {
  constructor(props: SectionBoundaryProps) {
    super(props);
    this.state = { failed: false };
  }

  /**
   * Flip to the failed state when a child throws during render.
   * @returns The next state
   */
  static getDerivedStateFromError(): SectionBoundaryState {
    return { failed: true };
  }

  /**
   * Report the failure so a merchant's broken section is debuggable.
   * @param error - The thrown value
   */
  componentDidCatch(error: Error): void {
    console.error(
      `[storefront] section "${this.props.sectionId}" (${this.props.sectionType}) failed to render`,
      error,
    );
  }

  /**
   * @returns The section, a failure card, or nothing
   */
  render(): React.ReactNode {
    if (!this.state.failed) return this.props.children;

    if (!this.props.showFailures) return null;

    return (
      <div className={styles.failed} role="status">
        This “{this.props.sectionType}” section could not be displayed. Check its settings.
      </div>
    );
  }
}
