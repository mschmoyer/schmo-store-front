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
    <html
      lang="en"
      className={`${inter.variable} ${spaceGrotesk.variable} ${jetbrainsMono.variable}`}
      {...mantineHtmlProps}
    >
      <head>
        <ColorSchemeScript defaultColorScheme="auto" />
        {/*
          Sets data-theme before first paint so the page never flashes the
          wrong palette. AppProviders keeps it in sync afterwards; this only
          has to win the very first frame, and it reads the same localStorage
          key Mantine's own script uses.
        */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var s=localStorage.getItem('mantine-color-scheme-value');if(!s||s==='auto'){s=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}document.documentElement.dataset.theme=s;}catch(e){}})();`,
          }}
        />
      </head>
      <body className="antialiased">
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
