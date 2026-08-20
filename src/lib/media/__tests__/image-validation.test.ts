/**
 * Image-sniffing tests.
 *
 * The upload endpoint identifies an image by its bytes, not by the client's
 * Content-Type or file name, because both are attacker-controlled — a `.jpg`
 * that is actually HTML, or an SVG that carries script. These pin that the real
 * raster formats are recognised and that everything else, SVG included, is
 * refused.
 */

import { sniffImage } from '../image-validation';

/** Build a byte array from a list of numbers, padded to 16. */
function bytes(...values: number[]): Uint8Array {
  const out = new Uint8Array(16);
  out.set(values.slice(0, 16));
  return out;
}

describe('sniffImage', () => {
  it('recognises JPEG', () => {
    expect(sniffImage(bytes(0xff, 0xd8, 0xff, 0xe0))).toEqual({
      contentType: 'image/jpeg',
      extension: 'jpg',
    });
  });

  it('recognises PNG', () => {
    expect(sniffImage(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))?.contentType).toBe(
      'image/png',
    );
  });

  it('recognises GIF', () => {
    expect(sniffImage(bytes(0x47, 0x49, 0x46, 0x38, 0x39, 0x61))?.extension).toBe('gif');
  });

  it('recognises WebP', () => {
    // "RIFF____WEBP"
    expect(
      sniffImage(bytes(0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50))?.contentType,
    ).toBe('image/webp');
  });

  it('recognises AVIF', () => {
    // box size, "ftyp", "avif"
    expect(
      sniffImage(bytes(0, 0, 0, 0x20, 0x66, 0x74, 0x79, 0x70, 0x61, 0x76, 0x69, 0x66))
        ?.contentType,
    ).toBe('image/avif');
  });

  it('refuses SVG, which is script-capable XML', () => {
    // "<svg " and "<?xml"
    expect(sniffImage(bytes(0x3c, 0x73, 0x76, 0x67, 0x20))).toBeNull();
    expect(sniffImage(bytes(0x3c, 0x3f, 0x78, 0x6d, 0x6c))).toBeNull();
  });

  it('refuses HTML masquerading as an image', () => {
    // "<!DOCTYPE"
    expect(sniffImage(bytes(0x3c, 0x21, 0x44, 0x4f, 0x43))).toBeNull();
  });

  it('refuses empty or too-short input', () => {
    expect(sniffImage(new Uint8Array(0))).toBeNull();
    expect(sniffImage(bytes(0xff))).toBeNull();
  });
});
