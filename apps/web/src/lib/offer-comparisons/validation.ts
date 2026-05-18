// =============================================================================
// Offer comparison - Validation pre-submission
// =============================================================================
// Verifie qu'un comparatif est complet et coherent avant de pouvoir etre
// soumis a approbation. Logique PURE.
//
// Regles (Modele 1 cadre §p21+) :
//   - Au moins 2 offres comparees (sauf si la nature autorise 1 seule
//     -> auquel cas il faut une SoleSourceJustification)
//   - Toutes les offres ont un prix > 0
//   - Une offre est recommandee
//   - La justification de la recommandation existe et fait au moins 30 chars
// =============================================================================

export interface OfferSummary {
  id: string;
  supplierId: string;
  priceTtc: number;
  technicallyCompliant: boolean;
}

export interface OfferComparisonContext {
  offers: OfferSummary[];
  recommendedOfferId: string | null;
  recommendationJustification: string | null;
}

export type ValidationResult =
  | { ok: true }
  | { ok: false; violations: string[] };

export function validateForSubmission(ctx: OfferComparisonContext): ValidationResult {
  const violations: string[] = [];

  if (ctx.offers.length < 2) {
    violations.push(
      'Au moins 2 offres requises pour un comparatif (sinon, utiliser une justification offre unique - Modele 2)',
    );
  }

  for (const offer of ctx.offers) {
    if (offer.priceTtc <= 0) {
      violations.push('Offre ' + offer.id + ' : prix TTC doit etre > 0');
    }
  }

  if (!ctx.recommendedOfferId) {
    violations.push('Une offre doit etre recommandee');
  } else {
    const found = ctx.offers.find((o) => o.id === ctx.recommendedOfferId);
    if (!found) {
      violations.push('La recommandation pointe sur une offre absente du comparatif');
    } else if (!found.technicallyCompliant) {
      violations.push('L\'offre recommandee doit etre techniquement conforme');
    }
  }

  if (!ctx.recommendationJustification || ctx.recommendationJustification.trim().length < 30) {
    violations.push('Justification de la recommandation requise (>= 30 caracteres)');
  }

  if (violations.length === 0) return { ok: true };
  return { ok: false, violations };
}

/**
 * Calcule un score automatique pour chaque offre. Utilise pour l'aide a la
 * decision (UI suggere la "meilleure" offre, le validateur peut ignorer).
 *
 * Score = w1 * (prix le plus bas / prix) + w2 * conformite_technique
 *
 * Renvoie une liste triee par score decroissant.
 */
export function rankOffers(
  offers: OfferSummary[],
  weights: { price: number; technical: number } = { price: 0.7, technical: 0.3 },
): { offer: OfferSummary; score: number }[] {
  if (offers.length === 0) return [];
  const compliantOffers = offers.filter((o) => o.priceTtc > 0);
  if (compliantOffers.length === 0) return [];

  const lowestPrice = Math.min(...compliantOffers.map((o) => o.priceTtc));

  const scored = offers.map((o) => {
    if (o.priceTtc <= 0) return { offer: o, score: 0 };
    const priceScore = lowestPrice / o.priceTtc;
    const techScore = o.technicallyCompliant ? 1 : 0;
    return {
      offer: o,
      score: weights.price * priceScore + weights.technical * techScore,
    };
  });

  return scored.sort((a, b) => b.score - a.score);
}
