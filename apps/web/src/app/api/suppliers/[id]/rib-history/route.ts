// =============================================================================
// Export CSV de l'historique des RIBs d'un fournisseur
// =============================================================================
// Conformite : "l'historique des changements RIB est immuable et exportable"
// (cadre §8 + acceptance M3). Format CSV avec separateur point-virgule
// (compatibilite Excel FR par defaut).
// =============================================================================

import { NextResponse } from 'next/server';

import { auth } from '@/lib/auth';
import { getUserMemberships, hasAnyRole } from '@/lib/rbac';
import { prisma, RoleCode } from '@reliance-finance/database';

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  // Echappement RFC 4180 (en utilisant ; comme separateur pour Excel FR)
  if (str.includes(';') || str.includes('"') || str.includes('\n')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

export async function GET(
  _req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Auth requise' }, { status: 401 });
  }

  const memberships = await getUserMemberships(session.user.id);
  const canExport = hasAnyRole(memberships, [
    RoleCode.ADMIN,
    RoleCode.DFG,
    RoleCode.DAF_PAYS,
    RoleCode.CONTROLEUR_INTERNE,
    RoleCode.AUDITEUR,
    RoleCode.TRESORIER_GROUPE,
  ]);
  if (!canExport) {
    return NextResponse.json({ error: 'Privilege insuffisant' }, { status: 403 });
  }

  const { id } = await context.params;

  const supplier = await prisma.supplier.findUnique({
    where: { id },
    select: { id: true, code: true, name: true, entityId: true },
  });
  if (!supplier) {
    return NextResponse.json({ error: 'Fournisseur introuvable' }, { status: 404 });
  }

  // Garde de tenancy : verifie que l'entite est visible par l'utilisateur
  const userEntityIds = new Set(memberships.map((m) => m.entityId));
  const hasGroupRole = hasAnyRole(memberships, [
    RoleCode.ADMIN,
    RoleCode.DFG,
    RoleCode.AG,
    RoleCode.AUDITEUR,
    RoleCode.FINANCE_GROUPE,
    RoleCode.TRESORIER_GROUPE,
    RoleCode.CONTROLEUR_INTERNE,
  ]);
  if (!hasGroupRole && !userEntityIds.has(supplier.entityId)) {
    return NextResponse.json({ error: 'Fournisseur hors scope' }, { status: 403 });
  }

  const changes = await prisma.bankAccountChangeRequest.findMany({
    where: { supplierId: id },
    orderBy: { createdAt: 'asc' },
    include: {
      requestedBy: { select: { email: true } },
      approvedBy1: { select: { email: true } },
      approvedBy2: { select: { email: true } },
    },
  });

  const headers = [
    'reference',
    'createdAt',
    'status',
    'oldIban',
    'oldRib',
    'newBankName',
    'newHolderName',
    'newIban',
    'newRib',
    'justification',
    'requestedBy',
    'approvedBy1',
    'approvedBy1At',
    'approvedBy2',
    'approvedBy2At',
    'quarantineUntil',
    'rejectedReason',
  ];

  const rows = changes.map((c) => [
    c.id,
    c.createdAt.toISOString(),
    c.status,
    c.oldIban ?? '',
    c.oldRib ?? '',
    c.newBankName ?? '',
    c.newHolderName,
    c.newIban ?? '',
    c.newRib ?? '',
    c.justification,
    c.requestedBy.email,
    c.approvedBy1?.email ?? '',
    c.approvedBy1At?.toISOString() ?? '',
    c.approvedBy2?.email ?? '',
    c.approvedBy2At?.toISOString() ?? '',
    c.quarantineUntil?.toISOString() ?? '',
    c.rejectedReason ?? '',
  ]);

  const csv = [
    headers.map(csvCell).join(';'),
    ...rows.map((row) => row.map(csvCell).join(';')),
  ].join('\n');

  // BOM UTF-8 pour Excel
  const body = '﻿' + csv;

  const filename =
    'RIB-history-' +
    supplier.code +
    '-' +
    new Date().toISOString().slice(0, 10) +
    '.csv';

  return new NextResponse(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="' + filename + '"',
      'Cache-Control': 'no-store',
    },
  });
}
