# Schmo Store Front

A modern e-commerce storefront built with Next.js 15, TypeScript, and Mantine UI, integrated with ShipStation APIs for real-time product and inventory management.

## Tech Stack

### Frontend
- **Framework**: Next.js 15 (App Router) with Turbopack
- **UI Library**: Mantine v8 with form validation and notifications
- **Styling**: TailwindCSS v4 with PostCSS
- **Icons**: Tabler Icons (@tabler/icons-react), FontAwesome
- **Typography**: Geist font family (sans and mono)
- **Animations**: Canvas Confetti, React Confetti
- **State Management**: React hooks, localStorage

### Backend & APIs
- **Database**: PostgreSQL with structured migrations
- **Authentication**: JWT tokens, bcrypt hashing
- **APIs**: ShipStation v2 API, ShipEngine API
- **Background Jobs**: Node-cron scheduler
- **File Processing**: Sharp for image optimization
- **PDF Generation**: @react-pdf/renderer

### Development & Testing
- **Language**: TypeScript with strict configuration
- **Testing**: Jest (unit tests), Playwright (e2e), React Testing Library
- **Linting**: ESLint with Next.js configuration
- **Package Management**: npm with Node.js 20+
- **Development**: Hot reload with Turbopack

### UI Components & Features
- **Drag & Drop**: @dnd-kit for sortable interfaces
- **Forms**: React Hook Form with Zod validation
- **Rich Text**: Markdown editor with preview
- **Data Visualization**: Custom analytics dashboards
- **Responsive Design**: Mobile-first approach
- **Accessibility**: ARIA labels and semantic HTML

### Integrations
- **ShipStation**: Product sync, inventory management, order processing
- **AI**: OpenAI integration for content generation
- **Social**: React Share for social media integration
- **Security**: Input sanitization with DOMPurify and sanitize-html

## Running the stack locally

Verified end to end from an empty database.

### Prerequisites

- **Node 22** — `nvm use` reads `.nvmrc`
- **PostgreSQL 16+** running locally
- Nothing else. Stripe, ShipStation and OpenAI keys are all optional; every feature that
  needs one degrades to a clearly-labelled "not configured" state rather than crashing.

### 1. Install

```bash
nvm use
npm install
```

### 2. Create the database

```bash
createdb rebelshops
```

### 3. Configure the environment

The app reads **`.env.local`** (not `.env`). Only two variables are required to boot:

```bash
cat > .env.local <<'EOF'
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/rebelshops
JWT_SECRET=any-long-random-string-for-local-dev
NEXT_PUBLIC_APP_URL=http://localhost:3000
EOF
```

`.env.example` documents every variable the app reads, grouped by what it unlocks.
`DATABASE_URL` is the only one without a working fallback.

### 4. Migrate and seed

```bash
npm run db:migrate     # 23 migrations; safe to re-run, no-ops when current
npm run db:seed-demo   # 3 stores, 36 products, 74 orders, blog posts, coupons
```

`db:seed-demo` is transactional and idempotent — run it as often as you like. It only
touches the three known demo store IDs, so it will not disturb other data.

### 5. Run

```bash
npm run dev            # or: npm run dev:log, which tees output to dev.log
```

### What you get

| URL | What it is |
|---|---|
| `/` | Marketing site |
| `/pricing` | Plan, comparison, FAQ |
| `/store/demo-electronics` | **Basecamp Audio** — dark, high-contrast theme |
| `/store/artisan-craft` | **Fernwood Goods** — warm editorial theme |
| `/store/fitness-pro` | **Ironline Fitness** — bright, roomy theme |
| `/admin` | Merchant dashboard |
| `/admin/design` | Storefront theme customizer with live preview |
| `/create-store` | Merchant onboarding |
| `/dev/design-system` | Every UI primitive in every state |

The three demo storefronts deliberately use three different presets, so you can see the
theme engine actually doing something rather than recolouring one design.

**Demo sign-in:** `demo@schmostore.com` / `rebeldev` (any seeded user shares that password).

### Optional integrations

| Variable | Unlocks | Without it |
|---|---|---|
| `STRIPE_SECRET_KEY` + `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Checkout and subscription billing | Checkout shows "payments not configured" |
| `STRIPE_WEBHOOK_SECRET` | Order creation on payment | Webhooks rejected |
| `OPENAI_API_KEY` | AI blog and HS-code generators | Those screens report unavailable |
| `CRON_SECRET` | Vercel Cron endpoints | Cron routes return 401 |

ShipStation credentials are entered **per store in the admin UI**, not via env — the
platform is multi-tenant and each merchant supplies their own key.

### Checks

```bash
npm run lint
npx tsc --noEmit
npm test               # 612 unit tests
npm run test:e2e       # Playwright; needs the dev server running
```

### Troubleshooting

- **Sign-in fails** — reseed. `npm run db:seed-demo` resets the demo users' passwords.
- **A storefront 404s** — the store must be `is_public`. The seed sets this; if you toggled
  visibility in the admin, toggle it back.
- **`DATABASE_URL` errors on boot** — the driver is chosen by hostname: a Neon host uses the
  serverless driver, anything else uses node-postgres. A malformed URL surfaces as a clear
  message rather than a stack trace.


## Features

### Customer-Facing Features
- **Multi-Store Platform**: Create and manage multiple storefronts
- **Product Catalog**: Browse products with real-time inventory
- **Shopping Cart**: Add/remove items with persistent storage
- **Checkout Flow**: Complete order processing with ShipStation
- **Blog System**: Per-store blog with markdown support
- **Responsive Design**: Mobile-optimized interface
- **Social Sharing**: Share products and blog posts
- **Theme System**: 10 customizable color themes for personalization
- **Product Search**: Real-time search with analytics tracking

### Admin Dashboard
- **Store Management**: Create, configure, and manage stores
- **Product Management**: Add, edit, and sync products with ShipStation
- **Inventory Tracking**: Real-time stock levels and forecasting
- **Purchase Orders**: Create, manage, and receive inventory
- **Analytics**: Store performance and visitor tracking
- **Coupon System**: Create and manage discount codes
- **AI Content Generation**: Auto-generate product descriptions and blog posts
- **Integration Management**: Configure ShipStation and other services

### Background Services
- **Automated Sync**: Scheduled synchronization with ShipStation
- **Inventory Forecasting**: Smart reorder suggestions
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
│   │   ├── inventory/     # Inventory management
│   │   ├── products/      # Product management
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
├── lib/                   # Utility functions and services
└── styles/               # Global styles and themes

database/
├── migrations/           # Database schema migrations
├── seeds/               # Development seed data
└── sql/                 # Raw SQL files

docs/
├── decision-log.md      # Development history
├── design/             # UI/UX design documents
└── implementation-plans/ # Technical specifications
```

## API Routes

### Admin APIs
- `/api/admin/products` - Product management with ShipStation sync
- `/api/admin/inventory` - Inventory tracking and forecasting
- `/api/admin/purchase-orders` - Purchase order management
- `/api/admin/analytics` - Store performance data
- `/api/admin/sync/*` - Background synchronization endpoints
- `/api/admin/ai/*` - AI content generation

### Public APIs
- `/api/products` - Public product catalog
- `/api/inventory` - Real-time stock levels
- `/api/orders` - Order creation and processing
- `/api/blog` - Blog content management
- `/api/stores` - Store information

### Authentication
- `/api/auth/login` - User authentication
- `/api/admin/auth/*` - Admin authentication

## Database Schema

The application uses PostgreSQL with a comprehensive schema including:
- **Products**: Product information, pricing, and metadata
- **Inventory**: Stock levels, locations, and forecasting
- **Orders**: Order processing and tracking
- **Stores**: Multi-tenant store configuration
- **Users**: Authentication and authorization
- **Blog**: Content management system
- **Coupons**: Discount and promotion system
- **Purchase Orders**: Inventory management
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
- `npm run sync:background` - Run background sync (Heroku Scheduler)
- `npm run sync:test` - Test sync operations manually

## Deployment

### Environment Variables
```env
# Database
DATABASE_URL=postgresql://user:password@host:port/database

# ShipStation API
SHIPSTATION_API_KEY=your_api_key_here
SHIPENGINE_SELLER_ID=your_seller_id
SHIPENGINE_WAREHOUSE_ID=your_warehouse_id

# Authentication
JWT_SECRET=your_jwt_secret
ADMIN_PASSWORD=your_admin_password

# AI Integration
OPENAI_API_KEY=your_openai_key

# Background Sync
SYNC_AUTH_TOKEN=your_sync_token
```

### Heroku Deployment
1. Set up PostgreSQL database
2. Configure environment variables
3. Deploy application
4. Run database migrations
5. Set up Heroku Scheduler for background sync

See `docs/heroku-scheduler-setup.md` for detailed deployment instructions.

## Development Guidelines

- Follow TypeScript strict mode conventions
- Use Mantine UI components for consistency
- Implement proper error handling and loading states
- Write unit tests for all components and utilities
- Use Playwright for e2e testing of critical flows
- Document API endpoints and component props
- Follow security best practices for authentication
- Maintain responsive design principles

See `docs/decision-log.md` for detailed development history and architectural decisions.