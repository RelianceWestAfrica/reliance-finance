import { redirect } from 'next/navigation';
import Link from 'next/link';

import { auth } from '@/lib/auth';
import { getTenantedDb } from '@/lib/tenancy';
import { formatCurrency, formatDateTime } from '@/lib/format';
import {
  ExpenseRequestStatus,
  ExpenseRequestType,
  UrgencyLevel,
} from '@reliance-finance/database';
import { detectStaleRegularizations } from './actions';

const STATUS_LABEL: Record<ExpenseRequestStatus, string> = {
  DRAFT: 'Brouillon',
  SUBMITTED: 'Soumis',
  CONTROL_DOC_OK: 'Doc OK',
  CONTROL_DOC_KO: 'Doc KO',
  BUDGET_OK: 'Budget OK',
  BUDGET_KO: 'Budget KO',
  FINANCE_FIL_VISA_PENDING: 'Attente visa Filiale',
  FINANCE_FIL_VISA_OK: 'Visa Filiale OK',
  FINANCE_GROUPE_VISA_PENDING: 'Attente visa Groupe',
  FINANCE_GROUPE_VISA_OK: 'Visa Groupe OK',
  AG_APPROVAL_PENDING: 'Attente AG',
  AG_APPROVED: 'AG approuve',
  APPROVED: 'Approuve',
  REJECTED: 'Rejete',
  ARCHIVED: 'Archive',
  CANCELLED: 'Annule',
};

const STATUS_COLOR: Record<ExpenseRequestStatus, string> = {
  DRAFT: 'text-[var(--color-muted-foreground)]',
  SUBMITTED: 'text-[var(--color-warning)]',
  CONTROL_DOC_OK: 'text-[var(--color-warning)]',
  CONTROL_DOC_KO: 'text-[var(--color-destructive)]',
  BUDGET_OK: 'text-[var(--color-warning)]',
  BUDGET_KO: 'text-[var(--color-destructive)]',
  FINANCE_FIL_VISA_PENDING: 'text-[var(--color-warning)]',
  FINANCE_FIL_VISA_OK: 'text-[var(--color-warning)]',
  FINANCE_GROUPE_VISA_PENDING: 'text-[var(--color-warning)]',
  FINANCE_GROUPE_VISA_OK: 'text-[var(--color-warning)]',
  AG_APPROVAL_PENDING: 'text-[var(--color-warning)]',
  AG_APPROVED: 'text-[var(--color-warning)]',
  APPROVED: 'text-[var(--color-success)]',
  REJECTED: 'text-[var(--color-destructive)]',
  ARCHIVED: 'text-[var(--color-muted-foreground)]',
  CANCELLED: 'text-[var(--color-muted-foreground)]',
};

export default async function ExpenseRequestsListPage(props: {
  searchParams: Promise<{ status?: ExpenseRequestStatus; type?: ExpenseRequestType }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');
  const params = await props.searchParams;

  const db = await getTenantedDb();
  const requests = await db.expenseRequest.findMany({
    where: {
      ...(params.status ? { status: params.status } : {}),
      ...(params.type ? { type: params.type } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
    include: {
      entity: { select: { code: true } },
      project: { select: { code: true } },
      supplier: { select: { code: true, name: true } },
      createdBy: { select: { email: true } },
    },
  });

  async function handleStaleCheck() {
    'use server';
    await detectStaleRegularizations();
  }

  return (
    <div className="space-y-6">
      <header className="flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Demandes de depense</h1>
          <p className="text-sm text-[var(--color-muted-foreground)]">
            FDA / FD / FD_URGENCE avec workflow d&apos;approbation par seuils (cadre §5 + §7).
          </p>
        </div>
        <div className="flex gap-2">
          <form action={handleStaleCheck}>
            <button className="rounded-md border px-3 py-1.5 text-xs hover:bg-[var(--color-muted)]">
              Verifier urgences echues
            </button>
          </form>
          <Link
            href="/expense-requests/new"
            className="rounded-md bg-[var(--color-primary)] px-3 py-2 text-sm font-medium text-[var(--color-primary-foreground)] hover:opacity-90"
          >
            + Nouvelle demande
          </Link>
        </div>
      </header>

      <form className="rounded-lg border bg-[var(--color-card)] p-4 shadow-sm">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <select
            name="status"
            defaultValue={params.status ?? ''}
            className="rounded-md border bg-white px-3 py-2 text-sm"
          >
            <option value="">-- Tous statuts --</option>
            {Object.values(ExpenseRequestStatus).map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
          <select
            name="type"
            defaultValue={params.type ?? ''}
            className="rounded-md border bg-white px-3 py-2 text-sm"
          >
            <option value="">-- Tous types --</option>
            {Object.values(ExpenseRequestType).map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="rounded-md bg-[var(--color-foreground)] px-3 py-2 text-xs font-medium text-white hover:opacity-90"
          >
            Filtrer
          </button>
        </div>
      </form>

      <section className="overflow-x-auto rounded-lg border bg-[var(--color-card)] shadow-sm">
        <table className="w-full text-sm">
          <thead className="border-b text-left text-xs uppercase text-[var(--color-muted-foreground)]">
            <tr>
              <th className="px-3 py-3 font-medium">Reference</th>
              <th className="px-3 py-3 font-medium">Type</th>
              <th className="px-3 py-3 font-medium">Titre</th>
              <th className="px-3 py-3 font-medium">Entite / Projet</th>
              <th className="px-3 py-3 font-medium">Fournisseur</th>
              <th className="px-3 py-3 font-medium">Montant</th>
              <th className="px-3 py-3 font-medium">Urgence</th>
              <th className="px-3 py-3 font-medium">Statut</th>
              <th className="px-3 py-3 font-medium">Cree</th>
            </tr>
          </thead>
          <tbody>
            {requests.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-6 text-center text-[var(--color-muted-foreground)]">
                  Aucune demande.
                </td>
              </tr>
            )}
            {requests.map((er) => (
              <tr key={er.id} className="border-b last:border-0">
                <td className="px-3 py-2 font-mono text-xs">
                  <Link
                    href={'/expense-requests/' + er.id}
                    className="text-[var(--color-primary)] hover:underline"
                  >
                    {er.reference}
                  </Link>
                </td>
                <td className="px-3 py-2 text-xs">{er.type}</td>
                <td className="px-3 py-2">{er.title}</td>
                <td className="px-3 py-2 text-xs">
                  <span className="font-mono">{er.entity.code}</span>
                  {er.project && (
                    <span className="ml-1 font-mono text-[var(--color-muted-foreground)]">
                      / {er.project.code}
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 text-xs">
                  {er.supplier ? er.supplier.code : <span className="italic">-</span>}
                </td>
                <td className="px-3 py-2 text-right text-xs tabular-nums">
                  {formatCurrency(Number(er.amount.toString()), er.currency)}
                </td>
                <td className="px-3 py-2 text-xs">
                  {er.urgency === UrgencyLevel.LOW ? (
                    <span className="text-[var(--color-muted-foreground)]">-</span>
                  ) : (
                    <span className="font-medium">{er.urgency}</span>
                  )}
                </td>
                <td className={'px-3 py-2 text-xs font-medium ' + STATUS_COLOR[er.status]}>
                  {STATUS_LABEL[er.status]}
                </td>
                <td className="px-3 py-2 text-xs text-[var(--color-muted-foreground)]">
                  {formatDateTime(er.createdAt)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <p className="text-xs text-[var(--color-muted-foreground)]">
        100 derniers resultats max. Pagination + tri par colonne : session de polish.
      </p>
    </div>
  );
}
