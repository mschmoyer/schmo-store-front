import { ImageResponse } from 'next/og';

/**
 * Generated favicon (Next.js file convention). Renders the RebelShops tile —
 * the R monogram reversed out of an ink square — at 32x32.
 *
 * Palette C: the tile is `--text` #111214 with a #FFFFFF mark. The identity is
 * monochrome, so the flap is the same white as the stem; `--signal` is money
 * only and never appears on the mark.
 *
 * The artwork is the same geometry as public/brand/icon-512.png, inlined here
 * as an SVG data URI so this route is fully self-contained: it reads no files
 * at request time and needs no typeface, which means it cannot fail the build
 * when a font is unavailable.
 *
 * The monogram is drawn at 0.78 of the tile (retuned up from 0.72 when the
 * tile inverted). Checked by rasterising at 16px and reading the pixel grid:
 * the aperture stays open and the flap's diagonal still reads.
 *
 * @returns A 32x32 PNG image response.
 */

export const size = { width: 32, height: 32 };
export const contentType = 'image/png';

/** The tile, in a 120-unit square. Identical geometry to public/brand/icon.svg. */
const TILE = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><rect width="120" height="120" rx="26" fill="#111214"/><path d="M34.03 21V99" fill="none" stroke="#FFFFFF" stroke-width="15.13" stroke-linejoin="miter"/><path d="M34.03 28.57H75.05L85.19 38.71V50.87L75.05 61.01H34.03" fill="none" stroke="#FFFFFF" stroke-width="15.13" stroke-linejoin="miter"/><path d="M45.18 68.58H65.46L93.54 99H73.26Z" fill="#FFFFFF"/></svg>`;

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
