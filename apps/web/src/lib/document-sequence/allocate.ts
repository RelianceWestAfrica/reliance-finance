// =============================================================================
// Document sequence - Allocation atomique de references
// =============================================================================
// Format : RWA-{TYPE}-{ENTITY_CODE}-{PROJECT_CODE?}-{YYYY}-{SEQ:04d}
// Exemple : RWA-FD-TOGO-CIDPE-2026-0042
//
// Atomicite garantie par transaction Serializable + increment Prisma. Une fois
// alloue, le numero est "consomme" meme si la transaction metier echoue
// (le trou est documente en M13 controle interne).
//
// Source : ADR 0001 §2.4.
// =============================================================================

import { prisma, type DocumentType } from '@reliance-finance/database';

export interface AllocateRefInput {
  type: DocumentType;
  entityId: string;
  entityCode: string;
  projectId?: string | null;
  projectCode?: string | null;
  year?: number;
}

export async function allocateReference(input: AllocateRefInput): Promise<string> {
  const year = input.year ?? new Date().getFullYear();
  const projectId = input.projectId ?? null;

  const allocatedSeq = await prisma.$transaction(
    async (tx) => {
      // 1. S'assurer que la ligne existe (creation lazy)
      await tx.documentSequence.upsert({
        where: {
          // Prisma type incomplet pour les uniques composites avec colonne
          // nullable - le runtime gere correctement le null.
          type_entityId_projectId_year: {
            type: input.type,
            entityId: input.entityId,
            projectId: projectId as string,
            year,
          },
        },
        create: {
          type: input.type,
          entityId: input.entityId,
          projectId,
          year,
          nextSeq: 1,
        },
        update: {},
      });

      // 2. Increment atomique + recuperation de la nouvelle valeur
      const updated = await tx.documentSequence.update({
        where: {
          type_entityId_projectId_year: {
            type: input.type,
            entityId: input.entityId,
            projectId: projectId as string,
            year,
          },
        },
        data: { nextSeq: { increment: 1 } },
      });

      // La valeur ALLOUEE est celle d'avant l'increment
      return updated.nextSeq - 1;
    },
    { isolationLevel: 'Serializable' },
  );

  return formatReference({
    type: input.type,
    entityCode: input.entityCode,
    projectCode: input.projectCode ?? null,
    year,
    seq: allocatedSeq,
  });
}

export interface FormatRefInput {
  type: DocumentType;
  entityCode: string;
  projectCode: string | null;
  year: number;
  seq: number;
}

export function formatReference(input: FormatRefInput): string {
  const parts = [
    'RWA',
    input.type,
    input.entityCode,
    input.projectCode ?? '',
    String(input.year),
    String(input.seq).padStart(4, '0'),
  ];
  // Replace empty parts by ---- but preserve structure
  return parts
    .map((p, i) => (i === 3 && p === '' ? '' : p))
    .filter((_, i) => i !== 3 || _ !== '')
    .join('-');
}
