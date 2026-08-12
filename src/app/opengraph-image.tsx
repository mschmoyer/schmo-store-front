import { ImageResponse } from 'next/og';

/**
 * Generated social share card (Next.js file convention), 1200x630.
 *
 * Composition matches the committed poster at public/brand/og-image.png: ink
 * ground, ember signal, the drawn RebelShops lockup, the hero line and the $1
 * offer. Both the lockup and the oversized ghost monogram are inlined as SVG
 * data URIs, so this route reads nothing from disk and ships no typeface —
 * body copy uses a system grotesque stack and falls back to the font bundled
 * with next/og, which means an unavailable font can never break the build.
 *
 * @returns A 1200x630 PNG image response.
 */

export const alt =
  'RebelShops — Your ShipStation catalog, now a storefront. $1 for 3 months, then $19.99 a month, no transaction fees.';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

const INK_950 = '#08090B';
const INK_800 = '#171A20';
const INK_700 = '#22262F';
const INK_400 = '#858D9A';
const PAPER = '#FBFAF8';
const EMBER = '#F94E1B';
const EMBER_400 = '#FF6F3D';

const SANS = '"Geist", "Inter", "Helvetica Neue", Helvetica, Arial, sans-serif';
const MONO = '"Geist Mono", "JetBrains Mono", "SF Mono", Menlo, monospace';

const uri = (svg: string) => `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;

/** The horizontal lockup, paper on ink with an ember flap. 899.92 x 148. */
const LOCKUP = uri(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-3 -3 899.92 148"><g fill="none" stroke="${PAPER}" stroke-linejoin="miter"><g stroke-width="25.61"><path d="M12.8 0V132"/><path d="M12.8 12.8H82.24L99.4 29.96V50.56L82.24 67.72H12.8"/></g><g stroke-width="19.4"><path d="M165.22 16V116"/><path d="M165.22 25.7H217.82L230.82 38.7V54.3L217.82 67.3H165.22"/><path d="M300.09 101.96A25.3 20.8 0 0 1 257.22 87V73A25.3 20.8 0 0 1 307.82 73V75"/><path d="M257.22 75H307.82"/><path d="M335.22 12V116"/><path d="M335.22 52.2H358.02A27.8 20.8 0 0 1 385.82 73V87A27.8 20.8 0 0 1 358.02 107.8H335.22"/><path d="M456.09 101.96A25.3 20.8 0 0 1 413.22 87V73A25.3 20.8 0 0 1 463.82 73V75"/><path d="M413.22 75H463.82"/><path d="M491.22 12V116"/><path d="M581.22 46.7C581.22 33.7 568.22 25.7 549.42 25.7C534.62 25.7 521.62 33.7 521.62 46.7C521.62 58.7 533.62 64 552.42 68C570.22 72 581.22 74.3 581.22 86.3C581.22 98.3 568.22 106.3 548.42 106.3C533.62 106.3 521.62 98.3 521.62 85.3"/><path d="M608.62 12V116"/><path d="M608.62 73A25.3 20.8 0 0 1 659.22 73V116"/><path d="M685.62 73A25.3 20.8 0 0 1 736.22 73V87A25.3 20.8 0 0 1 685.62 87Z"/><path d="M763.62 44V142"/><path d="M763.62 52.2H786.42A27.8 20.8 0 0 1 814.22 73V87A27.8 20.8 0 0 1 786.42 107.8H763.62"/><path d="M884.22 67.2C884.22 57.2 874.22 52.2 861.42 52.2C850.62 52.2 840.62 58.2 840.62 67.2C840.62 76.2 849.62 78 863.42 82C876.22 86 884.22 84.8 884.22 93.8C884.22 102.8 874.22 107.8 860.42 107.8C849.62 107.8 840.62 102.8 840.62 92.8"/></g></g><path d="M31.68 80.52H66L113.52 132H79.2Z" fill="${EMBER}"/><path d="M179.52 77H205.52L241.52 116H215.52Z" fill="${PAPER}"/></svg>`
);

/** The monogram alone, in near-ground tones. Bleeds off the right edge. */
const GHOST = uri(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 86 100"><g fill="none" stroke="${INK_800}" stroke-width="19.4" stroke-linejoin="miter"><path d="M9.7 0V100"/><path d="M9.7 9.7H62.3L75.3 22.7V38.3L62.3 51.3H9.7"/></g><path d="M24 61H50L86 100H60Z" fill="${INK_700}"/></svg>`
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
          backgroundColor: INK_950,
          padding: '82px',
          fontFamily: SANS,
          overflow: 'hidden',
        }}
      >
        <img
          src={GHOST}
          alt=""
          width={593}
          height={690}
          style={{ position: 'absolute', left: 900, top: 40, opacity: 0.62 }}
        />
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: 1200,
            height: 6,
            backgroundColor: EMBER,
          }}
        />

        <img src={LOCKUP} alt="RebelShops" width={353} height={58} />

        <div
          style={{
            marginTop: 65,
            fontFamily: MONO,
            fontSize: 17,
            letterSpacing: 2.6,
            color: EMBER_400,
          }}
        >
          FOR SHIPSTATION SELLERS
        </div>

        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            marginTop: 22,
            fontSize: 66,
            lineHeight: 1.06,
            letterSpacing: -2.2,
            color: PAPER,
          }}
        >
          <div>Your ShipStation catalog,</div>
          <div>now a storefront.</div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', marginTop: 63 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 256,
              height: 58,
              borderRadius: 10,
              backgroundColor: EMBER,
              color: INK_950,
              fontSize: 25,
              letterSpacing: -0.4,
            }}
          >
            $1 for 3 months
          </div>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              marginLeft: 26,
              fontSize: 21,
              lineHeight: 1.32,
              color: INK_400,
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
