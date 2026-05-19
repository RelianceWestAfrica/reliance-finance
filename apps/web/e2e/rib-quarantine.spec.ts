// =============================================================================
// E2E - Anti-fraude RIB (M3) : double validation + quarantaine 24h
// =============================================================================

import { expect, test } from '@playwright/test';

import { login, logout, TEST_USERS } from './helpers';

test.describe('Anti-fraude RIB (M3)', () => {
  test('Demande changement RIB -> validation N1 + N2 -> quarantaine 24h', async ({ page }) => {
    // Pre-requis : un fournisseur de demo seede avec RIB initial verifie
    const supplierCode = 'FRN-DEMO-001'; // depend du seed

    await login(page, TEST_USERS.dafTogo);

    // ----- Etape 1 : demande de changement -----
    await page.goto('/suppliers');
    await page.getByRole('link', { name: supplierCode }).click();
    await page.getByRole('tab', { name: /ribs/i }).click();
    await page.getByRole('button', { name: /demander un changement/i }).click();
    await page.getByLabel('Banque').fill('Ecobank Togo');
    await page.getByLabel('Titulaire').fill('Fournisseur Demo SARL');
    await page.getByLabel('IBAN').fill('TG530001012345678901230');
    await page.getByLabel('Justification').fill('Test e2e demande changement RIB');
    await page.getByRole('button', { name: /soumettre/i }).click();

    await expect(page.getByText(/REQUESTED/i)).toBeVisible();

    // ----- Etape 2 : validation N1 (par un AUTRE DAF Pays) -----
    // Pour ce test, on simule avec un user DFG (qui a aussi le role N1 dans
    // certaines configurations). Sinon il faut un 2eme compte DAF.
    test.skip(
      true,
      'Necessite un 2eme compte DAF_PAYS (separation des fonctions) - fixture a creer',
    );
  });

  test("Tentative de payer un RIB en quarantaine = blocage", async ({ page }) => {
    await login(page, TEST_USERS.demandeur);
    // Naviguer vers un paiement existant avec RIB en quarantaine (depend du seed)
    test.skip(true, 'Necessite un fixture seede : Payment en attente + RIB QUARANTAINE');
  });

  test('Helpers de detection RIB suspect : 3 regles', async ({ page }) => {
    // Test d'integration des regles de detection cote API
    test.skip(true, 'Couvert par les tests unitaires (anomaly-detection.test.ts)');
  });
});
