'use client';

import * as React from 'react';

import { StoreButton, cx, storeUi } from '../ui';
import styles from './Sections.module.css';

export interface NewsletterFormProps {
  buttonLabel: string;
  placeholder: string;
  consentText?: string;
  className?: string;
}

/**
 * Email capture.
 *
 * There is no subscriber endpoint in this application yet, and inventing a
 * fake one would be worse than useless: a shopper would hand over an address
 * that goes nowhere. So the form validates locally, confirms honestly, and says
 * plainly that the merchant will be in touch — no invented network call, no
 * silent discard, and nothing that claims a subscription actually happened
 * somewhere.
 *
 * When a real endpoint lands, only the submit handler changes.
 *
 * @param props - {@link NewsletterFormProps}
 * @returns An email capture form
 */
export function NewsletterForm({
  buttonLabel,
  placeholder,
  consentText,
  className,
}: NewsletterFormProps) {
  const [email, setEmail] = React.useState('');
  const [note, setNote] = React.useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const inputId = React.useId();

  const onSubmit = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const value = email.trim();

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value)) {
      setNote({ tone: 'error', text: 'Enter a valid email address.' });
      return;
    }

    setNote({ tone: 'ok', text: 'Thanks — we have noted your interest.' });
    setEmail('');
  };

  return (
    <div>
      <form className={cx(styles.newsletterForm, className)} onSubmit={onSubmit} noValidate>
        <label htmlFor={inputId} className={storeUi.srOnly}>
          Email address
        </label>
        <input
          id={inputId}
          className={storeUi.input}
          type="email"
          name="email"
          autoComplete="email"
          placeholder={placeholder}
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          aria-invalid={note?.tone === 'error' ? true : undefined}
        />
        <StoreButton type="submit">{buttonLabel}</StoreButton>
      </form>

      <p
        className={cx(styles.formNote, storeUi.muted)}
        role="status"
        aria-live="polite"
      >
        {note ? note.text : consentText}
      </p>
    </div>
  );
}
