'use client';

import * as React from 'react';
import Link from 'next/link';
import { Input } from '@/components/ui';
import { Banner, StepNavigation, StepPanel } from '@/components/wizard';
import { STEPS } from '../lib/steps';
import { validateEmail, validateName, validatePassword } from '../lib/password';
import PasswordStrength from '../PasswordStrength';
import type { OnboardingApi } from '../useOnboarding';
import styles from '../Onboarding.module.css';

interface AccountValues {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
}

type FieldName = keyof AccountValues;

/**
 * Validate the whole form. Used for the Continue button's disabled state and,
 * unchanged, by the server.
 *
 * @param values - Current field values
 * @returns Field name → message for every invalid field
 */
export function validateAccount(values: AccountValues): Partial<Record<FieldName, string>> {
  const errors: Partial<Record<FieldName, string>> = {};
  const firstName = validateName(values.firstName, 'first');
  if (firstName) errors.firstName = firstName;
  const lastName = validateName(values.lastName, 'last');
  if (lastName) errors.lastName = lastName;
  const email = validateEmail(values.email);
  if (email) errors.email = email;
  const password = validatePassword(values.password);
  if (password) errors.password = password;
  return errors;
}

/**
 * Step 1 — Create your account.
 *
 * Validation fires on blur and then live on every keystroke *for fields the
 * merchant has already left*, which is the behaviour that feels helpful rather
 * than nagging: nothing turns red while you are still typing your email for the
 * first time, and everything un-reds itself the moment you fix it.
 *
 * @param props.api - The onboarding API from `useOnboarding`
 * @returns The account step
 */
export default function AccountStep({ api }: { api: OnboardingApi }): React.ReactElement {
  const [values, setValues] = React.useState<AccountValues>({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
  });
  const [touched, setTouched] = React.useState<Partial<Record<FieldName, boolean>>>({});
  const [serverErrors, setServerErrors] = React.useState<Partial<Record<FieldName, string>>>({});
  const [formError, setFormError] = React.useState<string | null>(null);

  const errors = validateAccount(values);
  const isValid = Object.keys(errors).length === 0;

  const set = (field: FieldName) => (event: React.ChangeEvent<HTMLInputElement>) => {
    setValues((current) => ({ ...current, [field]: event.target.value }));
    setServerErrors((current) => ({ ...current, [field]: undefined }));
    setFormError(null);
  };

  const blur = (field: FieldName) => () =>
    setTouched((current) => ({ ...current, [field]: true }));

  const errorFor = (field: FieldName): string | undefined =>
    serverErrors[field] ?? (touched[field] ? errors[field] : undefined);

  const handleSubmit = async () => {
    setTouched({ firstName: true, lastName: true, email: true, password: true });
    if (!isValid || api.busy) return;

    const failure = await api.submit('/api/onboarding/account', {
      email: values.email.trim(),
      password: values.password,
      firstName: values.firstName.trim(),
      lastName: values.lastName.trim(),
    });

    if (failure) {
      if (failure.fieldErrors) {
        setServerErrors(failure.fieldErrors as Partial<Record<FieldName, string>>);
        setTouched({ firstName: true, lastName: true, email: true, password: true });
      }
      if (!failure.fieldErrors) setFormError(failure.message);
    }
  };

  const emailTaken = serverErrors.email?.startsWith('An account already uses');

  return (
    <StepPanel
      step={STEPS.account}
      onSubmit={handleSubmit}
      banner={
        formError ? (
          <Banner tone="danger" title="We couldn’t create that account">
            {formError}
          </Banner>
        ) : emailTaken ? (
          <Banner tone="warning" title="You already have an account">
            An account already uses this email. <Link href="/login">Sign in instead</Link>.
          </Banner>
        ) : null
      }
      footer={
        <StepNavigation
          primaryLabel={STEPS.account.primaryLabel}
          onPrimary={handleSubmit}
          primaryDisabled={!isValid}
          primaryLoading={api.busy}
        />
      }
    >
      <div className={styles.fields}>
        <div className={styles.row}>
          <Input
            label="First name"
            autoComplete="given-name"
            required
            value={values.firstName}
            onChange={set('firstName')}
            onBlur={blur('firstName')}
            error={errorFor('firstName')}
          />
          <Input
            label="Last name"
            autoComplete="family-name"
            required
            value={values.lastName}
            onChange={set('lastName')}
            onBlur={blur('lastName')}
            error={errorFor('lastName')}
          />
        </div>

        <Input
          label="Email"
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder="you@company.com"
          required
          value={values.email}
          onChange={set('email')}
          onBlur={blur('email')}
          error={errorFor('email')}
        />

        <div>
          <Input
            label="Password"
            type="password"
            autoComplete="new-password"
            required
            hint="At least 12 characters"
            value={values.password}
            onChange={set('password')}
            onBlur={blur('password')}
            error={errorFor('password')}
          />
          <PasswordStrength password={values.password} />
        </div>
      </div>

      <p className={styles.signinHint}>
        Already have a store? <Link href="/login">Sign in instead</Link>.
      </p>
    </StepPanel>
  );
}
