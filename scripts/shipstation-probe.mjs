#!/usr/bin/env node
/**
 * Live probe of every ShipStation V2 endpoint this application depends on.
 *
 * Answers a question the unit tests cannot: does a *real* ShipStation account, on the
 * caller's actual plan, return the endpoints and the field names our sync code reads?
 * The suite mocks `fetchImpl`, so a renamed field or a plan-gated 403 is invisible there
 * and only shows up as an empty sync in production.
 *
 * Each probe therefore checks three things:
 *
 *   1. The call is reachable and authenticated (HTTP status).
 *   2. The collection lives under the key our code destructures (`warehouses`,
 *      `inventory`, `products`, ...). A 200 whose body is shaped differently is a silent
 *      zero-row sync, not a success.
 *   3. The first record carries the fields the corresponding writer reads. Missing
 *      *required* fields are failures; missing optional ones are warnings, since our
 *      writers all `?? ` them.
 *
 * Read-only by design. `POST /v2/shipments`, `POST /v2/environment/webhooks` and
 * `DELETE /v2/environment/webhooks/{id}` are exercised by the app but deliberately not
 * probed here — they create real shipments and real webhook subscriptions in the
 * merchant's account. Confirming the credential works on the read endpoints establishes
 * the same auth path those writes use.
 *
 * Usage:
 *   SHIPSTATION_API_KEY=... npm run shipstation:probe
 *   SHIPSTATION_API_KEY=... node scripts/shipstation-probe.mjs --verbose
 *
 * The key is read from the environment only. It is never written to disk, never logged,
 * and never included in the output — not even a masked prefix.
 *
 * Exit code is 0 when every probe passes, 1 otherwise, so CI can gate on it.
 */

const BASE = 'https://api.shipstation.com';
const TIMEOUT_MS = 30_000;
const VERBOSE = process.argv.includes('--verbose');

/**
 * Every ShipStation endpoint the application calls, paired with the code that calls it
 * and the fields that code reads off each record.
 *
 * @type {Array<{
 *   label: string,
 *   callers: string[],
 *   path: string,
 *   collection: string | null,
 *   required: string[],
 *   optional: string[],
 *   allowEmpty?: boolean
 * }>}
 */
const PROBES = [
  {
    label: 'Warehouses (connection test + shipfroms sync)',
    callers: [
      'src/app/api/admin/integrations/shipstation/test/route.ts',
      'src/app/api/onboarding/_lib/shipstation.ts',
      'src/lib/shipstation/sync.ts → syncWarehousesPage',
      'src/app/api/warehouses/route.ts',
    ],
    path: '/v2/warehouses',
    collection: 'warehouses',
    required: ['warehouse_id'],
    optional: ['name', 'origin_address', 'return_address', 'is_default'],
  },
  {
    label: 'Carriers (v2Api credential check)',
    callers: ['src/lib/shipstation/v2Api.ts → testShipStationV2Credentials'],
    path: '/v2/carriers',
    collection: 'carriers',
    required: [],
    optional: ['carrier_id', 'carrier_code'],
  },
  {
    label: 'Inventory levels (stock sync)',
    callers: [
      'src/lib/shipstation/sync.ts → syncInventoryPage',
      'src/app/api/inventory/route.ts',
      'src/app/api/admin/inventory/route.ts',
    ],
    path: '/v2/inventory?page=1&page_size=5',
    collection: 'inventory',
    required: ['sku'],
    optional: ['available', 'on_hand', 'allocated'],
  },
  {
    label: 'Inventory warehouses',
    callers: ['src/lib/shipstation/sync.ts → syncInventoryWarehousesPage'],
    path: '/v2/inventory_warehouses?page=1&page_size=5',
    collection: 'inventory_warehouses',
    required: ['inventory_warehouse_id'],
    optional: ['name'],
  },
  {
    label: 'Inventory locations',
    callers: ['src/lib/shipstation/sync.ts → syncInventoryLocationsPage'],
    path: '/v2/inventory_locations?page=1&page_size=5',
    collection: 'inventory_locations',
    required: ['inventory_location_id'],
    optional: ['inventory_warehouse_id', 'name'],
  },
  {
    label: 'Product catalogue (product sync + onboarding import)',
    callers: [
      'src/lib/shipstation/sync.ts → syncProductsPage',
      'src/app/api/onboarding/_lib/import.ts',
      'src/app/api/products/route.ts',
    ],
    path: '/v2/products?page=1&page_size=5',
    collection: 'products',
    required: ['product_id'],
    optional: ['sku', 'name', 'description', 'customs_value', 'thumbnail_url', 'active'],
  },
  {
    label: 'Shipments (order push target + tracking read-back)',
    callers: [
      'src/lib/shipstation/sync.ts → syncShipmentsPage',
      'src/lib/shipstation/orderPush.ts → pushOrderToShipStation',
    ],
    // The read side of the order flow. `external_shipment_id` is the field that
    // matches a shipment back to the order that created it, so a response that
    // omits it would silently strand every order without tracking — exactly the
    // kind of shape change unit tests cannot see.
    path: '/v2/shipments?page=1&page_size=5&sort_by=modified_at&sort_dir=desc',
    collection: 'shipments',
    required: ['shipment_id'],
    optional: [
      'external_shipment_id',
      'shipment_status',
      'carrier_code',
      'service_code',
      'tracking_number',
      'ship_date',
      'shipment_cost',
    ],
    allowEmpty: true,
  },
  {
    label: 'Webhook subscriptions (list side of registration)',
    callers: ['src/lib/shipstation/webhookRegistration.ts → registerStoreWebhook'],
    path: '/v2/environment/webhooks',
    // The registration code accepts either a bare array or `{ webhooks: [...] }`.
    collection: 'webhooks',
    required: [],
    optional: ['webhook_id', 'url', 'event'],
    allowEmpty: true,
  },
];

/**
 * Perform one HTTP call against ShipStation.
 *
 * @param {string} apiKey - ShipStation V2 API key.
 * @param {string} path - Path beginning with `/v2/`.
 * @returns {Promise<{status: number, body: string, json: unknown, ms: number, error?: string}>}
 *   The raw outcome. A transport failure is reported as status 0 rather than thrown.
 */
async function call(apiKey, path) {
  const started = Date.now();

  try {
    const response = await fetch(`${BASE}${path}`, {
      method: 'GET',
      headers: { 'api-key': apiKey },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    const body = await response.text();
    let json = null;
    try {
      json = body.length > 0 ? JSON.parse(body) : null;
    } catch {
      // Left as null; the shape check reports it.
    }

    return { status: response.status, body, json, ms: Date.now() - started };
  } catch (error) {
    return {
      status: 0,
      body: '',
      json: null,
      ms: Date.now() - started,
      error: error instanceof Error ? error.message : 'unknown transport error',
    };
  }
}

/**
 * Decide whether a non-200 response actually came from ShipStation.
 *
 * Corporate proxies, VPN egress filters and sandboxed CI runners all answer blocked hosts
 * with their own 403, and the naive reading of that is "ShipStation rejected the key" —
 * which sends you off rotating a credential that was never tested. ShipStation errors are
 * JSON; an intermediary's are plain text. That difference is the most reliable signal
 * available without trusting any particular proxy's wording.
 *
 * @param {number} status - HTTP status code.
 * @param {unknown} json - Parsed body, or null when the body was not JSON.
 * @param {string} body - Raw response body.
 * @returns {string | null} An explanation when the response looks like an intermediary's,
 *   otherwise null.
 */
function detectInterceptor(status, json, body) {
  if (status === 200 || json !== null) {
    return null;
  }

  if (/allowlist|egress|proxy|blocked|firewall|not permitted/i.test(body)) {
    return 'a network proxy blocked this request — it never reached ShipStation';
  }

  return 'response body is not JSON, so this likely came from a proxy rather than ShipStation';
}

/**
 * Pull the record list out of a response body, tolerating both envelope shapes
 * ShipStation uses (`{ collection: [...] }` and a bare top-level array).
 *
 * @param {unknown} json - Parsed response body.
 * @param {string | null} collection - Key our code destructures.
 * @returns {{ list: unknown[] | null, via: string }} The records and how they were found.
 */
function extract(json, collection) {
  if (Array.isArray(json)) {
    return { list: json, via: 'top-level array' };
  }

  if (json && typeof json === 'object' && collection && Array.isArray(json[collection])) {
    return { list: json[collection], via: `"${collection}"` };
  }

  return { list: null, via: 'not found' };
}

/**
 * Run one probe and print its verdict.
 *
 * @param {string} apiKey - ShipStation V2 API key.
 * @param {(typeof PROBES)[number]} probe - Probe definition.
 * @returns {Promise<{ ok: boolean, label: string, detail: string }>} Verdict for the summary.
 */
async function run(apiKey, probe) {
  const result = await call(apiKey, probe.path);
  const header = `${probe.label}\n  GET ${probe.path}`;

  if (result.status === 0) {
    console.log(`\n✗ ${header}\n  transport failure: ${result.error}`);
    return { ok: false, label: probe.label, detail: `transport: ${result.error}` };
  }

  if (result.status !== 200) {
    // Check for an intermediary first. Reading a proxy's 403 as ShipStation's verdict is
    // how a blocked host gets misreported as a bad API key.
    const intercepted = detectInterceptor(result.status, result.json, result.body);

    // 401/403 is a credential or plan problem; 404 means the account does not expose
    // this endpoint at all, which sync.ts surfaces to merchants as its own message.
    const hint =
      intercepted ??
      (result.status === 401 || result.status === 403
        ? 'credential rejected, or the endpoint needs a higher ShipStation plan'
        : result.status === 404
          ? 'endpoint not available on this account'
          : result.status === 429
            ? 'rate limited'
            : 'unexpected status');

    console.log(
      `\n✗ ${header}\n  HTTP ${result.status} (${result.ms}ms) — ${hint}` +
        `\n  body: ${result.body.slice(0, 300)}`
    );
    return {
      ok: false,
      label: probe.label,
      detail: `HTTP ${result.status} — ${hint}`,
      intercepted: intercepted !== null,
    };
  }

  const { list, via } = extract(result.json, probe.collection);

  if (list === null) {
    const keys =
      result.json && typeof result.json === 'object' ? Object.keys(result.json).join(', ') : '(none)';
    console.log(
      `\n✗ ${header}\n  HTTP 200 (${result.ms}ms) but no "${probe.collection}" array.` +
        `\n  top-level keys: ${keys}` +
        `\n  → our code reads response.${probe.collection}, so this syncs zero rows silently.`
    );
    return { ok: false, label: probe.label, detail: `200 but "${probe.collection}" missing` };
  }

  if (list.length === 0) {
    const verdict = probe.allowEmpty ? '✓' : '⚠';
    console.log(
      `\n${verdict} ${header}\n  HTTP 200 (${result.ms}ms), found via ${via}, 0 records.` +
        (probe.allowEmpty ? '' : '\n  → reachable, but no data to verify field names against.')
    );
    return {
      ok: true,
      label: probe.label,
      detail: probe.allowEmpty ? '200, empty (expected)' : '200, empty — fields unverified',
    };
  }

  const sample = list[0];
  const missingRequired = probe.required.filter((field) => !(field in sample));
  const missingOptional = probe.optional.filter((field) => !(field in sample));

  if (missingRequired.length > 0) {
    console.log(
      `\n✗ ${header}\n  HTTP 200 (${result.ms}ms), found via ${via}, ${list.length} record(s).` +
        `\n  missing required field(s): ${missingRequired.join(', ')}` +
        `\n  record keys: ${Object.keys(sample).join(', ')}`
    );
    return {
      ok: false,
      label: probe.label,
      detail: `200 but missing ${missingRequired.join(', ')}`,
    };
  }

  console.log(
    `\n✓ ${header}\n  HTTP 200 (${result.ms}ms), found via ${via}, ${list.length} record(s).` +
      `\n  required fields present: ${probe.required.join(', ') || '(none declared)'}` +
      (missingOptional.length > 0 ? `\n  optional fields absent: ${missingOptional.join(', ')}` : '')
  );

  if (VERBOSE) {
    console.log(`  sample record keys: ${Object.keys(sample).join(', ')}`);
  }

  return { ok: true, label: probe.label, detail: `200, ${list.length} record(s)` };
}

/**
 * Probe every endpoint and print a summary.
 *
 * @returns {Promise<void>} Resolves after setting the process exit code.
 */
async function main() {
  const apiKey = process.env.SHIPSTATION_API_KEY;

  if (!apiKey) {
    console.error(
      'SHIPSTATION_API_KEY is not set.\n' +
        'Usage: SHIPSTATION_API_KEY=<key> node scripts/shipstation-probe.mjs [--verbose]'
    );
    process.exitCode = 1;
    return;
  }

  console.log(`Probing ${PROBES.length} ShipStation V2 endpoints at ${BASE}`);
  console.log('Read-only: no shipments, webhooks or other records are created.');

  const verdicts = [];
  for (const probe of PROBES) {
    // Sequential on purpose: parallel probes can trip ShipStation's rate limiter and
    // turn a healthy account into a wall of 429s.
    verdicts.push(await run(apiKey, probe));
  }

  const failed = verdicts.filter((verdict) => !verdict.ok);

  console.log('\n\n===== SUMMARY =====');
  for (const verdict of verdicts) {
    console.log(`${verdict.ok ? 'PASS' : 'FAIL'}  ${verdict.label} — ${verdict.detail}`);
  }
  console.log(`\n${verdicts.length - failed.length}/${verdicts.length} passed.`);

  if (verdicts.some((verdict) => verdict.intercepted)) {
    // Say this loudly. An intercepted run proves nothing about the account or the key, and
    // reporting it as "ShipStation is down" or "the key is bad" is worse than no result.
    console.log(
      '\nINCONCLUSIVE: at least one request was blocked before it reached ShipStation.\n' +
        'Nothing here reflects the API key or the account. Allow api.shipstation.com through\n' +
        'the network egress policy and re-run.'
    );
  }

  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

await main();
