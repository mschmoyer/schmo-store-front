import type { Metadata } from 'next';
import { Inter, JetBrains_Mono, Space_Grotesk } from 'next/font/google';
import './globals.css';
import '@mantine/core/styles.css';
import '@mantine/notifications/styles.css';
import '@/styles/mantine-overrides.css';
import { ColorSchemeScript, mantineHtmlProps } from '@mantine/core';
import { AppProviders } from '@/components/ui/AppProviders';
import { generateLandingPageMeta } from '@/components/seo/LandingPageMeta';

/**
 * Typography per design-system §3. Every family is loaded with `display: swap`
 * so first paint never waits on a webfont, and exposed as the CSS variable the
 * token layer reads.
 */

/** Display face — headings, numerals, prices, the wordmark. */
const spaceGrotesk = Space_Grotesk({
  variable: '--font-space-grotesk',
  subsets: ['latin'],
  display: 'swap',
  weight: ['500', '600', '700'],
});

/** UI and body face. Variable weight. */
const inter = Inter({
  variable: '--font-inter',
  subsets: ['latin'],
  display: 'swap',
  axes: ['opsz'],
});

/** Mono face — SKUs, order IDs, API keys. */
const jetbrainsMono = JetBrains_Mono({
  variable: '--font-jetbrains-mono',
  subsets: ['latin'],
  display: 'swap',
  weight: ['400', '500', '600'],
});

const SITE_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://rebelshops.com';

export const metadata: Metadata = {
  // Resolves relative OG/twitter image paths and silences the build warning.
  metadataBase: new URL(SITE_URL),
  ...generateLandingPageMeta(),
};

/**
 * Root layout. Mounts the font variables, the design-system stylesheet and the
 * client provider stack (theme context, Mantine, notifications).
 *
 * @param props.children - The routed page tree.
 * @returns The application document shell.
 */
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // The font variables must sit on <html>, not <body>: globals.css declares
    // `--font-sans: var(--font-inter), …` on :root, and a var() that is not
    // resolvable at that element makes the whole declaration invalid at
    // computed-value time — every font token would silently fall back to
    // system sans.
    // data-theme="light" pins the product to the approved palette.
    //
    // globals.css carries a `prefers-color-scheme: dark` override, so the
    // marketing site was silently rendering near-black (#0e0f11) for every
    // visitor whose OS is in dark mode — half the audience seeing a variant
    // nobody art-directed, that matches neither the OG card nor the brand
    // assets nor any screenshot we would show someone. Nothing in the product
    // ever offered a dark-mode toggle, so that support was accidental rather
    // than designed.
    //
    // The dark block is guarded by `:not([data-theme="light"])`, so this
    // disables it without duplicating the 57 semantic tokens it redefines.
    // Merchant storefronts are unaffected: they render from their own
    // `--st-*` layer, and a merchant who picks the dark Voltage preset still
    // gets a dark shop, because that is their choice rather than their OS's.
    <html
      lang="en"
      data-theme="light"
      className={`${inter.variable} ${spaceGrotesk.variable} ${jetbrainsMono.variable}`}
      {...mantineHtmlProps}
    >
      <head>
        <ColorSchemeScript defaultColorScheme="light" />
        {/*
          No pre-paint colour-scheme script.

          It used to read `prefers-color-scheme` and write
          `document.documentElement.dataset.theme = 'dark'`, which overwrote
          the `data-theme="light"` attribute above before the first frame —
          so pinning the palette in the markup had no effect at all and the
          product still rendered near-black for anyone whose OS is dark.

          The palette is now fixed in the markup, so there is nothing to
          restore from storage and nothing to compute before paint.
        */}
      </head>
      <body className="antialiased">
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
