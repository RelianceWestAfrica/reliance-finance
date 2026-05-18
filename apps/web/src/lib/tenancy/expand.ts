// =============================================================================
// Tenancy - Expansion des entites visibles
// =============================================================================
// Regles :
//   - Si l'utilisateur a un role "Groupe" (DFG, AG, AUDITEUR, etc.) sur la
//     Holding, il voit TOUTES les entites actives du Groupe.
//   - Sinon, il voit ses entites directes + leurs descendants (Filiale -> SPV).
//
// Logique pure (sans I/O) : prend l'arbre des entites en entree, retourne
// l'ensemble des IDs visibles. Testable en isolation.
// =============================================================================

import { RoleCode } from '@reliance-finance/database';

import type { MembershipSummary } from '@/lib/rbac';

/**
 * Roles "Groupe" : leurs porteurs voient toutes les entites du Groupe
 * (Holding + filiales + SPV). Source : docs/rbac-matrix.md + cadre §12.
 */
export const GROUP_LEVEL_ROLES: ReadonlySet<RoleCode> = new Set([
  RoleCode.ADMIN,
  RoleCode.AG,
  RoleCode.DFG,
  RoleCode.CONTROLEUR_INTERNE,
  RoleCode.AUDITEUR,
  RoleCode.FINANCE_GROUPE,
  RoleCode.TRESORIER_GROUPE,
  RoleCode.CONTROLEUR_GROUPE,
  RoleCode.CHIEF_ACCOUNTANT,
  RoleCode.FP_AND_A,
  RoleCode.TAX_COMPLIANCE,
]);

export function hasGroupLevelRole(memberships: MembershipSummary[]): boolean {
  return memberships.some((m) => GROUP_LEVEL_ROLES.has(m.role));
}

export interface EntityNode {
  id: string;
  parentEntityId: string | null;
}

/**
 * Renvoie l'ensemble des entites visibles selon le scope de l'utilisateur.
 *
 * - `memberships`: les memberships actifs de l'utilisateur
 * - `allEntities`: l'arbre complet des entites actives (provient d'un seul
 *   findMany cote appelant)
 *
 * Comportement :
 *   - Role Groupe -> toutes les entites actives
 *   - Sinon -> entites avec membership direct + leurs descendants recursifs
 */
export function expandVisibleEntities(
  memberships: MembershipSummary[],
  allEntities: EntityNode[],
): string[] {
  if (hasGroupLevelRole(memberships)) {
    return allEntities.map((e) => e.id);
  }

  const directIds = new Set(memberships.map((m) => m.entityId));

  // Construit la table parent -> [children]
  const childrenOf = new Map<string, string[]>();
  for (const entity of allEntities) {
    if (entity.parentEntityId) {
      const arr = childrenOf.get(entity.parentEntityId) ?? [];
      arr.push(entity.id);
      childrenOf.set(entity.parentEntityId, arr);
    }
  }

  // BFS depuis chaque entite directe pour collecter tous les descendants
  const visible = new Set<string>(directIds);
  const stack = [...directIds];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) continue;
    const children = childrenOf.get(current) ?? [];
    for (const child of children) {
      if (!visible.has(child)) {
        visible.add(child);
        stack.push(child);
      }
    }
  }
  return Array.from(visible);
}
