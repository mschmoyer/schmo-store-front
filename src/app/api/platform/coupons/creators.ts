/**
 * Resolving `platform_coupons.created_by` (a bare `users.id`) into a human name for the console.
 *
 * `src/lib/platform/coupons.ts` deliberately returns `createdBy` as a UUID and nothing more — it is
 * a persistence module, not a join against `users`, and it is out of scope for this phase to extend
 * (see the phase 3 task notes: the coupons library landed in phase 1 and is consumed here, not
 * edited). The console still has to show "created by" as a name per plan §4C, so this route-local
 * helper does the one small lookup that closes the gap, rather than the UI rendering a bare UUID.
 */

import { db } from '@/lib/database/connection';

/** Raw shape of the `users` lookup this module runs. */
interface CreatorRow extends Record<string, unknown> {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
}

/**
 * Look up display names for a set of user ids.
 *
 * @param ids - Candidate ids, possibly containing `null` (a coupon whose creator's account was
 *              later deleted — `created_by` is `ON DELETE SET NULL`) and duplicates.
 * @returns A map from user id to a display name (full name, falling back to email). Ids that do not
 *          resolve to a user — including every `null` — are simply absent from the map, so callers
 *          render "Unknown" rather than crashing on a missing entry.
 */
export async function resolveCreatorNames(
  ids: ReadonlyArray<string | null>
): Promise<Map<string, string>> {
  const unique = Array.from(new Set(ids.filter((id): id is string => Boolean(id))));
  if (unique.length === 0) {
    return new Map();
  }

  const result = await db.query<CreatorRow>(
    'SELECT id, email, first_name, last_name FROM users WHERE id = ANY($1)',
    [unique]
  );

  const names = new Map<string, string>();
  for (const row of result.rows) {
    const fullName = [row.first_name, row.last_name].filter(Boolean).join(' ').trim();
    names.set(row.id, fullName || row.email);
  }
  return names;
}
