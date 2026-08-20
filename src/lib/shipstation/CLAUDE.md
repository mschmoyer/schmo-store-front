# ShipStation Integration

Scope: `src/lib/shipstation/**`, `src/app/api/shipstation/**`, `src/app/api/admin/sync/**`,
`src/app/api/admin/integrations/shipstation/**`, `src/app/api/cron/sync`, `src/app/api/jobs/process`,
`src/app/api/onboarding/shipstation`, `scripts/shipstation-probe.mjs`.

Read this before changing anything in that surface. Most of what looks like an obvious improvement
here was already tried and reverted — see `docs/audits/shipstation-audit.md` for the findings each
rule below closes, and `docs/decision-log.md` for what changed after.

## One channel: the V2 REST API

Everything goes through ShipStation's V2 REST API under a single merchant API key. There is no
second integration and no second credential.

| Direction | How | Endpoint |
|---|---|---|
| Catalogue, inventory, warehouses **in** | Paged sync | `GET /v2/products`, `/v2/inventory`, `/v2/inventory_warehouses`, `/v2/inventory_locations`, `/v2/warehouses` |
| Orders **out** | Queued job on a paid order | `POST /v2/shipments` |
| Shipment status and tracking **back** | Paged sync on a modified-at window | `GET /v2/shipments` |

The two order directions key off each other: the push sets `external_shipment_id` to our
`order_number`, and `syncShipmentsPage` matches shipments back to orders on that field. A shipment
without it belongs to the merchant, not to us, and is skipped.

**The Custom Store XML feed has been removed.** It was a second, parallel integration with its own
credentials, its own wire format and its own auth, and it could not import a catalogue. Its wire
format is preserved for reference in `docs/shipstation-custom-store.md`, which now documents a
surface this codebase no longer exposes — do not build against it without reinstating the endpoint.

**Known limit, and it is load-bearing:** the V2 contract in `docs/shipstation-api-openapi.yaml` has
**no order resource** — no `POST /v2/orders`, no `GET /v2/sales_orders`. Orders reach ShipStation
only as a side effect of creating a shipment, via the `create_sales_order: true` field in
`orderPush.ts`. **That field does not appear anywhere in the published contract**, the same class as
`/v2/products`, which 404s on some accounts. Nothing here has been exercised against a live
ShipStation account. If push turns out not to create a fulfillable order, this is why.

## Rules

These are not style preferences. Each one closes a defect that reached production.

1. **Never call `fetch` against ShipStation directly.** Every outbound call goes through
   `shipStationFetch` (`client.ts`). It is the only place with retry, jittered backoff,
   `Retry-After` handling and a 429 policy. A hand-rolled `fetch` reintroduces P1-1, where a 429
   aborted one loop and was read as "no more pages" by another in the same function.
   The one remaining exception is `v2Api.ts`, which is legacy — see [Known gaps](#known-gaps).
2. **Never read credentials from a row yourself.** `credentials.ts` is the only module that
   decrypts. No `Buffer.from(key, 'base64')`, anywhere, ever — that was P0-9.
3. **Never log the API key, the webhook secret, or a fragment of either.** Not a prefix, not the
   last four characters. Mask with `maskApiKey` if a value must be shown to the merchant.
4. **Every query is store-scoped.** Every function in this directory takes a `storeId` and threads
   it into the `WHERE` clause. A webhook authenticated for store A must not be able to name an
   order in store B (P0-7). If you write a query here without a `store_id` predicate, it is a bug.
5. **Never loop a whole catalogue inside one request.** Work is one page per unit
   (`runSyncPage`), chained through `job_queue` or bounded by `PAGE_CAP` + a time budget
   (`manualSync.ts`). Serverless invocations die at `maxDuration`; a page is a cheap thing to lose,
   a run is not.
6. **Never fail a checkout on a ShipStation error.** The local order is authoritative and is
   written first; the push to ShipStation is a queued job, never an inline call. Regressing this
   loses paid sales — it already did once. (The queued push is built but not yet wired; see
   [Known gaps](#known-gaps). When you wire it, wire it as a job, not as a call.)
7. **Never report success for work that wrote nothing.** No `catch { log(); continue; }` around a
   per-record write. `/api/admin/sync/all` used to return `success: true` unconditionally.
8. **Never claim a connection test passed without a live call.** The test is
   `GET /v2/warehouses` against the real key. Regex and length checks are not tests (P0-2).

## How the pieces fit

```
Merchant pastes V2 API key
  └─ POST /api/onboarding/shipstation  (validates live, then saves)
     or POST /api/admin/integrations/shipstation
        └─ credentials.saveCredentials  → store_integrations (AES-256-GCM)
        └─ webhookRegistration.registerStoreWebhook
              → POST /v2/environment/webhooks  (URL + x-rebelshops-webhook-secret header)

Catalogue in ────────────────────────────────────────────────────────────────
  Vercel Cron (hourly) → GET /api/cron/sync → backgroundSyncService.runFullSync()
      → syncOrchestrator.enqueueStoreSync()
            one job_queue row per operation, seeded at lastPageCompleted + 1
  POST /api/jobs/process   ⚠ NOT SCHEDULED — no cron entry exists; see Known gaps
      → jobQueueService.processJobs() → syncOrchestrator.processSyncPageJob()
          → sync.runSyncPage(operation, page) → shipStationFetch → one transaction
          → on success, enqueues the next page; on the last page, closes the run
  Admin "Sync" button → POST /api/admin/sync/* → manualSync.runManualSync()
      → the same sync.runSyncPage writers, looped inside the request, bounded
      → this path does NOT use the queue, which is why it works today

Orders out ──────────────────────────────────────────────────────────────────
  Paid order written locally
      ⚠ NOTHING CALLS enqueueOrderPush — the chain below is unreachable today
      → orderPush.enqueueOrderPush() → job_queue
      → orderPush.processOrderPushJob() → POST /v2/shipments (create_sales_order: true)
      → orders.fulfillment_sync_status: pending → queued → pushed | failed

Shipments in ────────────────────────────────────────────────────────────────
  ShipStation → POST /api/shipstation/webhook/<store-token>
      → webhookSecurity.authenticateWebhook() (token → store, secret header, optional HMAC)
      → webhookPayload.parseShipStationWebhookPayload() → orderStatusService
```

## Module map

| File | Owns | Do not |
|---|---|---|
| `client.ts` | The only HTTP entry point. Retry, backoff, `Retry-After`, discriminated `ShipStationResult`. | Add a second fetch wrapper. Throw instead of returning a failure. |
| `credentials.ts` | Read/write of `store_integrations`. Masking, webhook URL building, sync status. | Decrypt anywhere else. Query without a `storeId`. |
| `crypto.ts` | AES-256-GCM at rest, `ssenc:v1:` / legacy `b64v0:` formats, self-healing upgrade. | Add a third format. Make a missing key non-fatal. |
| `sync.ts` | One page of one operation, written in one transaction. `SYNC_OPERATIONS` dependency order. | Loop pages here. Reorder operations (`products` must precede `inventory`). |
| `syncOrchestrator.ts` | Turning "sync this store" into chained `job_queue` rows; `sync_runs` cursor. | Build a second queue. `jobQueueService` already is one. |
| `manualSync.ts` | Operator-triggered sync that finishes in its own request. `PAGE_CAP`, `DEFAULT_BUDGET_MS`. | Remove the bounds. Fork the writers — it must call `runSyncPage`. |
| `orderPush.ts` | Queued order push to `POST /v2/shipments`, enqueued by `billing/orders.ts::createPaidOrder` after the transaction commits. Sets `external_shipment_id` to the order number. | Push inline from a checkout path. Fail a paid checkout on a ShipStation error. |
| `webhookSecurity.ts` | Inbound auth: path token → store, shared-secret header, optional body HMAC. | Trust anything in the payload to identify the tenant. |
| `webhookRegistration.ts` | `POST`/`DELETE /v2/environment/webhooks`. Idempotent by URL. | Register without the secret header. |
| `webhookPayload.ts` | Parsing/validating the inbound notification body. | Assume fields exist. |
| `v2Api.ts` | Legacy shipment creation + credential read. **Deprecated**, see Known gaps. | Add call sites. |
| `utils.ts` | Date, status-map, money and validation helpers. | Put network or DB code here. |

## Outbound API surface (ShipStation V2)

Base: `https://api.shipstation.com`. Auth header: `api-key: <key>` (lowercase, per the OpenAPI contract).
The contract lives at `docs/shipstation-api-openapi.yaml`.

| Method | Path | Called from | Notes |
|---|---|---|---|
| GET | `/v2/warehouses` | `sync.syncWarehousesPage`, both connection-test routes, onboarding validation, probe | Unpaged — returns everything in one call. Also the canonical liveness probe. |
| GET | `/v2/products?page&page_size` | `sync.syncProductsPage`, probe | **Not in the published V2 contract.** Some accounts expose it, some 404. A 404 surfaces `PRODUCTS_ENDPOINT_UNAVAILABLE` and the rest of the sync continues (P0-5). Read `price.amount` for cost, not `customs_value.amount`. |
| GET | `/v2/inventory?page&page_size` | `sync.syncInventoryPage`, probe | Stock levels by SKU. |
| GET | `/v2/inventory_warehouses?page&page_size` | `sync.syncInventoryWarehousesPage`, probe | |
| GET | `/v2/inventory_locations?page&page_size` | `sync.syncInventoryLocationsPage`, probe | |
| GET | `/v2/carriers` | `v2Api.testShipStationV2Credentials`, probe | Legacy credential test. |
| POST | `/v2/shipments` | `orderPush.pushOrderToShipStation`, `v2Api.createShipment` | `create_sales_order: true`. Money fields are **decimal dollars**, not cents — no `/100`. Not covered by the probe (it would create real records). |
| GET | `/v2/environment/webhooks` | `webhookRegistration`, probe | Used to make registration idempotent. |
| POST | `/v2/environment/webhooks` | `webhookRegistration.registerStoreWebhook` | Carries `headers: [{ x-rebelshops-webhook-secret }]`. Not probed. |
| DELETE | `/v2/environment/webhooks/{id}` | `webhookRegistration.unregisterStoreWebhook` | Not probed. |

`PAGE_SIZE` is 100. Run `SHIPSTATION_API_KEY=<key> npm run shipstation:probe` to verify every
read endpoint is both reachable **and shaped the way the parsing code expects** — a 200 whose
collection sits under a different key syncs zero rows without raising, which mocked unit tests
cannot catch.

## Inbound API surface (ours)

| Method | Route | Auth | Purpose |
|---|---|---|---|
| POST | `/api/shipstation/webhook/[storeToken]` | Path token + `x-rebelshops-webhook-secret`, optional `x-shipstation-signature` HMAC | The live webhook receiver. 401 before the body is parsed. Body capped at 512 KB. |
| POST/GET | `/api/shipstation/webhook` | none | **Retired.** Returns 410 with an explanation. Do not revive; it could not identify a tenant (P0-7). |
| GET/POST/DELETE | `/api/admin/integrations/shipstation` | merchant session | Read masked config / save key + register webhook / disconnect. Returns only what the server will honour — never a credential it invented (P0-1). |
| POST | `/api/admin/integrations/shipstation/test` | merchant session | Live `GET /v2/warehouses` against the submitted key, else the stored one. Routed through `shipStationFetch`. |
| POST | `/api/admin/integrations/test` | merchant session | Generic tester (`{ integrationType: 'shipstation' \| 'stripe' }`). Also hits `/v2/warehouses`, but with a raw `fetch` — see Known gaps. |
| POST | `/api/onboarding/shipstation` | onboarding session | `{ apiKey }` validates live then saves; `{ skip: true }` records an honest skip. |
| POST | `/api/admin/sync/all` | merchant session | All five operations in dependency order, synchronously. |
| POST | `/api/admin/sync/{products,inventory,warehouses,inventory-warehouses,inventory-locations}` | merchant session | One operation. All five are `createSyncRoute(...)` — a name and an operation, nothing else. |
| GET/POST | `/api/admin/sync/status` | merchant session | `sync_logs` history and aggregate statistics. |
| GET/POST | `/api/cron/sync` | `Authorization: Bearer $CRON_SECRET` (or `SYNC_AUTH_TOKEN`) | **Schedules**, does not execute. Enqueues one job per store per operation. |
| POST | `/api/jobs/process` | `Authorization: Bearer $CRON_SECRET` | Drains `job_queue`. 25 jobs/batch, 50 s work budget. |
| GET/POST | `/api/admin/integrations/monitoring` | merchant session | Health, metrics, queue stats, retry hatch. |

## Credentials

**Two credentials, one per channel.** They are not interchangeable and a merchant generally needs
both:

| Channel | Credential | Who issues it | Stored as |
|---|---|---|---|
| API v2 | API key the merchant pastes in from ShipStation | ShipStation | `store_integrations.api_key_encrypted` |

The rule P0-1 established still holds and applies to both: **never show a merchant a credential the
server will not accept.** The old screen generated a pair client-side with `Math.random()` that the
server never stored. Whatever the UI displays must be exactly what was persisted.

Storage is `store_integrations.api_key_encrypted`, AES-256-GCM under `SHIPSTATION_ENCRYPTION_KEY`:

```
ssenc:v1:<iv-b64>.<tag-b64>.<ciphertext-b64>   current
b64v0:<base64>                                 legacy, tagged by migration 022
```

`SHIPSTATION_ENCRYPTION_KEY` must decode to exactly 32 bytes — hex (64 chars), base64, or 32 raw
characters; generate one with `openssl rand -base64 32`. **It fails closed**: without it every
credential read throws `ShipStationKeyError`, including the legacy branch that would otherwise have
worked. This is deliberate. If ShipStation is silently doing nothing in an environment, check this
variable first — that exact omission took down production sync once already.

Legacy rows self-heal: `upgradeCiphertext` re-encrypts on first read with a key present, so no
backfill job is needed.

**Attaching a real key locally.** No path reads a merchant key from the environment, so
`SHIPSTATION_API_KEY` in `.env.local` connects nothing — a `store_integrations` row has to exist.
`npm run shipstation:connect` is the headless equivalent of onboarding step 3: it validates the key
against `GET /v2/warehouses` first and only writes an encrypted row if that call succeeded, exactly
as rule 8 requires. `--no-verify` stores it unproven, for an environment whose egress policy blocks
api.shipstation.com. See `docs/claude-session-setup.md`.

## Webhooks

ShipStation deliveries carry no field identifying our tenant, so tenancy is in the URL. Three
checks, in `webhookSecurity.authenticateWebhook`:

1. **Path token** — `/api/shipstation/webhook/<token>`, 192 bits of randomness, resolves the store.
2. **Shared secret header** — `x-rebelshops-webhook-secret`, registered with the subscription via
   the contract's `create_webhook_request_body.headers`, compared in constant time.
3. **Body HMAC when present** — `x-shipstation-signature`, HMAC-SHA256 of the raw body.

Every failure is a generic 401. Never tell an unauthenticated caller which check failed or whether
a token maps to a real store.

**Vocabulary mismatch, called out rather than papered over:** the V2 subscription enum is
`batch | carrier_connected | order_source_refresh_complete | rate | report_complete |
sales_orders_imported | track` (we register `track`), but the *payloads* our handler switches on use
ShipStation's legacy resource types — `ITEM_ORDER_NOTIFY`, `ITEM_SHIP_NOTIFY`,
`ITEM_DELIVERED_NOTIFY`. Both are real; both are accepted on the wire. Do not "fix" one to match the
other.

## Sync

`shipments` runs last and depends on nothing: it reads back what `orderPush` sent, matching on
`external_shipment_id`. It has no stored time cursor yet and re-reads a fixed 30-day window each
run, which is safe because every write is the same update with the same values.

`SYNC_OPERATIONS` runs in dependency order and the order matters — `products` before `inventory`, so
stock levels land on rows that exist:

```
warehouses → inventory-warehouses → inventory-locations → products → inventory → shipments
```

`warehouses` is the only unpaged operation. Progress lives in `sync_runs.last_page_completed`, so a
run that dies at page 37 resumes at 38.

Two callers, one set of writers:

- **Scheduled** — `/api/cron/sync` enqueues; `/api/jobs/process` drains one page per job.
- **Manual** — `/api/admin/sync/*` loops the same `runSyncPage` inline, capped at `PAGE_CAP` (50)
  pages per operation and `DEFAULT_BUDGET_MS` (240 s, inside the 300 s `maxDuration` from
  `vercel.json`). Exceeding either sets `truncated` in the response rather than dying mid-write.

If you add an operation, add it to `SyncOperation`, `SYNC_OPERATIONS`, `PAGED_OPERATIONS` if it
pages, a writer in `sync.ts`, the `runSyncPage` switch, and `scripts/shipstation-probe.mjs`.

## Order push

`create_sales_order: true` on `POST /v2/shipments` means the call creates a *shipment* that also
creates the underlying sales order. There is no separate order-creation resource in the V2 contract,
so "push an order for the merchant to process later" is not something the API offers. Nothing here
buys a label.

`orders.fulfillment_sync_status` moves `pending → queued → pushed | failed` (plus
`not_applicable`). Idempotent by construction: a non-null `orders.shipstation_shipment_id` short-
circuits the push, so a redelivered job is a no-op. A body-level rejection is not retryable — the
payload is wrong and retrying will not fix it.

## Data model

| Table | Role |
|---|---|
| `store_integrations` | Per-store credentials, webhook token/secret/id, sync status, `configuration` JSONB. |
| `sync_runs` | Per-run cursor (migration 022): `last_page_completed`, counts, status. |
| `sync_logs` | Per-run outcome, store-scoped. Backs `/api/admin/sync/status`. |
| `job_queue` | Work. `shipstation_sync_page`, `shipstation_order_push`, plus notification types. Has `store_id` and a `dedupe_key` with a partial unique index. |
| `shipstation_warehouses`, `shipstation_inventory_warehouses`, `shipstation_inventory_locations` | Mirrors of the upstream collections. |
| `products`, `inventory` | Catalogue and stock, written by the sync writers. |
| `orders` | `fulfillment_sync_status`, `fulfillment_sync_error`, `fulfillment_sync_attempts`, `fulfillment_pushed_at`, `shipstation_shipment_id`. |
| `shipfroms` | Origin addresses (renamed from warehouses in migration 014). |

## Environment

| Variable | Required | Purpose |
|---|---|---|
| `SHIPSTATION_ENCRYPTION_KEY` | **Yes, wherever credentials are read** | 32-byte AES-256-GCM key. Fails closed. |
| `CRON_SECRET` | Yes in deployed environments | Bearer for `/api/cron/*` and `/api/jobs/process`. |
| `SYNC_AUTH_TOKEN` | Optional | Legacy operator bearer, still accepted by `/api/cron/*`. |
| `SHIPSTATION_API_KEY` | Optional | Fallback for `/api/products/[productId]` and the probe script. Per-store keys come from the database. |
| `SHIPSTATION_WAREHOUSE_ID` | Optional | Default ship-from when an order names none. |
| `NEXT_PUBLIC_APP_URL` | Yes for webhooks | Origin used to build the per-store webhook URL. |

Per-store ShipStation keys are **never** environment variables — the platform is multi-tenant.

## Testing

- `src/lib/shipstation/__tests__/manualSync.test.ts` — the bounded manual path.
- `src/app/api/onboarding/_lib/__tests__/shipstation.test.ts` — live-validation behaviour.
- The network boundary is injectable everywhere (`fetchImpl`, `sleepImpl`, `randomImpl`,
  `maxAttempts`, `baseDelayMs`, `timeoutMs`). **Use it.** Test retry and backoff for real rather
  than mocking the module away — that is the whole reason the seam exists.
- `npm run shipstation:probe` is the only check that catches a response whose *shape* changed.
- `src/lib/shipstation/__tests__/scriptCiphertext.test.ts` — pins `scripts/connect-shipstation.js`
  to this module's ciphertext format. The script cannot import `crypto.ts` (CommonJS vs. app
  TypeScript), so it carries a copy; the test decrypts a script-written value through
  `decryptSecret` so the copies cannot drift.

## Known gaps

Live at the time of writing. Confirm against `docs/decision-log.md` before acting.

- **Nothing drains `job_queue` on a schedule.** `vercel.json` declares crons for `/api/cron/sync`
  and `/api/cron/inventory-snapshot`, but not `/api/jobs/process` — so the hourly sync enqueues
  rows nothing processes, and stuck `pending` rows block re-enqueue for their dedupe keys. The
  admin sync button works because `manualSync` bypasses the queue entirely. Fix is a cron entry
  (`*/5 * * * *`), subject to plan cron limits.
- **`runFullSync` throws after enqueuing.** `inconsistent types deduced for parameter $1`
  (`42P08`, text vs varchar) in the `job_queue` insert, so it reports `0 enqueued` for a store it
  just enqueued five jobs for. Needs an explicit cast.
- **`v2Api.ts` is not held to the rules on this page.** It bypasses `shipStationFetch` (no retry,
  no backoff), reads credentials with raw `Buffer.from(..., 'base64')`, and logs
  `first_6_chars` / `last_4_chars` of the key (`v2Api.ts:288`, `:446`) plus the full shipment
  payload including customer names and addresses. Prefer `orderPush.ts` + `credentials.ts`; do not
  add call sites to `v2Api.ts`.
- **`src/app/api/warehouses/route.ts` also reads the key as raw base64** (`:25`), bypassing
  `credentials.ts`. Same defect class as above.
- **`src/app/api/admin/integrations/test/route.ts` calls `fetch` directly** (`:85`) instead of
  `shipStationFetch`, so it has no retry or rate-limit handling. It does make a real call, so it
  is honest — just not hardened. Prefer `/api/admin/integrations/shipstation/test`.
- **`enqueueOrderPush` has no callers.** `jobQueueService` handles `shipstation_order_push` and
  `processOrderPushJob` is complete, but nothing enqueues a job, so no paid order is ever pushed to
  ShipStation. The hook belongs in `billing/orders.ts::createPaidOrder`.
- **`vercel.json` `functions` config points at the retired webhook route**
  (`src/app/api/shipstation/webhook/route.ts`), not the live `[storeToken]` one, and sets no limit
  for `/api/jobs/process` despite that route's comment assuming a 60 s budget.
