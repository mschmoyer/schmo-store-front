/**
 * @jest-environment node
 */
/**
 * `scripts/connect-shipstation.js` writes `store_integrations.api_key_encrypted`
 * without going through `crypto.ts` — it is plain CommonJS, and this module is
 * TypeScript inside the Next.js app. It therefore carries its own copy of the
 * `ssenc:v1:` construction, and a copy is only safe while something proves the
 * two agree.
 *
 * That is this test: it encrypts through the script and decrypts through the
 * app. If either side changes format, key derivation or IV length, this fails
 * instead of a sync quietly reading a credential it cannot decrypt.
 */

import { createRequire } from 'module';
import path from 'path';
import { decryptSecret, ENCRYPTION_KEY_ENV } from '../crypto';

const require_ = createRequire(__filename);
const scriptPath = path.join(process.cwd(), 'scripts', 'connect-shipstation.js');

describe('connect-shipstation.js ciphertext', () => {
  const previousKey = process.env[ENCRYPTION_KEY_ENV];

  beforeAll(() => {
    process.env[ENCRYPTION_KEY_ENV] = 'a'.repeat(64); // 32 bytes, hex
  });

  afterAll(() => {
    if (previousKey === undefined) delete process.env[ENCRYPTION_KEY_ENV];
    else process.env[ENCRYPTION_KEY_ENV] = previousKey;
  });

  it('produces a value the app can decrypt', () => {
    // The script exports its helpers and only runs `main()` when executed
    // directly, so requiring it here is inert.
    const { encryptSecret: encryptSecretFromScript, decodeKey: decodeKeyFromScript } =
      require_(scriptPath);

    const key = decodeKeyFromScript(process.env[ENCRYPTION_KEY_ENV] as string);
    expect(key).not.toBeNull();

    const stored = encryptSecretFromScript('ss-live-secret-key-value', key as Buffer);

    expect(stored.startsWith('ssenc:v1:')).toBe(true);
    expect(decryptSecret(stored)).toBe('ss-live-secret-key-value');
  });
});
