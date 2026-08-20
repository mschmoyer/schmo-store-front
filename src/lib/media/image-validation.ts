/**
 * Image validation for uploads, by content rather than by claim.
 *
 * A file's `Content-Type` is whatever the client says it is, so an upload
 * endpoint that trusts it will happily store an HTML file named `photo.jpg` and
 * serve it back with an image content type — or worse, store an SVG that a
 * browser executes. This module identifies an image by its actual leading
 * bytes (its "magic number") and returns the canonical content type and
 * extension, or null when the bytes are not one of the raster formats the
 * storefront renders.
 *
 * SVG is deliberately excluded: it is XML that can carry script, and
 * `next.config.ts` keeps `dangerouslyAllowSVG` off for exactly that reason. An
 * image library that accepted SVG would reopen the hole the config closes.
 */

/** A recognised image format. */
export interface ImageKind {
  contentType: string;
  extension: string;
}

/**
 * Identify an image from its leading bytes.
 *
 * @param bytes - The start of the file; 16 bytes is enough for every check
 * @returns The format, or null when the bytes are not a supported raster image
 */
export function sniffImage(bytes: Uint8Array): ImageKind | null {
  const at = (i: number): number => bytes[i] ?? -1;

  // JPEG: FF D8 FF
  if (at(0) === 0xff && at(1) === 0xd8 && at(2) === 0xff) {
    return { contentType: 'image/jpeg', extension: 'jpg' };
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    at(0) === 0x89 &&
    at(1) === 0x50 &&
    at(2) === 0x4e &&
    at(3) === 0x47 &&
    at(4) === 0x0d &&
    at(5) === 0x0a &&
    at(6) === 0x1a &&
    at(7) === 0x0a
  ) {
    return { contentType: 'image/png', extension: 'png' };
  }

  // GIF: "GIF87a" or "GIF89a"
  if (at(0) === 0x47 && at(1) === 0x49 && at(2) === 0x46 && at(3) === 0x38) {
    return { contentType: 'image/gif', extension: 'gif' };
  }

  // WebP: "RIFF" .... "WEBP"
  if (
    at(0) === 0x52 &&
    at(1) === 0x49 &&
    at(2) === 0x46 &&
    at(3) === 0x46 &&
    at(8) === 0x57 &&
    at(9) === 0x45 &&
    at(10) === 0x42 &&
    at(11) === 0x50
  ) {
    return { contentType: 'image/webp', extension: 'webp' };
  }

  // AVIF: an ISO-BMFF box whose major brand at bytes 8..11 is "ftyp" and whose
  // compatible brand at 16..19 is "avif" (or "avis" for a sequence).
  if (
    at(4) === 0x66 &&
    at(5) === 0x74 &&
    at(6) === 0x79 &&
    at(7) === 0x70 &&
    at(8) === 0x61 &&
    at(9) === 0x76 &&
    at(10) === 0x69 &&
    (at(11) === 0x66 || at(11) === 0x73)
  ) {
    return { contentType: 'image/avif', extension: 'avif' };
  }

  return null;
}

/** Largest upload accepted, in bytes. */
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
