// =============================================================================
// Audit log - Writer chaine cryptographique + verifier
// =============================================================================
// Garantie : pour un (entityType, entityId), la sequence d'AuditLog forme une
// chaine sha256 inviolable. Toute alteration d'une ligne casse les hashes
// suivants -> detectable via `verifyChain`.
//
// Concurrence : `appendAudit` ouvre une transaction Serializable pour eviter
// que deux ecritures simultanees ne reposent sur le meme `prevHash`. En cas
// de conflit, Prisma retry l'operation cote client (a configurer en M9).
// =============================================================================

import type { PrismaClient } from '@reliance-finance/database';
import { Prisma, prisma as defaultPrisma } from '@reliance-finance/database';

import { computeHash } from './hash.js';
import type { AuditAppendInput, AuditVerifyResult } from './types.js';

export async function appendAudit(
  input: AuditAppendInput,
  client: PrismaClient = defaultPrisma,
) {
  return client.$transaction(
    async (tx) => {
      // Tri composite : createdAt DESC puis id DESC pour garantir un ordre
      // deterministe meme en cas de collision a la milliseconde (cuid est
      // lexicographiquement croissant).
      const previous = await tx.auditLog.findFirst({
        where: { entityType: input.entityType, entityId: input.entityId },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        select: { hash: true },
      });

      const createdAt = new Date();
      const prevHash = previous?.hash ?? null;
      const hash = computeHash({
        prevHash,
        action: input.action,
        payload: input.payload,
        actorId: input.actorId ?? null,
        createdAt,
      });

      return tx.auditLog.create({
        data: {
          entityType: input.entityType,
          entityId: input.entityId,
          action: input.action,
          actorId: input.actorId ?? undefined,
          payload: input.payload as Prisma.InputJsonValue,
          ip: input.ip ?? undefined,
          userAgent: input.userAgent ?? undefined,
          prevHash,
          hash,
          createdAt,
        },
      });
    },
    { isolationLevel: 'Serializable' },
  );
}

export async function verifyChain(
  entityType: string,
  entityId: string,
  client: PrismaClient = defaultPrisma,
): Promise<AuditVerifyResult> {
  const logs = await client.auditLog.findMany({
    where: { entityType, entityId },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: {
      id: true,
      action: true,
      actorId: true,
      payload: true,
      prevHash: true,
      hash: true,
      createdAt: true,
    },
  });

  if (logs.length === 0) {
    return { ok: true, count: 0, reason: 'NO_ENTRIES' };
  }

  let expectedPrev: string | null = null;
  for (let i = 0; i < logs.length; i++) {
    const log = logs[i];
    if (!log) continue;

    if (log.prevHash !== expectedPrev) {
      return {
        ok: false,
        count: logs.length,
        brokenAtId: log.id,
        brokenAtIndex: i,
        reason: 'PREV_HASH_MISMATCH',
      };
    }

    const recomputed = computeHash({
      prevHash: expectedPrev,
      action: log.action,
      payload: log.payload,
      actorId: log.actorId,
      createdAt: log.createdAt,
    });

    if (recomputed !== log.hash) {
      return {
        ok: false,
        count: logs.length,
        brokenAtId: log.id,
        brokenAtIndex: i,
        reason: 'HASH_MISMATCH',
      };
    }

    expectedPrev = log.hash;
  }

  return { ok: true, count: logs.length };
}

export { computeHash, canonicalJson } from './hash.js';
export type { AuditAppendInput, AuditVerifyResult } from './types.js';
export { AuditAction } from './types.js';
