/**
 * What a file claims to be, and what it actually is.
 *
 * An upload arrives with a `Content-Type` chosen by whatever produced the request. That is a claim
 * by the uploader, not a fact about the bytes, and this platform serves those bytes back from its
 * own origin — so a file accepted on the strength of its header is a stored XSS waiting for the
 * first browser that sniffs it.
 *
 * So the format is read out of the file's own header. Every format below is identified by a magic
 * number the format's own specification requires, and the dimensions come from the same header,
 * which means we learn them without decoding the image and without a native dependency.
 *
 * SVG is not here on purpose. It is a document that can carry script and there is no header check
 * that makes it safe to serve inline from a first-party origin.
 */

/** A format this platform will accept and serve. */
export type ImageFormat = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';

/** What the bytes turned out to be. */
export interface ImageProbe {
  format: ImageFormat;
  width: number;
  height: number;
}

/** File extension for each accepted format, for the download filename. */
const EXTENSION: Record<ImageFormat, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp'
};

/**
 * The extension matching a stored image's content type.
 *
 * @param format - An accepted image format.
 * @returns The file extension, without a dot.
 */
export function extensionFor(format: ImageFormat): string {
  return EXTENSION[format];
}

/**
 * Identify an uploaded image from its own bytes and read its dimensions.
 *
 * @param bytes - The complete file.
 * @returns The format and pixel dimensions, or null when the bytes are not an image this platform
 *   accepts — including when they are a valid image of an unaccepted format.
 */
export function probeImage(bytes: Uint8Array): ImageProbe | null {
  return probePng(bytes) ?? probeJpeg(bytes) ?? probeGif(bytes) ?? probeWebp(bytes);
}

/**
 * PNG: an eight-byte signature, then an IHDR chunk whose first eight payload bytes are the
 * dimensions as big-endian 32-bit integers. IHDR is required by the specification to come first.
 *
 * @param b - The file.
 * @returns The probe, or null.
 */
function probePng(b: Uint8Array): ImageProbe | null {
  const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (b.length < 24 || !SIGNATURE.every((byte, i) => b[i] === byte)) return null;
  if (readAscii(b, 12, 4) !== 'IHDR') return null;
  return { format: 'image/png', width: readU32(b, 16), height: readU32(b, 20) };
}

/**
 * JPEG: a sequence of marker segments. The dimensions live in whichever start-of-frame marker the
 * encoder used — baseline, progressive, lossless and the arithmetic-coded variants all differ —
 * so this walks the segment chain rather than assuming an offset.
 *
 * @param b - The file.
 * @returns The probe, or null.
 */
function probeJpeg(b: Uint8Array): ImageProbe | null {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return null;

  let offset = 2;
  while (offset + 9 < b.length) {
    /* Padding between segments is legal and encoders emit it, so skip fill bytes rather than
     * giving up at the first one. */
    if (b[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = b[offset + 1];
    if (marker === 0xff) {
      offset += 1;
      continue;
    }

    /* Standalone markers carry no length field; stepping over a length they do not have would
     * desynchronise the walk. */
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2;
      continue;
    }

    /* Start of scan: entropy-coded data follows and there is no frame header left to find. */
    if (marker === 0xda || marker === 0xd9) return null;

    const length = readU16(b, offset + 2);
    if (length < 2) return null;

    /* SOF0-SOF15, excluding DHT (0xc4), JPG (0xc8) and DAC (0xcc), which share the range. */
    const isFrame =
      marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isFrame) {
      if (offset + 9 >= b.length) return null;
      /* Height precedes width in a JPEG frame header, which is the reverse of every other format
       * here and an easy thing to get silently backwards. */
      return { format: 'image/jpeg', height: readU16(b, offset + 5), width: readU16(b, offset + 7) };
    }

    offset += 2 + length;
  }
  return null;
}

/**
 * GIF: `GIF87a` or `GIF89a`, then the logical screen descriptor — dimensions as little-endian
 * 16-bit integers.
 *
 * @param b - The file.
 * @returns The probe, or null.
 */
function probeGif(b: Uint8Array): ImageProbe | null {
  if (b.length < 10) return null;
  const header = readAscii(b, 0, 6);
  if (header !== 'GIF87a' && header !== 'GIF89a') return null;
  return { format: 'image/gif', width: readU16LE(b, 6), height: readU16LE(b, 8) };
}

/**
 * WebP: a RIFF container whose fourth chunk word is `WEBP`, then one of three payload types.
 * The three encode their dimensions completely differently, so each is read on its own terms.
 *
 * @param b - The file.
 * @returns The probe, or null.
 */
function probeWebp(b: Uint8Array): ImageProbe | null {
  if (b.length < 30 || readAscii(b, 0, 4) !== 'RIFF' || readAscii(b, 8, 4) !== 'WEBP') return null;

  const kind = readAscii(b, 12, 4);

  /* Lossy: a VP8 key frame, dimensions as 14-bit fields after the three-byte start code. */
  if (kind === 'VP8 ') {
    return {
      format: 'image/webp',
      width: readU16LE(b, 26) & 0x3fff,
      height: readU16LE(b, 28) & 0x3fff
    };
  }

  /* Lossless: 14-bit dimensions minus one, packed across four bytes with no alignment. */
  if (kind === 'VP8L') {
    const bits = readU32LE(b, 21);
    return {
      format: 'image/webp',
      width: (bits & 0x3fff) + 1,
      height: ((bits >> 14) & 0x3fff) + 1
    };
  }

  /* Extended: animation, alpha and metadata. Dimensions are 24-bit, minus one. */
  if (kind === 'VP8X') {
    return {
      format: 'image/webp',
      width: readU24LE(b, 24) + 1,
      height: readU24LE(b, 27) + 1
    };
  }

  return null;
}

/**
 * Read a fixed-length ASCII tag.
 *
 * @param b - The file.
 * @param offset - Where to start.
 * @param length - How many bytes.
 * @returns The tag.
 */
function readAscii(b: Uint8Array, offset: number, length: number): string {
  let out = '';
  for (let i = 0; i < length; i += 1) out += String.fromCharCode(b[offset + i]);
  return out;
}

/**
 * Read a big-endian 32-bit unsigned integer.
 *
 * @param b - The file.
 * @param o - Where to start.
 * @returns The value.
 */
function readU32(b: Uint8Array, o: number): number {
  return ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
}

/**
 * Read a big-endian 16-bit unsigned integer.
 *
 * @param b - The file.
 * @param o - Where to start.
 * @returns The value.
 */
function readU16(b: Uint8Array, o: number): number {
  return (b[o] << 8) | b[o + 1];
}

/**
 * Read a little-endian 16-bit unsigned integer.
 *
 * @param b - The file.
 * @param o - Where to start.
 * @returns The value.
 */
function readU16LE(b: Uint8Array, o: number): number {
  return b[o] | (b[o + 1] << 8);
}

/**
 * Read a little-endian 24-bit unsigned integer.
 *
 * @param b - The file.
 * @param o - Where to start.
 * @returns The value.
 */
function readU24LE(b: Uint8Array, o: number): number {
  return b[o] | (b[o + 1] << 8) | (b[o + 2] << 16);
}

/**
 * Read a little-endian 32-bit unsigned integer.
 *
 * @param b - The file.
 * @param o - Where to start.
 * @returns The value.
 */
function readU32LE(b: Uint8Array, o: number): number {
  return (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;
}
