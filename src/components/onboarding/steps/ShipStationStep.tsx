'use client';

import * as React from 'react';
import { Banner, StepNavigation, StepPanel } from '@/components/wizard';
import { STEPS } from '../lib/steps';
import ApiKeyInput from '../ApiKeyInput';
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

function CheckMark(): React.ReactElement {
  return (
    <svg viewBox="0 0 14 14" width="14" height="14" fill="none" aria-hidden="true">
      <circle cx="7" cy="7" r="6.2" stroke="currentColor" strokeWidth="1.3" />
      <path
        d="M4.3 7.2 6.2 9.1l3.5-3.9"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Distinct copy per failure mode. The audit's whole complaint about the old
 *  screen was that every outcome looked the same, so these do not collapse into
 *  one "connection failed" string. */
const FAILURE_TITLES: Record<string, string> = {
  invalid_key: 'ShipStation rejected that key',
  forbidden: 'That key can’t read your catalog',
  rate_limited: 'ShipStation is rate-limiting us',
  network_error: 'We couldn’t reach ShipStation',
  blocked_upstream: 'Something blocked the connection',
  timeout: 'ShipStation didn’t answer in time',
  unexpected: 'ShipStation returned something unexpected',
  malformed: 'That doesn’t look like a ShipStation key',
};

/**
 * Step 3 — Connect ShipStation.
 *
 * "Test connection" performs a real `GET /v2/warehouses` against ShipStation
 * (server-side, `POST /api/onboarding/shipstation`). Nothing is saved unless
 * that call succeeds, and each failure mode gets its own title, sentence and
 * action. There is no simulated branch anywhere in this path — see
 * `src/app/api/onboarding/_lib/shipstation.ts`.
 *
 * "Skip for now" is honest: it records the skip, sends the merchant on, and
 * their store lands with the copy deck's "connect ShipStation and we'll pull
 * your catalog in" empty state rather than a broken shop.
 *
 * @param props.api - The onboarding API
 * @returns The ShipStation step
 */
export default function ShipStationStep({ api }: { api: OnboardingApi }): React.ReactElement {
  const connected = api.state.shipstation.connected;
  const [apiKey, setApiKey] = React.useState('');
  const [replacing, setReplacing] = React.useState(false);
  const [failure, setFailure] = React.useState<{
    status: string;
    message: string;
    action: string;
    detail?: string;
  } | null>(null);
  const [success, setSuccess] = React.useState<string | null>(null);

  const showForm = !connected || replacing;
  const canTest = apiKey.trim().length > 0;

  const test = async () => {
    // Enter submits the form; the handler must re-check what the button's
    // disabled state already covers.
    if (!canTest || api.busy) return;
    setFailure(null);
    setSuccess(null);
    const result = await api.submit('/api/onboarding/shipstation', { apiKey: apiKey.trim() });
    if (result) {
      setFailure(
        result.check ?? {
          status: 'unexpected',
          message: result.message,
          action: 'Try again',
        }
      );
      return;
    }
    setApiKey('');
    setReplacing(false);
    setSuccess('Connected. We can see your ShipStation account.');
  };

  const advance = async () => {
    // Already connected and not editing: just move on.
    await api.submit('/api/onboarding/state', { step: 'import' });
  };

  const skip = async () => {
    setFailure(null);
    await api.submit('/api/onboarding/shipstation', { skip: true });
  };

  const back = async () => {
    await api.navigate('store');
  };

  const warehouses = api.state.shipstation.warehouseCount;

  return (
    <StepPanel
      step={STEPS.shipstation}
      onSubmit={showForm ? test : advance}
      banner={
        failure ? (
          <Banner
            tone={
              failure.status === 'network_error' ||
              failure.status === 'timeout' ||
              failure.status === 'blocked_upstream'
                ? 'warning'
                : 'danger'
            }
            title={FAILURE_TITLES[failure.status] ?? 'That didn’t work'}
          >
            {failure.message}
          </Banner>
        ) : success ? (
          <Banner tone="success" title="ShipStation connected">
            {success}
            {typeof warehouses === 'number'
              ? ` We can see ${warehouses} warehouse${warehouses === 1 ? '' : 's'} on this account.`
              : ''}
          </Banner>
        ) : null
      }
      footer={
        <StepNavigation
          primaryLabel={showForm ? (failure ? failure.action : 'Test connection') : 'Continue'}
          onPrimary={showForm ? test : advance}
          primaryDisabled={showForm ? !canTest : false}
          primaryLoading={api.busy}
          onBack={back}
          onSkip={showForm ? skip : undefined}
          skipLabel="Skip for now"
        />
      }
    >
      {connected && !replacing ? (
        <div className={styles.connected}>
          <CheckMark />
          <span>ShipStation connected</span>
          {api.state.shipstation.maskedKey ? (
            <span className={styles.connectedKey}>{api.state.shipstation.maskedKey}</span>
          ) : null}
          <button
            type="button"
            className={styles.replaceLink}
            onClick={() => {
              setReplacing(true);
              setSuccess(null);
            }}
          >
            Use a different key
          </button>
        </div>
      ) : (
        <>
          <p className={styles.sectionLabel}>
            Generate a key in ShipStation under Settings → Account → API Settings.
          </p>
          <ApiKeyInput
            value={apiKey}
            onChange={(value) => {
              setApiKey(value);
              setFailure(null);
            }}
            autoFocus
            disabled={api.busy}
            hint="We test it before saving. Nothing is stored until the test passes."
          />

          {failure?.status === 'invalid_key' || failure?.status === 'forbidden' ? (
            <p className={styles.inlineNote}>
              Keys are account-wide. If you have more than one ShipStation account, check that this
              key came from the one holding the catalog you want to sell.
            </p>
          ) : null}

          {failure?.status === 'network_error' ||
          failure?.status === 'timeout' ||
          failure?.status === 'blocked_upstream' ? (
            <p className={styles.inlineNote}>
              Nothing was saved and nothing was changed in ShipStation. You can retry, or skip this
              and connect later from Settings — your store will still be created.
            </p>
          ) : null}

          <div className={styles.helpNote}>
            <InfoMark />
            <span>
              {/* This key is not read-only any more. Once the store is live, every paid
                  order is pushed to ShipStation as a shipment, so promising we never
                  write would be false the first time somebody buys something. */}
              <strong>Setup only reads.</strong> Products, SKUs, prices, images and stock levels
              come in, and nothing in ShipStation changes while you set up. Once your store is
              live, this same key sends each paid order over for fulfilment.
            </span>
          </div>
        </>
      )}

      {api.state.shipstation.planLimited ? (
        <p className={styles.inlineNote}>
          ShipStation reports this account’s plan limits warehouse access. Your key works — we may
          just see less than the full picture.
        </p>
      ) : null}

    </StepPanel>
  );
}
