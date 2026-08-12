import { ImageResponse } from 'next/og';

/**
 * Generated social share card (Next.js file convention), 1200x630.
 *
 * Composition matches the committed poster at public/brand/og-image.png —
 * palette C, near-monochrome. A white page carrying the monochrome lockup, a
 * mono eyebrow and one very large ink hero line, over a full-bleed ink band
 * that holds the offer.
 *
 * Three things are load-bearing here and should not be "tidied":
 *
 * 1. **Hierarchy is scale, not weight.** next/og bundles exactly one face at
 *    one weight (Noto Sans 400) and satori does not synthesise bold, so a
 *    `fontWeight: 700` is a no-op at render time. The ~5x jump from the 16px
 *    eyebrow to the 84px hero is what makes this read as designed. Never trade
 *    size for weight here.
 * 2. **The ink band is the card's edge.** A white 1200x630 with no frame
 *    dissolves into a light chat background when it is unfurled. The band also
 *    is the design system's one permitted inversion, at the pricing decision.
 * 3. **The price is the only colour on the card**, in `--signal-on-dark`,
 *    because a price is money — that is the single role `--signal` has. On the
 *    ink band `--signal` itself measures 1.9:1 and would be unreadable; the
 *    on-dark step measures 8.02:1.
 *
 * The lockup is inlined as an SVG data URI, so this route reads nothing from
 * disk and ships no typeface: an unavailable font can never break the build.
 *
 * @returns A 1200x630 PNG image response.
 */

export const alt =
  'RebelShops — Your ShipStation catalog, now a storefront. $1 for 3 months, then $19.99 a month, no transaction fees.';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

const INK = '#111214';
const WHITE = '#FFFFFF';
const MUTED = '#6B6F76';
const SUBTLE = '#8A8E96';
const SIGNAL_ON_DARK = '#3FBF83';

const SANS = '"Geist", "Inter", "Helvetica Neue", Helvetica, Arial, sans-serif';
const MONO = '"Geist Mono", "JetBrains Mono", "SF Mono", Menlo, monospace';

/** Full-bleed ink band across the bottom. */
const BAND_H = 160;
/** Horizontal margin, shared by the white zone and the band. */
const PAD = 88;

const uri = (svg: string) => `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;

/**
 * The horizontal lockup, monochrome ink. 899.92 x 148 in cap units, mark 132
 * of those tall. Same path data as public/brand/logo-horizontal.svg.
 */
const LOCKUP = uri(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-3 -3 899.92 148"><g fill="none" stroke="${INK}" stroke-linejoin="miter"><g stroke-width="25.61"><path d="M12.8 0V132"/><path d="M12.8 12.8H82.24L99.4 29.96V50.56L82.24 67.72H12.8"/></g><g stroke-width="19.4"><path d="M165.22 16V116"/><path d="M165.22 25.7H217.82L230.82 38.7V54.3L217.82 67.3H165.22"/><path d="M300.09 101.96A25.3 20.8 0 0 1 257.22 87V73A25.3 20.8 0 0 1 307.82 73V75"/><path d="M257.22 75H307.82"/><path d="M335.22 12V116"/><path d="M335.22 52.2H358.02A27.8 20.8 0 0 1 385.82 73V87A27.8 20.8 0 0 1 358.02 107.8H335.22"/><path d="M456.09 101.96A25.3 20.8 0 0 1 413.22 87V73A25.3 20.8 0 0 1 463.82 73V75"/><path d="M413.22 75H463.82"/><path d="M491.22 12V116"/><path d="M581.22 46.7C581.22 33.7 568.22 25.7 549.42 25.7C534.62 25.7 521.62 33.7 521.62 46.7C521.62 58.7 533.62 64 552.42 68C570.22 72 581.22 74.3 581.22 86.3C581.22 98.3 568.22 106.3 548.42 106.3C533.62 106.3 521.62 98.3 521.62 85.3"/><path d="M608.62 12V116"/><path d="M608.62 73A25.3 20.8 0 0 1 659.22 73V116"/><path d="M685.62 73A25.3 20.8 0 0 1 736.22 73V87A25.3 20.8 0 0 1 685.62 87Z"/><path d="M763.62 44V142"/><path d="M763.62 52.2H786.42A27.8 20.8 0 0 1 814.22 73V87A27.8 20.8 0 0 1 786.42 107.8H763.62"/><path d="M884.22 67.2C884.22 57.2 874.22 52.2 861.42 52.2C850.62 52.2 840.62 58.2 840.62 67.2C840.62 76.2 849.62 78 863.42 82C876.22 86 884.22 84.8 884.22 93.8C884.22 102.8 874.22 107.8 860.42 107.8C849.62 107.8 840.62 102.8 840.62 92.8"/></g></g><path d="M31.68 80.52H66L113.52 132H79.2Z" fill="${INK}"/><path d="M179.52 77H205.52L241.52 116H215.52Z" fill="${INK}"/></svg>`
);

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          width: '100%',
          height: '100%',
          backgroundColor: WHITE,
          fontFamily: SANS,
          overflow: 'hidden',
        }}
      >
        {/* ---- white zone ---- */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            marginTop: 73,
            marginLeft: PAD,
            marginRight: PAD,
          }}
        >
          <img src={LOCKUP} alt="RebelShops" width={314} height={52} />
          <div style={{ flexGrow: 1 }} />
          <div style={{ fontSize: 20, color: SUBTLE }}>rebelshops.com</div>
        </div>

        <div
          style={{
            marginTop: 64,
            marginLeft: PAD,
            fontFamily: MONO,
            fontSize: 16,
            letterSpacing: 3.2,
            color: MUTED,
          }}
        >
          FOR SHIPSTATION SELLERS
        </div>

        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            marginTop: 26,
            marginLeft: PAD,
            fontSize: 84,
            lineHeight: 1.095,
            letterSpacing: -2.9,
            color: INK,
          }}
        >
          <div>Your ShipStation catalog,</div>
          <div>now a storefront.</div>
        </div>

        {/* ---- the ink band: the offer, and the card's bottom edge ---- */}
        <div
          style={{
            position: 'absolute',
            left: 0,
            bottom: 0,
            display: 'flex',
            alignItems: 'center',
            width: size.width,
            height: BAND_H,
            paddingLeft: PAD,
            paddingRight: PAD,
            backgroundColor: INK,
          }}
        >
          <div style={{ fontSize: 46, letterSpacing: -1.2, color: SIGNAL_ON_DARK }}>
            $1 for 3 months
          </div>
          <div style={{ flexGrow: 1 }} />
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-end',
              fontSize: 22,
              lineHeight: 1.55,
              color: SUBTLE,
            }}
          >
            <div>then $19.99/mo.</div>
            <div>No transaction fees.</div>
          </div>
        </div>
      </div>
    ),
    { ...size }
  );
}
