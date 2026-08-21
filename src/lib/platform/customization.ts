/**
 * One definition of "this merchant has made the storefront their own".
 *
 * This module exists because there were briefly two. The overview counted a store as customised
 * only if it had a `storefront_themes` row that had been edited after creation; the customers list
 * counted it if the store had a logo, a description, a hero line, or a non-default theme name. On
 * the demo data those rules disagree completely — the first returns **0 of 3**, the second returns
 * **3 of 3** — so an operator would have read "0 stores customized" directly above a table in
 * which every row said "Customized".
 *
 * That is worse than either rule being wrong on its own. A dashboard's value is entirely borrowed
 * from the reader's belief that its numbers mean something, and two contradictory answers to the
 * same question on one screen spends that belief on every other figure too.
 *
 * The rule below is deliberately the **union** of the two, because they are measuring different
 * real things and a merchant who has done either has genuinely customised their store:
 *
 *   1. **Theme editing** — a `storefront_themes` row whose version has moved past its first save,
 *      or which was updated meaningfully after being created. This is "opened the customizer".
 *   2. **Branding** — a logo, a store description, a hero title, or a theme other than `default`.
 *      This is "filled in the things that make the storefront not look like everyone else's".
 *
 * Signal 2 carries the platform today (`storefront_themes` is empty; all three demo stores have
 * full branding), and signal 1 is what will carry it once the customizer sees real use. Counting
 * only one of them under-reports activation in one direction or the other depending on the month,
 * which is exactly the kind of drift that makes a trend line meaningless.
 *
 * Both call sites import from here. Two copies kept in agreement by hand is how they diverged the
 * first time.
 */

/**
 * SQL predicate deciding whether a store is customised.
 *
 * Written against an alias for `stores` and an optional alias for `storefront_themes`, so it can be
 * dropped into a `SELECT` list, a `COUNT(*) FILTER (...)`, or a `WHERE` clause unchanged.
 *
 * @param storeAlias - The alias `stores` is joined under. Defaults to `s`.
 * @param themeAlias - The alias a `storefront_themes` row is available under, or `null` when the
 *                     caller has not joined it. With `null` the predicate falls back to the
 *                     branding signals alone, which is correct-but-conservative: it can
 *                     under-count a store that customised its theme and nothing else, so joining
 *                     the table is preferred wherever the query can afford it.
 * @returns A parenthesised boolean SQL expression, safe to interpolate — it contains no user input.
 */
export function customizedPredicate(storeAlias = 's', themeAlias: string | null = 'th'): string {
  const branding = [
    `NULLIF(BTRIM(${storeAlias}.logo_url), '') IS NOT NULL`,
    `NULLIF(BTRIM(${storeAlias}.store_description), '') IS NOT NULL`,
    `NULLIF(BTRIM(${storeAlias}.hero_title), '') IS NOT NULL`,
    `COALESCE(NULLIF(BTRIM(${storeAlias}.theme_name), ''), 'default') <> 'default'`,
  ].join('\n         OR ');

  if (!themeAlias) return `(\n         ${branding}\n       )`;

  return `(\n         ${themeAlias}.store_id IS NOT NULL\n         OR ${branding}\n       )`;
}

/**
 * The `storefront_themes` sub-select the predicate expects to be joined as `themeAlias`.
 *
 * Kept next to the predicate so the two cannot drift. A row qualifies when the merchant has saved
 * the customizer at least once beyond the row's own creation — `version > 1` catches a republish,
 * and the one-minute grace on `updated_at` avoids counting the write that created the row.
 */
export const CUSTOMIZED_THEME_JOIN = `
  SELECT DISTINCT store_id FROM storefront_themes
   WHERE version > 1 OR updated_at > created_at + INTERVAL '1 minute'
`;
