import type { NextConfig } from 'next';
import { withSentryConfig } from '@sentry/nextjs';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Mode standalone pour image Docker minimaliste (~100 MB vs ~1 GB)
  output: 'standalone',
  // Permet d'importer directement depuis les packages du monorepo sans build
  transpilePackages: [
    '@reliance-finance/database',
    '@reliance-finance/workflow-engine',
    '@reliance-finance/bridge-contract',
  ],
  // Argon2 est natif (node-gyp) - on l'exclut du bundle Edge
  serverExternalPackages: ['argon2', '@prisma/client', '.prisma/client'],
  experimental: {
    typedRoutes: false,
  },
  webpack: (config) => {
    config.resolve.extensionAlias = {
      '.js': ['.ts', '.tsx', '.js'],
    };
    return config;
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ];
  },
};

// Sentry wrapper - active uniquement si les env vars sont definies. Sans
// SENTRY_AUTH_TOKEN les sourcemaps ne sont pas uploadees mais le SDK runtime
// continue de fonctionner si SENTRY_DSN est present.
const baseConfig = withNextIntl(nextConfig);
const withSentry = withSentryConfig(baseConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  silent: !process.env.SENTRY_DEBUG,
  // No-op si pas de token (sourcemap upload skip)
  authToken: process.env.SENTRY_AUTH_TOKEN,
  // Reduit la surface de configuration en prod
  tunnelRoute: undefined,
  sourcemaps: { disable: false },
  disableLogger: true,
  automaticVercelMonitors: false,
});

// Permet de booter sans @sentry/nextjs cassant le build si SENTRY_* manquent
// totalement (le wrapper accepte org/project undefined).
export default process.env.NEXT_PUBLIC_SENTRY_DSN || process.env.SENTRY_DSN
  ? withSentry
  : baseConfig;
