# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Next.js 15 storefront application using TypeScript, TailwindCSS, and Mantine UI components. The project follows the App Router pattern with components in `src/app/`.

## Development Commands

- `npm run dev` - Start development server with Turbopack
- `npm run build` - Build production application
- `npm run start` - Start production server
- `npm run lint` - Run ESLint

## Architecture

- **Framework**: Next.js 15 with App Router
- **UI Components**: Mantine v8 with MantineProvider configured in layout
- **Styling**: TailwindCSS v4 with custom CSS variables + Mantine CSS
- **Typography**: Geist font family (sans and mono variants)
- **Structure**: Standard App Router layout with `layout.tsx` and `page.tsx`
- **Images**: Next.js Image component with SVG assets in `/public`

## Key Configuration

- TypeScript configuration in `tsconfig.json`
- ESLint with Next.js config
- TailwindCSS with PostCSS processing
- Next.js config supports standard options

## Rules 

- Always run lint after a task or TODO list item is completed. 
- Always run unit tests at the end of a task. 
- Add any TODO items to /docs/decision-log.md. Check them off when completed and include the date/time. Also include the user's prompt or request.
- Check if the root README.md file needs an update after a task is completed. Only include relevant changes.