// =============================================================================
// RBAC helpers - Reliance Finance
// =============================================================================
// Verifie les roles d'un utilisateur sur une entite donnee.
// Source : docs/rbac-matrix.md
// =============================================================================

import { RoleCode, prisma } from '@reliance-finance/database';

export class UnauthorizedError extends Error {
  constructor(message = 'Authentification requise') {
    super(message);
    this.name = 'UnauthorizedError';
  }
}

export class ForbiddenError extends Error {
  constructor(message = 'Acces refuse pour ce role') {
    super(message);
    this.name = 'ForbiddenError';
  }
}

export interface MembershipSummary {
  entityId: string;
  entityCode: string;
  role: RoleCode;
}

export async function getUserMemberships(userId: string): Promise<MembershipSummary[]> {
  const memberships = await prisma.membership.findMany({
    where: { userId, isActive: true },
    include: { entity: { select: { id: true, code: true } } },
  });
  return memberships.map((m) => ({
    entityId: m.entityId,
    entityCode: m.entity.code,
    role: m.role,
  }));
}

export function hasRole(
  memberships: MembershipSummary[],
  role: RoleCode,
  entityId?: string,
): boolean {
  return memberships.some(
    (m) => m.role === role && (entityId === undefined || m.entityId === entityId),
  );
}

export function hasAnyRole(
  memberships: MembershipSummary[],
  roles: RoleCode[],
  entityId?: string,
): boolean {
  return roles.some((r) => hasRole(memberships, r, entityId));
}

export function requireRole(
  memberships: MembershipSummary[],
  role: RoleCode,
  entityId?: string,
): void {
  if (!hasRole(memberships, role, entityId)) {
    throw new ForbiddenError(
      'Role requis : ' + role + (entityId ? ' (entite ' + entityId + ')' : ''),
    );
  }
}

export function requireAnyRole(
  memberships: MembershipSummary[],
  roles: RoleCode[],
  entityId?: string,
): void {
  if (!hasAnyRole(memberships, roles, entityId)) {
    throw new ForbiddenError('Au moins un de ces roles requis : ' + roles.join(', '));
  }
}

/**
 * Liste des entites visibles par un utilisateur (selon ses memberships).
 * Un membership Holding implique l'acces transverse (Groupe).
 */
export function visibleEntityIds(memberships: MembershipSummary[]): string[] {
  return Array.from(new Set(memberships.map((m) => m.entityId)));
}
