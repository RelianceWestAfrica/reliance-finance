import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';

import { auth } from '@/lib/auth';
import { getTenantedDb } from '@/lib/tenancy';
import { SupplierSensitivity } from '@reliance-finance/database';
import { formatDateTime } from '@/lib/format';
import { updateSupplier, archiveSupplier } from '../actions';

export default async function SupplierDetailPage(props: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');
  const { id } = await props.params;
  const searchParams = await props.searchParams;
  const errorMessage = searchParams.error ? decodeURIComponent(searchParams.error) : null;

  const db = await getTenantedDb();
  const supplier = await db.supplier.findUnique({
    where: { id },
    include: {
      entity: { select: { code: true, name: true } },
      bankAccounts: { where: { isActive: true }, select: { id: true } },
      _count: { select: { bankAccounts: true, bankChangeRequests: true } },
    },
  });
  if (!supplier) notFound();

  async function handleUpdate(formData: FormData) {
    'use server';
    const r = await updateSupplier(formData);
    if (!r.ok) redirect('/suppliers/' + id + '?error=' + encodeURIComponent(r.error ?? 'Echec'));
  }

  async function handleArchive(formData: FormData) {
    'use server';
    const r = await archiveSupplier(formData);
    if (!r.ok) redirect('/suppliers/' + id + '?error=' + encodeURIComponent(r.error ?? 'Echec'));
    redirect('/suppliers');
  }

  return (
    <div className="space-y-6">
      <header className="flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{supplier.name}</h1>
          <p className="text-sm text-[var(--color-muted-foreground)]">
            <span className="font-mono">{supplier.code}</span> - Entite {supplier.entity.code}
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href={'/suppliers/' + id + '/bank-accounts'}
            className="rounded-md border px-3 py-1.5 text-xs hover:bg-[var(--color-muted)]"
          >
            RIBs ({supplier._count.bankAccounts})
          </Link>
          <Link
            href={'/suppliers/' + id + '/history'}
            className="rounded-md border px-3 py-1.5 text-xs hover:bg-[var(--color-muted)]"
          >
            Historique RIB
          </Link>
        </div>
      </header>

      {errorMessage && (
        <div role="alert" className="rounded-md border border-[var(--color-destructive)] bg-[var(--color-destructive)]/10 px-3 py-2 text-sm text-[var(--color-destructive)]">
          {errorMessage}
        </div>
      )}

      <section className="rounded-lg border bg-[var(--color-card)] p-6 shadow-sm">
        <h2 className="text-lg font-semibold">Identification & sensibilite</h2>
        <form action={handleUpdate} className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <input type="hidden" name="id" value={supplier.id} />
          <label className="text-sm sm:col-span-2">
            Raison sociale *
            <input
              name="name"
              required
              defaultValue={supplier.name}
              className="mt-1 block w-full rounded-md border bg-white px-3 py-2 text-sm"
            />
          </label>
          <label className="text-sm">
            RCCM
            <input
              name="rccm"
              defaultValue={supplier.rccm ?? ''}
              className="mt-1 block w-full rounded-md border bg-white px-3 py-2 text-sm font-mono"
            />
          </label>
          <label className="text-sm">
            IFU / NIF
            <input
              name="ifu"
              defaultValue={supplier.ifu ?? ''}
              className="mt-1 block w-full rounded-md border bg-white px-3 py-2 text-sm font-mono"
            />
          </label>
          <label className="text-sm">
            Email
            <input
              name="email"
              type="email"
              defaultValue={supplier.email ?? ''}
              className="mt-1 block w-full rounded-md border bg-white px-3 py-2 text-sm"
            />
          </label>
          <label className="text-sm">
            Telephone
            <input
              name="phone"
              defaultValue={supplier.phone ?? ''}
              className="mt-1 block w-full rounded-md border bg-white px-3 py-2 text-sm"
            />
          </label>
          <label className="text-sm sm:col-span-2">
            Adresse
            <input
              name="address"
              defaultValue={supplier.address ?? ''}
              className="mt-1 block w-full rounded-md border bg-white px-3 py-2 text-sm"
            />
          </label>
          <label className="text-sm">
            Pays
            <input
              name="country"
              maxLength={2}
              defaultValue={supplier.country ?? ''}
              className="mt-1 block w-full rounded-md border bg-white px-3 py-2 text-sm uppercase"
            />
          </label>
          <label className="text-sm">
            Sensibilite (cadre §6.3)
            <select
              name="sensitivity"
              defaultValue={supplier.sensitivity}
              className="mt-1 block w-full rounded-md border bg-white px-3 py-2 text-sm"
            >
              {Object.values(SupplierSensitivity).map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input
              type="checkbox"
              name="isStrategic"
              defaultChecked={supplier.isStrategic}
            />
            Fournisseur strategique (controle renforce)
          </label>
          <label className="text-sm sm:col-span-2">
            Notes
            <textarea
              name="notes"
              rows={3}
              defaultValue={supplier.notes ?? ''}
              className="mt-1 block w-full rounded-md border bg-white px-3 py-2 text-sm"
            />
          </label>
          <button
            type="submit"
            className="rounded-md bg-[var(--color-primary)] px-3 py-2 text-sm font-medium text-[var(--color-primary-foreground)] hover:opacity-90 sm:col-span-2"
          >
            Enregistrer
          </button>
        </form>
      </section>

      {supplier.status === 'ACTIVE' && (
        <section className="rounded-lg border border-[var(--color-destructive)] bg-[var(--color-destructive)]/5 p-6">
          <h2 className="text-sm font-semibold text-[var(--color-destructive)]">Zone dangereuse</h2>
          <p className="mt-1 text-xs text-[var(--color-muted-foreground)]">
            L&apos;archivage est journalise et reversible uniquement par requete SQL admin.
            Les BC et factures existants restent consultables.
          </p>
          <form action={handleArchive} className="mt-3 flex gap-2">
            <input type="hidden" name="id" value={supplier.id} />
            <input
              name="reason"
              required
              placeholder="Motif d'archivage (obligatoire, min 5 chars)"
              minLength={5}
              className="flex-1 rounded-md border bg-white px-3 py-2 text-sm"
            />
            <button
              type="submit"
              className="rounded-md border border-[var(--color-destructive)] bg-white px-3 py-2 text-xs font-medium text-[var(--color-destructive)] hover:bg-[var(--color-destructive)]/10"
            >
              Archiver
            </button>
          </form>
        </section>
      )}

      <section className="rounded-lg border bg-[var(--color-card)] p-4 text-xs text-[var(--color-muted-foreground)]">
        Cree le {formatDateTime(supplier.createdAt)} - Statut <span className="font-mono">{supplier.status}</span>
      </section>
    </div>
  );
}
