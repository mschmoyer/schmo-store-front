# Plan: replace homegrown auth with Clerk

**Status:** in progress — being implemented in one pass on `claude/auth-system-review-nbf4mz`
(Clerk keys exist in Vercel for preview and production; this session builds keyless).

**Goal:** merchants sign in through Clerk — email/password, Google, password reset, MFA, bot and
brute-force protection all handled by the vendor — while everything Clerk must never know about
(`store_id` scoping, `is_admin`, billing, ShipStation credentials) stays exactly where it is, in our
Postgres, checked the way `platform-admin.ts` already checks it.

---

## 1. What Clerk replaces, and what it must not touch

The current system is homegrown end to end: bcrypt hashes in `users.password_hash`, HS256 JWTs from
`src/lib/auth/session.ts`, delivered both as an httpOnly cookie and as a Bearer token the admin app
keeps in `localStorage`. It has no password reset, no OAuth, no rate limiting, and `destroySession()`
is a documented no-op. Those four gaps are the reason for this plan; each is Clerk's core product.

| Concern | Today | After |
|---|---|---|
| Who are you? | Our JWT (`session.ts`) | Clerk session |
| Password storage, reset, Google, MFA, lockout | Missing or homegrown | Clerk |
| Which store may you touch? | `users`/`stores` join, `store_id` in every query | Unchanged |
| Platform operator? | `users.is_admin`, re-read per request | Unchanged |
| Shoppers on storefronts | Anonymous, no accounts | Unchanged — out of scope |

**The `users` table stays the identity spine.** Every FK in the schema points at `users.id`, and
`platform-admin.ts`'s rule — *the session says who you are, the database says what you may do* —
survives verbatim. Clerk becomes the thing that establishes "who", nothing more. One new column:

```sql
ALTER TABLE users ADD COLUMN clerk_user_id VARCHAR(255) UNIQUE;
```

Nullable during migration, backfilled as users are imported, `NOT NULL` once the old login dies.

**Shoppers are explicitly out of scope.** Storefront checkout is guest-only today (`customer_email`
on the order). Charging Clerk MAU for shoppers would also be the one way this gets expensive;
merchants number in the hundreds and are free-tier forever, shoppers would not be.

## 2. The one abstraction that keeps this small

~80 API routes call `requireAuth(request)` / `getSessionFromRequest` / `getSessionFromCookies` and
get back a `UserSession` (`userId`, `email`, `storeId`, …). That interface is good and nothing
above it should notice the change. The whole migration hinges on reimplementing it once:

```
requireAuth(request)
  → Clerk auth() resolves clerk_user_id
  → SELECT id, email, …, store_id FROM users JOIN stores … WHERE clerk_user_id = $1
    (no row yet → just-in-time creation, §3)
  → same UserSession shape as today
```

`userId` keeps meaning `users.id` (our UUID), never the Clerk id — every audit row, FK and query
already speaks it. The DB hit per request is new but is the same price `requirePlatformAdmin`
already pays on the console, and it buys instant revocation of `storeId` changes, which the current
JWT bakes in for seven days (a known defect).

`platform-admin.ts` needs only its `resolveSession` swapped to the same helper; rules 1–3 in its
header comment do not move.

## 3. The pieces

**Middleware.** `@clerk/nextjs` wants its middleware wrapper at the app edge. This repo has no
middleware file today, and **this Next.js 16 has breaking conventions** — confirm the file name and
matcher syntax against `node_modules/next/dist/docs/` before writing it, per the repo rule. Matcher
covers `/admin`, `/platform`, `/onboarding`, `/api/**` except public storefront and webhook routes;
`/store/**` and marketing pages stay outside it entirely so an unconfigured Clerk cannot take a
storefront down. The middleware is convenience (redirects, session refresh), **not the security
boundary**: every protected route keeps its own `requireAuth`/`requirePlatformAdmin` call, so a
matcher mistake fails to a 401, never to an open route.

**Sign-in/up UI.** Replace the form logic in `/login` and the account step of onboarding with
Clerk's components (or `useSignIn` for a custom look — the design system will fight `<SignIn/>`
theming; budget for the hook-based route). Google OAuth is a dashboard toggle plus the component.
The `/login/page.tsx` comment about the missing "Forgot password?" link finally gets deleted for
the right reason.

**Signup → provisioning: just-in-time, webhook as reconciliation.** Today `/api/onboarding/account`
creates the `users` row and the session in one transaction. A webhook-only replacement has a race
baked in: Clerk delivers `user.created` asynchronously, and the freshly signed-up merchant hits
onboarding before it lands — a 401 on their first authenticated request. So the authoritative
creation path is **just-in-time in `requireAuth`**: a valid Clerk session whose `clerk_user_id` has
no `users` row upserts one right there, from the verified session claims. The `user.created` /
`user.updated` / `user.deleted` webhook (Svix signature verified — treat like the Stripe webhook,
idempotent on event id) then only reconciles: email changes, and `user.deleted` → `is_active =
false`, never a row delete — FKs and audit history point here. The onboarding route keeps doing
store provisioning, keyed by the authenticated Clerk user.

**Linking rule (the account-takeover guard).** The *only* join key between Clerk and `users` is
`clerk_user_id`. Email is never a lookup key on an authenticated path: an attacker who registers a
Clerk account claiming a merchant's address must never bind to that merchant's row. The single
exception is the one-shot import script (§ below), which runs offline against users we created, and
even there the write is refused if the target row already carries a different `clerk_user_id`. JIT
creation of a *new* row on an email that already exists un-linked is a hard error surfaced to
support, not an auto-link — and Clerk is configured to require verified email before a session
exists at all.

**The native-login escape hatch.** The legacy email/password system does not die at cutover; it
moves to `/native-login` behind `ENABLE_NATIVE_LOGIN` (`true`/`false`; unset defaults to enabled
outside production, disabled in production). The flag gates the page, `/api/auth/login`,
`/api/admin/auth/login` (404 when off) *and* legacy-JWT acceptance in `requireAuth` — off means
legacy sessions stop authenticating, not just that the form hides. This supersedes the phased
410/secret-rotation choreography below: the kill switch is an env var flip, and local dev and e2e
run keyless on the native path.

**Kill the Bearer/localStorage transport.** `AdminContext` and the fetch hooks stop storing any
token; Clerk's cookie rides along automatically, same-origin. This deletes the standing XSS-steals-
a-session risk and the dual-transport bug class `platform-admin.ts`'s comment complains about.
`session-cookie.ts`'s two-path clearing dance dies with the cookie it clears.

**Existing users.** Clerk imports bcrypt hashes (`password_hasher: 'bcrypt'`) through its user
import API, so real users keep their passwords with no forced reset. A one-shot
`scripts/import-users-to-clerk.mjs` walks `users`, imports, writes back `clerk_user_id`. At
launch scale this may be one dry run and a handful of rows.

## 4. Environment, degradation, CI

New variables in `.env.example`: `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` `[optional]`,
`CLERK_SECRET_KEY` `[optional]`, `CLERK_WEBHOOK_SIGNING_SECRET` `[optional]`.

They are `[optional]` because CI's keyless build and the graceful-degradation rule demand it:
unconfigured Clerk renders a labelled "sign-in not configured" state on `/login` and 401s on
protected APIs — it must not throw at import time. That is the exact regression class the
`JWT_SECRET` lazy check exists for; Clerk's provider touches the root layout, which is client-
adjacent, so this needs the same treatment and an e2e test proving the customizer still renders
keyless. Auth itself still fails closed: no keys means nobody signs in, never "everybody does".

**Local dev and seeds: the demo credential becomes dev-only, and production gets a real account.**
Today every seeded user shares the published password `rebeldev`. With the native-login escape
hatch above, that credential's blast radius shrinks to environments where `ENABLE_NATIVE_LOGIN`
resolves true — development and e2e, where the seeds live and Clerk keys don't. In production the
flag defaults off, so the seeded credential is unusable there by construction, and the demo account
is a **real Clerk account**: created once through the actual signup flow (its owner holds the
credential; nothing committed), linked to the seeded owner row by backfilling `clerk_user_id` via
`scripts/import-users-to-clerk.mjs --link-owner`. Seeded users are never imported to Clerk. The
JIT sentinel rule still applies where no password should exist: `password_hash` is `NOT NULL`, so
credential-less rows (e.g. JIT-created Clerk users) carry a literal `'!'` — not a valid bcrypt
hash, so `bcrypt.compare` can never return true against it.

**E2e.** Playwright keeps signing in through the native form with the seeded credential — keyless,
via `/native-login`, with `ENABLE_NATIVE_LOGIN` resolving true in dev and CI. Testing the
Clerk-configured branch end-to-end (`@clerk/testing` tokens against a dev instance) is future work
once CI carries dev-instance keys; the keyless render of `/login` and the customizer is what the
suite proves today.

## 5. Phases

Each lands green on its own; the dual-read window is deliberate so a bad step rolls back by flag.

1. **Spike + decisions.** Clerk app created, Next 16 middleware convention confirmed, `<SignIn/>`
   themed vs `useSignIn` decided, keyless degradation proven in a branch. Exit: go/no-go.
2. **Foundation.** SDK, middleware, provider, `clerk_user_id` migration, webhook route with tests.
   Old login untouched; Clerk sessions recognised by a new `resolveUser` helper that falls back to
   the legacy JWT. Both worlds valid.
3. **Front door.** `/login` and onboarding account step on Clerk; Google enabled; new signups are
   Clerk-native. Import script run for existing real users; seeded users are deliberately not
   imported (§4). Only after the import is verified complete — every active real user carries a
   `clerk_user_id` — does `/api/auth/login` flip to 410; the other order locks merchants out.
4. **The 80 routes.** `requireAuth` internals swapped to Clerk-only; Bearer/localStorage transport
   deleted; `AdminContext` simplified. This is one focused PR — the call sites do not change.
   Removing the legacy fallback does not expire legacy JWTs already in the wild (they live 7 days
   and cannot be revoked — the defect this plan exists to fix), so **rotate `JWT_SECRET` in the
   same deploy**: every outstanding legacy token dies at once instead of trickling out.
5. **Demolition.** `session.ts` signing, `password.ts`, `admin/auth/login`, legacy fallback,
   `JWT_SECRET` and its lazy-check machinery, dead columns (`password_hash` →
   `email_verification_token` → `password_reset_*`, which were never wired to anything). Update
   `.env.example`, `README.md`, this doc's status, decision log. Minor version bump.

## 6. Open questions (answer during phase 1)

- **`/api/admin/auth/login`** duplicates `/api/auth/login` almost exactly. Confirm nothing but the
  admin app calls it and fold it into the same 410.
- **Vercel preview deploys** need the dev-instance keys or the labelled degraded state — decide
  which per environment.
- **Session lifetime.** Clerk's default (7-day, sliding) vs today's fixed 7 days; pick deliberately.
- **Custom domain** (`clerk.rebelshops.com`) is a production-instance requirement — DNS work,
  schedule it before phase 3, not during.

## 7. What this plan refuses to do

- Put `is_admin` or `store_id` in Clerk metadata. Clerk says who; Postgres says what you may do.
- Migrate shoppers, or add shopper accounts "while we're in there".
- Big-bang cutover. The legacy fallback in phase 2 exists so phases 3 and 4 can ship separately.
- Trust `user.deleted` to cascade. Deactivation only.
