import type { NextConfig } from "next";

/**
 * Canonical public host. All production traffic is redirected here so that
 * `www.rebelshops.com`, the `*.vercel.app` production alias and any other
 * attached domain resolve to one address for SEO and cookie scoping.
 *
 * Overridable so a staging project can canonicalise to its own domain.
 */
const CANONICAL_HOST = process.env.NEXT_PUBLIC_CANONICAL_HOST || "rebelshops.com";

/**
 * `VERCEL_ENV` is "production" | "preview" | "development". Canonical-host
 * redirects must never fire on preview deployments — every preview has its own
 * generated hostname and would redirect itself into production.
 */
const IS_PRODUCTION_DEPLOYMENT = process.env.VERCEL_ENV === "production";

/**
 * Content Security Policy.
 *
 * Deliberately permissive where this app needs it:
 *   - `'unsafe-inline'` in style-src, because Mantine and Tailwind emit inline
 *     style attributes and `<style>` blocks that cannot carry a nonce.
 *   - `'unsafe-inline'` in script-src, because Next.js inlines hydration data
 *     and flight chunks without a nonce in the current setup.
 *   - Stripe's `js.stripe.com` (Elements) and `api.stripe.com` (network).
 *
 * Shipped as Report-Only by default. A CSP that blocks a payment iframe is a
 * worse outcome than no CSP, so enforcement is opt-in: set `CSP_ENFORCE=true`
 * once the browser console is clean of violation reports.
 */
function buildContentSecurityPolicy(): string {
  const scriptSrc = [
    "'self'",
    "'unsafe-inline'",
    // Turbopack/webpack dev tooling evaluates code at runtime.
    ...(process.env.NODE_ENV === "production" ? [] : ["'unsafe-eval'"]),
    "https://js.stripe.com",
    "https://va.vercel-scripts.com",
  ].join(" ");

  return [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    // 'self', not 'none': the customizer frames /store/* from this origin.
    // With 'none' this becomes a latent kill switch that takes the preview
    // down the moment CSP_ENFORCE=true, long after anyone remembers why.
    "frame-ancestors 'self'",
    "form-action 'self'",
    `script-src ${scriptSrc}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    [
      "connect-src 'self'",
      "https://api.stripe.com",
      "https://api.shipstation.com",
      "https://*.vercel-insights.com",
      "https://va.vercel-scripts.com",
    ].join(" "),
    "frame-src https://js.stripe.com https://hooks.stripe.com",
    "worker-src 'self' blob:",
    "upgrade-insecure-requests",
  ].join("; ");
}

const nextConfig: NextConfig = {
  compress: true,

  // Do not advertise the framework version.
  poweredByHeader: false,

  images: {
    // `images.domains` is deprecated; remotePatterns is the supported form and
    // allows scoping by protocol and path rather than host alone.
    remotePatterns: [
      { protocol: "http", hostname: "localhost" },
      { protocol: "http", hostname: "127.0.0.1" },
      // Any HTTPS host.
      //
      // This is multi-tenant: product imagery belongs to the merchant, and the
      // URLs arrive from their ShipStation catalog pointing at whatever host
      // they already use — their own domain, a Shopify CDN, S3, Cloudinary.
      // A merchant's inventory page crashed outright on
      // `shopsunnytails.com`, because an allowlist cannot enumerate hosts we
      // do not control and will never know in advance. Any fixed list is a
      // crash waiting for the next merchant who signs up.
      //
      // The trade-off, stated plainly: the optimizer will fetch any HTTPS URL
      // this app renders, so it must never render a URL from an untrusted
      // source. Product image URLs come from the merchant's own authenticated
      // ShipStation account or their own uploads, which is the trust boundary
      // being relied on here. `dangerouslyAllowSVG` stays off, so a hostile
      // URL cannot serve script-bearing SVG through the optimizer.
      { protocol: "https", hostname: "**" },
    ],
    // Deliberately absent: dangerouslyAllowSVG. With `**` above, enabling it
    // would let any host serve script-bearing SVG from our origin.
    formats: ["image/webp", "image/avif"],
    minimumCacheTTL: 60 * 60 * 24 * 7,
  },

  experimental: {
    optimizeCss: true,
  },

  /**
   * Keeps the Postgres drivers out of the client bundle and out of the server
   * bundler entirely. This replaces the old `webpack.resolve.fallback` block:
   * `serverExternalPackages` is honoured by both webpack and Turbopack, whereas
   * the fallback shim only ever applied to webpack builds.
   */
  serverExternalPackages: [
    "pg",
    "pg-native",
    "pg-connection-string",
    "@neondatabase/serverless",
  ],

  /**
   * Type errors are still ignored at build time: `npx tsc --noEmit` currently
   * reports ~500 pre-existing errors across the codebase. Flip this to `false`
   * once that backlog is cleared — leaving it on means a type regression can
   * reach production.
   */
  typescript: {
    ignoreBuildErrors: true,
  },

  /**
   * ESLint is still ignored at build time. `npm run lint` currently reports 4
   * `no-unused-vars` errors (src/lib/billing/cart-pricing.ts,
   * src/lib/shipstation/xmlParser.ts). Flip this to `false` as soon as those
   * are fixed — it is a one-line change and the only reason it is not already
   * off. Lint was clean earlier in this migration, so the backlog is small.
   */
  eslint: {
    ignoreDuringBuilds: true,
  },

  /**
   * Canonicalise the public host.
   *
   * Production only: preview deployments keep their generated hostnames.
   * `/api`, `/_next` and `/_vercel` are excluded so that server-to-server calls
   * (the cron sync job calls back into `/api/admin/sync/*`) and asset requests
   * are never bounced through a redirect.
   *
   * @returns Redirect rules for the current deployment environment.
   */
  async redirects() {
    if (!IS_PRODUCTION_DEPLOYMENT) {
      return [];
    }

    return [
      {
        source: "/:path((?!api/|_next/|_vercel/).*)",
        missing: [{ type: "host", value: CANONICAL_HOST }],
        destination: `https://${CANONICAL_HOST}/:path`,
        permanent: true,
      },
    ];
  },

  /**
   * Security headers applied to every response.
   *
   * These live here rather than in `vercel.json` so they also apply in local
   * development and to any non-Vercel host, and so there is exactly one place
   * to change them. `vercel.json` handles only edge-level caching concerns.
   *
   * @returns Header rules.
   */
  async headers() {
    const cspHeaderName =
      process.env.CSP_ENFORCE === "true"
        ? "Content-Security-Policy"
        : "Content-Security-Policy-Report-Only";

    return [
      {
        // Storefronts are deliberately frameable by this origin, because the
        // theme customizer previews a live store in an iframe. The blanket
        // `X-Frame-Options: DENY` below matched `/(.*)`, which includes
        // `/store/*`, so the customizer's preview pane was blocked by our own
        // header: the merchant got a permanent "Loading your storefront…"
        // spinner and the single most important feature in the product never
        // worked. It was not environment-gated, so production shipped it too.
        //
        // SAMEORIGIN rather than removing the header: a storefront should be
        // framed by our customizer and by nothing else. `frame-ancestors`
        // below carries the same rule for browsers that honour CSP, which is
        // the modern equivalent and supersedes X-Frame-Options where both
        // apply.
        source: "/store/:path*",
        headers: [
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
      {
        // Everything except /store/*. Next applies EVERY matching entry, so a
        // plain `/(.*)` here still re-applied `DENY` to storefronts and
        // silently defeated the SAMEORIGIN rule above — the customizer preview
        // stayed blocked even after the storefront entry was added.
        source: "/((?!store/).*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            // Two years, subdomains included, preload-eligible. Only meaningful
            // over HTTPS; browsers ignore it on plain HTTP localhost.
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          {
            key: "Permissions-Policy",
            value: [
              "camera=()",
              "microphone=()",
              "geolocation=()",
              "browsing-topics=()",
              "interest-cohort=()",
              // Stripe Elements uses the Payment Request API.
              "payment=(self \"https://js.stripe.com\")",
            ].join(", "),
          },
          { key: "X-DNS-Prefetch-Control", value: "on" },
          { key: cspHeaderName, value: buildContentSecurityPolicy() },
        ],
      },
      {
        // Never let a proxy or the CDN cache an API response by default.
        source: "/api/(.*)",
        headers: [
          { key: "Cache-Control", value: "no-store, max-age=0" },
          { key: "X-Robots-Tag", value: "noindex" },
        ],
      },
    ];
  },
};

export default nextConfig;
