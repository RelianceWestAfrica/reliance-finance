import { redirect } from 'next/navigation';
import Link from 'next/link';

import { auth } from '@/lib/auth';
import { getTenantedDb } from '@/lib/tenancy';
import { formatDateTime } from '@/lib/format';
import { OfferComparisonStatus } from '@reliance-finance/database';

const STATUS_COLOR: Record<OfferComparisonStatus, string> = {
  DRAFT: 'text-[var(--color-muted-foreground)]',
  SUBMITTED: 'text-[var(--color-warning)]',
  APPROVED: 'text-[var(--color-success)]',
  REJECTED: 'text-[var(--color-destructive)]',
  ARCHIVED: 'text-[var(--color-muted-foreground)]',
};

export default async function OfferComparisonsListPage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');

  const db = await getTenantedDb();
  const comparisons = await db.offerComparison.findMany({
    orderBy: { createdAt: 'desc' },
    take: 100,
    include: {
      entity: { select: { code: true } },
      expenseRequest: { select: { reference: true } },
      offers: { select: { id: true } },
    },
  });

  return (
    <div className="space-y-6">
      <header className="flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Comparatifs d&apos;offres (Modele 1)</h1>
          <p className="text-sm text-[var(--color-muted-foreground)]">
            2-3 offres comparees avec recommandation justifiee (cadre §6).
          </p>
        </div>
        <Link
          href="/offer-comparisons/new"
          className="rounded-md bg-[var(--color-primary)] px-3 py-2 text-sm font-medium text-[var(--color-primary-foreground)] hover:opacity-90"
        >
          + Nouveau comparatif
        </Link>
      </header>

      <section className="overflow-x-auto rounded-lg border bg-[var(--color-card)] shadow-sm">
        <table className="w-full text-sm">
          <thead className="border-b text-left text-xs uppercase text-[var(--color-muted-foreground)]">
            <tr>
              <th className="px-4 py-3 font-medium">Reference</th>
              <th className="px-4 py-3 font-medium">Entite</th>
              <th className="px-4 py-3 font-medium">Demande liee</th>
              <th className="px-4 py-3 font-medium">Offres</th>
              <th className="px-4 py-3 font-medium">Statut</th>
              <th className="px-4 py-3 font-medium">Cree</th>
            </tr>
          </thead>
          <tbody>
            {comparisons.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-[var(--color-muted-foreground)]">
                  Aucun comparatif.
                </td>
              </tr>
            )}
            {comparisons.map((c) => (
              <tr key={c.id} className="border-b last:border-0">
                <td className="px-4 py-3 font-mono text-xs">
                  <Link href={'/offer-comparisons/' + c.id} className="text-[var(--color-primary)] hover:underline">
                    {c.reference}
                  </Link>
                </td>
                <td className="px-4 py-3 font-mono text-xs">{c.entity.code}</td>
                <td className="px-4 py-3 font-mono text-xs">
                  {c.expenseRequest?.reference ?? '-'}
                </td>
                <td className="px-4 py-3 text-xs">{c.offers.length}</td>
                <td className={'px-4 py-3 text-xs font-medium ' + STATUS_COLOR[c.status]}>{c.status}</td>
                <td className="px-4 py-3 text-xs text-[var(--color-muted-foreground)]">
                  {formatDateTime(c.createdAt)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
