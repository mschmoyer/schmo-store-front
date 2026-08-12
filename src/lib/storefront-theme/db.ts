/**
 * Persistence for storefront themes (spec section 9).
 *
 * One row per (store, status). Draft and published coexist so a merchant can
 * edit without breaking their live shop, then publish in one atomic step.
 *
 * Reads of the *published* theme happen on every storefront request, so they go
 * through a small in-process cache with explicit invalidation on write. Drafts
 * are never cached: the customizer must always see exactly what it just saved.
 */

import { db } from '@/lib/database';

import { presetSections } from './presets';
import { defaultSections, normalizeSections } from './sections';
import { resolveTheme } from './resolve';
import type { ResolvedTheme, Section, StorefrontTheme, StorefrontThemeInput } from './types';

export type ThemeStatus = 'draft' | 'published';

export interface StorefrontThemeRecord {
  storeId: string;
  status: ThemeStatus;
  /** The stored (partial) theme, exactly as persisted. */
  theme: StorefrontThemeInput;
  sections: Section[];
  /** Monotonic revision, bumped on every write. */
  version: number;
  updatedAt: Date | null;
  publishedAt: Date | null;
}

/** A theme record with its theme already resolved for rendering. */
export interface ResolvedThemeRecord extends Omit<StorefrontThemeRecord, 'theme'> {
  theme: ResolvedTheme;
  /** The raw stored patch, for the customizer to edit. */
  raw: StorefrontThemeInput;
}

interface ThemeRow extends Record<string, unknown> {
  store_id: string;
  status: ThemeStatus;
  theme: unknown;
  sections: unknown;
  version: number | string;
  updated_at: Date | null;
  published_at: Date | null;
}

/* ------------------------------------------------------------------ *
 * Cache
 * ------------------------------------------------------------------ */

interface CacheEntry {
  record: ResolvedThemeRecord | null;
  expiresAt: number;
}

/** Published themes change rarely; 60s bounds staleness after an out-of-band write. */
const PUBLISHED_CACHE_TTL_MS = 60_000;

const publishedCache = new Map<string, CacheEntry>();

/**
 * Drop a store's cached published theme.
 * Called automatically on publish and reset; exported for callers that mutate
 * theme rows by other means (migrations, admin scripts, tests).
 * @param storeId - Store to invalidate, or omit to clear the whole cache
 */
export function invalidateThemeCache(storeId?: string): void {
  if (storeId) publishedCache.delete(storeId);
  else publishedCache.clear();
}

/* ------------------------------------------------------------------ *
 * Row mapping
 * ------------------------------------------------------------------ */

/**
 * Parse a JSONB column that may arrive as an object or as a string.
 * @param value - Raw column value
 * @returns The parsed value, or undefined when unusable
 */
function parseJson(value: unknown): unknown {
  if (value === null || value === undefined) return undefined;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      return undefined;
    }
  }
  return value;
}

/**
 * Convert a database row into a record.
 * @param row - Raw row
 * @returns A typed record
 */
function toRecord(row: ThemeRow): StorefrontThemeRecord {
  const theme = (parseJson(row.theme) ?? {}) as StorefrontThemeInput;
  const { sections } = normalizeSections(parseJson(row.sections) ?? []);
  return {
    storeId: row.store_id,
    status: row.status,
    theme,
    sections,
    version: Number(row.version) || 1,
    updatedAt: row.updated_at ?? null,
    publishedAt: row.published_at ?? null,
  };
}

/**
 * Resolve a record's theme for rendering, keeping the raw patch alongside.
 * @param record - A stored record
 * @returns The record with a resolved theme
 */
function resolveRecord(record: StorefrontThemeRecord): ResolvedThemeRecord {
  return {
    ...record,
    raw: record.theme,
    theme: resolveTheme(record.theme),
  };
}

const SELECT_COLUMNS =
  'store_id, status, theme, sections, version, updated_at, published_at';

/* ------------------------------------------------------------------ *
 * Reads
 * ------------------------------------------------------------------ */

/**
 * Read a store's published theme.
 *
 * This is the storefront's hot path: it is cached in-process and invalidated on
 * publish. Returns null when the store has never published, which the layout
 * should treat as "render the defaults", not as an error.
 *
 * @param storeId - Store UUID
 * @returns The published record with a resolved theme, or null
 */
export async function getPublishedTheme(
  storeId: string,
): Promise<ResolvedThemeRecord | null> {
  if (!storeId) return null;

  const cached = publishedCache.get(storeId);
  if (cached && cached.expiresAt > Date.now()) return cached.record;

  const result = await db.query<ThemeRow>(
    `SELECT ${SELECT_COLUMNS}
       FROM storefront_themes
      WHERE store_id = $1 AND status = 'published'
      LIMIT 1`,
    [storeId],
  );

  const row = result.rows[0];
  const record = row ? resolveRecord(toRecord(row)) : null;
  publishedCache.set(storeId, { record, expiresAt: Date.now() + PUBLISHED_CACHE_TTL_MS });
  return record;
}

/**
 * Read a store's draft theme, creating one from the published row (or the
 * shipped defaults) the first time a merchant opens the customizer.
 *
 * Never expose this over an unauthenticated endpoint — a draft is unpublished
 * work in progress.
 *
 * @param storeId - Store UUID
 * @returns The draft record with a resolved theme
 */
export async function getDraftTheme(storeId: string): Promise<ResolvedThemeRecord | null> {
  if (!storeId) return null;

  const result = await db.query<ThemeRow>(
    `SELECT ${SELECT_COLUMNS}
       FROM storefront_themes
      WHERE store_id = $1 AND status = 'draft'
      LIMIT 1`,
    [storeId],
  );

  const row = result.rows[0];
  if (row) return resolveRecord(toRecord(row));

  // No draft yet: seed one from whatever is live so the merchant starts from
  // their own shop rather than from a blank slate.
  const published = await getPublishedTheme(storeId);
  const seedTheme = published?.raw ?? {};
  const seedSections = published?.sections ?? presetSections(published?.raw?.preset);
  return saveDraft(storeId, seedTheme, seedSections);
}

/**
 * Read whichever theme a request should render.
 * @param storeId - Store UUID
 * @param wantsDraft - True when a valid preview token authorised draft access
 * @returns The record to render, or null
 */
export async function getThemeForRender(
  storeId: string,
  wantsDraft: boolean,
): Promise<ResolvedThemeRecord | null> {
  return wantsDraft ? getDraftTheme(storeId) : getPublishedTheme(storeId);
}

/* ------------------------------------------------------------------ *
 * Writes
 * ------------------------------------------------------------------ */

/**
 * Substitute a preset's own home page for the generic starter list.
 *
 * Presets did not always carry a composition, so the callers that seed a brand
 * new draft — onboarding, and "reset to preset" — were written to hand over
 * `defaultSections()` alongside the chosen preset's theme. Now that a preset
 * *is* a composition, handing us the generic list next to a preset id means
 * "this preset's page", and honouring that literally would leave every store
 * opening on the same seven sections whichever look the merchant picked.
 *
 * Only the exact shipped starter list is substituted. Anything a merchant has
 * touched differs from it and is persisted verbatim.
 *
 * @param theme - The theme patch being saved, if any
 * @param sections - The sections the caller supplied, if any
 * @returns The sections to persist
 */
function withPresetComposition(
  theme: StorefrontThemeInput | undefined,
  sections: Section[] | undefined,
): Section[] | undefined {
  if (sections === undefined || !theme?.preset) return sections;
  const generic = JSON.stringify(defaultSections());
  if (JSON.stringify(sections) !== generic) return sections;
  return presetSections(theme.preset);
}

/**
 * Create or update a store's draft.
 *
 * Passing `undefined` for either argument leaves that column alone, so the
 * customizer can save a theme tweak without resending the whole section list.
 *
 * @param storeId - Store UUID
 * @param theme - The theme patch to persist, or undefined to keep the current one
 * @param sections - The section list to persist, or undefined to keep the current one
 * @returns The saved draft record
 */
export async function saveDraft(
  storeId: string,
  theme?: StorefrontThemeInput,
  sections?: Section[],
): Promise<ResolvedThemeRecord> {
  if (!storeId) throw new Error('saveDraft requires a storeId');

  const resolvedSections = withPresetComposition(theme, sections);

  const themeJson = theme === undefined ? null : JSON.stringify(theme);
  const sectionsJson = resolvedSections === undefined ? null : JSON.stringify(resolvedSections);
  const fallbackSections = JSON.stringify(presetSections(theme?.preset));

  const result = await db.query<ThemeRow>(
    `INSERT INTO storefront_themes (store_id, status, theme, sections, version)
     VALUES ($1, 'draft', COALESCE($2::jsonb, '{}'::jsonb), COALESCE($3::jsonb, $4::jsonb), 1)
     ON CONFLICT (store_id, status) DO UPDATE
        SET theme      = COALESCE($2::jsonb, storefront_themes.theme),
            sections   = COALESCE($3::jsonb, storefront_themes.sections),
            version    = storefront_themes.version + 1,
            updated_at = NOW()
     RETURNING ${SELECT_COLUMNS}`,
    [storeId, themeJson, sectionsJson, fallbackSections],
  );

  return resolveRecord(toRecord(result.rows[0]));
}

/**
 * Copy the draft over the published row, in one transaction.
 *
 * @param storeId - Store UUID
 * @returns The newly published record, or null when there is no draft to publish
 */
export async function publishDraft(storeId: string): Promise<ResolvedThemeRecord | null> {
  if (!storeId) throw new Error('publishDraft requires a storeId');

  const published = await db.transaction(async (client) => {
    const draft = await client.query<ThemeRow>(
      `SELECT ${SELECT_COLUMNS}
         FROM storefront_themes
        WHERE store_id = $1 AND status = 'draft'
        LIMIT 1`,
      [storeId],
    );
    if (draft.rows.length === 0) return null;

    const row = draft.rows[0];
    const result = await client.query<ThemeRow>(
      `INSERT INTO storefront_themes (store_id, status, theme, sections, version, published_at)
       VALUES ($1, 'published', $2::jsonb, $3::jsonb, 1, NOW())
       ON CONFLICT (store_id, status) DO UPDATE
          SET theme        = EXCLUDED.theme,
              sections     = EXCLUDED.sections,
              version      = storefront_themes.version + 1,
              updated_at   = NOW(),
              published_at = NOW()
       RETURNING ${SELECT_COLUMNS}`,
      [storeId, JSON.stringify(parseJson(row.theme) ?? {}), JSON.stringify(parseJson(row.sections) ?? [])],
    );
    return result.rows[0] ?? null;
  });

  // Invalidate after the transaction commits, never before.
  invalidateThemeCache(storeId);

  return published ? resolveRecord(toRecord(published)) : null;
}

/**
 * Throw away the draft and restore it from the published theme.
 *
 * When nothing has ever been published, the draft resets to the shipped
 * defaults instead — a merchant must always be able to get back to a good state.
 *
 * @param storeId - Store UUID
 * @returns The restored draft record
 */
export async function resetDraft(storeId: string): Promise<ResolvedThemeRecord> {
  if (!storeId) throw new Error('resetDraft requires a storeId');

  const result = await db.query<ThemeRow>(
    `SELECT ${SELECT_COLUMNS}
       FROM storefront_themes
      WHERE store_id = $1 AND status = 'published'
      LIMIT 1`,
    [storeId],
  );

  const publishedRow = result.rows[0];
  const theme = publishedRow
    ? ((parseJson(publishedRow.theme) ?? {}) as StorefrontThemeInput)
    : ({} as StorefrontThemeInput);
  const sections = publishedRow
    ? normalizeSections(parseJson(publishedRow.sections) ?? []).sections
    : presetSections(theme.preset);

  return saveDraft(storeId, theme, sections.length > 0 ? sections : presetSections(theme.preset));
}

/**
 * Delete both rows for a store. Used when a store is deleted; exposed for tests.
 * @param storeId - Store UUID
 */
export async function deleteStoreTheme(storeId: string): Promise<void> {
  await db.query('DELETE FROM storefront_themes WHERE store_id = $1', [storeId]);
  invalidateThemeCache(storeId);
}

/**
 * Re-export for callers that want the theme shape without a second import.
 */
export type { StorefrontTheme, StorefrontThemeInput, Section, ResolvedTheme };
