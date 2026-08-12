import { ImageResponse } from 'next/og';

/**
 * Generated Apple touch icon (Next.js file convention), 180x180.
 *
 * Same artwork as src/app/icon.tsx and public/brand/apple-touch-icon.png, but
 * full-bleed and square-cornered: iOS applies its own corner mask, so shipping
 * our own radius would produce a double-rounded tile with a light halo on the
 * corners. Palette C — an ink ground with a white monochrome mark.
 *
 * Inlined as an SVG data URI, so this route reads nothing from disk and ships
 * no typeface and therefore cannot fail a build.
 *
 * @returns A 180x180 PNG image response.
 */

export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

/** The tile at radius 0, in a 120-unit square. Geometry matches public/brand/icon.svg. */
const TILE = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><rect width="120" height="120" fill="#111214"/><path d="M34.03 21V99" fill="none" stroke="#FFFFFF" stroke-width="15.13" stroke-linejoin="miter"/><path d="M34.03 28.57H75.05L85.19 38.71V50.87L75.05 61.01H34.03" fill="none" stroke="#FFFFFF" stroke-width="15.13" stroke-linejoin="miter"/><path d="M45.18 68.58H65.46L93.54 99H73.26Z" fill="#FFFFFF"/></svg>`;

const TILE_URI = `data:image/svg+xml;base64,${Buffer.from(TILE).toString('base64')}`;

export default function AppleIcon() {
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
