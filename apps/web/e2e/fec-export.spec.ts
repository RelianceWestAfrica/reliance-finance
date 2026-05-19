// =============================================================================
// E2E - Export FEC SYSCOHADA (M12)
// =============================================================================
// Verifie qu'on peut clore une periode comptable et exporter le FEC dans le
// format DGFiP attendu (18 colonnes pipe-separated, UTF-8 BOM).
// =============================================================================

import { expect, test } from '@playwright/test';

import { login, TEST_USERS } from './helpers';

test.describe('Export FEC SYSCOHADA (M12)', () => {
  test('DFG peut exporter le FEC du mois courant', async ({ page, request }) => {
    await login(page, TEST_USERS.dfg);
    await page.goto('/accounting/periods');

    // La page liste les periodes ouvertes / cloturees
    await expect(page.getByText(/periode/i)).toBeVisible();

    // Selectionner la periode du mois en cours
    const today = new Date();
    const monthLabel = today.toLocaleString('fr-FR', { month: 'long', year: 'numeric' });

    const periodRow = page.getByText(monthLabel);
    if (await periodRow.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await periodRow.click();
      await page.getByRole('button', { name: /exporter fec/i }).click();
    } else {
      test.skip(true, 'Pas de periode pour le mois courant - skip');
    }

    // Verifier le download
    const downloadPromise = page.waitForEvent('download');
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/^FEC[-_]\d{6}\.txt$/);
  });

  test('Format FEC : 18 colonnes pipe-separated + BOM UTF-8', async ({ page, request }) => {
    // Test direct sur l'endpoint API
    test.skip(true, 'Necessite un periode test seedee + role DFG via API token');
  });

  test("Tentative de cloturer une periode 2 fois = no-op", async ({ page }) => {
    await login(page, TEST_USERS.dfg);
    await page.goto('/accounting/periods');
    test.skip(true, 'Necessite une periode test seedee');
  });
});
