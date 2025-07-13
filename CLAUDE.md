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

### Heroku
1. Set environment variable: `SYNC_AUTH_TOKEN=your-secure-token`
2. Apply database migration: `015_sync_logs_table.sql`
3. Configure Heroku Scheduler to run `npm run sync:background`
4. See `/docs/heroku-scheduler-setup.md` for detailed setup instructions
5. Our app is: rebel-shops

### Monitoring
- API endpoint: `/api/admin/sync/status` - View sync history and statistics
- Database table: `sync_logs` - Detailed sync results
- Manual trigger: POST to `/api/admin/sync/background`

## Completing a Task
When completing a task, follow these steps:
- Run lint: `npm run lint`
- Run unit tests: `npm run test`
- Run Playwright e2e tests: `npm run test:e2e --project=chromium` on related code
- Check `dev.log` for server status and errors
- Update `/docs/decision-log.md` with any TODO items, marking them off when completed`
- Check if the root `README.md` file needs updates and include relevant changes
- Increment the version number in `package.json` using semantic versioning (major.minor.patch) if the task affects application functionality