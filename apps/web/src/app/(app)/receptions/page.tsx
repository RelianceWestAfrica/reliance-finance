import { redirect } from 'next/navigation';
import Link from 'next/link';

import { auth } from '@/lib/auth';
import { getTenantedDb } from '@/lib/tenancy';
import { formatDateTime } from '@/lib/format';
import { ReceptionStatus, ReceptionType } from '@reliance-finance/database';

const STATUS_COLOR: Record<ReceptionStatus, string> = {
  DRAFT: 'text-[var(--color-muted-foreground)]',
  SIGNED_OPS: 'text-[var(--color-warning)]',
  SIGNED_TECH: 'text-[var(--color-warning)]',
  SIGNED_FINANCE: 'text-[var(--color-warning)]',
  DEFINITIVE: 'text-[var(--color-success)]',
  PROVISIONAL: 'text-[var(--color-warning)]',
  REJECTED: 'text-[var(--color-destructive)]',
};

export default async function ReceptionsListPage(props: {
  searchParams: Promise<{ status?: ReceptionStatus; type?: ReceptionType }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');
  const params = await props.searchParams;

  const db = await getTenantedDb();
  const receptions = await db.reception.findMany({
    where: {
      ...(params.status ? { status: params.status } : {}),
      ...(params.type ? { type: params.type } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
    include: {
      entity: { select: { code: true } },
      purchaseOrder: { select: { reference: true, supplier: { select: { code: true } } } },
    },
  });

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">PV de reception (Modele 4)</h1>
        <p className="text-sm text-[var(--color-muted-foreground)]">
          Workflow OPS -&gt; TECH -&gt; FINANCE. &quot;Sans PV = pas de paiement final&quot; (cadre §4.1).
        </p>
      </header>

      <section className="overflow-x-auto rounded-lg border bg-[var(--color-card)] shadow-sm">
        <table className="w-full text-sm">
          <thead className="border-b text-left text-xs uppercase text-[var(--color-muted-foreground)]">
            <tr>
              <th className="px-4 py-3 font-medium">Reference</th>
              <th className="px-4 py-3 font-medium">Type</th>
              <th className="px-4 py-3 font-medium">BC lie</th>
              <th className="px-4 py-3 font-medium">Fournisseur</th>
              <th className="px-4 py-3 font-medium">Statut</th>
              <th className="px-4 py-3 font-medium">Date reception</th>
            </tr>
          </thead>
          <tbody>
            {receptions.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-[var(--color-muted-foreground)]">
                  Aucun PV. Creez un PV depuis la fiche d&apos;un BC signe.
                </td>
              </tr>
            )}
            {receptions.map((r) => (
              <tr key={r.id} className="border-b last:border-0">
                <td className="px-4 py-3 font-mono text-xs">
                  <Link href={'/receptions/' + r.id} className="text-[var(--color-primary)] hover:underline">
                    {r.reference}
                  </Link>
                </td>
                <td className="px-4 py-3 text-xs">{r.type}</td>
                <td className="px-4 py-3 font-mono text-xs">{r.purchaseOrder.reference}</td>
                <td className="px-4 py-3 font-mono text-xs">{r.purchaseOrder.supplier.code}</td>
                <td className={'px-4 py-3 text-xs font-medium ' + STATUS_COLOR[r.status]}>
                  {r.status}
                </td>
                <td className="px-4 py-3 text-xs text-[var(--color-muted-foreground)]">
                  {formatDateTime(r.receptionDate)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
