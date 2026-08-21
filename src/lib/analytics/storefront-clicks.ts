/**
 * Buyer-side click tracking for merchant storefronts — the pure, testable half.
 *
 * ## Why this exists next to `visitors` rather than replacing it
 *
 * `visitors` is `UNIQUE (store_id, ip_address, visited_date)`: it deliberately keeps *at most one
 * row per IP per day*, which makes it a unique-visitor counter and structurally unable to count
 * clicks. `useVisitorTracking` / `POST /api/visitors` still own that number and are untouched.
 * This module owns the complementary one: **every** buyer event, so the platform console can say
 * "12,400 clicks" as well as "900 people", and can break traffic down by event type, path,
 * referrer and campaign. Neither is a duplicate of the other; deleting either loses a real number.
 *
 * ## Why the logic lives here and not in the route handler
 *
 * `route.ts` is a thin adapter: read headers, read the body, call {@link recordStorefrontClick},
 * turn the outcome into a status code. Everything that can be *wrong* — an unknown event type, a
 * crawler, an over-long path, a slug that resolves to no store — is decided here, against injected
 * boundaries (`resolveStoreId`, `insertEvent`) rather than a mocked database module. That is what
 * lets the unit tests exercise the real decision logic, per the repo's "inject the boundary" rule.
 *
 * ## Privacy decisions, stated plainly
 *
 * 1. **The raw IP never leaves this function.** It is salted-SHA-256'd into `ip_hash CHAR(64)` and
 *    the address itself is never stored, logged, or returned. The salt comes from
 *    `STOREFRONT_CLICK_IP_SALT`; see {@link ipHashSalt} for what an unset salt costs you.
 * 2. **Bots are dropped, not recorded.** See {@link classifyDevice}.
 * 3. **`DNT` / `Sec-GPC` are honoured** — suppressed on the client before a request is made, and
 *    again here if a request arrives with either header set. A hashed-IP aggregate count is
 *    arguably defensible under both signals, but the operator dashboards this feeds are ordinary
 *    product analytics, not a legal obligation, and honouring the signal costs a documented
 *    undercount rather than a wrong number. Undercounting people who asked not to be counted is
 *    the failure mode we can live with.
 *
 * Nothing in here logs a secret, an address, or a fragment of either.
 */

import { createHash } from 'node:crypto';

/**
 * The event types the database's CHECK constraint accepts.
 *
 * This list is the application-side mirror of
 * `storefront_click_events_type_ck` (migration 040). It is validated *before* the insert because
 * an unknown value would otherwise be a 500 from a public, unauthenticated endpoint — a free way
 * for anyone to fill the error log.
 */
export const STOREFRONT_CLICK_EVENT_TYPES = [
  'storefront_view',
  'product_view',
  'add_to_cart',
  'checkout_start',
  'outbound_click',
] as const;

/** One of the five event types migration 040 allows. */
export type StorefrontClickEventType = (typeof STOREFRONT_CLICK_EVENT_TYPES)[number];

/** How a hit was classified from its user agent. `bot` never reaches the database. */
export type StorefrontClickDevice = 'desktop' | 'mobile' | 'tablet' | 'bot';

/** The JSON body `POST /api/storefront/click` accepts. Every field is untrusted input. */
export interface StorefrontClickInput {
  storeId?: unknown;
  storeSlug?: unknown;
  eventType?: unknown;
  path?: unknown;
  productId?: unknown;
  visitorId?: unknown;
  sessionId?: unknown;
  referrer?: unknown;
  utmSource?: unknown;
  utmMedium?: unknown;
  utmCampaign?: unknown;
}

/** Request-derived facts the client cannot be trusted to supply. */
export interface StorefrontClickContext {
  /** Client address, already extracted from the proxy headers. Hashed, never stored. */
  ip: string | null;
  /** Raw user agent, used for bot and device classification. */
  userAgent: string | null;
  /** Two-letter country from the edge (`x-vercel-ip-country`), if the platform provided one. */
  country?: string | null;
  /** True when the request carried `DNT: 1` or `Sec-GPC: 1`. */
  privacySignal?: boolean;
}

/** A validated row, ready to insert. Column widths already enforced. */
export interface StorefrontClickRecord {
  storeId: string;
  eventType: StorefrontClickEventType;
  path: string | null;
  productId: string | null;
  visitorId: string | null;
  sessionId: string | null;
  referrerDomain: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  country: string | null;
  device: StorefrontClickDevice;
  ipHash: string | null;
  userAgent: string | null;
}

/** Why a well-formed beacon was deliberately not written. Not an error. */
export type StorefrontClickSkipReason = 'bot' | 'privacy_signal';

/** Why a beacon was rejected. Each maps to a 4xx in the route. */
export type StorefrontClickRejectReason =
  | 'invalid_body'
  | 'invalid_event_type'
  | 'missing_store'
  | 'unknown_store';

/** What {@link recordStorefrontClick} decided. */
export type StorefrontClickOutcome =
  | { status: 'recorded'; record: StorefrontClickRecord }
  | { status: 'skipped'; reason: StorefrontClickSkipReason }
  | { status: 'rejected'; reason: StorefrontClickRejectReason };

/**
 * The two boundaries this module refuses to reach across itself.
 *
 * Injected so the endpoint's real validation, resolution and classification logic can be tested
 * against in-memory implementations instead of a mocked `db` module.
 */
export interface StorefrontClickDeps {
  /**
   * Turn a store id or slug into a confirmed store id.
   * @param ref - Exactly one of `storeId` or `storeSlug`, already type-checked
   * @returns The store's id, or `null` when no such store exists
   */
  resolveStoreId(ref: { storeId?: string; storeSlug?: string }): Promise<string | null>;
  /**
   * Persist one validated event.
   * @param record - The row to write
   * @returns Nothing; throwing is the only way to report failure
   */
  insertEvent(record: StorefrontClickRecord): Promise<void>;
}

/**
 * The fallback salt used when `STOREFRONT_CLICK_IP_SALT` is unset.
 *
 * It is a literal in a public repository, so it is not a secret: with this value in force, anyone
 * who guesses a candidate IP can hash it and confirm whether that address appears in the table.
 * That is the entire consequence, and it is why the variable is documented as `[optional]` in
 * `.env.example` with an explicit "set this in production" note. The alternative — a random
 * per-process salt — would silently make `ip_hash` uncorrelatable across restarts and deploys,
 * turning a coarse de-duplication signal into noise, which is a worse failure because it looks
 * like it is working.
 */
const FALLBACK_IP_SALT = 'rebelshops-storefront-click-v1';

/**
 * Resolve the salt used to hash client addresses.
 *
 * Read per call rather than captured at module load, because a serverless module can outlive an
 * environment change and this must never be the reason a deploy's hashes disagree with itself.
 *
 * @returns The configured salt, or the documented public fallback
 */
export function ipHashSalt(): string {
  const configured = process.env.STOREFRONT_CLICK_IP_SALT;
  return configured && configured.trim().length > 0 ? configured.trim() : FALLBACK_IP_SALT;
}

/**
 * Hash a client address into the `ip_hash CHAR(64)` column.
 *
 * SHA-256 over `salt + ':' + ip`. The salt is prefixed rather than appended so that a truncated
 * or length-extended input cannot collide with a shorter address plus salt.
 *
 * @param ip - The client address, or null when the platform gave us none
 * @param salt - Salt to use; defaults to {@link ipHashSalt}
 * @returns 64 lowercase hex characters, or null when there was no address to hash
 */
export function hashClientIp(ip: string | null | undefined, salt: string = ipHashSalt()): string | null {
  if (!ip) return null;
  const trimmed = ip.trim();
  if (!trimmed) return null;
  return createHash('sha256').update(`${salt}:${trimmed}`).digest('hex');
}

/**
 * Extract the client address from the proxy headers Vercel and most reverse proxies set.
 *
 * `x-forwarded-for` is a comma-separated chain appended to by each hop, so the *first* entry is
 * the client. It is spoofable by the client, which is fine: the only thing it feeds is a hashed,
 * coarse de-duplication signal, never an authorisation decision.
 *
 * @param headers - The incoming request's headers
 * @returns The client address, or null when no header carried one
 */
export function clientIpFromHeaders(headers: Headers): string | null {
  const forwarded = headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  const real = headers.get('x-real-ip')?.trim();
  return real || null;
}

/**
 * Whether the request asked not to be tracked.
 *
 * `DNT: 1` is the legacy signal; `Sec-GPC: 1` is Global Privacy Control, which some US state laws
 * treat as a binding opt-out. Both are honoured. The client suppresses the beacon before it is
 * sent, so this is the belt to that braces — it catches a stale bundle or a hand-rolled caller.
 *
 * @param headers - The incoming request's headers
 * @returns True when either signal is set
 */
export function hasPrivacySignal(headers: Headers): boolean {
  return headers.get('dnt') === '1' || headers.get('sec-gpc') === '1';
}

/**
 * Substrings that identify a non-human user agent.
 *
 * Deliberately small and boring. A large heuristic list is a maintenance burden that still misses
 * the crawler written last week, so this covers the traffic that actually shows up on a public
 * storefront — search engines, social-card unfurlers, uptime checkers, headless browsers and the
 * common HTTP clients — and accepts that a determined scraper spoofing Chrome gets counted. The
 * goal is "the dashboard is not dominated by Googlebot", not "perfect classification".
 */
const BOT_SIGNATURES = [
  'bot', 'crawl', 'spider', 'slurp', 'headless', 'phantomjs', 'puppeteer', 'playwright',
  'selenium', 'lighthouse', 'pagespeed', 'preview', 'monitor', 'uptime', 'pingdom',
  'curl/', 'wget', 'python-requests', 'httpx', 'axios/', 'go-http-client', 'java/', 'okhttp',
  'facebookexternalhit', 'whatsapp', 'telegrambot', 'slackbot', 'discordbot', 'embedly',
  'feedfetcher', 'ahrefs', 'semrush', 'mj12', 'dotbot', 'petalbot', 'bytespider', 'gptbot',
  'claudebot', 'perplexitybot', 'applebot', 'archive.org_bot',
];

/** Tablet markers checked before the generic mobile markers, because Android tablets say both. */
const TABLET_SIGNATURES = ['ipad', 'tablet', 'kindle', 'silk/', 'playbook', 'nexus 7', 'nexus 10'];

/** Phone markers. `android` only reaches here once the tablet check has declined it. */
const MOBILE_SIGNATURES = ['iphone', 'ipod', 'android', 'mobile', 'windows phone', 'blackberry', 'opera mini'];

/**
 * Whether a user agent belongs to a crawler, scraper or synthetic client.
 *
 * @param userAgent - The raw `user-agent` header, if any
 * @returns True when the agent looks non-human. An empty agent counts as a bot: every real browser
 *          sends one, so a missing header is a script.
 */
export function isBotUserAgent(userAgent: string | null | undefined): boolean {
  const ua = (userAgent ?? '').toLowerCase().trim();
  if (!ua) return true;
  return BOT_SIGNATURES.some((signature) => ua.includes(signature));
}

/**
 * Classify a user agent into the `device` column's four values.
 *
 * `bot` is returned so the caller can decide what to do about it, but a `bot` classification never
 * reaches the database — see {@link recordStorefrontClick}. Dropping at the door, rather than
 * storing `device = 'bot'` and filtering in every query, is deliberate: `storefront_click_daily`
 * is maintained by an `AFTER INSERT` trigger that cannot see a `WHERE` clause, so anything written
 * is already counted in the rollup by the time a dashboard query could exclude it. One query
 * somewhere forgetting the filter would then quietly inflate the platform's headline number. The
 * only place a crawler cannot leak into an operator dashboard is before the insert.
 *
 * @param userAgent - The raw `user-agent` header, if any
 * @returns The device class
 */
export function classifyDevice(userAgent: string | null | undefined): StorefrontClickDevice {
  if (isBotUserAgent(userAgent)) return 'bot';
  const ua = (userAgent ?? '').toLowerCase();
  if (TABLET_SIGNATURES.some((signature) => ua.includes(signature))) return 'tablet';
  if (MOBILE_SIGNATURES.some((signature) => ua.includes(signature))) return 'mobile';
  return 'desktop';
}

/**
 * Reduce a referrer URL to its registrable host.
 *
 * The full URL is not stored: it can carry a search query, a session token or a private path from
 * whatever site linked here, none of which the operator console has a use for. The host answers
 * the only question asked of it — "where is this traffic coming from".
 *
 * Same-origin referrers are the caller's business to filter; this function reports what it is
 * given. A malformed or non-HTTP referrer returns null rather than throwing.
 *
 * @param referrer - A referrer URL, or null
 * @returns The lowercased hostname without a leading `www.`, or null
 */
export function referrerDomain(referrer: string | null | undefined): string | null {
  if (!referrer || typeof referrer !== 'string') return null;
  try {
    const url = new URL(referrer);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    return host ? host.slice(0, 255) : null;
  } catch {
    return null;
  }
}

/** Postgres rejects a value wider than its column, so every string is clipped on the way in. */
function clip(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, max);
}

/** UUID shape check, so a malformed id fails validation instead of the insert. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Whether a value is one of the five accepted event types.
 *
 * @param value - Untrusted input
 * @returns True when the value is safe to send to the CHECK-constrained column
 */
export function isStorefrontClickEventType(value: unknown): value is StorefrontClickEventType {
  return typeof value === 'string'
    && (STOREFRONT_CLICK_EVENT_TYPES as readonly string[]).includes(value);
}

/**
 * Validate, classify and (usually) persist one storefront click beacon.
 *
 * The whole endpoint, minus HTTP. The order of checks is chosen so the cheapest rejection happens
 * first and no database work is done for traffic that will not be stored: shape, then event type,
 * then the privacy signal, then the bot check, and only then the store lookup and the insert.
 *
 * @param input - The parsed request body. Every field is treated as untrusted.
 * @param context - Request-derived facts (address, agent, country, privacy signal)
 * @param deps - The injected store-resolution and insert boundaries
 * @returns What was decided: recorded, deliberately skipped, or rejected
 */
export async function recordStorefrontClick(
  input: StorefrontClickInput | null | undefined,
  context: StorefrontClickContext,
  deps: StorefrontClickDeps,
): Promise<StorefrontClickOutcome> {
  if (!input || typeof input !== 'object') {
    return { status: 'rejected', reason: 'invalid_body' };
  }

  const eventType = input.eventType ?? 'storefront_view';
  if (!isStorefrontClickEventType(eventType)) {
    return { status: 'rejected', reason: 'invalid_event_type' };
  }

  const storeId = typeof input.storeId === 'string' && UUID_RE.test(input.storeId.trim())
    ? input.storeId.trim()
    : undefined;
  const storeSlug = clip(input.storeSlug, 255) ?? undefined;
  if (!storeId && !storeSlug) {
    return { status: 'rejected', reason: 'missing_store' };
  }

  if (context.privacySignal) {
    return { status: 'skipped', reason: 'privacy_signal' };
  }

  const device = classifyDevice(context.userAgent);
  if (device === 'bot') {
    return { status: 'skipped', reason: 'bot' };
  }

  const resolvedStoreId = await deps.resolveStoreId(storeId ? { storeId } : { storeSlug });
  if (!resolvedStoreId) {
    return { status: 'rejected', reason: 'unknown_store' };
  }

  const productId = typeof input.productId === 'string' && UUID_RE.test(input.productId.trim())
    ? input.productId.trim()
    : null;

  const country = clip(context.country, 2);

  const record: StorefrontClickRecord = {
    storeId: resolvedStoreId,
    eventType,
    path: clip(input.path, 512),
    productId,
    visitorId: clip(input.visitorId, 64),
    sessionId: clip(input.sessionId, 64),
    referrerDomain: referrerDomain(typeof input.referrer === 'string' ? input.referrer : null),
    utmSource: clip(input.utmSource, 128),
    utmMedium: clip(input.utmMedium, 128),
    utmCampaign: clip(input.utmCampaign, 128),
    country: country ? country.toUpperCase() : null,
    device,
    ipHash: hashClientIp(context.ip),
    userAgent: clip(context.userAgent, 1024),
  };

  await deps.insertEvent(record);
  return { status: 'recorded', record };
}

// ---------------------------------------------------------------------------
// Server-only helper
//
// Everything above is pure and boundary-injected. The one function below reaches for the request's
// session because the question it answers — "is this the merchant looking at their own shop?" —
// has no meaning without one. It is kept here rather than duplicated into each storefront page so
// that the layout, the product page and the checkout page all make the same decision; a
// storefront_view that is suppressed and a product_view that is not would be worse than either.
// ---------------------------------------------------------------------------

/**
 * Whether the current request is the shop's own owner looking at it.
 *
 * Buyer-click tracking exists to count *shoppers*. A merchant refreshing their own storefront
 * twenty times after publishing it is not twenty shoppers, and on a new store — where the numbers
 * are small enough for it to dominate them — that is the single largest source of fake traffic.
 *
 * The check is cheap by construction. No session cookie means no work at all, which is the shopper
 * case and therefore the overwhelming majority of storefront traffic. A session whose JWT already
 * names this store is answered from the token. Only a signed-in user whose token predates their
 * store — the onboarding wizard mints the session before the store row exists — pays one indexed
 * primary-key read.
 *
 * Any failure is treated as "not the owner": the cost of a false negative is one inflated click,
 * and the cost of a false positive is a storefront that silently under-reports its traffic.
 *
 * **Known limitation, stated rather than papered over:** this only recognises a merchant who is
 * carrying their session cookie. The same merchant in a private window, in another browser, or
 * signed out is indistinguishable from a shopper and is counted as one. Closing that would need
 * device fingerprinting, which is a far worse trade than a slightly generous number.
 *
 * @param storeId - The store being rendered
 * @returns True only for an authenticated owner of this store
 */
export async function isMerchantSelfView(storeId: string): Promise<boolean> {
  try {
    // Imported lazily: `next/headers` is only resolvable inside a request scope, and this module's
    // pure half is unit-tested outside one.
    const { cookies } = await import('next/headers');
    const token = (await cookies()).get('session')?.value;
    if (!token) return false;

    const { verifySession } = await import('@/lib/auth/session');
    const session = await verifySession(token);
    if (!session?.userId) return false;
    if (session.storeId === storeId) return true;

    const { db } = await import('@/lib/database/connection');
    const owner = await db.query<{ owner_id: string }>(
      'SELECT owner_id FROM stores WHERE id = $1 LIMIT 1',
      [storeId],
    );
    return owner.rows[0]?.owner_id === session.userId;
  } catch {
    return false;
  }
}
