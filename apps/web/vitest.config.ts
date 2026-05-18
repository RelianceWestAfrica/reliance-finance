import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  test: {
    environment: 'node',
    globals: false,
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['node_modules', '.next', 'dist'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      // Scope : LOGIQUE PURE testable en isolation (sans Prisma reel ni
      // headers Next.js). Les wrappers d'I/O (extension.ts, actor-context.ts)
      // seront couverts par les tests d'integration en session M9.
      include: [
        'src/lib/tenancy/filter.ts',
        'src/lib/tenancy/models.ts',
        'src/lib/tenancy/expand.ts',
        'src/lib/audit/hash.ts',
        'src/lib/audit/log.ts',
        'src/lib/audit/types.ts',
        'src/lib/thresholds/resolve.ts',
        'src/lib/bank-accounts/usability.ts',
        'src/lib/bank-accounts/change-validation.ts',
        'src/lib/bank-accounts/anomaly-detection.ts',
      ],
      exclude: ['**/*.test.ts', '**/*.spec.ts', '**/*.d.ts'],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 75,
        statements: 80,
      },
    },
  },
});
