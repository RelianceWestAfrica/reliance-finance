import { SupplierSensitivity } from '@reliance-finance/database';
import { redirect } from 'next/navigation';
import Link from 'next/link';

import { auth } from '@/lib/auth';
import { getTenantedDb } from '@/lib/tenancy';
import { createSupplier } from '../actions';

export default async function NewSupplierPage(props: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');
  const params = await props.searchParams;
  const errorMessage = params.error ? decodeURIComponent(params.error) : null;

  const db = await getTenantedDb();
  const entities = await db.entity.findMany({
    where: { isActive: true },
    orderBy: { code: 'asc' },
    select: { id: true, code: true, name: true, kind: true, defaultCurrency: true },
  });

  async function handleCreate(formData: FormData) {
    'use server';
    const r = await createSupplier(formData);
    if (!r.ok || !r.id) {
      redirect('/suppliers/new?error=' + encodeURIComponent(r.error ?? 'Echec'));
    }
    redirect('/suppliers/' + r.id);
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Nouveau fournisseur</h1>
        <p className="text-sm text-[var(--color-muted-foreground)]">
          Onboarding KYC light : RCCM/IFU + RIB initial (verification ulterieure par double validation - cadre §8).
        </p>
        <Link
          href="/suppliers"
          className="mt-2 inline-block text-xs text-[var(--color-primary)] hover:underline"
        >
          &larr; Retour a la liste
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
              Entite *
              <select
                name="entityId"
                required
                className="mt-1 block w-full rounded-md border bg-white px-3 py-2 text-sm"
              >
                <option value="">-- Entite --</option>
                {entities.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.code} - {e.name} ({e.kind})
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              Code fournisseur * (MAJUSCULES)
              <input
                name="code"
                required
                placeholder="RWA-SUP-TOGO-0099"
                className="mt-1 block w-full rounded-md border bg-white px-3 py-2 text-sm uppercase"
              />
            </label>
            <label className="text-sm sm:col-span-2">
              Raison sociale *
              <input
                name="name"
                required
                placeholder="ACME SARL"
                className="mt-1 block w-full rounded-md border bg-white px-3 py-2 text-sm"
              />
            </label>
            <label className="text-sm">
              RCCM
              <input
                name="rccm"
                placeholder="TG-LFW-2025-A-1234"
                className="mt-1 block w-full rounded-md border bg-white px-3 py-2 text-sm font-mono"
              />
            </label>
            <label className="text-sm">
              IFU / NIF
              <input
                name="ifu"
                className="mt-1 block w-full rounded-md border bg-white px-3 py-2 text-sm font-mono"
              />
            </label>
            <label className="text-sm">
              Email
              <input
                name="email"
                type="email"
                className="mt-1 block w-full rounded-md border bg-white px-3 py-2 text-sm"
              />
            </label>
            <label className="text-sm">
              Telephone
              <input
                name="phone"
                className="mt-1 block w-full rounded-md border bg-white px-3 py-2 text-sm"
              />
            </label>
            <label className="text-sm sm:col-span-2">
              Adresse
              <input
                name="address"
                className="mt-1 block w-full rounded-md border bg-white px-3 py-2 text-sm"
              />
            </label>
            <label className="text-sm">
              Pays (ISO 2)
              <input
                name="country"
                maxLength={2}
                placeholder="TG"
                className="mt-1 block w-full rounded-md border bg-white px-3 py-2 text-sm uppercase"
              />
            </label>
          </div>
        </section>

        <section className="space-y-4 rounded-lg border bg-[var(--color-card)] p-6 shadow-sm">
          <h2 className="text-lg font-semibold">Sensibilite (cadre §6.3)</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="text-sm">
              Sensibilite
              <select
                name="sensitivity"
                defaultValue={SupplierSensitivity.STANDARD}
                className="mt-1 block w-full rounded-md border bg-white px-3 py-2 text-sm"
              >
                {Object.values(SupplierSensitivity).map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
            <label className="mt-6 flex items-center gap-2 text-sm">
              <input type="checkbox" name="isStrategic" /> Fournisseur strategique (controle renforce)
            </label>
            <label className="text-sm sm:col-span-2">
              Notes
              <textarea
                name="notes"
                rows={3}
                className="mt-1 block w-full rounded-md border bg-white px-3 py-2 text-sm"
              />
            </label>
          </div>
        </section>

        <section className="space-y-4 rounded-lg border bg-[var(--color-card)] p-6 shadow-sm">
          <h2 className="text-lg font-semibold">RIB initial (optionnel)</h2>
          <p className="text-xs text-[var(--color-muted-foreground)]">
            Le RIB sera initialement marque NON verifie. Il devra etre verifie via le workflow
            de double validation (DAF Pays + DFG) avant de pouvoir etre utilise pour un paiement.
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="text-sm">
              Banque
              <input
                name="bankName"
                placeholder="Ecobank Togo"
                className="mt-1 block w-full rounded-md border bg-white px-3 py-2 text-sm"
              />
            </label>
            <label className="text-sm">
              Titulaire (doit egaler raison sociale)
              <input
                name="holderName"
                className="mt-1 block w-full rounded-md border bg-white px-3 py-2 text-sm"
              />
            </label>
            <label className="text-sm">
              IBAN
              <input
                name="iban"
                className="mt-1 block w-full rounded-md border bg-white px-3 py-2 text-sm font-mono"
              />
            </label>
            <label className="text-sm">
              RIB
              <input
                name="rib"
                className="mt-1 block w-full rounded-md border bg-white px-3 py-2 text-sm font-mono"
              />
            </label>
            <label className="text-sm">
              SWIFT / BIC
              <input
                name="swift"
                className="mt-1 block w-full rounded-md border bg-white px-3 py-2 text-sm font-mono uppercase"
              />
            </label>
            <label className="text-sm">
              Devise
              <input
                name="currency"
                defaultValue="XOF"
                maxLength={3}
                className="mt-1 block w-full rounded-md border bg-white px-3 py-2 text-sm uppercase"
              />
            </label>
          </div>
        </section>

        <div className="flex gap-2">
          <button
            type="submit"
            className="rounded-md bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-[var(--color-primary-foreground)] hover:opacity-90"
          >
            Creer le fournisseur
          </button>
          <Link
            href="/suppliers"
            className="rounded-md border px-4 py-2 text-sm hover:bg-[var(--color-muted)]"
          >
            Annuler
          </Link>
        </div>
      </form>
    </div>
  );
}
