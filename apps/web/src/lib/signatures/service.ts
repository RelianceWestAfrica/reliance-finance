// =============================================================================
// Signatures - Service de creation avec chainage cryptographique
// =============================================================================
// Conforme a l'ADR 0002 §2.5 :
//   - signatureHash = sha256(prevHash + documentHash + actorId + ts + ip + ua + comment + stage)
//   - prevHash = signatureHash de la signature precedente sur le MEME
//     WorkflowInstance
//   - Documenthash = sha256 du snapshot canonique du document signe (fige a
//     l'instant T)
//
// Garanties :
//   - Transaction Serializable : pas de signature parallele bypass
//   - Index unique (workflowInstanceId, stepId, actorId, stage) : impossible
//     de signer 2 fois la meme etape
// =============================================================================

import { createHash } from 'node:crypto';

import {
  prisma,
  type SignatureStage,
  type RoleCode,
  type PrismaClient,
} from '@reliance-finance/database';

import { canonicalJson } from '@/lib/audit/hash';

export interface CreateSignatureInput {
  workflowInstanceId: string;
  stepId?: string | null;
  actorId: string;
  role: RoleCode;
  stage: SignatureStage;
  /** Snapshot du document signe a cet instant (sera hashe en SHA-256 canonical) */
  documentSnapshot: unknown;
  ip?: string | null;
  userAgent?: string | null;
  comment?: string | null;
}

export function hashDocument(snapshot: unknown): string {
  return createHash('sha256').update(canonicalJson(snapshot)).digest('hex');
}

export function buildSignatureHash(input: {
  prevHash: string | null;
  documentHash: string;
  actorId: string;
  stage: SignatureStage;
  signedAt: Date;
  ip: string | null;
  userAgent: string | null;
  comment: string | null;
}): string {
  const payload = [
    input.prevHash ?? 'NULL',
    input.documentHash,
    input.actorId,
    input.stage,
    input.signedAt.toISOString(),
    input.ip ?? 'NULL',
    input.userAgent ?? 'NULL',
    input.comment ?? 'NULL',
  ].join('|');
  return createHash('sha256').update(payload).digest('hex');
}

export async function createSignature(
  input: CreateSignatureInput,
  client: PrismaClient = prisma,
) {
  return client.$transaction(
    async (tx) => {
      // 1. Recupere la derniere signature sur ce WorkflowInstance (chainage)
      const previous = await tx.signature.findFirst({
        where: { workflowInstanceId: input.workflowInstanceId },
        orderBy: [{ signedAt: 'desc' }, { id: 'desc' }],
        select: { signatureHash: true },
      });

      const signedAt = new Date();
      const documentHash = hashDocument(input.documentSnapshot);
      const prevHash = previous?.signatureHash ?? null;
      const signatureHash = buildSignatureHash({
        prevHash,
        documentHash,
        actorId: input.actorId,
        stage: input.stage,
        signedAt,
        ip: input.ip ?? null,
        userAgent: input.userAgent ?? null,
        comment: input.comment ?? null,
      });

      // 2. Insertion (l'index unique (workflowInstanceId, stepId, actorId, stage)
      //    levera une erreur en cas de double signature)
      return tx.signature.create({
        data: {
          workflowInstanceId: input.workflowInstanceId,
          stepId: input.stepId ?? undefined,
          actorId: input.actorId,
          role: input.role,
          stage: input.stage,
          documentHash,
          prevSignatureHash: prevHash,
          signatureHash,
          ip: input.ip ?? undefined,
          userAgent: input.userAgent ?? undefined,
          comment: input.comment ?? undefined,
          signedAt,
        },
      });
    },
    { isolationLevel: 'Serializable' },
  );
}

/**
 * Recalcule la chaine de signatures d'un WorkflowInstance et detecte les
 * ruptures. Equivalent du `verifyChain` pour l'audit log.
 */
export async function verifySignatureChain(
  workflowInstanceId: string,
  client: PrismaClient = prisma,
): Promise<
  | { ok: true; count: number }
  | { ok: false; count: number; brokenAtIndex: number; reason: 'PREV_HASH_MISMATCH' | 'HASH_MISMATCH' }
> {
  const signatures = await client.signature.findMany({
    where: { workflowInstanceId },
    orderBy: [{ signedAt: 'asc' }, { id: 'asc' }],
  });

  if (signatures.length === 0) return { ok: true, count: 0 };

  let expectedPrev: string | null = null;
  for (let i = 0; i < signatures.length; i++) {
    const sig = signatures[i];
    if (!sig) continue;

    if (sig.prevSignatureHash !== expectedPrev) {
      return {
        ok: false,
        count: signatures.length,
        brokenAtIndex: i,
        reason: 'PREV_HASH_MISMATCH',
      };
    }

    const recomputed = buildSignatureHash({
      prevHash: expectedPrev,
      documentHash: sig.documentHash,
      actorId: sig.actorId,
      stage: sig.stage,
      signedAt: sig.signedAt,
      ip: sig.ip,
      userAgent: sig.userAgent,
      comment: sig.comment,
    });

    if (recomputed !== sig.signatureHash) {
      return {
        ok: false,
        count: signatures.length,
        brokenAtIndex: i,
        reason: 'HASH_MISMATCH',
      };
    }

    expectedPrev = sig.signatureHash;
  }

  return { ok: true, count: signatures.length };
}
