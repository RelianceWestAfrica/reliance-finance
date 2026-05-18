import { redirect } from 'next/navigation';
import Link from 'next/link';

import { auth } from '@/lib/auth';
import { getTenantedDb } from '@/lib/tenancy';
import { isBankAccountUsable } from '@/lib/bank-accounts/usability';
import { SupplierSensitivity, SupplierStatus } from '@reliance-finance/database';

const SENSITIVITY_BADGE: Record<SupplierSensitivity, string> = {
  STANDARD: 'bg-[var(--color-muted)] text-[var(--color-foreground)]',
  SENSITIVE: 'bg-[var(--color-warning)]/10 text-[var(--color-warning)]',
  STRATEGIC: 'bg-[var(--color-destructive)]/10 text-[var(--color-destructive)]',
};

const STATUS_BADGE: Record<SupplierStatus, string> = {
  DRAFT: 'text-[var(--color-muted-foreground)]',
  ACTIVE: 'text-[var(--color-success)]',
  SUSPENDED: 'text-[var(--color-warning)]',
  BLACKLISTED: 'text-[var(--color-destructive)]',
  ARCHIVED: 'text-[var(--color-muted-foreground)] line-through',
};

export default async function SuppliersListPage(props: {
  searchParams: Promise<{ status?: SupplierStatus; sensitivity?: SupplierSensitivity; q?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');
  const params = await props.searchParams;

  const db = await getTenantedDb();
  const suppliers = await db.supplier.findMany({
    where: {
      ...(params.status ? { status: params.status } : {}),
      ...(params.sensitivity ? { sensitivity: params.sensitivity } : {}),
      ...(params.q
        ? {
            OR: [
              { name: { contains: params.q, mode: 'insensitive' } },
              { code: { contains: params.q.toUpperCase() } },
              { rccm: { contains: params.q } },
              { ifu: { contains: params.q } },
            ],
          }
        : {}),
    },
    orderBy: [{ entityId: 'asc' }, { code: 'asc' }],
    include: {
      entity: { select: { code: true } },
      bankAccounts: {
        where: { isActive: true },
        select: { id: true, isActive: true, verifiedAt: true, quarantineUntil: true },
      },
      _count: { select: { bankChangeRequests: true } },
    },
    take: 100,
  });

  return (
    <div className="space-y-6">
      <header className="flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Fournisseurs</h1>
          <p className="text-sm text-[var(--color-muted-foreground)]">
            Cycle fournisseur + anti-fraude RIB (cadre §8). 100 derniers resultats max.
          </p>
        </div>
        <Link
          href="/suppliers/new"
          className="rounded-md bg-[var(--color-primary)] px-3 py-2 text-sm font-medium text-[var(--color-primary-foreground)] hover:opacity-90"
        >
          + Nouveau fournisseur
        </Link>
      </header>

      <form className="rounded-lg border bg-[var(--color-card)] p-4 shadow-sm">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
          <input
            name="q"
            placeholder="Recherche : nom, code, RCCM, IFU"
            defaultValue={params.q ?? ''}
            className="rounded-md border bg-white px-3 py-2 text-sm sm:col-span-2"
          />
          <select
            name="status"
            defaultValue={params.status ?? ''}
            className="rounded-md border bg-white px-3 py-2 text-sm"
          >
            <option value="">-- Tous statuts --</option>
            {Object.values(SupplierStatus).map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <select
            name="sensitivity"
            defaultValue={params.sensitivity ?? ''}
            className="rounded-md border bg-white px-3 py-2 text-sm"
          >
            <option value="">-- Toutes sensibilites --</option>
            {Object.values(SupplierSensitivity).map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          className="mt-3 rounded-md bg-[var(--color-foreground)] px-3 py-1.5 text-xs font-medium text-white hover:opacity-90"
        >
          Filtrer
        </button>
      </form>

      <section className="overflow-x-auto rounded-lg border bg-[var(--color-card)] shadow-sm">
        <table className="w-full text-sm">
          <thead className="border-b text-left text-xs uppercase text-[var(--color-muted-foreground)]">
            <tr>
              <th className="px-4 py-3 font-medium">Entite</th>
              <th className="px-4 py-3 font-medium">Code</th>
              <th className="px-4 py-3 font-medium">Nom</th>
              <th className="px-4 py-3 font-medium">RCCM / IFU</th>
              <th className="px-4 py-3 font-medium">Sensibilite</th>
              <th className="px-4 py-3 font-medium">Statut</th>
              <th className="px-4 py-3 font-medium">RIB</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {suppliers.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-6 text-center text-[var(--color-muted-foreground)]">
                  Aucun fournisseur.
                </td>
              </tr>
            )}
            {suppliers.map((s) => {
              const primary = s.bankAccounts[0];
              const usability = primary
                ? isBankAccountUsable({
                    isActive: primary.isActive,
                    verifiedAt: primary.verifiedAt,
                    quarantineUntil: primary.quarantineUntil,
                  })
                : null;

              return (
                <tr key={s.id} className="border-b last:border-0">
                  <td className="px-4 py-3 font-mono text-xs">{s.entity.code}</td>
                  <td className="px-4 py-3 font-mono text-xs font-semibold">{s.code}</td>
                  <td className="px-4 py-3">
                    <Link
                      href={'/suppliers/' + s.id}
                      className="font-medium text-[var(--color-primary)] hover:underline"
                    >
                      {s.name}
                    </Link>
                    {s.isStrategic && (
                      <span className="ml-2 rounded bg-[var(--color-destructive)]/10 px-1.5 py-0.5 text-[10px] font-medium text-[var(--color-destructive)]">
                        STRATEGIQUE
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs font-mono text-[var(--color-muted-foreground)]">
                    {s.rccm ?? '-'}
                    <br />
                    {s.ifu ?? '-'}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={
                        'rounded-full px-2 py-0.5 text-[10px] font-medium ' +
                        SENSITIVITY_BADGE[s.sensitivity]
                      }
                    >
                      {s.sensitivity}
                    </span>
                  </td>
                  <td className={'px-4 py-3 text-xs font-medium ' + STATUS_BADGE[s.status]}>
                    {s.status}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {!primary ? (
                      <span className="text-[var(--color-muted-foreground)]">Aucun</span>
                    ) : usability?.usable ? (
                      <span className="text-[var(--color-success)]">OK</span>
                    ) : (
                      <span className="text-[var(--color-warning)]" title={usability?.usable === false ? usability.message : ''}>
                        {usability?.usable === false ? usability.reason : '-'}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right text-xs">
                    <Link
                      href={'/suppliers/' + s.id + '/bank-accounts'}
                      className="text-[var(--color-primary)] hover:underline"
                    >
                      RIBs ({s.bankAccounts.length})
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </div>
  );
}
