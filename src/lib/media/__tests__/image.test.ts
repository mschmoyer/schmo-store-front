/**
 * What the format prober accepts, and what it refuses.
 *
 * These matter more than most unit tests here, because this function is the whole of the platform's
 * defence against a hostile upload. Everything downstream — the database CHECK, the serving route's
 * `Content-Type`, the `nosniff` header — trusts the format it returns. If it can be talked into
 * calling a document an image, all of that is decoration.
 *
 * The fixtures are built byte by byte rather than committed as files. A binary fixture is a thing
 * nobody reviews, and the point of a test that says "this is a valid PNG" is lost if the reader
 * cannot see why.
 */

import { deflateSync } from 'zlib';
import { probeImage, extensionFor } from '../image';

/**
 * Build a real PNG with the given dimensions.
 *
 * @param width - Pixel width.
 * @param height - Pixel height.
 * @returns The complete file.
 */
function png(width: number, height: number): Uint8Array {
  const table: number[] = [];
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  const crc32 = (buf: Buffer): number => {
    let crc = 0xffffffff;
    for (const b of buf) crc = table[(crc ^ b) & 0xff] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer): Buffer => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const typed = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(typed));
    return Buffer.concat([len, typed, crc]);
  };

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const raw = Buffer.concat(
    Array.from({ length: height }, () =>
      Buffer.concat([Buffer.from([0]), Buffer.alloc(width * 3, 0x7f)])
    )
  );
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

/**
 * Build a JPEG header ending in a start-of-frame marker.
 *
 * @param width - Pixel width.
 * @param height - Pixel height.
 * @param marker - Which SOF marker to use, so the walk can be tested against more than baseline.
 * @param withPreamble - Whether to precede the frame with a JFIF APP0 segment and padding, as a
 *   real encoder would.
 * @returns The bytes up to and including the frame header.
 */
function jpeg(width: number, height: number, marker = 0xc0, withPreamble = true): Uint8Array {
  const parts: number[] = [0xff, 0xd8];
  if (withPreamble) {
    /* APP0: length 16, "JFIF\0", then version, units and thumbnail fields. */
    parts.push(0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00);
    parts.push(0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00);
    /* Fill bytes between segments, which are legal and which a naive parser trips over. */
    parts.push(0xff, 0xff);
  }
  parts.push(
    0xff,
    marker,
    0x00,
    0x11,
    0x08,
    (height >> 8) & 0xff,
    height & 0xff,
    (width >> 8) & 0xff,
    width & 0xff,
    0x03
  );
  parts.push(...new Array(6).fill(0x00));
  return Uint8Array.from(parts);
}

/**
 * Build a GIF87a header.
 *
 * @param width - Pixel width.
 * @param height - Pixel height.
 * @returns The header bytes.
 */
function gif(width: number, height: number): Uint8Array {
  return Uint8Array.from([
    ...Buffer.from('GIF87a', 'ascii'),
    width & 0xff,
    (width >> 8) & 0xff,
    height & 0xff,
    (height >> 8) & 0xff,
    0x80,
    0x00,
    0x00
  ]);
}

/**
 * Build a lossy WebP header.
 *
 * @param width - Pixel width.
 * @param height - Pixel height.
 * @returns The header bytes.
 */
function webpLossy(width: number, height: number): Uint8Array {
  const b = Buffer.alloc(32);
  b.write('RIFF', 0, 'ascii');
  b.writeUInt32LE(24, 4);
  b.write('WEBP', 8, 'ascii');
  b.write('VP8 ', 12, 'ascii');
  b.writeUInt16LE(width, 26);
  b.writeUInt16LE(height, 28);
  return b;
}

/**
 * Build an extended WebP header, which encodes its dimensions as 24-bit values minus one.
 *
 * @param width - Pixel width.
 * @param height - Pixel height.
 * @returns The header bytes.
 */
function webpExtended(width: number, height: number): Uint8Array {
  const b = Buffer.alloc(32);
  b.write('RIFF', 0, 'ascii');
  b.writeUInt32LE(24, 4);
  b.write('WEBP', 8, 'ascii');
  b.write('VP8X', 12, 'ascii');
  b.writeUIntLE(width - 1, 24, 3);
  b.writeUIntLE(height - 1, 27, 3);
  return b;
}

describe('probeImage', () => {
  it('reads a PNG and its dimensions', () => {
    expect(probeImage(png(640, 480))).toEqual({ format: 'image/png', width: 640, height: 480 });
  });

  it('reads a GIF and its dimensions', () => {
    expect(probeImage(gif(300, 200))).toEqual({ format: 'image/gif', width: 300, height: 200 });
  });

  it('reads lossy and extended WebP', () => {
    expect(probeImage(webpLossy(800, 600))).toEqual({
      format: 'image/webp',
      width: 800,
      height: 600
    });
    expect(probeImage(webpExtended(1920, 1080))).toEqual({
      format: 'image/webp',
      width: 1920,
      height: 1080
    });
  });

  it('does not transpose a JPEG, whose frame header puts height first', () => {
    /* Deliberately non-square. Every other format here is width-then-height, so a copy-paste from
     * one of them reads a 1600x900 photograph as 900x1600 — which silently makes every reserved
     * layout box the wrong shape and is invisible on a square test fixture. */
    expect(probeImage(jpeg(1600, 900))).toEqual({
      format: 'image/jpeg',
      width: 1600,
      height: 900
    });
  });

  it('walks past segments to find the frame, whichever SOF marker the encoder used', () => {
    /* Progressive JPEG is what a phone camera and most export pipelines emit. A parser that only
     * knows SOF0 rejects a large share of real uploads. */
    for (const marker of [0xc0, 0xc1, 0xc2, 0xc3, 0xc9, 0xca]) {
      expect(probeImage(jpeg(120, 80, marker))).toEqual({
        format: 'image/jpeg',
        width: 120,
        height: 80
      });
    }
  });

  it('is not fooled by markers that share the SOF range but are not frames', () => {
    /* DHT, JPG and DAC sit inside 0xc0-0xcf and carry no dimensions. Treating one as a frame
     * reads whatever follows it as a size. */
    for (const marker of [0xc4, 0xc8, 0xcc]) {
      expect(probeImage(jpeg(120, 80, marker))).toBeNull();
    }
  });

  it('refuses an SVG, whatever it is called or declared as', () => {
    /* The reason this function exists. An SVG is a document that can carry script, and serving one
     * from the platform's own origin is a stored XSS against the merchant's admin. */
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
    expect(probeImage(svg)).toBeNull();
  });

  it('refuses a file that merely starts like an image', () => {
    /* A PNG signature glued to something else. Real formats are self-describing past the magic
     * number, and this is the shape of a polyglot. */
    const fake = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      Buffer.from('MZ\x90\x00 not a chunk header at all, no IHDR here')
    ]);
    expect(probeImage(fake)).toBeNull();
  });

  it('refuses formats a browser will not render as an image', () => {
    expect(probeImage(Buffer.from('%PDF-1.7\n%\xe2\xe3\xcf\xd3\n'))).toBeNull();
    expect(probeImage(Buffer.from('BM\x36\x00\x00\x00'))).toBeNull();
    expect(probeImage(Buffer.from('PK\x03\x04'))).toBeNull();
    expect(probeImage(Buffer.from([0x00, 0x00, 0x01, 0x00]))).toBeNull();
  });

  it('does not read past the end of a truncated file', () => {
    /* An upload cut off mid-flight must be a rejection, not an exception and not a dimension read
     * out of adjacent memory. */
    const full = png(64, 64);
    for (let length = 0; length < full.length; length += 1) {
      expect(() => probeImage(full.slice(0, length))).not.toThrow();
    }
    expect(probeImage(full.slice(0, 20))).toBeNull();
    expect(probeImage(new Uint8Array(0))).toBeNull();
  });

  it('names an extension for every format it accepts', () => {
    for (const bytes of [png(1, 1), gif(1, 1), webpLossy(1, 1), jpeg(1, 1)]) {
      const probe = probeImage(bytes);
      expect(probe).not.toBeNull();
      expect(extensionFor(probe!.format)).toMatch(/^(jpg|png|gif|webp)$/);
    }
  });
});
