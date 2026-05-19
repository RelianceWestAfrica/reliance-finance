// =============================================================================
// Configuration Playwright - Reliance Finance e2e tests
// =============================================================================
// Necessite :
//   - PostgreSQL + MinIO + Mailhog en local (docker compose -f
//     docker-compose.dev.yml up -d)
//   - DB seedee (pnpm db:seed)
//   - .env.local correctement configure
//
// Lancement :
//   pnpm test:e2e            // run headless
//   pnpm test:e2e:ui         // mode UI (debug interactif)
//   pnpm test:e2e:headed     // affiche le navigateur
// =============================================================================

import { defineConfig, devices } from '@playwright/test';

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false, // Series par defaut : etats partages (DB seedee)
  workers: 1,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [['html'], ['github']] : 'list',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 5_000,
    navigationTimeout: 10_000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  // Demarrage automatique du serveur Next si pas deja en cours
  webServer: process.env.CI
    ? {
        command: 'pnpm dev',
        url: BASE_URL,
        reuseExistingServer: false,
        timeout: 60_000,
      }
    : undefined,
});
