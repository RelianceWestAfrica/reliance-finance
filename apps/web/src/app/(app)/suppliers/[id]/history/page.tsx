import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';

import { auth } from '@/lib/auth';
import { getTenantedDb } from '@/lib/tenancy';
import { prisma } from '@reliance-finance/database';
import { verifyChain } from '@/lib/audit/log';
import { formatDateTime } from '@/lib/format';

export default async function SupplierHistoryPage(props: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');
  const { id } = await props.params;

  const db = await getTenantedDb();
  const supplier = await db.supplier.findUnique({
    where: { id },
    select: { id: true, code: true, name: true },
  });
  if (!supplier) notFound();

  // Recupere l'audit log de l'entite Supplier et de tous ses BankAccount /
  // BankAccountChangeRequest pour une vue consolidee.
  const bankAccounts = await prisma.bankAccount.findMany({
    where: { supplierId: id },
    select: { id: true },
  });
  const bankAccountIds = bankAccounts.map((b) => b.id);

  const bankChangeRequests = await prisma.bankAccountChangeRequest.findMany({
    where: { supplierId: id },
    select: { id: true },
  });
  const changeIds = bankChangeRequests.map((c) => c.id);

  const auditEntries = await prisma.auditLog.findMany({
    where: {
      OR: [
        { entityType: 'Supplier', entityId: id },
        { entityType: 'BankAccount', entityId: { in: bankAccountIds } },
        { entityType: 'BankAccountChangeRequest', entityId: { in: changeIds } },
      ],
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: 200,
    include: { actor: { select: { email: true } } },
  });

  // Verifier la chaine d'audit du Supplier (chaine isolee)
  const supplierChain = await verifyChain('Supplier', id);

  return (
    <div className="space-y-6">
      <header className="flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-semibold">
            Historique RIB - {supplier.name}
          </h1>
          <p className="text-sm text-[var(--color-muted-foreground)]">
            Inviolabilite garantie par chainage SHA-256. 200 dernieres entrees.
          </p>
          <Link
            href={'/suppliers/' + id}
            className="mt-2 inline-block text-xs text-[var(--color-primary)] hover:underline"
          >
            &larr; Retour fiche
          </Link>
        </div>
        <div className="flex flex-col gap-2 text-right text-xs">
          <a
            href={'/api/suppliers/' + id + '/rib-history'}
            target="_blank"
            rel="noreferrer"
            className="rounded-md border px-3 py-1.5 text-xs hover:bg-[var(--color-muted)]"
          >
            Export CSV
          </a>
          <a
            href={'/api/audit/verify/Supplier/' + id}
            target="_blank"
            rel="noreferrer"
            className="rounded-md border px-3 py-1.5 text-xs hover:bg-[var(--color-muted)]"
          >
            Verifier chaine
          </a>
        </div>
      </header>

      <section className="rounded-lg border bg-[var(--color-card)] p-4 shadow-sm">
        <div className="flex items-center gap-3">
          <span className={'h-3 w-3 rounded-full ' + (supplierChain.ok ? 'bg-[var(--color-success)]' : 'bg-[var(--color-destructive)]')} />
          <div className="text-sm">
            Chaine d&apos;audit Supplier :
            <span className={'ml-2 font-mono ' + (supplierChain.ok ? 'text-[var(--color-success)]' : 'text-[var(--color-destructive)]')}>
              {supplierChain.ok ? 'OK' : supplierChain.reason}
            </span>
            <span className="ml-2 text-xs text-[var(--color-muted-foreground)]">
              ({supplierChain.count} entree(s))
            </span>
          </div>
        </div>
      </section>

      <section className="overflow-x-auto rounded-lg border bg-[var(--color-card)] shadow-sm">
        <table className="w-full text-sm">
          <thead className="border-b text-left text-xs uppercase text-[var(--color-muted-foreground)]">
            <tr>
              <th className="px-3 py-3 font-medium">Date</th>
              <th className="px-3 py-3 font-medium">Action</th>
              <th className="px-3 py-3 font-medium">Acteur</th>
              <th className="px-3 py-3 font-medium">Cible</th>
              <th className="px-3 py-3 font-medium">Hash</th>
            </tr>
          </thead>
          <tbody>
            {auditEntries.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-[var(--color-muted-foreground)]">
                  Aucune entree.
                </td>
              </tr>
            )}
            {auditEntries.map((e) => (
              <tr key={e.id} className="border-b last:border-0 align-top">
                <td className="whitespace-nowrap px-3 py-2 text-xs">{formatDateTime(e.createdAt)}</td>
                <td className="px-3 py-2 font-mono text-xs">{e.action}</td>
                <td className="px-3 py-2 text-xs">
                  {e.actor?.email ?? <span className="italic">systeme</span>}
                </td>
                <td className="px-3 py-2 text-xs">
                  <div className="font-mono">{e.entityType}</div>
                  <div className="font-mono text-[var(--color-muted-foreground)]">
                    {e.entityId.slice(0, 14)}...
                  </div>
                </td>
                <td className="px-3 py-2 font-mono text-[10px] text-[var(--color-muted-foreground)]">
                  {e.hash.slice(0, 16)}...
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
