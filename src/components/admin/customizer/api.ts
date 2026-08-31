/**
 * Thin client for the storefront-theme admin API.
 *
 * Every call is same-origin, so the browser attaches the httpOnly session cookie
 * itself; nothing here reads or carries a token. The store is taken from the
 * session server-side, never from anything sent here — a caller cannot address
 * someone else's shop.
 */

import type {
  FontDefinition,
  PresetDefinition,
  Section,
  SectionDefinition,
  StorefrontThemeInput,
} from '@/lib/storefront-theme';

export interface ContrastRow {
  pair: string;
  ratio: number;
  required: number;
  passes: boolean;
}

export interface ThemePayload {
  storeId: string;
  storeSlug: string;
  storeName: string;
  theme: StorefrontThemeInput;
  sections: Section[];
  version: number;
  updatedAt: string | null;
  contrast: ContrastRow[];
  previewToken: string;
  published: {
    theme: StorefrontThemeInput;
    sections: Section[];
    version: number;
    publishedAt: string | null;
  } | null;
  registries: {
    presets: PresetDefinition[];
    fonts: FontDefinition[];
    sections: SectionDefinition[];
  };
}

export interface CatalogPayload {
  collections: Array<{ id: string; name: string; slug: string; productCount: number }>;
  products: Array<{
    id: string;
    name: string;
    sku: string;
    price: number | null;
    imageUrl: string | null;
  }>;
}

/** Thrown for any non-2xx response, carrying the API's field errors when present. */
export class ThemeApiError extends Error {
  readonly status: number;
  readonly fieldErrors?: Record<string, string[]>;

  /**
   * @param message - Human-readable failure
   * @param status - HTTP status
   * @param fieldErrors - Per-field detail from the API
   */
  constructor(message: string, status: number, fieldErrors?: Record<string, string[]>) {
    super(message);
    this.name = 'ThemeApiError';
    this.status = status;
    this.fieldErrors = fieldErrors;
  }
}

/**
 * Perform an authenticated JSON request against the theme API.
 * @param path - Absolute API path
 * @param init - Fetch options
 * @returns The `data` payload
 */
async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    ...init,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });

  let body: {
    success?: boolean;
    data?: T;
    error?: string;
    fieldErrors?: Record<string, string[]>;
  } = {};
  try {
    body = (await response.json()) as typeof body;
  } catch {
    // A non-JSON body is itself the error; fall through to the status check.
  }

  if (!response.ok || body.success === false) {
    throw new ThemeApiError(
      body.error ?? `Request failed with ${response.status}`,
      response.status,
      body.fieldErrors,
    );
  }

  return body.data as T;
}

/**
 * Load the draft, the published theme, the registries and a preview token.
 * @returns Everything the customizer needs to boot
 */
export const loadTheme = (): Promise<ThemePayload> =>
  request<ThemePayload>('/api/admin/storefront-theme');

/**
 * Save the draft.
 * @param body - The theme patch and/or the section list
 * @returns The saved draft
 */
export const saveDraft = (body: {
  theme?: StorefrontThemeInput;
  sections?: Section[];
}): Promise<ThemePayload> =>
  request<ThemePayload>('/api/admin/storefront-theme', {
    method: 'PUT',
    body: JSON.stringify(body),
  });

/**
 * Promote the draft to published.
 * @returns The published theme
 */
export const publishDraft = (): Promise<ThemePayload> =>
  request<ThemePayload>('/api/admin/storefront-theme/publish', { method: 'POST' });

/**
 * Reset the draft to the published theme, or to a named preset.
 * @param preset - Optional preset id to reset to
 * @returns The restored draft
 */
export const resetDraft = (preset?: string): Promise<ThemePayload> =>
  request<ThemePayload>('/api/admin/storefront-theme/reset', {
    method: 'POST',
    body: JSON.stringify(preset ? { preset } : {}),
  });

/**
 * Load the merchant's collections and products for the picker controls.
 * @returns The catalogue
 */
export const loadCatalog = (): Promise<CatalogPayload> =>
  request<CatalogPayload>('/api/admin/storefront-theme/catalog');
