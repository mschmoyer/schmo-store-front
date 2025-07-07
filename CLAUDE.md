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

## Rules 

- Always run lint after a task or TODO list item is completed. 
- Always run unit tests at the end of a task. 
- Always check `dev.log` after task completion to verify server status and check for errors.
- Add any TODO items to /docs/decision-log.md. Check them off when completed and include the date/time. Also include the user's prompt or request.
- Check if the root README.md file needs an update after a task is completed. Only include relevant changes.