# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Next.js 15 storefront application using TypeScript, TailwindCSS, and Mantine UI components. The project follows the App Router pattern with components in `src/app/`.

## Development Commands

- `npm run dev` - Start development server with Turbopack
- `npm run dev:log` - Start dev server with logging to `dev.log` file (run in separate terminal)
- `npm run build` - Build production application
- `npm run start` - Start production server
- `npm run lint` - Run ESLint

### Development Server Monitoring

When using `npm run dev:log` in a separate terminal, the server output is logged to `dev.log`. You can:
- Read `dev.log` to check for errors and server status after each task completion
- Monitor real-time output with the terminal running `dev:log`
- Use `tail -f dev.log` in another terminal for live monitoring

**Important**: Always check `dev.log` after completing tasks to verify the server is running without errors.

## Architecture

- **Framework**: Next.js 15 with App Router
- **UI Components**: Mantine v8 with MantineProvider configured in layout
- **Styling**: TailwindCSS v4 with custom CSS variables + Mantine CSS
- **Icons**: @tabler/icons-react (use IconBuildingStore not IconStore)
- **Typography**: Geist font family (sans and mono variants)
- **Structure**: Standard App Router layout with `layout.tsx` and `page.tsx`
- **Images**: Next.js Image component with SVG assets in `/public`

## Key Configuration

- TypeScript configuration in `tsconfig.json`
- ESLint with Next.js config
- TailwindCSS with PostCSS processing
- Next.js config supports standard options

## Development Best Practices

- **Components**: Create small, single-responsibility components
- **Styling**: Separate CSS into dedicated `.module.css` files or use Tailwind classes
- **Documentation**: Include JSDoc comments on all components with `@param` and `@returns`
- **TypeScript**: Use strict typing, avoid `any` types
- **File Organization**: Group related components in folders with index.ts exports
- **Props**: Use interfaces for component props, destructure with defaults
- **Hooks**: Extract custom logic into reusable hooks
- **Testing**: Write unit tests for all components and utilities
- **Performance**: Use React.memo, useMemo, useCallback for expensive operations
- **Accessibility**: Include ARIA labels and semantic HTML
- **Mocks**: Avoid using mocks unless explicitly requested; prefer real data where possible

## Testing

### Unit Tests
- `npm run test` - Run Jest unit tests
- `npm run test:watch` - Run Jest in watch mode
- `npm run test:ci` - Run Jest with coverage for CI

### End-to-End Tests
- `npm run test:e2e` - Run Playwright e2e tests (headless)
- `npm run test:e2e:headed` - Run Playwright tests with visible browser
- `npm run test:e2e:debug` - Run Playwright tests in debug mode
- `npm run test:e2e:ui` - Run Playwright tests with interactive UI

**Important**: Playwright tests require the development server to be running (`npm run dev`) on localhost:3000.

## Background Sync System

The application includes an automated background sync system for ShipStation integration:

### Available Scripts
- `npm run sync:background` - Run background sync (used by Heroku Scheduler)
- `npm run sync:test` - Test sync manually

### Sync Operations
The system automatically syncs the following data from ShipStation:
1. **Warehouses** - Shipping locations and addresses
2. **Inventory Warehouses** - Warehouse mappings
3. **Inventory Locations** - Location mappings
4. **Products** - Product information, SKUs, prices, images
5. **Inventory** - Stock levels and quantities

### Deployment (Vercel)
1. Set `CRON_SECRET` and `SYNC_AUTH_TOKEN` in the Vercel project
2. Migrations run from the Vercel build command (`node database/migrate.js`)
3. Schedules are declared in `vercel.json` under `crons`
4. See `/docs/deployment-vercel.md` for the full runbook
5. Production domain: rebelshops.com

### Monitoring
- API endpoint: `/api/admin/sync/status` - View sync history and statistics
- Database table: `sync_logs` - Detailed sync results
- Scheduled trigger: Vercel Cron calls `GET /api/cron/sync` with `Authorization: Bearer $CRON_SECRET`
  (the old `/api/admin/sync/background` route was removed — it accepted an unauthenticated
  `x-heroku-scheduler: true` header as proof of identity)

## Completing a Task
When completing a task, follow these steps:
- Run lint: `npm run lint`
- Run tsc
- Run unit tests: `npm run test`
- Run Playwright e2e tests: `npm run test:e2e --project=chromium` on related code
- Check `dev.log` for server status and errors
- Update `/docs/decision-log.md` with any TODO items, marking them off when completed`
- Check if the root `README.md` file needs updates and include relevant changes
- Increment the version number in `package.json` using semantic versioning (major.minor.patch) if the task affects application functionality. For small fixes, increment patch. For medium feature adds, increment minor. Do not change major unless specified. 

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
