/**
 * Values accepted by {@link cn}. Falsy entries are dropped, which lets callers
 * write `cond && styles.x` and object maps without guarding.
 */
export type ClassValue =
  | string
  | number
  | null
  | undefined
  | false
  | ClassValue[]
  | { [key: string]: boolean | null | undefined };

/**
 * Joins class names, skipping anything falsy. Deliberately dependency-free —
 * we do not need `clsx` for this, and we do not merge conflicting Tailwind
 * utilities because the primitives use CSS Modules for their own geometry.
 *
 * @param inputs - Strings, arrays, or `{ className: enabled }` maps.
 * @returns A single space-separated class string, or `''` when nothing applies.
 */
export function cn(...inputs: ClassValue[]): string {
  const out: string[] = [];

  for (const input of inputs) {
    if (!input) continue;

    if (typeof input === 'string' || typeof input === 'number') {
      out.push(String(input));
      continue;
    }

    if (Array.isArray(input)) {
      const nested = cn(...input);
      if (nested) out.push(nested);
      continue;
    }

    for (const key of Object.keys(input)) {
      if (input[key]) out.push(key);
    }
  }

  return out.join(' ');
}

export default cn;
