# Plan: replace homegrown auth with Clerk

**Status:** proposed. Nothing here is built.

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
storefront down.

**Sign-in/up UI.** Replace the form logic in `/login` and the account step of onboarding with
Clerk's components (or `useSignIn` for a custom look — the design system will fight `<SignIn/>`
theming; budget for the hook-based route). Google OAuth is a dashboard toggle plus the component.
The `/login/page.tsx` comment about the missing "Forgot password?" link finally gets deleted for
the right reason.

**Signup → provisioning.** Today `/api/onboarding/account` creates the `users` row and the session
in one transaction. After: Clerk creates the credential, then our `user.created` webhook (Svix
signature verified — treat like the Stripe webhook, idempotent on event id) upserts the `users` row.
The onboarding route keeps doing store provisioning, keyed by the authenticated Clerk user. Webhook
also handles `user.updated` (email change) and `user.deleted` (set `is_active = false`, never
delete — FKs and audit history point here).

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

**Local dev and seeds.** A Clerk dev instance (test keys, fake SMS/email) goes into `dev-local`'s
generated `.env.local` via a documented manual step — the keys are per-developer and cannot be
committed. `seed-demo.js` keeps writing `users` rows; demo sign-in works once the seeded emails are
imported to the dev instance (extend the import script to cover seeds). `rebeldev` as the shared
password will fail Clerk's breached-password check — expect to pick a new demo password.

**E2e.** Playwright signs in through the real form today. Clerk's bot detection will block that;
`@clerk/testing` issues testing tokens for exactly this. The e2e job gains dev-instance keys as CI
secrets — the one exception to the keyless build job, which stays keyless.

## 5. Phases

Each lands green on its own; the dual-read window is deliberate so a bad step rolls back by flag.

1. **Spike + decisions.** Clerk app created, Next 16 middleware convention confirmed, `<SignIn/>`
   themed vs `useSignIn` decided, keyless degradation proven in a branch. Exit: go/no-go.
2. **Foundation.** SDK, middleware, provider, `clerk_user_id` migration, webhook route with tests.
   Old login untouched; Clerk sessions recognised by a new `resolveUser` helper that falls back to
   the legacy JWT. Both worlds valid.
3. **Front door.** `/login` and onboarding account step on Clerk; Google enabled; new signups are
   Clerk-native. Import script run for existing + seeded users. Old `/api/auth/login` returns 410.
4. **The 80 routes.** `requireAuth` internals swapped to Clerk-only; Bearer/localStorage transport
   deleted; `AdminContext` simplified. This is one focused PR — the call sites do not change.
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
