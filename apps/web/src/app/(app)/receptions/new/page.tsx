import { redirect } from 'next/navigation';
import Link from 'next/link';

import { auth } from '@/lib/auth';
import { getTenantedDb } from '@/lib/tenancy';
import { ReceptionType, PurchaseOrderStatus } from '@reliance-finance/database';
import { createReception } from '../actions';

export default async function NewReceptionPage(props: {
  searchParams: Promise<{ error?: string; purchaseOrderId?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');
  const params = await props.searchParams;
  const errorMessage = params.error ? decodeURIComponent(params.error) : null;

  const db = await getTenantedDb();
  const purchaseOrders = await db.purchaseOrder.findMany({
    where: {
      status: {
        in: [
          PurchaseOrderStatus.SIGNED,
          PurchaseOrderStatus.SENT_TO_SUPPLIER,
          PurchaseOrderStatus.PARTIAL,
        ],
      },
    },
    orderBy: { createdAt: 'desc' },
    take: 50,
    include: { supplier: { select: { code: true, name: true } } },
  });

  async function handleCreate(formData: FormData) {
    'use server';
    const r = await createReception(formData);
    if (!r.ok || !r.id) {
      redirect('/receptions/new?error=' + encodeURIComponent(r.error ?? 'Echec'));
    }
    redirect('/receptions/' + r.id);
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Nouveau PV de reception</h1>
        <Link href="/receptions" className="mt-2 inline-block text-xs text-[var(--color-primary)] hover:underline">
          &larr; Retour
        </Link>
      </header>

      {errorMessage && (
        <div role="alert" className="rounded-md border border-[var(--color-destructive)] bg-[var(--color-destructive)]/10 px-3 py-2 text-sm text-[var(--color-destructive)]">
          {errorMessage}
        </div>
      )}

      <form action={handleCreate} className="space-y-4 rounded-lg border bg-[var(--color-card)] p-6 shadow-sm">
        <label className="block text-sm">
          BC associe *
          <select name="purchaseOrderId" required defaultValue={params.purchaseOrderId ?? ''} className="mt-1 block w-full rounded-md border bg-white px-3 py-2 text-sm">
            <option value="">-- BC signe / envoye --</option>
            {purchaseOrders.map((po) => (
              <option key={po.id} value={po.id}>
                {po.reference} - {po.supplier.code} {po.supplier.name} ({po.status})
              </option>
            ))}
          </select>
        </label>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="text-sm">
            Type de PV *
            <select name="type" required defaultValue={ReceptionType.GOODS} className="mt-1 block w-full rounded-md border bg-white px-3 py-2 text-sm">
              <option value={ReceptionType.GOODS}>Reception de biens</option>
              <option value={ReceptionType.SERVICE_DONE}>Service fait (prestation)</option>
              <option value={ReceptionType.WORK_ATTACHMENT}>Attachement travaux</option>
            </select>
          </label>
          <label className="text-sm">
            Date de reception
            <input name="receptionDate" type="date" className="mt-1 block w-full rounded-md border bg-white px-3 py-2 text-sm" />
          </label>
          <label className="text-sm sm:col-span-2">
            Lieu
            <input name="location" className="mt-1 block w-full rounded-md border bg-white px-3 py-2 text-sm" />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="requiresTechnical" defaultChecked />
            Verification technique requise (recommande pour biens techniques)
          </label>
        </div>

        <p className="text-xs text-[var(--color-muted-foreground)]">
          Les lignes seront pre-remplies depuis le BC. Vous pourrez ajuster les
          quantites recues et marquer les non-conformites avant signature.
        </p>

        <div className="flex gap-2">
          <button type="submit" className="rounded-md bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-[var(--color-primary-foreground)] hover:opacity-90">
            Creer le PV (brouillon)
          </button>
          <Link href="/receptions" className="rounded-md border px-4 py-2 text-sm hover:bg-[var(--color-muted)]">
            Annuler
          </Link>
        </div>
      </form>
    </div>
  );
}
