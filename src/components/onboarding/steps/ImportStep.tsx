'use client';

import * as React from 'react';
import { EmptyState, Button } from '@/components/ui';
import ApiKeyInput from '../ApiKeyInput';
import { Banner, StepNavigation, StepPanel } from '@/components/wizard';
import { STEPS } from '../lib/steps';
import type { OnboardingApi } from '../useOnboarding';
import styles from '../Onboarding.module.css';

/**
 * Step 4 — Pull in your catalog.
 *
 * The bar is real: each POST runs one bounded slice of the import server-side
 * and returns actual row counts, and the component keeps posting while the
 * server says there are more pages. Nothing here animates on a timer pretending
 * work is happening. If the merchant closes the tab the cursor stays in the
 * database, and coming back resumes from the same page.
 *
 * @param props.api - The onboarding API
 * @returns The import step
 */
export default function ImportStep({ api }: { api: OnboardingApi }): React.ReactElement {
  const progress = api.state.importProgress;
  // The catalogue needs the V2 API key, and nothing else can supply it — the
  // Custom Store feed set up at step 3 carries orders, not products. So this
  // step gates on the key, not on `shipstation.connected`, which would send a
  // merchant back to a screen that cannot give them what is missing here.
  const hasKey = api.state.shipstation.catalogKeyPresent;
  // Skipping is a decision about *this* step. It used to be inherited from
  // `shipstation.skipped`, which now means "declined the order connection" — a
  // merchant who skipped orders can still perfectly well import a catalogue,
  // and would otherwise have been shown an empty state with no way forward.
  const importSkipped = progress.status === 'skipped';
  // Lets a merchant who skipped come back to the key form without a round trip
  // to a route that would reject the request for want of the very key they are
  // trying to supply.
  const [reopened, setReopened] = React.useState(false);
  const [apiKey, setApiKey] = React.useState('');
  const [keyFailure, setKeyFailure] = React.useState<{ message: string; action: string } | null>(
    null
  );
  const [running, setRunning] = React.useState(false);
  const cancelled = React.useRef(false);

  React.useEffect(
    () => () => {
      cancelled.current = true;
    },
    []
  );

  /**
   * Drive the import to completion, one slice per request.
   *
   * @param restart - Whether to discard the stored cursor and start over
   */
  const drive = async (restart = false) => {
    setRunning(true);
    cancelled.current = false;
    let first = true;
    // Hard stop so a server that always reports `hasMore` cannot spin forever.
    for (let slice = 0; slice < 200; slice += 1) {
      if (cancelled.current) break;
      const failure = await api.submit('/api/onboarding/import', {
        restart: restart && first,
      });
      first = false;
      if (failure) break;
      const latest = await readProgress();
      if (!latest || !latest.hasMore || latest.status !== 'running') break;
    }
    setRunning(false);
  };

  /**
   * Read the freshest progress the hook holds. `api.state` is stale inside this
   * closure, so we go back to the server for the authoritative answer.
   *
   * @returns The latest progress, or null when unreachable
   */
  const readProgress = async () => {
    try {
      const response = await fetch('/api/onboarding/import', { cache: 'no-store' });
      if (!response.ok) return null;
      const payload = (await response.json()) as {
        state?: { importProgress?: typeof progress };
      };
      return payload.state?.importProgress ?? null;
    } catch {
      return null;
    }
  };

  const skip = async () => {
    cancelled.current = true;
    await api.submit('/api/onboarding/import', { skip: true });
  };

  const back = async () => {
    cancelled.current = true;
    await api.navigate('shipstation');
  };

  const advance = async () => {
    await api.submit('/api/onboarding/state', { step: 'style' });
  };

  /**
   * Verify the catalogue key and store it. Nothing is written unless the live
   * check against ShipStation passes.
   */
  const saveKey = async () => {
    if (!apiKey.trim() || api.busy) return;
    setKeyFailure(null);
    const failure = await api.submit('/api/onboarding/catalog-key', { apiKey: apiKey.trim() });
    if (failure) {
      setKeyFailure({
        message: failure.check?.message ?? failure.message,
        action: failure.check?.action ?? 'Try again',
      });
      return;
    }
    setApiKey('');
  };

  /* ---- No catalogue key yet: ask for the one thing that is missing ------ */

  if (!hasKey && (!importSkipped || reopened) && progress.status !== 'complete' && progress.status !== 'partial') {
    return (
      <StepPanel
        step={STEPS.import}
        onSubmit={saveKey}
        banner={
          keyFailure ? (
            <Banner tone="danger" title="ShipStation didn’t accept that key">
              {keyFailure.message}
            </Banner>
          ) : null
        }
        footer={
          <StepNavigation
            primaryLabel={keyFailure ? keyFailure.action : 'Connect catalog'}
            onPrimary={saveKey}
            primaryDisabled={apiKey.trim().length === 0}
            primaryLoading={api.busy}
            onBack={back}
            onSkip={skip}
            skipLabel="Skip for now"
          />
        }
      >
        <p className={styles.sectionLabel}>
          {/* Only true if they actually finished step 3 — a merchant who skipped it
              would otherwise be told their orders were set up when they are not. */}
          {api.state.shipstation.connected
            ? 'Your orders are set up. To fill the store we need a ShipStation API key — generate one under Settings → Account → API Settings.'
            : 'To fill the store we need a ShipStation API key — generate one under Settings → Account → API Settings. This is separate from the order connection you skipped, which you can finish later from Integrations.'}
        </p>
        <ApiKeyInput
          value={apiKey}
          onChange={(value) => {
            setApiKey(value);
            setKeyFailure(null);
          }}
          autoFocus
          disabled={api.busy}
          hint="We test it before saving. Nothing is stored until the test passes."
        />
        <p className={styles.inlineNote}>
          This is a different credential from the order connection on the previous step. The key
          reads your catalog; it is never used to change anything in ShipStation.
        </p>
      </StepPanel>
    );
  }

  /* ---- Not connected: the honest empty path ---------------------------- */

  if (importSkipped && !reopened && progress.status !== 'complete' && progress.status !== 'partial') {
    return (
      <StepPanel
        step={STEPS.import}
        onSubmit={skip}
        footer={
          <StepNavigation
            primaryLabel="Continue"
            onPrimary={skip}
            primaryLoading={api.busy}
            onBack={back}
          />
        }
      >
        <div className={styles.emptyWrap}>
          <EmptyState
            title="No products yet"
            description="Add your ShipStation API key and we'll pull your catalog in. You can do it now, or from Settings once your store is up."
            action={
              <Button variant="secondary" onClick={() => setReopened(true)}>
                Add API key
              </Button>
            }
          />
        </div>
        <p className={styles.inlineNote}>
          Your store still gets created, styled and published. It just starts empty — the same
          empty state you see here is what greets you in the products list until you connect.
        </p>
      </StepPanel>
    );
  }

  /* ---- Connected ------------------------------------------------------- */

  const isRunning = running || progress.status === 'running';
  const finished = progress.status === 'complete' || progress.status === 'partial';
  const failed = progress.status === 'failed';

  /*
   * The denominator is the size of the *catalog*, not the size of what we have
   * already read. Dividing by `found` was the old bug: after page one of a
   * 5,000-product import, `found` and `imported` were both 100, so the bar read
   * 100% and then sat there for another forty-nine pages.
   *
   * When ShipStation does not send a count there is no honest percentage, so
   * the bar goes indeterminate rather than inventing one.
   */
  const total = progress.total;
  const determinate = total !== null && total > 0;
  const percent = determinate
    ? Math.min(100, Math.round(((progress.imported + progress.failed) / total) * 100))
    : 0;
  const indeterminate = !determinate && !finished && !failed && (isRunning || progress.found > 0);

  const primaryLabel = finished
    ? 'Continue'
    : failed
      ? (progress.errorAction ?? 'Retry')
      : progress.imported > 0
        ? 'Resume sync'
        : STEPS.import.primaryLabel;

  const onPrimary = finished ? advance : () => void drive(failed ? false : progress.imported === 0);

  return (
    <StepPanel
      step={STEPS.import}
      onSubmit={onPrimary}
      banner={
        failed ? (
          <Banner tone="danger" title="The catalog sync stopped">
            {progress.error ?? 'Sync failed before it started.'}
            {progress.imported > 0
              ? ` ${progress.imported} product${progress.imported === 1 ? '' : 's'} made it in before it stopped — nothing was lost.`
              : ''}
          </Banner>
        ) : progress.status === 'partial' ? (
          <Banner tone="warning" title="Some products didn’t make it">
            {progress.imported} products synced, {progress.failed} failed. You can publish now and
            fix those after.
          </Banner>
        ) : progress.status === 'complete' ? (
          <Banner tone="success" title="Sync complete">
            {progress.imported} products, {progress.skus} SKUs and stock for {progress.warehouses}{' '}
            warehouse{progress.warehouses === 1 ? '' : 's'} are in.
          </Banner>
        ) : null
      }
      footer={
        <StepNavigation
          primaryLabel={primaryLabel}
          onPrimary={onPrimary}
          primaryLoading={api.busy || isRunning}
          onBack={back}
          backDisabled={isRunning}
          onSkip={finished ? undefined : skip}
          skipLabel="Skip for now"
          skipDisabled={isRunning}
        />
      }
    >
      <div className={styles.progressWrap}>
        <div className={styles.progressHead}>
          <p className={styles.progressTitle}>
            {isRunning
              ? determinate
                ? `Syncing your catalog. ${progress.imported} of ${total} products in.`
                : `Syncing your catalog. ${progress.found} products so far.`
              : finished
                ? 'Catalog imported'
                : failed
                  ? 'Import stopped'
                  : 'Ready when you are'}
          </p>
          <span className={styles.progressCount}>
            {progress.imported}/{determinate ? total : progress.found || '—'}
          </span>
        </div>

        <div
          className={styles.progressTrack}
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={indeterminate || (!determinate && !finished) ? undefined : finished ? 100 : percent}
          aria-label="Catalog import progress"
          data-testid="import-progress"
        >
          <div
            className={styles.progressFill}
            data-indeterminate={indeterminate || undefined}
            data-tone={finished ? 'success' : failed ? 'danger' : undefined}
            style={
              indeterminate ? undefined : { width: `${finished ? 100 : determinate ? percent : 0}%` }
            }
          />
        </div>

        {isRunning && !determinate ? (
          <p className={styles.inlineNote}>
            ShipStation has not told us how big your catalog is, so there is no honest percentage to
            show. The counts below are real and keep climbing until every page is read.
          </p>
        ) : null}

        <div className={styles.stats}>
          <div className={styles.stat}>
            <span className={styles.statValue}>
              {determinate ? total : progress.found}
            </span>
            <span className={styles.statLabel}>
              {determinate ? 'Products in ShipStation' : 'Products found'}
            </span>
          </div>
          <div className={styles.stat}>
            <span className={styles.statValue}>{progress.imported}</span>
            <span className={styles.statLabel}>Imported</span>
          </div>
          <div className={styles.stat}>
            <span className={styles.statValue}>{progress.skus}</span>
            <span className={styles.statLabel}>SKUs with stock</span>
          </div>
          <div className={styles.stat}>
            <span className={styles.statValue}>{progress.warehouses}</span>
            <span className={styles.statLabel}>Warehouses</span>
          </div>
        </div>
      </div>

      <p className={styles.inlineNote}>
        Keep this tab open while the sync runs — it is driven from here. Closing it loses nothing:
        the cursor is stored server-side, so coming back resumes from the same page rather than
        starting over. It just will not carry on while you are away.
      </p>
    </StepPanel>
  );
}
