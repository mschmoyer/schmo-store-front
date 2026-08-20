/**
 * Storefront theme engine — public entry point.
 *
 * Import from `@/lib/storefront-theme` rather than from individual modules.
 * See `README.md` in this directory for the full API surface.
 *
 * One exception: `./fonts.next` is intentionally **not** re-exported here.
 * It calls `next/font/google`, which only works inside the Next build, so the
 * storefront layout imports it directly:
 *
 *   import { storefrontFontVariables } from '@/lib/storefront-theme/fonts.next';
 */

export * from './types';
export * from './color';
export * from './defaults';
export * from './presets';
export * from './fonts';
export * from './resolve';
export * from './sanitize';
export * from './sections';
export * from './preview';
export * from './navigation';
export * from './pages';
export * from './page-templates';
