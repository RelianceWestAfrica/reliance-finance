import nextConfig from '@reliance-finance/eslint-config/next.mjs';

export default [
  ...nextConfig,
  {
    ignores: ['.next/**', 'node_modules/**', 'next-env.d.ts'],
  },
];
