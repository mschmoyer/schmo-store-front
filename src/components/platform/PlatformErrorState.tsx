'use client';

import React from 'react';
import { Button } from '@/components/ui';
import { IconAlertTriangle, IconPlugOff, IconRefresh, IconShieldLock } from '@tabler/icons-react';
import type { PlatformFetchError } from './usePlatformData';
import styles from './PlatformPanels.module.css';

export interface PlatformErrorStateProps {
  /** What failed. */
  error: PlatformFetchError;
  /** What the operator was trying to read — "the platform overview". Used in the sentence. */
  what: string;
  /** Re-runs the request. Omitted only where a retry cannot help. */
  onRetry?: () => void;
  /** Renders at panel scale rather than page scale. */
  compact?: boolean;
}

const MARK = { size: 20, stroke: 1.6 } as const;

/**
 * A failed read, rendered as a failed read.
 *
 * The rule this component enforces is the console's most important one: **a fetch that did not
 * return data must never be drawn as zero.** A platform with 40,000 orders and a broken API looks
 * exactly like a platform with no orders if the failure path renders a `0`, and the operator has no
 * way to tell the difference. So the number is absent, the reason is named, and there is a button.
 *
 * The four kinds get four sentences because the remedies differ: an expired session needs a sign-in,
 * a non-operator account needs a different account, an endpoint that is not deployed yet needs a
 * deploy, and a 500 or a dropped connection needs a retry.
 *
 * @param props - {@link PlatformErrorStateProps}
 * @returns The error block, with a retry where retrying can help.
 */
export function PlatformErrorState({
  error,
  what,
  onRetry,
  compact = false,
}: PlatformErrorStateProps): React.ReactElement {
  const isMissing = error.kind === 'not-implemented';
  const isForbidden = error.kind === 'forbidden' || error.kind === 'unauthenticated';

  const Mark = isMissing ? IconPlugOff : isForbidden ? IconShieldLock : IconAlertTriangle;

  /* `what` is written as a mid-sentence noun phrase ("the platform overview"), so the one heading
     that starts with it has to capitalise it rather than the caller passing two spellings. */
  const sentenceCase = what.charAt(0).toUpperCase() + what.slice(1);

  const heading = isMissing
    ? `${sentenceCase} is not available yet`
    : isForbidden
      ? `You cannot read ${what}`
      : `Could not load ${what}`;

  return (
    <div className={compact ? `${styles.errorState} ${styles.errorCompact}` : styles.errorState} role="alert">
      <span className={styles.errorMark} aria-hidden="true">
        <Mark {...MARK} />
      </span>
      <div className={styles.errorCopy}>
        <p className={styles.errorTitle}>{heading}</p>
        <p className={styles.errorDetail}>{error.message}</p>
        <p className={styles.errorMeta}>
          {error.status > 0 ? `HTTP ${error.status}` : 'No response from the server'}
        </p>
      </div>
      <div className={styles.errorActions}>
        {error.kind === 'unauthenticated' ? (
          <Button href="/login" size="sm">
            Sign in
          </Button>
        ) : null}
        {onRetry ? (
          <Button variant="secondary" size="sm" onClick={onRetry} leftIcon={<IconRefresh size={16} />}>
            Retry
          </Button>
        ) : null}
      </div>
    </div>
  );
}
