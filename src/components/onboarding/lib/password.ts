/**
 * Password strength scoring and account-form validation.
 *
 * The copy deck (§5.2) sets the floor at 12 characters. Everything above that
 * floor is advisory: we score the password and tell the merchant what would
 * make it stronger, but we never block them on a heuristic. Pure functions so
 * the meter, the form and the API route all agree.
 */

/** Copy-deck floor. Anything shorter is rejected, client and server. */
export const PASSWORD_MIN_LENGTH = 12;

/** Above this we stop asking for more; bcrypt truncates at 72 bytes anyway. */
export const PASSWORD_MAX_LENGTH = 200;

export type PasswordScore = 0 | 1 | 2 | 3 | 4;

export interface PasswordStrength {
  /** 0 = unusable, 4 = strong. Drives the meter's filled segments. */
  score: PasswordScore;
  /** One word for the meter: "Too short", "Weak", "Fair", "Good", "Strong". */
  label: string;
  /** The single most useful thing they could do next. Null when strong. */
  suggestion: string | null;
  /** Hard failure — blocks submit. Null when the password is acceptable. */
  error: string | null;
}

/** Passwords so common that length alone does not save them. */
const COMMON_PATTERNS: RegExp[] = [
  /^p[a@]ssw[o0]rd/i,
  /^(?:12345|qwerty|letmein|welcome|iloveyou|admin)/i,
  /^(.)\1+$/,
  /^(?:abcdefg|0123456789)/i,
];

const SCORE_LABELS: Record<PasswordScore, string> = {
  0: 'Too short',
  1: 'Weak',
  2: 'Fair',
  3: 'Good',
  4: 'Strong',
};

/**
 * Count how many distinct character classes a password draws on.
 *
 * @param password - Raw password
 * @returns 0–4: lowercase, uppercase, digits, everything else
 */
export function characterClasses(password: string): number {
  let classes = 0;
  if (/[a-z]/.test(password)) classes += 1;
  if (/[A-Z]/.test(password)) classes += 1;
  if (/[0-9]/.test(password)) classes += 1;
  if (/[^a-zA-Z0-9]/.test(password)) classes += 1;
  return classes;
}

/**
 * Score a password and produce the one piece of advice worth showing.
 *
 * Scoring is length-led, because length is what actually buys entropy: 12 gets
 * you to "Fair", 16 to "Good", 20 to "Strong". Character variety and repetition
 * nudge it either way. A password below the 12-character floor always scores 0
 * and always carries `error`.
 *
 * @param password - Raw password as typed
 * @returns {@link PasswordStrength}
 */
export function scorePassword(password: string): PasswordStrength {
  if (!password) {
    return { score: 0, label: SCORE_LABELS[0], suggestion: null, error: 'This field is required' };
  }

  if (password.length < PASSWORD_MIN_LENGTH) {
    const remaining = PASSWORD_MIN_LENGTH - password.length;
    return {
      score: 0,
      label: SCORE_LABELS[0],
      suggestion: `${remaining} more character${remaining === 1 ? '' : 's'} to go`,
      error: 'Use at least 12 characters',
    };
  }

  if (password.length > PASSWORD_MAX_LENGTH) {
    return {
      score: 0,
      label: SCORE_LABELS[0],
      suggestion: null,
      error: `Keep this under ${PASSWORD_MAX_LENGTH + 1} characters`,
    };
  }

  if (COMMON_PATTERNS.some((pattern) => pattern.test(password))) {
    return {
      score: 1,
      label: SCORE_LABELS[1],
      suggestion: 'That starts with a very common password. Try something unrelated to you.',
      error: null,
    };
  }

  const classes = characterClasses(password);
  const distinct = new Set(password).size;

  let score = 1;
  if (password.length >= 12) score = 2;
  if (password.length >= 16) score = 3;
  if (password.length >= 20) score = 4;

  // Variety pulls a merely-long password up; a narrow alphabet pulls it down.
  if (classes >= 3 && score < 4) score += 1;
  if (distinct <= 5 && score > 1) score -= 1;
  if (classes === 1 && score > 2) score -= 1;

  const clamped = Math.max(0, Math.min(4, score)) as PasswordScore;

  let suggestion: string | null = null;
  if (clamped < 4) {
    if (distinct <= 5) suggestion = 'Too much repetition. Mix in some different characters.';
    else if (password.length < 16) suggestion = 'Longer is stronger. Try a short phrase.';
    else if (classes < 3) suggestion = 'Add a number or a symbol.';
    else suggestion = 'Good. A few more characters would make it strong.';
  }

  return { score: clamped, label: SCORE_LABELS[clamped], suggestion, error: null };
}

/**
 * Hard validation used by the account step and by `POST /api/onboarding/account`.
 * The server never trusts the meter — it calls this too.
 *
 * @param password - Raw password
 * @returns The blocking error message, or null when acceptable
 */
export function validatePassword(password: string): string | null {
  return scorePassword(password).error;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;

/**
 * Validate an email address to the standard the copy deck words.
 *
 * @param email - Raw email as typed
 * @returns The blocking error message, or null when acceptable
 */
export function validateEmail(email: string): string | null {
  const trimmed = email.trim();
  if (!trimmed) return 'This field is required';
  if (trimmed.length > 254) return 'Keep this under 255 characters';
  if (!EMAIL_PATTERN.test(trimmed)) return 'Enter a valid email address';
  return null;
}

/**
 * Validate a person's name field.
 *
 * @param value - Raw input
 * @param which - Which field, so the message names it
 * @returns The blocking error message, or null when acceptable
 */
export function validateName(value: string, which: 'first' | 'last'): string | null {
  const trimmed = value.trim();
  if (!trimmed) return which === 'first' ? 'Enter your first name' : 'Enter your last name';
  if (trimmed.length > 100) return 'Keep this under 101 characters';
  return null;
}
