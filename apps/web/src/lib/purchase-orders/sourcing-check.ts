// =============================================================================
// Purchase order - Verification sourcing (3 offres ou justification)
// =============================================================================
// Cadre §6 : "Tout achat ou prestation engageant financierement RWA doit etre
// formalise avant execution par BC ou Contrat". Au-dessus du seuil "3 offres",
// le BC doit etre adosse a :
//   - soit un comparatif d'offres valide (au moins 2 offres comparees +
//     recommandation justifiee)
//   - soit une justification offre unique signee (Modele 2)
//
// Logique pure : prend le contexte sourcing du BC, retourne OK ou la raison
// du blocage. Aucune I/O.
// =============================================================================

export interface SourcingContext {
  amountInGroupCurrency: number;
  /** Seuil au-dessus duquel un sourcing formel est requis */
  threeOffersThreshold: number | null;
  /** Le BC est adosse a un comparatif APPROVED ? */
  hasApprovedOfferComparison: boolean;
  /** Le BC est adosse a une justification offre unique APPROVED ? */
  hasApprovedSoleSourceJustification: boolean;
}

export type SourcingCheckResult =
  | { ok: true }
  | { ok: false; reason: string };

export function checkSourcing(ctx: SourcingContext): SourcingCheckResult {
  // Sous le seuil : pas de sourcing formel requis
  if (ctx.threeOffersThreshold === null) return { ok: true };
  if (ctx.amountInGroupCurrency <= ctx.threeOffersThreshold) return { ok: true };

  // Au-dessus du seuil : un comparatif OU une justification doit etre approuve
  if (ctx.hasApprovedOfferComparison || ctx.hasApprovedSoleSourceJustification) {
    return { ok: true };
  }

  return {
    ok: false,
    reason:
      'Au-dessus du seuil "3 offres" (' +
      ctx.threeOffersThreshold +
      ') : un comparatif d\'offres APPROVED OU une justification offre unique APPROVED est requis avant signature (cadre §6).',
  };
}
