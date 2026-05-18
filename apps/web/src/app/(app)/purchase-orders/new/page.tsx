import { redirect } from 'next/navigation';
import Link from 'next/link';

import { auth } from '@/lib/auth';
import { getTenantedDb } from '@/lib/tenancy';
import { PurchaseOrderType } from '@reliance-finance/database';
import { createPurchaseOrder } from '../actions';

export default async function NewPurchaseOrderPage(props: {
  searchParams: Promise<{ error?: string; expenseRequestId?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');
  const params = await props.searchParams;
  const errorMessage = params.error ? decodeURIComponent(params.error) : null;

  const db = await getTenantedDb();
  const [entities, projects, suppliers, expenseRequests] = await Promise.all([
    db.entity.findMany({ where: { isActive: true }, orderBy: { code: 'asc' }, select: { id: true, code: true, name: true } }),
    db.project.findMany({ where: { isActive: true }, orderBy: { code: 'asc' }, select: { id: true, code: true, entity: { select: { code: true } } } }),
    db.supplier.findMany({ where: { status: 'ACTIVE' }, orderBy: { code: 'asc' }, select: { id: true, code: true, name: true } }),
    db.expenseRequest.findMany({
      where: { status: 'APPROVED' },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: { id: true, reference: true, title: true },
    }),
  ]);

  async function handleCreate(formData: FormData) {
    'use server';
    const r = await createPurchaseOrder(formData);
    if (!r.ok || !r.id) {
      redirect('/purchase-orders/new?error=' + encodeURIComponent(r.error ?? 'Echec'));
    }
    redirect('/purchase-orders/' + r.id);
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Nouveau BC / Contrat</h1>
        <Link href="/purchase-orders" className="mt-2 inline-block text-xs text-[var(--color-primary)] hover:underline">
          &larr; Retour
        </Link>
      </header>

      {errorMessage && (
        <div role="alert" className="rounded-md border border-[var(--color-destructive)] bg-[var(--color-destructive)]/10 px-3 py-2 text-sm text-[var(--color-destructive)]">
          {errorMessage}
        </div>
      )}

      <form action={handleCreate} className="space-y-6">
        <section className="space-y-4 rounded-lg border bg-[var(--color-card)] p-6 shadow-sm">
          <h2 className="text-lg font-semibold">Identification</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="text-sm">
              Type *
              <select name="type" required defaultValue={PurchaseOrderType.BC} className="mt-1 block w-full rounded-md border bg-white px-3 py-2 text-sm">
                <option value={PurchaseOrderType.BC}>BC - Bon de commande</option>
                <option value={PurchaseOrderType.CONTRACT}>CONTRACT - Contrat / prestation</option>
              </select>
            </label>
            <label className="text-sm">
              Entite *
              <select name="entityId" required className="mt-1 block w-full rounded-md border bg-white px-3 py-2 text-sm">
                <option value="">-- Entite --</option>
                {entities.map((e) => (
                  <option key={e.id} value={e.id}>{e.code} - {e.name}</option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              Projet (optionnel)
              <select name="projectId" defaultValue="" className="mt-1 block w-full rounded-md border bg-white px-3 py-2 text-sm">
                <option value="">-- Aucun --</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>{p.entity.code} / {p.code}</option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              Demande liee (FD approuvee)
              <select name="expenseRequestId" defaultValue={params.expenseRequestId ?? ''} className="mt-1 block w-full rounded-md border bg-white px-3 py-2 text-sm">
                <option value="">-- Aucune --</option>
                {expenseRequests.map((er) => (
                  <option key={er.id} value={er.id}>{er.reference} - {er.title}</option>
                ))}
              </select>
            </label>
            <label className="text-sm sm:col-span-2">
              Fournisseur *
              <select name="supplierId" required className="mt-1 block w-full rounded-md border bg-white px-3 py-2 text-sm">
                <option value="">-- Fournisseur --</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>{s.code} - {s.name}</option>
                ))}
              </select>
            </label>
            <label className="text-sm sm:col-span-2">
              Objet *
              <input name="objet" required minLength={3} className="mt-1 block w-full rounded-md border bg-white px-3 py-2 text-sm" />
            </label>
            <label className="text-sm sm:col-span-2">
              Description
              <textarea name="description" rows={3} className="mt-1 block w-full rounded-md border bg-white px-3 py-2 text-sm" />
            </label>
          </div>
        </section>

        <section className="space-y-4 rounded-lg border bg-[var(--color-card)] p-6 shadow-sm">
          <h2 className="text-lg font-semibold">Livraison &amp; conditions</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="text-sm">
              Lieu de livraison
              <input name="deliveryLocation" className="mt-1 block w-full rounded-md border bg-white px-3 py-2 text-sm" />
            </label>
            <label className="text-sm">
              Date limite
              <input name="deliveryDeadline" type="date" className="mt-1 block w-full rounded-md border bg-white px-3 py-2 text-sm" />
            </label>
            <label className="text-sm">
              Devise
              <input name="currency" defaultValue="XOF" maxLength={3} className="mt-1 block w-full rounded-md border bg-white px-3 py-2 text-sm uppercase" />
            </label>
            <label className="text-sm">
              Incoterm (si import)
              <input name="incoterm" className="mt-1 block w-full rounded-md border bg-white px-3 py-2 text-sm uppercase" />
            </label>
            <label className="text-sm sm:col-span-2">
              Conditions de paiement
              <input name="paymentTerms" placeholder="Ex : 100% apres reception + PV + facture conforme" className="mt-1 block w-full rounded-md border bg-white px-3 py-2 text-sm" />
            </label>
            <label className="text-sm">
              Acompte (%)
              <input name="depositPercent" type="number" min="0" max="100" step="1" className="mt-1 block w-full rounded-md border bg-white px-3 py-2 text-sm" />
            </label>
            <label className="text-sm">
              Garantie (mois)
              <input name="warrantyMonths" type="number" min="0" className="mt-1 block w-full rounded-md border bg-white px-3 py-2 text-sm" />
            </label>
            <label className="text-sm">
              Penalite/jour de retard
              <input name="penaltyPerDay" type="number" min="0" step="0.01" className="mt-1 block w-full rounded-md border bg-white px-3 py-2 text-sm tabular-nums" />
            </label>
          </div>
        </section>

        <section className="space-y-4 rounded-lg border bg-[var(--color-card)] p-6 shadow-sm">
          <h2 className="text-lg font-semibold">Reception requise (cadre §6.4)</h2>
          <div className="space-y-2 text-sm">
            <label className="flex items-center gap-2">
              <input type="checkbox" name="requiresReceptionPv" defaultChecked /> PV de reception
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" name="requiresServiceDone" /> PV de service fait
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" name="requiresWorkAttachment" /> Attachement travaux
            </label>
          </div>
        </section>

        <div className="flex gap-2">
          <button type="submit" className="rounded-md bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-[var(--color-primary-foreground)] hover:opacity-90">
            Creer le BC (brouillon)
          </button>
          <Link href="/purchase-orders" className="rounded-md border px-4 py-2 text-sm hover:bg-[var(--color-muted)]">
            Annuler
          </Link>
        </div>
      </form>
    </div>
  );
}
