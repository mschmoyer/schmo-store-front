'use client';

import * as React from 'react';
import { Button } from '@/components/ui';
import { Banner, StepNavigation, StepPanel } from '@/components/wizard';
import { STEPS } from '../lib/steps';
import type { OnboardingApi } from '../useOnboarding';
import styles from '../Onboarding.module.css';

/** Small info mark for the "what we do with this" note. */
function InfoMark(): React.ReactElement {
  return (
    <svg className={styles.helpIcon} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="6.9" stroke="currentColor" strokeWidth="1.3" />
      <path d="M8 7.3v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="8" cy="4.9" r="0.85" fill="currentColor" />
    </svg>
  );
}

/** The connection details the merchant pastes into ShipStation. */
interface Connection {
  endpointUrl: string;
  username: string;
  password: string;
  statusMapping: Record<string, string>;
  setupSteps: string[];
}

/**
 * One labelled value with its own copy button.
 *
 * Each field is copied separately because they go into separate inputs on
 * ShipStation's form. A blank value is shown as an explicit instruction rather
 * than an empty box, since "leave this empty" is itself the correct setting for
 * the On-Hold field.
 *
 * @param props.label - ShipStation's own label for the field
 * @param props.value - The exact string to paste
 * @returns A copy row
 */
function CopyRow({ label, value }: { label: string; value: string }): React.ReactElement {
  const [copied, setCopied] = React.useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard can be blocked by permissions; the value is on screen to
      // select by hand, so there is nothing useful to say here.
    }
  };

  return (
    <div className={styles.copyRow}>
      <span className={styles.copyRowText}>
        <span className={styles.copyLabel}>{label}</span>
        <span className={`${styles.copyValue} ${value ? '' : styles.copyValueEmpty}`}>
          {value || 'Leave this field empty'}
        </span>
      </span>
      {value ? (
        <Button variant="ghost" size="sm" onClick={copy} aria-label={`Copy ${label}`}>
          {copied ? 'Copied' : 'Copy'}
        </Button>
      ) : null}
    </div>
  );
}

/**
 * Step 3 — Connect ShipStation for orders.
 *
 * ShipStation has two surfaces and this step sets up one of them: the **Custom
 * Store** feed, which is how orders leave us and how tracking comes back. It has
 * no catalogue capability, so the API key that imports products is asked for at
 * the next step, where that is the job it does. Presenting both here as one
 * "connect ShipStation" action is what previously left merchants unsure which
 * credential they were being asked for.
 *
 * The credentials are generated server-side and are idempotent across visits —
 * going back to this step re-reads the existing secret rather than rotating it,
 * because rotating would silently break a connection already pasted into
 * ShipStation.
 *
 * "Skip for now" stays honest: it records the skip and the store is still
 * created, it just will not receive orders until the merchant connects later.
 *
 * @param props.api - The onboarding API
 * @returns The ShipStation step
 */
export default function ShipStationStep({ api }: { api: OnboardingApi }): React.ReactElement {
  const [connection, setConnection] = React.useState<Connection | null>(null);
  const [failure, setFailure] = React.useState<string | null>(null);
  // Starts true: the request is fired on mount, so rendering "idle" first would
  // be a lie for the one frame before the effect runs.
  const [loading, setLoading] = React.useState(true);

  /**
   * Ask the server to issue or re-read this store's Custom Store credentials.
   *
   * Goes straight to the route rather than through `api.submit`, which resolves
   * with `null` on success and so cannot hand back the credentials.
   *
   * @returns The connection, or a message explaining why there isn't one
   */
  const requestConnection = React.useCallback(async (): Promise<
    { ok: true; connection: Connection } | { ok: false; message: string }
  > => {
    try {
      const response = await fetch('/api/onboarding/shipstation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
        cache: 'no-store',
      });
      const payload = (await response.json().catch(() => ({}))) as {
        connection?: Connection;
        message?: string;
      };
      if (!response.ok || !payload.connection) {
        return {
          ok: false,
          message: payload.message ?? 'We couldn’t generate your connection details.',
        };
      }
      return { ok: true, connection: payload.connection };
    } catch {
      return {
        ok: false,
        message: 'We couldn’t reach the server. Check your connection and try again.',
      };
    }
  }, []);

  React.useEffect(() => {
    let active = true;
    void (async () => {
      const result = await requestConnection();
      if (!active) return;
      if (result.ok) {
        setConnection(result.connection);
        await api.refresh();
      } else {
        setFailure(result.message);
      }
      setLoading(false);
    })();
    return () => {
      active = false;
    };
    // Runs once on entering the step. `api` identity changes on every state
    // update, so depending on it would reissue the request in a loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestConnection]);

  /** Retry after a failure, from the footer button. */
  const retry = async () => {
    setLoading(true);
    setFailure(null);
    const result = await requestConnection();
    if (result.ok) {
      setConnection(result.connection);
      await api.refresh();
    } else {
      setFailure(result.message);
    }
    setLoading(false);
  };

  const advance = async () => {
    // Marks the step done *and* moves the cursor. Issuing the credentials does
    // neither, so a merchant who opens this screen and closes the tab comes back
    // to it rather than to the next step.
    await api.submit('/api/onboarding/shipstation', { confirm: true });
  };

  const skip = async () => {
    setFailure(null);
    await api.submit('/api/onboarding/shipstation', { skip: true });
  };

  const back = async () => {
    await api.navigate('store');
  };

  const busy = api.busy || loading;

  return (
    <StepPanel
      step={STEPS.shipstation}
      onSubmit={advance}
      banner={
        failure ? (
          <Banner tone="danger" title="That didn’t work">
            {failure}
          </Banner>
        ) : null
      }
      footer={
        <StepNavigation
          primaryLabel={connection ? 'Continue' : 'Try again'}
          onPrimary={connection ? advance : retry}
          primaryLoading={busy}
          onBack={back}
          onSkip={skip}
          skipLabel="Skip for now"
        />
      }
    >
      <p className={styles.sectionLabel}>
        ShipStation collects your orders by calling us on a schedule it controls. These are the
        details it needs to do that.
      </p>

      {connection ? (
        <>
          <div className={styles.copyGrid}>
            <CopyRow label="URL to custom XML page" value={connection.endpointUrl} />
            <CopyRow label="Username" value={connection.username} />
            <CopyRow label="Password" value={connection.password} />
          </div>

          <p className={styles.sectionLabel}>
            Order statuses — these are case-sensitive, and a typo sends orders to the wrong place
            in ShipStation without reporting an error.
          </p>
          <div className={styles.copyGrid}>
            {Object.entries(connection.statusMapping).map(([label, value]) => (
              <CopyRow key={label} label={label} value={value} />
            ))}
          </div>

          <p className={styles.sectionLabel}>Where these go in ShipStation</p>
          <ol className={styles.setupList}>
            {connection.setupSteps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>

          <div className={styles.helpNote}>
            <InfoMark />
            <span>
              <strong>This connection carries orders, not products.</strong> Your catalogue comes
              in over a separate ShipStation API key, which we ask for on the next step.
            </span>
          </div>

          <p className={styles.inlineNote}>
            Stuck? ShipStation runs its first import on its own schedule, so nothing appears the
            instant you connect — that is normal. You can check whether it has called yet, and copy
            these details again, under Integrations in your dashboard. ShipStation&apos;s own guide
            to this screen is in their{' '}
            <a
              href="https://docs.shipstation.com/"
              target="_blank"
              rel="noopener noreferrer"
              className={styles.inlineLink}
            >
              help centre
            </a>
            .
          </p>
        </>
      ) : (
        <p className={styles.inlineNote}>
          {loading
            ? 'Generating your connection details…'
            : 'We couldn’t generate your connection details. You can retry, or skip and set this up later from Settings — your store will still be created.'}
        </p>
      )}
    </StepPanel>
  );
}
