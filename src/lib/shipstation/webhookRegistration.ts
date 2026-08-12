/**
 * Subscribing our webhook endpoint with ShipStation.
 *
 * Audit P0-8: the webhook handler was well-built dead code, because nothing in the product ever
 * called `POST /v2/environment/webhooks` to tell ShipStation where to send events. This module is
 * that call.
 *
 * The registration carries two things ShipStation replays on every delivery:
 *
 * - the per-store URL (`/api/shipstation/webhook/<token>`), which is how an event arrives with a
 *   tenant attached at all, and
 * - a custom `x-rebelshops-webhook-secret` header, which the contract explicitly supports
 *   (`create_webhook_request_body.headers`) and which is the credential the receiver checks.
 *
 * Registration is idempotent: an existing subscription for the same URL is reused rather than
 * duplicated, so a merchant clicking "Register" twice does not get two deliveries per event.
 */

import { db } from '@/lib/database/connection';
import { shipStationFetch, type ShipStationFetchOptions } from './client';
import { buildWebhookUrl, getIntegration } from './credentials';
import {
  WEBHOOK_SECRET_HEADER,
  getOrCreateWebhookSecret,
  getOrCreateWebhookToken
} from './webhookSecurity';

/**
 * The `webhook_event` values in the V2 contract.
 *
 * Worth being precise about, because they are not what the *receiver* handles. The V2 enum is
 * `batch | carrier_connected | order_source_refresh_complete | rate | report_complete |
 * sales_orders_imported | track`; `track` is the one that carries shipment movement. The
 * `ITEM_SHIP_NOTIFY`-style resource types our handler switches on come from ShipStation's legacy
 * webhook vocabulary. Both are accepted on the wire; see `docs/shipstation.md` for why this
 * mismatch is called out rather than papered over.
 */
export type ShipStationWebhookEvent =
  | 'batch'
  | 'carrier_connected'
  | 'order_source_refresh_complete'
  | 'rate'
  | 'report_complete'
  | 'sales_orders_imported'
  | 'track';

/** Events we subscribe to by default. */
export const DEFAULT_WEBHOOK_EVENTS: readonly ShipStationWebhookEvent[] = ['track'];

/** Outcome of a registration attempt. */
export interface WebhookRegistrationResult {
  ok: boolean;
  webhookId?: string;
  webhookUrl?: string;
  /** True when an existing matching subscription was reused. */
  reused?: boolean;
  error?: string;
}

/** Injected network primitives, for tests. */
export type RegistrationNetworkOptions = Pick<
  ShipStationFetchOptions,
  'fetchImpl' | 'sleepImpl' | 'randomImpl' | 'maxAttempts' | 'baseDelayMs' | 'timeoutMs'
>;

/** A webhook as ShipStation reports it. */
interface RemoteWebhook {
  webhook_id?: string;
  url?: string;
  event?: string;
}

/**
 * Register (or reuse) the per-store webhook subscription.
 *
 * @param storeId - Store UUID.
 * @param baseUrl - Absolute public origin of this deployment.
 * @param options - Events to subscribe to, and injected network primitives.
 * @returns The subscription result.
 */
export async function registerStoreWebhook(
  storeId: string,
  baseUrl: string,
  options: { events?: readonly ShipStationWebhookEvent[] } & RegistrationNetworkOptions = {}
): Promise<WebhookRegistrationResult> {
  const { events = DEFAULT_WEBHOOK_EVENTS, ...network } = options;

  const integration = await getIntegration(storeId, { activeOnly: true });
  if (!integration?.apiKey) {
    return { ok: false, error: 'No active ShipStation integration for this store' };
  }

  if (!/^https:\/\//i.test(baseUrl)) {
    // ShipStation will not deliver to a non-HTTPS endpoint, and neither should we ask it to.
    return {
      ok: false,
      error: `Webhook registration needs an https:// public URL; got "${baseUrl}". Set NEXT_PUBLIC_APP_URL.`
    };
  }

  const token = await getOrCreateWebhookToken(storeId);
  const secret = await getOrCreateWebhookSecret(storeId);
  const url = buildWebhookUrl(baseUrl, token);

  const existing = await shipStationFetch<{ webhooks?: RemoteWebhook[] } | RemoteWebhook[]>(
    '/v2/environment/webhooks',
    { apiKey: integration.apiKey, operation: 'list webhooks', ...network }
  );

  if (existing.ok) {
    const list = Array.isArray(existing.data) ? existing.data : (existing.data.webhooks ?? []);
    const match = list.find((hook) => hook.url === url && hook.webhook_id);

    if (match?.webhook_id) {
      await persistRegistration(storeId, match.webhook_id);
      return { ok: true, webhookId: match.webhook_id, webhookUrl: url, reused: true };
    }
  }

  const created = await shipStationFetch<RemoteWebhook>('/v2/environment/webhooks', {
    apiKey: integration.apiKey,
    method: 'POST',
    body: {
      event: events[0],
      url,
      headers: [{ key: WEBHOOK_SECRET_HEADER, value: secret }]
    },
    operation: 'create webhook',
    ...network
  });

  if (!created.ok) {
    return { ok: false, error: created.error };
  }

  const webhookId = created.data.webhook_id;
  if (!webhookId) {
    return { ok: false, error: 'ShipStation accepted the webhook but returned no webhook_id' };
  }

  await persistRegistration(storeId, webhookId);
  return { ok: true, webhookId, webhookUrl: url };
}

/**
 * Record a successful subscription against the integration row.
 *
 * @param storeId - Store UUID.
 * @param webhookId - ShipStation's webhook id.
 * @returns Nothing.
 */
async function persistRegistration(storeId: string, webhookId: string): Promise<void> {
  await db.query(
    `UPDATE store_integrations
        SET webhook_id = $1, webhook_registered_at = NOW(), updated_at = NOW()
      WHERE store_id = $2 AND integration_type = 'shipstation'`,
    [webhookId, storeId]
  );
}

/**
 * Remove a store's webhook subscription from ShipStation.
 *
 * @param storeId - Store UUID.
 * @param network - Injected network primitives, for tests.
 * @returns Whether the subscription was removed.
 */
export async function unregisterStoreWebhook(
  storeId: string,
  network: RegistrationNetworkOptions = {}
): Promise<{ ok: boolean; error?: string }> {
  const integration = await getIntegration(storeId);
  if (!integration?.apiKey || !integration.webhookId) {
    return { ok: true };
  }

  const response = await shipStationFetch(
    `/v2/environment/webhooks/${encodeURIComponent(integration.webhookId)}`,
    { apiKey: integration.apiKey, method: 'DELETE', operation: 'delete webhook', ...network }
  );

  // A 404 means it is already gone, which is the state we wanted.
  if (!response.ok && response.status !== 404) {
    return { ok: false, error: response.error };
  }

  await db.query(
    `UPDATE store_integrations
        SET webhook_id = NULL, webhook_registered_at = NULL, updated_at = NOW()
      WHERE store_id = $1 AND integration_type = 'shipstation'`,
    [storeId]
  );

  return { ok: true };
}
