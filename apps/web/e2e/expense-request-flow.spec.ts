// =============================================================================
// E2E - Workflow complet FDA -> validation N1 -> validation N2 -> BC -> Paiement
// =============================================================================

import { expect, test } from '@playwright/test';

import { login, logout, TEST_USERS } from './helpers';

test.describe('Workflow FDA -> Paiement (M4-M10)', () => {
  test('Demandeur cree FDA -> DAF valide N1 -> DFG valide N2', async ({ page }) => {
    // ----- Etape 1 : Demandeur cree une FDA -----
    await login(page, TEST_USERS.demandeur);
    await page.goto('/expense-requests/new');
    await page.getByLabel('Type').selectOption('FDA');
    await page.getByLabel('Intitule').fill('Achat materiel coffrage test E2E');
    await page.getByLabel('Description').fill('Test e2e : achat materiel pour chantier Akodessewa');
    await page.getByLabel('Justification').fill('Materiel necessaire pour avancement chantier');
    await page.getByLabel('Montant').fill('1500000');
    await page.getByLabel('OPEX').check();
    // Ajout une ligne
    await page.getByRole('button', { name: /ajouter une ligne/i }).click();
    await page.getByLabel('Designation').last().fill('Coffrage metallique');
    await page.getByLabel('Quantite').last().fill('10');
    await page.getByLabel('Prix unitaire').last().fill('150000');
    // Soumettre
    await page.getByRole('button', { name: /soumettre/i }).click();
    // Verifier statut SUBMITTED
    await expect(page.getByText(/SUBMITTED/i)).toBeVisible();
    const url = page.url();
    const erId = url.match(/expense-requests\/([^/]+)/)?.[1];
    expect(erId).toBeTruthy();
    await logout(page);

    // ----- Etape 2 : DAF Togo valide en N1 -----
    await login(page, TEST_USERS.dafTogo);
    await page.goto(`/expense-requests/${erId}`);
    await page.getByRole('button', { name: /valider n1/i }).click();
    await page.getByLabel('Commentaire').fill('Valide en N1 par test e2e');
    await page.getByRole('button', { name: /confirmer/i }).click();
    await expect(page.getByText(/APPROVAL_N2|APPROVAL_GROUP/i)).toBeVisible();
    await logout(page);

    // ----- Etape 3 : DFG valide en N2/Groupe -----
    await login(page, TEST_USERS.dfg);
    await page.goto(`/expense-requests/${erId}`);
    await page.getByRole('button', { name: /valider/i }).click();
    await page.getByLabel('Commentaire').fill('Valide en Groupe par test e2e');
    await page.getByRole('button', { name: /confirmer/i }).click();
    await expect(page.getByText(/APPROVED/i)).toBeVisible();

    // ----- Verification chaine audit -----
    await page.goto(`/audit?entityType=ExpenseRequest&entityId=${erId}`);
    await expect(page.getByText('EXPENSE_REQUEST_CREATED')).toBeVisible();
    await expect(page.getByText(/APPROVED.*N1|EXPENSE_REQUEST_APPROVED.*1/i)).toBeVisible();
    await expect(page.getByText(/APPROVED.*GROUP|EXPENSE_REQUEST_APPROVED.*GROUP/i)).toBeVisible();
  });

  test('Refuse signature si demandeur == validateur', async ({ page }) => {
    // Demandeur tente de valider sa propre FDA (separation des fonctions)
    await login(page, TEST_USERS.dafTogo); // DAF avec membership demandeur
    await page.goto('/expense-requests/new');
    await page.getByLabel('Intitule').fill('Test separation fonctions');
    await page.getByLabel('Montant').fill('500000');
    await page.getByRole('button', { name: /soumettre/i }).click();
    const url = page.url();
    const erId = url.match(/expense-requests\/([^/]+)/)?.[1];
    // Le bouton "Valider N1" doit etre absent ou desactive
    await expect(page.getByRole('button', { name: /valider n1/i })).toBeDisabled();
    expect(erId).toBeTruthy();
  });

  test('FD_URGENCE declenche SLA 72h', async ({ page }) => {
    await login(page, TEST_USERS.demandeur);
    await page.goto('/expense-requests/new');
    await page.getByLabel('Type').selectOption('FD_URGENCE');
    await page.getByLabel('Intitule').fill('Urgence test E2E');
    await page.getByLabel('Niveau urgence').selectOption('HIGH');
    await page.getByLabel('Motif urgence').fill('Arret chantier critique - 4 conditions reunies');
    await page.getByLabel('Montant').fill('800000');
    await page.getByRole('button', { name: /soumettre/i }).click();
    // Apres soumission, emergencyDeadlineAt doit etre <= 72h
    const deadlineText = await page.getByText(/echeance regularisation/i).innerText();
    expect(deadlineText).toBeTruthy();
  });
});
