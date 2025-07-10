import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Enable compression
  compress: true,
  
  // Optimize images
  images: {
    domains: ['localhost'],
    formats: ['image/webp', 'image/avif'],
  },
  
  // Enable experimental features for better performance
  experimental: {
    optimizeCss: true,
  },
  
  // Webpack configuration to exclude database modules from client-side bundling
  webpack: (config: any, { isServer }: { isServer: boolean }) => {
    if (!isServer) {
      // Exclude database-related modules from client-side bundle
      config.resolve.fallback = {
        ...config.resolve.fallback,
        net: false,
        tls: false,
        fs: false,
        dns: false,
        pg: false,
        'pg-native': false,
        'pg-connection-string': false,
      };
    }
    return config;
  },
  
  // Server-side only packages for Turbopack
  serverExternalPackages: ['pg', 'pg-native', 'pg-connection-string'],
  
  // Skip type checking during build
  typescript: {
    ignoreBuildErrors: true,
  },
  
  // Skip ESLint during build
  eslint: {
    ignoreDuringBuilds: true,
  },
  
  // Force HTTPS in production
  async redirects() {
    if (process.env.NODE_ENV === 'production') {
      return [
        {
          source: '/(.*)',
          has: [{ type: 'header', key: 'x-forwarded-proto', value: 'http' }],
          destination: 'https://rebel-shops-6fbb5f3f808e.herokuapp.com/:path*',
          permanent: true,
        },
      ];
    }
    return [];
  },

  // Configure headers for security
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
