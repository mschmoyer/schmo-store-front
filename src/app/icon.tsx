import { ImageResponse } from 'next/og';

/**
 * Generated favicon (Next.js file convention). Renders the RebelShops tile —
 * the R monogram reversed out of an ember square — at 32x32.
 *
 * The artwork is the same geometry as public/brand/icon-512.png, inlined here
 * as an SVG data URI so this route is fully self-contained: it reads no files
 * at request time and needs no typeface, which means it cannot fail the build
 * when a font is unavailable.
 *
 * @returns A 32x32 PNG image response.
 */

export const size = { width: 32, height: 32 };
export const contentType = 'image/png';

/** The tile, in a 120-unit square. Identical geometry to public/icon.svg. */
const TILE = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><rect width="120" height="120" rx="27" fill="#F94E1B"/><path d="M36.02 24V96" fill="none" stroke="#FBFAF8" stroke-width="13.97" stroke-linejoin="miter"/><path d="M36.02 30.98H73.9L83.26 40.34V51.58L73.9 60.94H36.02" fill="none" stroke="#FBFAF8" stroke-width="13.97" stroke-linejoin="miter"/><path d="M46.32 67.92H65.04L90.96 96H72.24Z" fill="#FBFAF8"/></svg>`;

const TILE_URI = `data:image/svg+xml;base64,${Buffer.from(TILE).toString('base64')}`;

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          display: 'flex',
          width: '100%',
          height: '100%',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <img src={TILE_URI} alt="RebelShops" width={size.width} height={size.height} />
      </div>
    ),
    { ...size }
  );
}
