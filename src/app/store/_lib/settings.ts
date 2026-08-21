/**
 * Typed, forgiving readers for section `settings`.
 *
 * A section's settings are `Record<string, unknown>` straight out of JSONB, and
 * they may have been written by an older build, a different customizer version,
 * or a merchant editing JSON by hand. Every read therefore has to survive the
 * wrong type without throwing — spec section 8: one bad section must never
 * blank a storefront.
 */

/**
 * Read a string setting.
 * @param settings - The section's settings object
 * @param key - Setting id
 * @param fallback - Value to use when missing or the wrong type
 * @returns A trimmed string
 */
export function str(
  settings: Record<string, unknown>,
  key: string,
  fallback = '',
): string {
  const value = settings[key];
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return fallback;
}

/**
 * Read a boolean setting. Only a real boolean counts as `false`; anything
 * missing falls back, so a toggle added after a section was saved defaults on.
 * @param settings - The section's settings object
 * @param key - Setting id
 * @param fallback - Value to use when missing or the wrong type
 * @returns A boolean
 */
export function bool(
  settings: Record<string, unknown>,
  key: string,
  fallback = false,
): boolean {
  const value = settings[key];
  return typeof value === 'boolean' ? value : fallback;
}

/**
 * Read a numeric setting, clamped to a range.
 * @param settings - The section's settings object
 * @param key - Setting id
 * @param fallback - Value to use when missing or unparseable
 * @param min - Lower bound
 * @param max - Upper bound
 * @returns A number inside `[min, max]`
 */
export function num(
  settings: Record<string, unknown>,
  key: string,
  fallback: number,
  min = Number.NEGATIVE_INFINITY,
  max = Number.POSITIVE_INFINITY,
): number {
  const raw = settings[key];
  const parsed = typeof raw === 'number' ? raw : Number.parseFloat(String(raw ?? ''));
  const value = Number.isFinite(parsed) ? parsed : fallback;
  return Math.min(Math.max(value, min), max);
}

/**
 * Read a setting constrained to a known set of options.
 * @param settings - The section's settings object
 * @param key - Setting id
 * @param allowed - The permitted values
 * @param fallback - Value to use when the stored one is not permitted
 * @returns One of `allowed`
 */
export function pick<T extends string>(
  settings: Record<string, unknown>,
  key: string,
  allowed: readonly T[],
  fallback: T,
): T {
  const value = settings[key];
  return typeof value === 'string' && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

/**
 * Read a list setting, dropping entries that are not objects.
 *
 * Used by the repeater-style sections (value props, testimonials, FAQ, logos)
 * whose items are edited as JSON.
 *
 * @param settings - The section's settings object
 * @param key - Setting id
 * @param limit - Maximum entries to return
 * @returns An array of plain objects, possibly empty
 */
export function list(
  settings: Record<string, unknown>,
  key: string,
  limit = 24,
): Record<string, unknown>[] {
  const value = settings[key];
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (entry): entry is Record<string, unknown> =>
        typeof entry === 'object' && entry !== null && !Array.isArray(entry),
    )
    .slice(0, limit);
}

/**
 * Read a list of product ids.
 * @param settings - The section's settings object
 * @param key - Setting id
 * @returns UUID-shaped strings only
 */
export function idList(settings: Record<string, unknown>, key: string): string[] {
  const value = settings[key];
  if (!Array.isArray(value)) return [];
  return value.filter(
    (entry): entry is string => typeof entry === 'string' && /^[0-9a-fA-F-]{36}$/.test(entry),
  );
}

/**
 * Read a merchant-supplied image path, rejecting anything that is not a
 * same-origin path or a `data:image` URI.
 *
 * Section settings are merchant input and this value lands in a `src` or a
 * `background-image`, so an `http://` URL here would be both a mixed-content
 * problem and a tracking beacon.
 *
 * @param settings - The section's settings object
 * @param key - Setting id
 * @returns A safe image reference, or an empty string
 */
export function imageSrc(settings: Record<string, unknown>, key: string): string {
  const value = settings[key];
  if (typeof value !== 'string') return '';
  const raw = value.trim();
  if (raw === '') return '';
  if (raw.startsWith('//')) return '';
  if (raw.startsWith('/')) return raw;
  if (/^data:image\/(png|jpe?g|gif|webp|avif|svg\+xml);/i.test(raw)) return raw;
  // An `https:` URL is valid merchant input: `next.config.ts` allows any https
  // host for imagery, and until this branch existed a merchant who pasted their
  // hero photograph's URL saw the customizer preview render it and the live site
  // silently drop it — the value returned '' here. `http:` stays rejected as
  // mixed content; `javascript:`, `blob:` and everything else fall through.
  try {
    if (new URL(raw).protocol === 'https:') return raw;
  } catch {
    return '';
  }
  return '';
}
