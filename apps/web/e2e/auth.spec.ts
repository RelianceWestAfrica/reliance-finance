// =============================================================================
// E2E - Authentification (M1)
// =============================================================================

import { expect, test } from '@playwright/test';

import { login, TEST_USERS } from './helpers';

test.describe('Authentification', () => {
  test('login admin par defaut', async ({ page }) => {
    await login(page, TEST_USERS.admin);
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByText(/admin/i)).toBeVisible();
  });

  test('rejette un mauvais mot de passe', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill(TEST_USERS.admin.email);
    await page.getByLabel('Mot de passe').fill('wrong-password');
    await page.getByRole('button', { name: /se connecter/i }).click();
    // Doit afficher un message d'erreur, pas rediriger
    await expect(page.getByText(/identifiants invalides|incorrect/i)).toBeVisible({
      timeout: 3_000,
    });
    await expect(page).toHaveURL(/\/login/);
  });

  test('redirige vers /set-password si hashedPassword null', async ({ page }) => {
    // Ce test exige un user fraichement invite (hashedPassword = null).
    // Skip si pas de fixture preparee.
    test.skip(true, 'Necessite un user fixture avec hashedPassword=null');
  });

  test('session expire apres 15 minutes (cookie maxAge)', async ({ page, context }) => {
    await login(page, TEST_USERS.admin);
    const cookies = await context.cookies();
    const sessionCookie = cookies.find((c) => c.name.startsWith('authjs.session-token'));
    expect(sessionCookie).toBeDefined();
    if (sessionCookie?.expires) {
      const ttlSeconds = sessionCookie.expires - Date.now() / 1000;
      // 900s = 15 min, on tolere une marge
      expect(ttlSeconds).toBeGreaterThan(800);
      expect(ttlSeconds).toBeLessThanOrEqual(900 + 10);
    }
  });

  test('endpoint /api/health repond 200', async ({ request }) => {
    const r = await request.get('/api/health');
    expect(r.status()).toBe(200);
    const body = await r.json();
    expect(body.status).toBe('ok');
    expect(body.db).toBe('up');
  });
});
