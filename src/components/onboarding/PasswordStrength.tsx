'use client';

import * as React from 'react';
import { scorePassword } from './lib/password';
import styles from './Onboarding.module.css';

export interface PasswordStrengthProps {
  password: string;
  /** Id referenced by the input's `aria-describedby`. */
  id?: string;
}

/**
 * Live password strength feedback.
 *
 * Four segments, a one-word verdict and the single most useful next move.
 * Announced politely rather than assertively so it does not interrupt typing.
 *
 * @param props - {@link PasswordStrengthProps}
 * @returns The meter, or nothing when the field is empty
 */
export default function PasswordStrength({
  password,
  id,
}: PasswordStrengthProps): React.ReactElement | null {
  const strength = React.useMemo(() => scorePassword(password), [password]);
  if (!password) return null;

  return (
    <div className={styles.meter} id={id}>
      <div
        className={styles.meterTrack}
        role="meter"
        aria-valuemin={0}
        aria-valuemax={4}
        aria-valuenow={strength.score}
        aria-valuetext={`Password strength: ${strength.label}`}
      >
        {[1, 2, 3, 4].map((segment) => (
          <span
            key={segment}
            className={styles.meterSegment}
            data-filled={strength.score >= segment}
            data-score={strength.score}
          />
        ))}
      </div>
      <div className={styles.meterRow} aria-live="polite">
        <span className={styles.meterLabel} data-score={strength.score}>
          {strength.label}
        </span>
        {strength.suggestion ? (
          <span className={styles.meterSuggestion}>{strength.suggestion}</span>
        ) : null}
      </div>
    </div>
  );
}
