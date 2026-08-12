'use client';

import * as React from 'react';
import { Button } from '@/components/ui';
import { Banner, StepNavigation, StepPanel } from '@/components/wizard';
import { PRESET_LIST } from '@/lib/storefront-theme/presets';
import { STEPS } from '../lib/steps';
import PresetThumbnail from '../PresetThumbnail';
import type { OnboardingApi } from '../useOnboarding';
import styles from '../Onboarding.module.css';

function TickMark(): React.ReactElement {
  return (
    <svg viewBox="0 0 12 12" width="9" height="9" fill="none" aria-hidden="true">
      <path
        d="M2.4 6.2 4.8 8.6 9.6 3.5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Step 5 — Style it and publish.
 *
 * The six presets come from `src/lib/storefront-theme/presets.ts`, which exists,
 * so these are real previews of real themes rather than placeholder swatches.
 * Where the choice is *stored* depends on whether the theme engine's migration
 * has landed — the API route probes for `storefront_themes` and falls back to
 * legacy `stores.theme_name`. See `src/app/api/onboarding/theme/route.ts`.
 *
 * @param props.api - The onboarding API
 * @returns The style step
 */
export default function ThemeStep({ api }: { api: OnboardingApi }): React.ReactElement {
  const [selected, setSelected] = React.useState<string | null>(api.state.theme.presetId);
  const [error, setError] = React.useState<string | null>(null);
  const [savingDraft, setSavingDraft] = React.useState(false);

  React.useEffect(() => {
    if (api.state.theme.presetId) setSelected(api.state.theme.presetId);
  }, [api.state.theme.presetId]);

  const choose = async (presetId: string) => {
    setSelected(presetId);
    setError(null);
    const failure = await api.submit('/api/onboarding/theme', { presetId });
    if (failure) setError(failure.message);
  };

  const finish = async (draft: boolean) => {
    if (!selected) {
      setError('Pick a look to continue.');
      return;
    }
    setSavingDraft(draft);
    const failure = await api.submit('/api/onboarding/publish', { draft });
    setSavingDraft(false);
    if (failure) setError(failure.message);
  };

  const back = async () => {
    await api.navigate('import');
  };

  return (
    <StepPanel
      step={STEPS.style}
      onSubmit={() => void finish(false)}
      banner={
        error ? (
          <Banner tone="danger" title="We couldn’t save that">
            {error}
          </Banner>
        ) : null
      }
      footer={
        <StepNavigation
          primaryLabel={STEPS.style.primaryLabel}
          onPrimary={() => void finish(false)}
          primaryDisabled={!selected}
          primaryLoading={api.busy && !savingDraft}
          onBack={back}
          secondary={
            <Button
              variant="secondary"
              onClick={() => void finish(true)}
              loading={api.busy && savingDraft}
              disabled={!selected}
            >
              Save as draft
            </Button>
          }
        />
      }
    >
      <p className={styles.sectionLabel}>Pick a starting look. You can change every part of it later.</p>

      <div className={styles.presetGrid}>
        {PRESET_LIST.map((preset) => (
          <button
            key={preset.id}
            type="button"
            className={styles.presetCard}
            aria-pressed={selected === preset.id}
            onClick={() => void choose(preset.id)}
          >
            <span className={styles.presetThumb}>
              <PresetThumbnail thumbnail={preset.thumbnail} name={preset.name} />
            </span>
            <span className={styles.presetMeta}>
              <span className={styles.presetName}>
                {preset.name}
                {selected === preset.id ? (
                  <span className={styles.presetTick} aria-hidden="true">
                    <TickMark />
                  </span>
                ) : null}
              </span>
              <span className={styles.presetRegister}>{preset.register}</span>
            </span>
          </button>
        ))}
      </div>

      <p className={styles.inlineNote}>
        This is your real store. Nobody can see it until you publish — &ldquo;Save as draft&rdquo;
        finishes setup and leaves it private.
      </p>
    </StepPanel>
  );
}
