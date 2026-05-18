// =============================================================================
// Bank account - Verification d'utilisabilite (anti-fraude)
// =============================================================================
// Conformement au cadre §8 :
//   - "Tout changement RIB exige verification + delai de carence"
//   - "Interdiction de payer 'en urgence' sur un nouveau RIB non verifie"
//
// Logique pure (sans I/O) : appelee avant tout paiement et avant tout choix
// de RIB beneficiaire dans le BC.
// =============================================================================

export interface BankAccountStatus {
  isActive: boolean;
  verifiedAt: Date | null;
  quarantineUntil: Date | null;
}

export type UsabilityResult =
  | { usable: true }
  | { usable: false; reason: 'INACTIVE' | 'NOT_VERIFIED' | 'QUARANTINE'; message: string };

export function isBankAccountUsable(
  account: BankAccountStatus,
  now: Date = new Date(),
): UsabilityResult {
  if (!account.isActive) {
    return { usable: false, reason: 'INACTIVE', message: 'Compte bancaire inactif' };
  }
  if (!account.verifiedAt) {
    return {
      usable: false,
      reason: 'NOT_VERIFIED',
      message:
        'RIB non verifie. Confirmation telephone retour + email officiel requis (cadre §8).',
    };
  }
  if (account.quarantineUntil && account.quarantineUntil > now) {
    const hours = Math.ceil((account.quarantineUntil.getTime() - now.getTime()) / (3600 * 1000));
    return {
      usable: false,
      reason: 'QUARANTINE',
      message:
        'RIB en quarantaine encore ' +
        hours +
        ' h (jusqu\'au ' +
        account.quarantineUntil.toISOString() +
        ').',
    };
  }
  return { usable: true };
}

/**
 * Sucre : true si utilisable, false sinon. Pour les checks rapides en UI.
 */
export function isBankAccountUsableSimple(
  account: BankAccountStatus,
  now: Date = new Date(),
): boolean {
  return isBankAccountUsable(account, now).usable;
}
