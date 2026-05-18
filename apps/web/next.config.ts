import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Mode standalone pour image Docker minimaliste (~100 MB vs ~1 GB)
  output: 'standalone',
  // Permet d'importer directement depuis les packages du monorepo sans build
  transpilePackages: ['@reliance-finance/database', '@reliance-finance/workflow-engine'],
  // Argon2 est natif (node-gyp) - on l'exclut du bundle Edge
  serverExternalPackages: ['argon2', '@prisma/client', '.prisma/client'],
  experimental: {
    typedRoutes: false,
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

export default nextConfig;
