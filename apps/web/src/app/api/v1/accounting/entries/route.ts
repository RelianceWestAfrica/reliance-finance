// =============================================================================
// API REST - GET /api/v1/accounting/entries
// =============================================================================
// Expose les ecritures comptables en JSON / FEC / CSV SYSCOHADA pour
// integration ERP externe (Sage / Odoo / Dolibarr).
//
// Auth : session NextAuth uniquement pour cette version. L'ajout d'une
// API key dediee (ERP_INTEGRATION_API_KEY env var) est reporte a session
// de polish.
//
// Garde : role Comptabilite / DFG / Auditeur requis.
// =============================================================================

import { NextResponse } from 'next/server';

import { auth } from '@/lib/auth';
import { getUserMemberships, hasAnyRole } from '@/lib/rbac';
import { prisma, RoleCode, JournalEntryStatus } from '@reliance-finance/database';
import { appendAudit, AuditAction } from '@/lib/audit/log';
import {
  buildFec,
  buildSyscohadaBalance,
  type FecLine,
  type BalanceLine,
} from '@/lib/accounting/fec-format';

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Auth requise' }, { status: 401 });
  }

  const memberships = await getUserMemberships(session.user.id);
  if (
    !hasAnyRole(memberships, [
      RoleCode.ADMIN,
      RoleCode.DFG,
      RoleCode.CHIEF_ACCOUNTANT,
      RoleCode.COMPTABLE_PAYS,
      RoleCode.CONTROLEUR_INTERNE,
      RoleCode.AUDITEUR,
    ])
  ) {
    return NextResponse.json({ error: 'Privilege insuffisant' }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const entityId = searchParams.get('entityId');
  const yearParam = searchParams.get('year');
  const monthParam = searchParams.get('month');
  const format = (searchParams.get('format') ?? 'json') as 'json' | 'fec' | 'balance';
  const includeAllStatuses = searchParams.get('all') === '1';

  if (!entityId) {
    return NextResponse.json({ error: 'entityId requis' }, { status: 400 });
  }
  const year = yearParam ? Number(yearParam) : undefined;
  const month = monthParam ? Number(monthParam) : undefined;

  // Garde tenancy : verifier que l'entite est visible
  const userEntityIds = new Set(memberships.map((m) => m.entityId));
  const hasGroupRole = hasAnyRole(memberships, [
    RoleCode.ADMIN,
    RoleCode.DFG,
    RoleCode.AG,
    RoleCode.AUDITEUR,
    RoleCode.FINANCE_GROUPE,
    RoleCode.CONTROLEUR_INTERNE,
    RoleCode.CHIEF_ACCOUNTANT,
  ]);
  if (!hasGroupRole && !userEntityIds.has(entityId)) {
    return NextResponse.json({ error: 'Entite hors scope' }, { status: 403 });
  }

  const entries = await prisma.journalEntry.findMany({
    where: {
      entityId,
      ...(year && month ? { period: { year, month } } : year ? { period: { year } } : {}),
      ...(includeAllStatuses
        ? {}
        : { status: { in: [JournalEntryStatus.POSTED, JournalEntryStatus.REVERSED] } }),
    },
    orderBy: { entryDate: 'asc' },
    include: {
      lines: {
        orderBy: { position: 'asc' },
        include: { account: { select: { label: true } } },
      },
      entity: { select: { code: true, name: true } },
      period: { select: { year: true, month: true, isClosed: true } },
    },
  });

  if (format === 'fec') {
    const fecLines: FecLine[] = [];
    for (const e of entries) {
      for (const l of e.lines) {
        fecLines.push({
          journalCode: e.journalCode,
          journalLib:
            e.journalCode === 'BNQ'
              ? 'Banque'
              : e.journalCode === 'ACH'
                ? 'Achats'
                : e.journalCode === 'CAI'
                  ? 'Caisse'
                  : e.journalCode,
          ecritureNum: e.reference,
          ecritureDate: e.entryDate,
          compteNum: l.accountCode,
          compteLib: l.account?.label ?? '',
          pieceRef: e.reference,
          pieceDate: e.entryDate,
          ecritureLib: l.description ?? e.description,
          debit: Number(l.debit.toString()),
          credit: Number(l.credit.toString()),
          validDate: e.postedAt ?? e.entryDate,
          iDevise: e.currency,
        });
      }
    }

    const fec = buildFec(fecLines);

    await appendAudit({
      entityType: 'Entity',
      entityId,
      action: AuditAction.FEC_EXPORTED,
      actorId: session.user.id,
      payload: { entryCount: entries.length, lineCount: fecLines.length, year, month },
    }).catch(() => undefined);

    return new NextResponse('﻿' + fec, {
      status: 200,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Content-Disposition':
          'attachment; filename="FEC-' +
          entityId +
          '-' +
          (year ?? 'ALL') +
          (month ? '-' + String(month).padStart(2, '0') : '') +
          '.txt"',
        'Cache-Control': 'no-store',
      },
    });
  }

  if (format === 'balance') {
    // Aggrege par compte
    const balance = new Map<string, { label: string; debit: number; credit: number }>();
    for (const e of entries) {
      for (const l of e.lines) {
        const existing = balance.get(l.accountCode) ?? {
          label: l.account?.label ?? '',
          debit: 0,
          credit: 0,
        };
        existing.debit += Number(l.debit.toString());
        existing.credit += Number(l.credit.toString());
        balance.set(l.accountCode, existing);
      }
    }

    const balanceLines: BalanceLine[] = Array.from(balance.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([code, b]) => ({
        accountCode: code,
        accountLabel: b.label,
        totalDebit: b.debit,
        totalCredit: b.credit,
        balance: b.debit - b.credit,
      }));

    const csv = buildSyscohadaBalance(balanceLines);

    await appendAudit({
      entityType: 'Entity',
      entityId,
      action: AuditAction.SYSCOHADA_EXPORTED,
      actorId: session.user.id,
      payload: { accountCount: balanceLines.length, year, month },
    }).catch(() => undefined);

    return new NextResponse('﻿' + csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition':
          'attachment; filename="Balance-SYSCOHADA-' +
          entityId +
          '-' +
          (year ?? 'ALL') +
          (month ? '-' + String(month).padStart(2, '0') : '') +
          '.csv"',
        'Cache-Control': 'no-store',
      },
    });
  }

  // JSON par defaut
  return NextResponse.json(
    {
      meta: { entityId, year, month, count: entries.length },
      entries: entries.map((e) => ({
        id: e.id,
        reference: e.reference,
        status: e.status,
        journalCode: e.journalCode,
        entryDate: e.entryDate.toISOString(),
        description: e.description,
        totalDebit: e.totalDebit.toString(),
        totalCredit: e.totalCredit.toString(),
        currency: e.currency,
        period: e.period,
        lines: e.lines.map((l) => ({
          position: l.position,
          accountCode: l.accountCode,
          accountLabel: l.account?.label ?? null,
          description: l.description,
          debit: l.debit.toString(),
          credit: l.credit.toString(),
        })),
      })),
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
