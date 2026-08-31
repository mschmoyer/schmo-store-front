# Schmo Store Front

**RebelShops** — a multi-tenant e-commerce platform built with Next.js 16, TypeScript and Mantine UI.
Merchants create a storefront, connect their own ShipStation account for catalogue and inventory,
and take payments through Stripe Connect. Production runs at **rebelshops.com**.

Working on this repo with an AI agent? Start at [`CLAUDE.md`](CLAUDE.md); the two integrations have
their own instruction files at [`src/lib/shipstation/CLAUDE.md`](src/lib/shipstation/CLAUDE.md) and
[`src/lib/stripe/CLAUDE.md`](src/lib/stripe/CLAUDE.md).

## Tech Stack

### Frontend
- **Framework**: Next.js 16 (App Router) with Turbopack, the default bundler for both `dev` and `build`
- **UI Library**: Mantine v8 with form validation and notifications
- **Styling**: TailwindCSS v4 with PostCSS
- **Icons**: Tabler Icons (@tabler/icons-react), FontAwesome
- **Typography**: Geist font family (sans and mono)
- **Animations**: Canvas Confetti, React Confetti
- **State Management**: React hooks, localStorage

### Backend & APIs
- **Database**: PostgreSQL with structured migrations
- **Authentication**: JWT tokens, bcrypt hashing
- **External APIs**: ShipStation V2 (`api.shipstation.com`), Stripe (pinned API version), OpenAI
- **Background Jobs**: `job_queue` table drained over HTTP, scheduled by Vercel Cron
- **File Processing**: Sharp for image optimization
- **PDF Generation**: @react-pdf/renderer

### Development & Testing
- **Language**: TypeScript with strict configuration
- **Testing**: Jest (unit tests), Playwright (e2e), React Testing Library
- **Linting**: ESLint with Next.js configuration
- **Package Management**: npm with Node 22 (`.nvmrc`)
- **Development**: Hot reload with Turbopack

### UI Components & Features
- **Drag & Drop**: @dnd-kit for sortable interfaces
- **Forms**: React Hook Form with Zod validation
- **Rich Text**: Markdown editor with preview
- **Data Visualization**: Custom analytics dashboards
- **Responsive Design**: Mobile-first approach
- **Accessibility**: ARIA labels and semantic HTML

### Integrations
- **ShipStation**: Per-store V2 API key, catalogue and inventory sync, webhooks, order push —
  see [`src/lib/shipstation/CLAUDE.md`](src/lib/shipstation/CLAUDE.md)
- **Stripe**: Platform subscription billing and storefront checkout via Connect —
  see [`src/lib/stripe/CLAUDE.md`](src/lib/stripe/CLAUDE.md) and [`docs/payments.md`](docs/payments.md)
- **AI**: OpenAI integration for content generation
- **Social**: React Share for social media integration
- **Security**: Input sanitization with DOMPurify and sanitize-html

## Running the stack locally

### One command

```bash
nvm use && npm install
npm run dev-local
```

That is the whole thing. It finds your Postgres, creates the database if it is missing,
writes `.env.local` with a generated `JWT_SECRET`, applies migrations, seeds demo data,
prints your sign-in credentials, and starts the dev server.

Every step is idempotent, so re-running it is safe and fast — it skips whatever is
already done.

```
npm run dev-local              # set up what is missing, then run
npm run dev-local -- --fresh   # also re-seed demo data
npm run dev-local -- --setup   # set up but do not start the server
```

**Sign in:** at **`/native-login`**, with `demo@schmostore.com` / `rebeldev` — every seeded user
shares that password. `/login` is Clerk's sign-in and renders a labelled "not configured" state
without Clerk keys, which is what a local container has.

### On a bare container (Claude Code on the web, CI sandboxes)

```bash
npm run setup:local     # starts Postgres too, then does everything dev-local does
```

`dev-local` expects a Postgres that is already running. `setup:local` is the superset for a
container that has the server package installed but no server running: it starts (or creates)
the cluster, gives the `postgres` role a password, creates the database, and hands off to
`dev-local --setup`. About five seconds on a warm container, and no Docker anywhere.

In Claude Code on the web this runs automatically at session start via
`.claude/hooks/session-start.sh`. Full runbook, including where ShipStation credentials go:
[`docs/claude-session-setup.md`](docs/claude-session-setup.md).

### Why it probes for credentials

Postgres defaults differ by platform and there is no connection string that is correct
everywhere. Homebrew on macOS creates a superuser named after your OS account, with trust
auth and usually no `postgres` role at all. Docker and most Linux packages do create
`postgres`, often with a password. `dev-local` tries the plausible candidates and uses
whichever actually connects, rather than documenting one and hoping.

If you already have a `DATABASE_URL` in `.env.local` it is always used as-is, on the
assumption that you meant it. That also means a stale one is not routed around — if it
fails, `dev-local` reports the actual Postgres error and whether the server answered at
all, so you can tell "not running" apart from "wrong password".

### Running Postgres in Docker

There is no native install requirement. A dedicated container keeps this project's data
separate from anything else on your machine:

```bash
docker run -d --name rebelshops-postgres \
  -e POSTGRES_USER=rebelshops \
  -e POSTGRES_PASSWORD=rebelshops_dev \
  -e POSTGRES_DB=rebelshops \
  -p 5436:5432 --restart unless-stopped postgres:17
```

Port 5436 is deliberate — 5432 is often already taken by another project's container.
Put the matching URL in `.env.local` before the first `dev-local` run, since the probe
only guesses at 5432:

```
DATABASE_URL=postgresql://rebelshops:rebelshops_dev@127.0.0.1:5436/rebelshops
```

To find the values for a container you already have, the user and password come from its
environment and the port is the host side of its mapping:

```bash
docker ps --format '{{.Names}}\t{{.Ports}}'
docker inspect <name> --format '{{range .Config.Env}}{{println .}}{{end}}' | grep POSTGRES
```

### Prerequisites

- **Node 22** — `nvm use` reads `.nvmrc`
- **PostgreSQL 16+** — running locally or in Docker (see above)
- Nothing else. Stripe, ShipStation and OpenAI keys are optional; every feature that needs
  one degrades to a labelled "not configured" state rather than crashing.

### What you get

| URL | What it is |
|---|---|
| `/` | Marketing site |
| `/pricing` | Plan, comparison, FAQ. Quotes a `/join/<code>` signup coupon's real offer instead of the standard price when that link's cookie is present. |
| `/join/<code>` | Redeems a platform signup coupon link, then redirects into `/create-store` |
| `/store/demo-electronics` | **Basecamp Audio** — dark, high-contrast preset |
| `/store/artisan-craft` | **Fernwood Goods** — warm editorial preset |
| `/store/fitness-pro` | **Ironline Fitness** — bright, roomy preset |
| `/admin` | Merchant dashboard |
| `/admin/design` | Storefront theme customizer with live preview |
| `/platform` | **Platform operator console** — every tenant in one screen (needs `is_admin`) |
| `/platform/customers` | Every merchant, paginated, with drill-through to one store |
| `/platform/coupons` | Issue and track platform signup coupons — the console's first write surface (needs `is_admin`) |
| `/create-store` | Merchant onboarding |
| `/dev/design-system` | Every UI primitive in every state |

The three demo storefronts deliberately use three different presets, so the theme engine
is visibly doing something rather than recolouring one design.

### Doing it by hand

```bash
createdb rebelshops
cp .env.example .env.local          # then set DATABASE_URL and JWT_SECRET
npm run db:migrate
npm run db:seed-demo
npm run db:verify                   # optional: prove the trigger-backed schema rules still hold
npm run dev
```

The app reads **`.env.local`**, not `.env`. `DATABASE_URL` is the only variable without a
working fallback.

### Tests

```bash
npm run test                                # Jest unit tests
npm run test:e2e -- --project=chromium      # Playwright, starts the dev server itself
```

Playwright's `webServer` reuses an already-running `npm run dev` and starts one otherwise, so
the suite no longer depends on remembering to start the server first. The `--` before the flags
is required — without it npm drops them and all three browser projects run.

### Optional integrations

| Variable | Unlocks | Without it |
|---|---|---|
| `STRIPE_SECRET_KEY` + `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Paid checkout and subscription billing | Checkout shows "payments not configured" — except for $0 orders, which are placed without Stripe |
| `STRIPE_WEBHOOK_SECRET` | Order creation on payment | Webhooks rejected |
| `OPENAI_API_KEY` | AI blog and HS-code generators | Those screens report unavailable |
| `CRON_SECRET` | Vercel Cron endpoints and the job-queue drain | Those routes return 401 |
| `SHIPSTATION_ENCRYPTION_KEY` | Reading any stored ShipStation credential | **Fails closed** — every credential read throws, so ShipStation silently does nothing |

ShipStation credentials are entered **per store in the admin UI**, not via env — the
platform is multi-tenant and each merchant supplies their own key. `SHIPSTATION_ENCRYPTION_KEY`
is the 32-byte AES-256-GCM key those per-store credentials are encrypted with; unlike everything
else in this table it does not degrade gracefully. If ShipStation appears connected but nothing
syncs, check it first.

### Checks

```bash
npm run lint
npx tsc --noEmit
npm test               # 799 unit tests across 48 suites
npm run test:e2e       # Playwright; needs the dev server running
```

`next.config.ts` sets `typescript.ignoreBuildErrors`, so `npm run build` does **not** enforce
types — `npx tsc --noEmit` is the only thing that does.

CI (`.github/workflows/ci.yml`) runs lint, typecheck, unit tests, a production build with no
integration keys set (proving every integration degrades rather than crashes), and a migrations
job that applies migrations to a clean database, proves a re-run is a no-op, and seeds twice to
prove the seed is idempotent.

### Troubleshooting

- **`password authentication failed`** — with no `DATABASE_URL` set, `npm run dev-local`
  probes for working credentials. With one set it is used as-is, so fix it there;
  `dev-local` will tell you whether the server rejected the credentials or never answered.
  `scripts/seed-demo.js` also prints platform-specific guidance on this error rather than
  a stack trace.
- **Sign-in fails** — `npm run dev-local -- --fresh` resets the demo users.
- **A storefront 404s** — the store must be `is_public`. The seed sets this; if you toggled
  visibility in the admin, toggle it back.

## Features

### Customer-Facing Features
- **Multi-Store Platform**: Create and manage multiple storefronts
- **Product Catalog**: Browse products with real-time inventory
- **Shopping Cart**: Add/remove items with persistent storage
- **Checkout Flow**: Complete order processing with ShipStation
- **Blog System**: Per-store blog with markdown support
- **Responsive Design**: Mobile-optimized interface
- **Social Sharing**: Share products and blog posts
- **Theme System**: Six preset designs, each with its own composition, over a token engine with
  auto-contrast; merchant CSS is sanitised on every render
- **Custom Pages**: Merchant-authored pages (About, Shipping & returns, Contact, FAQ, ...) built
  from the same section engine as the home page, with eight starter templates
- **Store Navigation**: Merchant-defined header and footer menus, published in the same
  transaction as the sections that link to them
- **Product Search**: Real-time search with analytics tracking

### Platform operator console (`/platform`)

The view for whoever runs the platform, as opposed to `/admin`, which is one merchant's view of
one store. Reached from an **Admin** item at the bottom of the merchant sidebar, shown only to a
user carrying `users.is_admin`.

- **Overview**: fleet health first — four cards, one per ShipStation sync state, each naming the
  stores behind its number; then merchants, buyer clicks, orders received and shipped, GMV and
  fulfilment rate, each against the equally-sized preceding period; the buyer funnel from click to
  order; and, at the foot, **Needs an operator** — the stuck-order backlog with the money and age
  of what is waiting, and every open alert
- **Customers**: paginated, searchable and sortable merchant list with URL state, showing orders,
  GMV, clicks, products, integration state and whether the storefront has been customized
- **Customer detail**: orders received/shipped/delivered/cancelled/refunded with recent orders and
  tracking, catalogue and inventory with top products, ShipStation and Stripe connection state,
  customization and setup completeness, and per-store traffic with top pages and referrers
- **Honest by construction**: GMV is settled money with unsettled and cancelled reported beside it,
  rates return "—" rather than a percentage below a sample floor, and a failed fetch renders an
  error with a retry — never a zero
- **Coupons** (`/platform/coupons`): the console's first *write* surface. Issue a signup coupon
  (a free year, half off for six months, a comp account), copy its `/join/<code>` link, deactivate
  it later — and see every redemption, across every merchant, with who claimed it and when their
  free window ends. A mutation here audits inside the same database transaction as the change; a
  failed audit write fails the whole request rather than leaving an unaccountable change (see
  `docs/platform-admin.md`). This is a different `coupons` from the merchant's own `/admin/coupons`
  storefront discount codes — see `docs/plans/platform-coupons.md` §1 for why the two are kept apart.

Access is granted deliberately, never by the product:

```bash
DATABASE_URL='<connection-string>' node scripts/grant-admin.js you@example.com
node scripts/grant-admin.js --list          # who has it
node scripts/grant-admin.js you@example.com --revoke
```

`docs/platform-admin.md` is the runbook, including what every figure on the console means.

### Admin Dashboard
- **Store Management**: Create, configure, and manage stores
- **Product Catalogue**: Saved views, inline editing, bulk actions, CSV import/export, real image
  uploads, and a ShipStation sync that respects fields the merchant has edited
- **Inventory**: On hand, committed, available, on order and days of cover shown apart from one
  another, backed by an append-only stock ledger with reasons
- **Multiple locations**: Stock counted per location, with transfers recorded as a paired movement
- **Restocking**: Select what needs ordering and turn it straight into a purchase order
- **Quarantine**: Units held back from sale without leaving the shelf
- **Purchase Orders**: Create, manage, and receive inventory against that ledger
- **Analytics**: Store performance and visitor tracking
- **Coupon System**: Create and manage discount codes
- **AI Page Composer**: Describe the business and get a validated draft home page - preset,
  palette, section composition and copy - to edit before publishing. Never writes to the published
  theme, and every setting the model returns is checked against the section registry
- **AI Content Generation**: Auto-generate product descriptions and blog posts
- **Integration Management**: Configure ShipStation and other services

### Background Services
- **Automated Sync**: Scheduled synchronization with ShipStation
- **Inventory Snapshots**: Daily stock snapshot, and reorder-point suggestions computed from
  90-day velocity and supplier lead time
- **Performance Monitoring**: Track sync operations and errors
- **Data Migration**: Structured database migrations

## Project Structure

```
src/
├── app/                    # Next.js App Router pages
│   ├── admin/             # Admin dashboard pages
│   │   ├── analytics/     # Store analytics
│   │   ├── blog/          # Blog management
│   │   ├── coupons/       # Coupon management
│   │   ├── inventory/     # Stock levels, adjustments, ledger
│   │   ├── products/      # Catalogue grid, product detail, new product
│   │   ├── suppliers/     # Supplier management
│   │   └── purchase-orders/ # Purchase order system
│   ├── api/               # API routes
│   │   ├── admin/         # Admin API endpoints
│   │   ├── auth/          # Authentication
│   │   ├── products/      # Product data
│   │   └── store/         # Store operations
│   ├── blog/              # Public blog pages
│   ├── store/             # Customer storefront
│   └── create-store/      # Store creation flow
├── components/            # Reusable UI components
├── lib/                   # Domain logic
│   ├── shipstation/       # ShipStation V2 client, sync, webhooks, order push
│   ├── stripe/            # Stripe SDK singleton, Connect, webhook dispatch
│   ├── billing/           # Cart pricing, coupons, orders, subscriptions
│   ├── services/          # Job queue, monitoring, inventory, order status
│   ├── auth/              # Sessions and JWT
│   └── database/          # Connection and query helpers
└── styles/               # Global styles and themes

database/
├── migrations/           # Database schema migrations
├── seeds/               # Development seed data
└── sql/                 # Raw SQL files

docs/
├── decision-log.md              # Development history and live TODOs
├── payments.md                  # Stripe money flows, in narrative form
├── deployment-vercel.md         # Vercel runbook
├── design-system.md             # UI primitives and tokens
├── storefront-theme-spec.md     # Theme engine and presets
├── brand.md, marketing-copy.md  # Voice and approved copy
├── demo-data.md                 # What the demo seed creates
├── shipstation-api-openapi.yaml # Upstream V2 contract
├── shipstation-custom-store.md  # Removed Custom Store XML format, kept for reference
└── audits/                      # Point-in-time critiques
```

Agent instructions live beside the code they govern: `CLAUDE.md` at the root,
`src/lib/shipstation/CLAUDE.md` and `src/lib/stripe/CLAUDE.md` for the two integrations.

## API Routes

### Platform APIs (require `users.is_admin`, re-checked per request)
- `/api/platform/overview` - Platform-wide metrics for a window, against the preceding one
- `/api/platform/timeseries` - Daily clicks, orders, shipped, GMV and signups, zero-filled
- `/api/platform/health` - Sync state per store, job queue depth, and the stuck-order backlog
- `/api/platform/customers` - Paginated merchant list; sort, filter and search
- `/api/platform/customers/[storeId]` - One merchant in full; `/orders` for their paged orders
- `/api/platform/coupons` - List (`GET`) and issue (`POST`) platform signup coupons — the console's
  first write surface; mutations audit inside the same transaction as the change
- `/api/platform/coupons/[id]` - Deactivate, rename or edit notes (`PATCH`); economics are refused,
  never silently ignored
- `/api/platform/coupons/redemptions` - Every redemption across every coupon, newest first
- `/api/storefront/click` - Public buyer-click beacon; rate limited, bot filtered, IP hashed

### Admin APIs
- `/api/admin/products` - Catalogue list and create; `[productId]` for read, update and archive
- `/api/admin/products/bulk` - Bulk actions over a selection or a whole filter
- `/api/admin/products/{export,import}` - CSV round trip; import previews before it writes
- `/api/admin/categories` - Category tree: create, rename, re-nest, delete
- `/api/admin/media` - Upload product images; `[mediaId]` for alt text and delete
- `/api/admin/inventory` - Stock grid with the five quantities and cover
- `/api/admin/inventory/[id]/adjust` - Post a stock movement with a required reason
- `/api/admin/inventory/[id]/ledger` - Movement history for one product
- `/api/admin/inventory/[id]/transfer` - Move stock between locations, as a paired ledger entry
- `/api/admin/inventory/[id]/hold` - Hold units back from sale, or return them to it
- `/api/admin/inventory/locations` - The places a store keeps stock; `[locationId]` to edit or close
- `/api/admin/inventory/export` - CSV of the current view
- `/api/admin/purchase-orders` - Purchase order management; `[id]/receive` posts receipts to the
  ledger, `[id]/pdf` renders the order document
- `/api/admin/analytics` - Store performance data
- `/api/admin/sync/*` - Operator-triggered ShipStation sync, run synchronously in the request
  (`all`, `products`, `inventory`, `warehouses`, `inventory-warehouses`, `inventory-locations`,
  `shipments`). `shipments` is the only one that writes to `orders` — it pulls tracking and
  shipment status back, and is what the orders list's Refresh button posts.
- `/api/admin/sync/status` - Sync history and aggregate statistics
- `/api/admin/integrations/shipstation` - Save, test and disconnect a store's ShipStation key
- `/api/admin/ai/*` - AI content generation

### Public APIs
- `/api/products` - Public product catalog
- `/api/inventory` - Real-time stock levels
- `/api/orders` - Order creation and processing
- `/api/blog` - Blog content management
- `/api/stores` - Store information
- `/api/media/[mediaId]` - Serves an uploaded product image; content-addressed and cacheable
- `/sitemap.xml`, `/robots.txt` - Every live storefront and published product, announced to crawlers

### Payments
- `/api/checkout/quote` - Server-authoritative pricing preview; creates nothing
- `/api/checkout/session` - Storefront Stripe Checkout Session ($0 carts complete without Stripe)
- `/api/checkout/confirm` - Order confirmation resolved against our tables, not the query string
- `/api/billing/{checkout,portal,status}` - Merchant subscription to the platform; `checkout` takes
  an optional signup-coupon code, `status` reports which discount (coupon or intro offer) is live
- `/api/billing/coupon/preview` - Validate and describe a signup coupon code; writes nothing
- `/api/billing/coupon/notice` - Which coupon clock (reservation or discount) the merchant's live
  claim is on, for the `/admin` alert ladder
- `/api/connect/{onboard,status,return,refresh}` - Stripe Connect Express onboarding and payouts
- `/api/webhooks/stripe` - The single Stripe webhook endpoint for both money flows, plus platform
  signup coupon redemption close-out

### Integration and scheduled
- `/api/shipstation/webhook/[storeToken]` - Per-store ShipStation webhook receiver
- `/api/cron/sync` - Vercel Cron: schedules a ShipStation sync per store
- `/api/cron/inventory-snapshot` - Vercel Cron: daily inventory snapshot
- `/api/cron/coupon-sweep` - Vercel Cron: releases signup-coupon reservations nobody converted
- `/api/jobs/process` - Drains `job_queue` (sync pages, order pushes, notifications)
- `/api/health` - Liveness

### Authentication
- `/api/auth/login` - User authentication
- `/api/admin/auth/*` - Admin authentication

## Database Schema

The application uses PostgreSQL with a comprehensive schema including:
- **Products**: Product information, pricing, and metadata
- **Inventory**: `inventory_locations` and `inventory_levels` (with `available` as a generated
  column), plus the append-only `inventory_transactions` ledger every stock change is posted
  through, and `inventory_holds` for units present but not sellable
- **Orders**: Order processing and tracking
- **Stores**: Multi-tenant store configuration
- **Users**: Authentication and authorization
- **Blog**: Content management system
- **Coupons**: Discount and promotion system (`coupons`, a merchant's storefront codes) and
  **platform signup coupons** (`platform_coupons` / `platform_coupon_redemptions`) — an operator's
  discount on a merchant's own RebelShops subscription. Two unrelated tables; see
  `docs/plans/platform-coupons.md` §1.
- **Purchase Orders**: Inventory management
- **Product Media**: Uploaded images, content-addressed by SHA-256 and scoped to one store
- **Sync Logs**: Integration monitoring

## Development Scripts

### Core Development
- `npm run dev` - Start development server with Turbopack
- `npm run dev:log` - Start dev server with logging to `dev.log`
- `npm run build` - Build production application
- `npm run start` - Start production server
- `npm run lint` - Run ESLint

### Testing
- `npm run test` - Run Jest unit tests
- `npm run test:watch` - Run Jest in watch mode
- `npm run test:ci` - Run Jest with coverage for CI
- `npm run test:e2e` - Run Playwright e2e tests
- `npm run test:e2e:headed` - Run Playwright with visible browser
- `npm run test:e2e:debug` - Run Playwright in debug mode
- `npm run test:e2e:ui` - Run Playwright with interactive UI

### Background Services
- `npm run sync:background` - Run background sync (invoked by Vercel Cron via `/api/cron/sync`)

### Integration Checks
- `npm run shipstation:probe` - Probe every ShipStation V2 endpoint the app depends on

```bash
SHIPSTATION_API_KEY=<key> npm run shipstation:probe
```

Read-only, and it checks more than reachability: for each endpoint it also verifies the
response is shaped the way the calling code parses it. A `200` whose collection sits under
a different key, or whose records lack the fields a sync writer reads, is reported as a
failure — that combination syncs zero rows without raising an error, which the unit tests
cannot catch because they mock the network. Exits non-zero if any probe fails.

Not covered, deliberately: `POST /v2/shipments` and the webhook create/delete calls, which
would create real records in the merchant's ShipStation account.

## Deployment

### Environment Variables

`.env.example` is the authoritative list, with a `[required]` / `[optional]` tag on every entry.
The essentials:

```env
# Database — the only variable with no working fallback
DATABASE_URL=postgresql://user:password@host:port/database

# Authentication
JWT_SECRET=your_jwt_secret

# ShipStation — per-store keys live in the database, not here.
# This one is the AES-256-GCM key those stored credentials are encrypted with,
# and it fails closed: without it, every credential read throws.
SHIPSTATION_ENCRYPTION_KEY=32_random_bytes_base64_or_hex
SHIPSTATION_API_KEY=            # optional fallback for /api/products/[productId] and the probe
SHIPSTATION_WAREHOUSE_ID=       # optional default ship-from

# Stripe
STRIPE_SECRET_KEY=sk_...
STRIPE_WEBHOOK_SECRET=whsec_...           # per endpoint, per environment
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_...
STRIPE_PLATFORM_PRODUCT_ID=               # optional; otherwise resolved or created
STRIPE_PLATFORM_PRICE_ID=                 # optional
STRIPE_INTRO_COUPON_ID=                   # optional; defaults to rebelshops-intro-3mo
STRIPE_APPLICATION_FEE_BPS=               # optional platform take rate

# Scheduled work
CRON_SECRET=your_cron_secret              # bearer for /api/cron/* and /api/jobs/process
SYNC_AUTH_TOKEN=your_sync_token           # legacy operator bearer, still accepted

# AI
OPENAI_API_KEY=your_openai_key

# Public origin, used for webhook and redirect URLs
NEXT_PUBLIC_APP_URL=https://rebelshops.com
```

### Vercel Deployment

Production runs on Vercel at **rebelshops.com**.

1. Provision Postgres. Neon through the Vercel Marketplace (`vercel integration add neon`) sets
   `DATABASE_URL`, `DATABASE_URL_UNPOOLED` and `POSTGRES_URL_NON_POOLING` on the project itself —
   `database/migrate.js` reads the unpooled one, because its advisory lock needs a direct
   (non-PgBouncer) connection.
2. Set `CRON_SECRET`, `SYNC_AUTH_TOKEN` and **`SHIPSTATION_ENCRYPTION_KEY`**, plus the Stripe,
   OpenAI and ShipStation keys. The encryption key has been omitted from production before, and
   the symptom was ShipStation appearing connected while every sync wrote nothing.
3. Migrations run from the build command in `vercel.json`
   (`node database/migrate.js && npm run build`), so a missing connection string fails the deploy
   before Next.js ever builds.
4. Cron schedules are declared in `vercel.json` under `crons`; Vercel calls
   `GET /api/cron/sync` with `Authorization: Bearer $CRON_SECRET`.

See `docs/deployment-vercel.md` for the full runbook.

## Development Guidelines

- Follow TypeScript strict mode conventions; `npx tsc --noEmit` is what enforces them
- Every query touching tenant data carries `store_id` — the platform is multi-tenant
- Money is integer cents in application code; convert at the boundary
- Never log an API key or webhook secret, or any fragment of one
- Use Mantine UI components for consistency
- Implement proper error handling and loading states; an unconfigured integration renders a
  labelled "not configured" state rather than crashing
- Write unit tests for all components and utilities
- Use Playwright for e2e testing of critical flows
- Document API endpoints and component props with JSDoc
- Maintain responsive design principles

`CLAUDE.md` holds the full working rules for agents and contributors alike, and
`docs/decision-log.md` has the development history and architectural decisions.