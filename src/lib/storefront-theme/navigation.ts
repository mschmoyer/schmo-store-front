/**
 * Merchant-authored storefront navigation.
 *
 * Before this module the header menu was `['Shop all', ...first four categories]`
 * computed in `StoreHeader`, and the footer computed its own variation of the
 * same thing. A merchant could not add a link, rename one, reorder them, or
 * point at a page they had just written — which meant a custom page was
 * unreachable except by typing its URL.
 *
 * Two decisions worth keeping:
 *
 *  - **Empty means "derive from categories".** A store that has never opened the
 *    navigation editor gets exactly the menu it had before, generated from its
 *    live categories, and gains new categories automatically as it adds them.
 *    Materialising the derived menu at migration time would have frozen it, so
 *    the fallback stays live until the merchant actually edits it.
 *  - **Links are stored as store-relative paths** (`/products`, `/pages/about`),
 *    never absolute URLs to the shop's own domain. The storefront is mounted at
 *    `/store/<slug>` today and on a custom domain tomorrow, and a stored
 *    absolute URL would break on the move. `resolveNavHref` does the mapping.
 *
 * External links are allowed — a merchant linking their Instagram is ordinary —
 * but are constrained to `http:`/`https:`/`mailto:`/`tel:` so a menu label
 * cannot smuggle `javascript:` into an anchor.
 */

import { z } from 'zod';

/* ------------------------------------------------------------------ *
 * Types
 * ------------------------------------------------------------------ */

/** How deep a menu may nest. One level of dropdown, no more. */
export const MAX_NAV_DEPTH = 2;

/** Cap on top-level items in one menu. */
export const MAX_NAV_ITEMS = 12;

/** Cap on children under one top-level item. */
export const MAX_NAV_CHILDREN = 16;

export interface NavItem {
  /** Visible label. */
  label: string;
  /**
   * Store-relative path (`/products`), or an absolute external URL.
   * Relative paths are resolved against the store base by `resolveNavHref`.
   */
  href: string;
  /** Second-level items. Only meaningful on a top-level item. */
  children?: NavItem[];
}

export interface StoreNavigation {
  /**
   * Header menu. `undefined` — not `[]` — means "derive from categories".
   * An empty array is a merchant deliberately choosing to have no menu, and
   * the two must stay distinguishable.
   */
  header?: NavItem[];
  /** Footer "Shop" column. Same `undefined` vs `[]` distinction. */
  footer?: NavItem[];
}

/* ------------------------------------------------------------------ *
 * Validation
 * ------------------------------------------------------------------ */

/** Schemes a merchant may link to. Everything else — `javascript:`, `data:` — is rejected. */
const ALLOWED_EXTERNAL_SCHEMES = new Set(['http:', 'https:', 'mailto:', 'tel:']);

/**
 * Whether a stored `href` is one this platform will render into an anchor.
 *
 * Accepts a store-relative path beginning with a single `/`, or an absolute URL
 * in an allowed scheme. Rejects protocol-relative `//evil.example` — which is
 * absolute despite looking relative, and is the case a naive `startsWith('/')`
 * check waves straight through.
 *
 * @param href - Candidate link target
 * @returns True when the link is safe to render
 */
export function isSafeNavHref(href: string): boolean {
  const trimmed = href.trim();
  if (trimmed.length === 0 || trimmed.length > 2048) return false;

  if (trimmed.startsWith('//')) return false;
  if (trimmed.startsWith('/')) return true;

  try {
    return ALLOWED_EXTERNAL_SCHEMES.has(new URL(trimmed).protocol);
  } catch {
    return false;
  }
}

const navHrefSchema = z
  .string()
  .trim()
  .min(1)
  .max(2048)
  .refine(isSafeNavHref, 'Links must be a store path like /products, or an http(s), mailto or tel URL');

const navLabelSchema = z.string().trim().min(1, 'A menu item needs a label').max(60);

/** A second-level menu item. Cannot nest further — see `MAX_NAV_DEPTH`. */
const navChildSchema = z
  .object({ label: navLabelSchema, href: navHrefSchema })
  .strict();

/** A top-level menu item, optionally carrying one level of children. */
export const navItemSchema = z
  .object({
    label: navLabelSchema,
    href: navHrefSchema,
    children: z.array(navChildSchema).max(MAX_NAV_CHILDREN).optional(),
  })
  .strict();

export const navMenuSchema = z.array(navItemSchema).max(MAX_NAV_ITEMS);

/** The wire shape of a navigation patch. Both menus optional and independently settable. */
export const storeNavigationSchema = z
  .object({
    header: navMenuSchema,
    footer: navMenuSchema,
  })
  .partial()
  .strict();

/* ------------------------------------------------------------------ *
 * Rendering
 * ------------------------------------------------------------------ */

/**
 * Turn a stored `href` into one the browser can follow from this storefront.
 *
 * Relative paths are prefixed with the store base so `/products` on
 * `acme` becomes `/store/acme/products`. Absolute URLs pass through untouched.
 * Anything that fails {@link isSafeNavHref} collapses to the store home page
 * rather than rendering — a menu item that goes somewhere harmless is a better
 * failure than an anchor carrying a hostile scheme.
 *
 * @param storeSlug - The store the menu belongs to
 * @param href - Stored link target
 * @returns A URL safe to put in an `href` attribute
 */
export function resolveNavHref(storeSlug: string, href: string): string {
  const base = `/store/${storeSlug}`;
  const trimmed = href.trim();
  if (!isSafeNavHref(trimmed)) return base;
  if (!trimmed.startsWith('/')) return trimmed;
  return trimmed === '/' ? base : `${base}${trimmed}`;
}

/** A category as the navigation builder needs it. */
export interface NavCategory {
  name: string;
  slug: string;
}

/** A published page as the navigation builder needs it. */
export interface NavPage {
  title: string;
  slug: string;
}

/**
 * The menu a store gets when it has never edited its navigation.
 *
 * Reproduces the previous hardcoded behaviour — "Shop all" plus the first four
 * categories — so this migration changed no existing shop's header, and adds
 * nothing else: a derived menu that silently grew every page the merchant wrote
 * would put drafts of policy pages in the header the moment they were published.
 *
 * @param categories - The store's categories, already ordered
 * @returns The derived header menu
 */
export function defaultHeaderNav(categories: readonly NavCategory[]): NavItem[] {
  return [
    { label: 'Shop all', href: '/products' },
    ...categories.slice(0, 4).map((category) => ({
      label: category.name,
      href: `/products?category=${encodeURIComponent(category.slug)}`,
    })),
  ];
}

/**
 * Resolve the header menu for a render: the merchant's if they have set one,
 * otherwise the derived default.
 *
 * @param navigation - The store's stored navigation
 * @param categories - The store's categories, for the derived fallback
 * @returns The menu to render
 */
export function resolveHeaderNav(
  navigation: StoreNavigation | undefined,
  categories: readonly NavCategory[],
): NavItem[] {
  return navigation?.header ?? defaultHeaderNav(categories);
}

/**
 * Resolve the footer "Shop" column for a render.
 *
 * Falls back to the derived category list rather than to the header menu: the
 * footer column has always been a category index, and inheriting a header the
 * merchant built for a top nav would produce a footer full of external links.
 *
 * @param navigation - The store's stored navigation
 * @param categories - The store's categories, for the derived fallback
 * @returns The menu to render
 */
export function resolveFooterNav(
  navigation: StoreNavigation | undefined,
  categories: readonly NavCategory[],
): NavItem[] {
  return navigation?.footer ?? defaultHeaderNav(categories);
}
