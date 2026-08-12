'use client';

import * as React from 'react';
import { Input, Spinner, Textarea } from '@/components/ui';
import { Banner, StepNavigation, StepPanel } from '@/components/wizard';
import { STEPS } from '../lib/steps';
import { slugify, slugifyLive, validateSlug } from '../lib/slug';
import { useSlugAvailability } from '../useSlugAvailability';
import type { OnboardingApi } from '../useOnboarding';
import styles from '../Onboarding.module.css';

/** Tick / cross marks for the availability line. */
function StatusMark({ ok }: { ok: boolean }): React.ReactElement {
  return ok ? (
    <svg viewBox="0 0 12 12" width="12" height="12" fill="none" aria-hidden="true">
      <path
        d="M2.2 6.3 4.7 8.8 9.8 3.4"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ) : (
    <svg viewBox="0 0 12 12" width="12" height="12" fill="none" aria-hidden="true">
      <path
        d="M3 3l6 6M9 3l-6 6"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

/**
 * Step 2 — Name your store.
 *
 * The address is derived from the name as they type, shown as the URL it will
 * actually be (`/store/{slug}`, which is the route that exists — not a
 * prettier one that 404s), and checked against the server on a 350ms debounce.
 * When it is taken we offer free alternatives rather than just saying no.
 *
 * The merchant can also edit the address directly; doing so stops the name from
 * overwriting it, because silently discarding a hand-typed URL is infuriating.
 *
 * @param props.api - The onboarding API
 * @returns The store step
 */
export default function StoreStep({ api }: { api: OnboardingApi }): React.ReactElement {
  const existing = api.state.store;
  const [name, setName] = React.useState(existing?.name ?? '');
  const [slug, setSlug] = React.useState(existing?.slug ?? '');
  const [description, setDescription] = React.useState(existing?.description ?? '');
  const [slugEdited, setSlugEdited] = React.useState(Boolean(existing?.slug));
  const [touched, setTouched] = React.useState<{ name?: boolean; slug?: boolean }>({});
  const [formError, setFormError] = React.useState<string | null>(null);

  // Re-seed when the server hands us a store we did not know about (resume).
  React.useEffect(() => {
    if (!existing) return;
    setName((current) => current || existing.name);
    setSlug((current) => current || existing.slug);
    setDescription((current) => current || existing.description);
    if (existing.slug) setSlugEdited(true);
  }, [existing]);

  const availability = useSlugAvailability(slug);
  const slugValidation = validateSlug(slug);
  const origin = typeof window === 'undefined' ? '' : window.location.host;
  const displayHost = origin || 'rebelshops.com';

  const nameError = touched.name && !name.trim() ? 'Enter a store name' : undefined;
  const slugError =
    touched.slug && !slugValidation.valid
      ? slugValidation.message
      : availability.state === 'taken'
        ? availability.message ?? undefined
        : undefined;

  const canContinue =
    Boolean(name.trim()) &&
    slugValidation.valid &&
    availability.state !== 'taken' &&
    availability.state !== 'checking' &&
    availability.state !== 'invalid';

  const handleName = (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    setName(value);
    setFormError(null);
    if (!slugEdited) setSlug(slugifyLive(value));
  };

  const handleSlug = (event: React.ChangeEvent<HTMLInputElement>) => {
    const next = slugifyLive(event.target.value);
    // Clearing the address hands control back to the store name. Without this,
    // a merchant who edits the address and then wipes it is stuck with an empty
    // field that retyping the name never refills.
    setSlugEdited(next !== '');
    setSlug(next);
    setFormError(null);
  };

  const applySuggestion = (suggestion: string) => {
    setSlugEdited(true);
    setSlug(suggestion);
    setTouched((current) => ({ ...current, slug: true }));
  };

  const handleSubmit = async () => {
    setTouched({ name: true, slug: true });
    if (!canContinue) return;
    const failure = await api.submit('/api/onboarding/store', {
      name: name.trim(),
      slug: slugify(slug),
      description: description.trim(),
    });
    if (failure) setFormError(failure.fieldErrors?.slug ?? failure.message);
  };

  const statusState =
    availability.state === 'checking'
      ? 'checking'
      : availability.state === 'available'
        ? 'available'
        : availability.state === 'taken'
          ? 'taken'
          : null;

  return (
    <StepPanel
      step={STEPS.store}
      onSubmit={handleSubmit}
      banner={
        formError ? (
          <Banner tone="danger" title="We couldn’t save that">
            {formError}
          </Banner>
        ) : null
      }
      footer={
        <StepNavigation
          primaryLabel={STEPS.store.primaryLabel}
          onPrimary={handleSubmit}
          primaryDisabled={!canContinue}
          primaryLoading={api.busy}
          onBack={undefined}
        />
      }
    >
      <div className={styles.fields}>
        <div>
          <Input
            label="Store name"
            placeholder="Northgate Supply"
            hint="Shown in your store header and page titles"
            required
            autoFocus
            value={name}
            onChange={handleName}
            onBlur={() => setTouched((current) => ({ ...current, name: true }))}
            error={nameError}
          />
        </div>

        <div>
          <Input
            label="Store address"
            placeholder="northgate-supply"
            mono
            required
            value={slug}
            onChange={handleSlug}
            onBlur={() => setTouched((current) => ({ ...current, slug: true }))}
            error={slugError}
            hint={slugError ? undefined : 'Lowercase letters, numbers and hyphens'}
            aria-describedby="slug-preview"
          />

          <div className={styles.slugPreview} id="slug-preview">
            <span className={styles.slugUrl}>
              {displayHost}/store/
              <span className={styles.slugUrlActive}>{slug || 'your-slug'}</span>
            </span>
            {statusState ? (
              <span className={styles.slugStatus} data-state={statusState} aria-live="polite">
                {statusState === 'checking' ? (
                  <>
                    <Spinner size={12} label={null} /> Checking
                  </>
                ) : statusState === 'available' ? (
                  <>
                    <StatusMark ok /> Available
                  </>
                ) : (
                  <>
                    <StatusMark ok={false} /> Taken
                  </>
                )}
              </span>
            ) : null}
          </div>

          {availability.suggestions.length > 0 ? (
            <div className={styles.suggestions}>
              <span className={styles.suggestionLabel}>Try:</span>
              {availability.suggestions.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  className={styles.suggestionChip}
                  onClick={() => applySuggestion(suggestion)}
                >
                  {suggestion}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <Textarea
          label="Description"
          placeholder="What you sell, in a sentence"
          hint="Used in search results and social shares"
          optionalLabel
          rows={3}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
        />
      </div>
    </StepPanel>
  );
}
