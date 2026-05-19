// =============================================================================
// Helpers e2e
// =============================================================================
// Utilitaires partages entre specs : login, navigation, attendus communs.
// =============================================================================

import { expect, type Page } from '@playwright/test';

export interface TestUser {
  email: string;
  password: string;
  name: string;
  role: string;
}

// Comptes par defaut crees par le seed (cf. packages/database/prisma/seed.ts)
export const TEST_USERS = {
  admin: {
    email: 'admin@reliancewestafrica.com',
    password: 'ChangeMe123!',
    name: 'Admin Reliance',
    role: 'ADMIN',
  },
  dfg: {
    email: 'dfg@reliancewestafrica.com',
    password: 'ChangeMe123!',
    name: 'DFG Reliance',
    role: 'DFG',
  },
  dafTogo: {
    email: 'daf.togo@reliancewestafrica.com',
    password: 'ChangeMe123!',
    name: 'DAF Togo',
    role: 'DAF_PAYS',
  },
  demandeur: {
    email: 'demandeur@reliancewestafrica.com',
    password: 'ChangeMe123!',
    name: 'Demandeur Test',
    role: 'USER',
  },
} satisfies Record<string, TestUser>;

export async function login(page: Page, user: TestUser) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(user.email);
  await page.getByLabel('Mot de passe').fill(user.password);
  await page.getByRole('button', { name: /se connecter/i }).click();
  // Wait redirection vers dashboard
  await page.waitForURL('**/dashboard', { timeout: 10_000 });
}

export async function logout(page: Page) {
  await page.getByRole('button', { name: /deconnexion/i }).click();
  await page.waitForURL('**/login', { timeout: 5_000 });
}

export async function expectAuditLogContains(
  page: Page,
  entityType: string,
  entityId: string,
  action: string,
) {
  await page.goto(`/audit?entityType=${entityType}&entityId=${entityId}`);
  await expect(page.getByText(action)).toBeVisible();
}
