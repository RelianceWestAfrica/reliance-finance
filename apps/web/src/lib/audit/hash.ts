// =============================================================================
// Audit log - Fonctions pures de hash (testables sans I/O)
// =============================================================================

import { createHash } from 'node:crypto';

/**
 * Serialisation canonique JSON deterministe (cle triees recursivement).
 * Necessaire pour que deux machines produisent le meme hash.
 */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return '[' + value.map(canonicalJson).join(',') + ']';
  }
  const obj = value as Record<string, unknown>;
  const sortedKeys = Object.keys(obj).sort();
  return (
    '{' +
    sortedKeys
      .map((k) => JSON.stringify(k) + ':' + canonicalJson(obj[k]))
      .join(',') +
    '}'
  );
}

export interface HashInput {
  prevHash: string | null;
  action: string;
  payload: unknown;
  actorId: string | null;
  createdAt: Date;
}

/**
 * Hash deterministe : sha256( prevHash || '|' || action || '|' || canonical(payload) || '|' || actorId || '|' || iso(createdAt) )
 *
 * Le '|' est un separateur pour eviter les collisions du type
 * `actorId="x", payload="y"` vs `actorId="xy", payload=""`.
 */
export function computeHash(input: HashInput): string {
  const parts = [
    input.prevHash ?? 'NULL',
    input.action,
    canonicalJson(input.payload),
    input.actorId ?? 'NULL',
    input.createdAt.toISOString(),
  ];
  return createHash('sha256').update(parts.join('|')).digest('hex');
}
