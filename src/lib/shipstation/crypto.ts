/**
 * Authenticated encryption for ShipStation credentials at rest.
 *
 * Replaces the previous base64 "encryption" (P0-9). Ciphertexts are AES-256-GCM with a random
 * 96-bit IV and the 128-bit auth tag stored alongside, using node's `crypto` — no bespoke
 * construction.
 *
 * Storage format (self-describing, so old and new rows can coexist during rollout):
 *
 * ```
 *   ssenc:v1:<iv-b64>.<tag-b64>.<ciphertext-b64>   AES-256-GCM (current)
 *   b64v0:<base64>                                 legacy, tagged by migration 022
 * ```
 *
 * Fail-closed policy: every call needs `SHIPSTATION_ENCRYPTION_KEY`. Without it, encryption and
 * decryption both throw {@link ShipStationKeyError} rather than silently degrading. Legacy `b64v0:`
 * values are still *readable* (they were never really encrypted, so refusing to read them protects
 * nobody) but only when the key is present, which means every read path can immediately re-encrypt
 * them — see `upgradeCiphertext`.
 */

import crypto from 'crypto';

/** Prefix identifying an AES-256-GCM ciphertext written by this module. */
export const CIPHERTEXT_PREFIX_V1 = 'ssenc:v1:';

/** Prefix migration 022 stamps onto pre-existing base64-only values. */
export const CIPHERTEXT_PREFIX_LEGACY = 'b64v0:';

/** Environment variable holding the 32-byte data-encryption key. */
export const ENCRYPTION_KEY_ENV = 'SHIPSTATION_ENCRYPTION_KEY';

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;
const KEY_BYTES = 32;

/**
 * Raised when credential encryption cannot be performed safely.
 *
 * Callers should surface this to the operator verbatim; it never contains secret material.
 */
export class ShipStationKeyError extends Error {
  /** Stable discriminator so route handlers can map this to a 503 without string matching. */
  readonly code = 'SHIPSTATION_ENCRYPTION_KEY_MISSING';

  /**
   * @param message - Operator-facing explanation.
   */
  constructor(message: string) {
    super(message);
    this.name = 'ShipStationKeyError';
  }
}

/**
 * Decode the configured key from base64, hex, or raw 32 characters.
 *
 * @param raw - Value of the key environment variable.
 * @returns A 32-byte key buffer, or null when the value cannot be decoded to 32 bytes.
 */
function decodeKey(raw: string): Buffer | null {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return null;
  }

  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
    return Buffer.from(trimmed, 'hex');
  }

  const fromBase64 = Buffer.from(trimmed, 'base64');
  if (fromBase64.length === KEY_BYTES) {
    return fromBase64;
  }

  const fromUtf8 = Buffer.from(trimmed, 'utf-8');
  if (fromUtf8.length === KEY_BYTES) {
    return fromUtf8;
  }

  return null;
}

/**
 * Resolve the data-encryption key, throwing a clear error when it is unusable.
 *
 * @returns The 32-byte key.
 * @throws {ShipStationKeyError} When the key is absent or the wrong length.
 */
export function requireEncryptionKey(): Buffer {
  const raw = process.env[ENCRYPTION_KEY_ENV];

  if (!raw) {
    throw new ShipStationKeyError(
      `${ENCRYPTION_KEY_ENV} is not set. ShipStation credentials cannot be read or written until ` +
        `it is configured. Generate one with: openssl rand -base64 32`
    );
  }

  const key = decodeKey(raw);
  if (!key) {
    throw new ShipStationKeyError(
      `${ENCRYPTION_KEY_ENV} must decode to exactly 32 bytes (base64, hex, or 32 raw characters). ` +
        `Generate one with: openssl rand -base64 32`
    );
  }

  return key;
}

/**
 * Report whether credential encryption is currently usable.
 *
 * Used by admin surfaces to show an actionable banner instead of a stack trace.
 *
 * @returns True when a valid key is configured.
 */
export function isEncryptionConfigured(): boolean {
  try {
    requireEncryptionKey();
    return true;
  } catch {
    return false;
  }
}

/**
 * Encrypt a secret for storage.
 *
 * @param plaintext - The secret to protect (API key, API secret, webhook signing secret).
 * @returns A self-describing `ssenc:v1:` ciphertext.
 * @throws {ShipStationKeyError} When no usable key is configured.
 */
export function encryptSecret(plaintext: string): string {
  const key = requireEncryptionKey();
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf-8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return (
    CIPHERTEXT_PREFIX_V1 +
    [iv.toString('base64'), tag.toString('base64'), ciphertext.toString('base64')].join('.')
  );
}

/**
 * Report whether a stored value is still in the pre-022 base64 form.
 *
 * @param stored - Value read from `store_integrations`.
 * @returns True when the value has not yet been re-encrypted with AES-256-GCM.
 */
export function isLegacyCiphertext(stored: string): boolean {
  return !stored.startsWith(CIPHERTEXT_PREFIX_V1);
}

/**
 * Decrypt a stored credential.
 *
 * Accepts current `ssenc:v1:` ciphertexts, migration-tagged `b64v0:` values, and untagged base64
 * (a row written by an older deploy after 022 ran). The key must be configured in every case, so
 * an unconfigured environment can never read credentials.
 *
 * @param stored - Value read from the database.
 * @returns The plaintext secret.
 * @throws {ShipStationKeyError} When no usable key is configured.
 * @throws {Error} When an AES-GCM ciphertext is malformed or fails authentication.
 */
export function decryptSecret(stored: string): string {
  const key = requireEncryptionKey();

  if (stored.startsWith(CIPHERTEXT_PREFIX_V1)) {
    const body = stored.slice(CIPHERTEXT_PREFIX_V1.length);
    const parts = body.split('.');

    if (parts.length !== 3) {
      throw new Error('Malformed ShipStation ciphertext: expected iv.tag.ciphertext');
    }

    const [ivPart, tagPart, dataPart] = parts;
    const iv = Buffer.from(ivPart, 'base64');
    const tag = Buffer.from(tagPart, 'base64');

    if (iv.length !== IV_BYTES) {
      throw new Error('Malformed ShipStation ciphertext: bad IV length');
    }

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);

    // Throws on tag mismatch, which is exactly the tamper-detection we want.
    return Buffer.concat([
      decipher.update(Buffer.from(dataPart, 'base64')),
      decipher.final()
    ]).toString('utf-8');
  }

  const legacyBody = stored.startsWith(CIPHERTEXT_PREFIX_LEGACY)
    ? stored.slice(CIPHERTEXT_PREFIX_LEGACY.length)
    : stored;

  return Buffer.from(legacyBody, 'base64').toString('utf-8');
}

/**
 * Re-encrypt a legacy value so callers can persist the upgrade.
 *
 * @param stored - Value read from the database.
 * @returns A fresh `ssenc:v1:` ciphertext when the input was legacy, otherwise null.
 * @throws {ShipStationKeyError} When no usable key is configured.
 */
export function upgradeCiphertext(stored: string): string | null {
  if (!isLegacyCiphertext(stored)) {
    return null;
  }
  return encryptSecret(decryptSecret(stored));
}

/**
 * Constant-time string comparison for tokens and signatures.
 *
 * @param a - First value.
 * @param b - Second value.
 * @returns True when the values are byte-identical.
 */
export function timingSafeEqualString(a: string, b: string): boolean {
  const bufferA = Buffer.from(a, 'utf-8');
  const bufferB = Buffer.from(b, 'utf-8');

  if (bufferA.length !== bufferB.length) {
    return false;
  }

  return crypto.timingSafeEqual(bufferA, bufferB);
}

/**
 * Generate a URL-safe random token (used for per-store webhook URLs).
 *
 * @param bytes - Entropy in bytes.
 * @returns Hex-encoded token.
 */
export function generateToken(bytes: number = 24): string {
  return crypto.randomBytes(bytes).toString('hex');
}
