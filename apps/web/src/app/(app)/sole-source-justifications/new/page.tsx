import { redirect } from 'next/navigation';
import Link from 'next/link';

import { auth } from '@/lib/auth';
import { getTenantedDb } from '@/lib/tenancy';
import { SoleSourceReason } from '@reliance-finance/database';
import { createSoleSourceJustification } from '../actions';

export default async function NewSoleSourceJustificationPage(props: {
  searchParams: Promise<{ error?: string; expenseRequestId?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');
  const params = await props.searchParams;
  const errorMessage = params.error ? decodeURIComponent(params.error) : null;

  const db = await getTenantedDb();
  const expenseRequests = await db.expenseRequest.findMany({
    orderBy: { createdAt: 'desc' },
    take: 50,
    select: { id: true, reference: true, title: true, amount: true, currency: true },
  });

  async function handleCreate(formData: FormData) {
    'use server';
    const r = await createSoleSourceJustification(formData);
    if (!r.ok || !r.id) {
      redirect('/sole-source-justifications/new?error=' + encodeURIComponent(r.error ?? 'Echec'));
    }
    redirect('/sole-source-justifications/' + r.id);
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Justification offre unique (Modele 2)</h1>
        <p className="text-sm text-[var(--color-muted-foreground)]">
          Derogation a la regle des 3 offres (cadre §6). Justification ecrite obligatoire.
        </p>
      </header>

      {errorMessage && (
        <div role="alert" className="rounded-md border border-[var(--color-destructive)] bg-[var(--color-destructive)]/10 px-3 py-2 text-sm text-[var(--color-destructive)]">
          {errorMessage}
        </div>
      )}

      <form action={handleCreate} className="space-y-4 rounded-lg border bg-[var(--color-card)] p-6 shadow-sm">
        <label className="block text-sm">
          Demande de depense liee *
          <select name="expenseRequestId" required defaultValue={params.expenseRequestId ?? ''} className="mt-1 block w-full rounded-md border bg-white px-3 py-2 text-sm">
            <option value="">-- Demande --</option>
            {expenseRequests.map((er) => (
              <option key={er.id} value={er.id}>
                {er.reference} - {er.title} ({er.amount.toString()} {er.currency})
              </option>
            ))}
          </select>
        </label>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="text-sm">
            Motif *
            <select name="reason" required className="mt-1 block w-full rounded-md border bg-white px-3 py-2 text-sm">
              <option value="">-- Motif --</option>
              <option value={SoleSourceReason.MONOPOLY}>Monopole / exclusivite technique</option>
              <option value={SoleSourceReason.URGENCY_CRITICAL}>Urgence critique (arret/HSE/legal)</option>
              <option value={SoleSourceReason.TECHNICAL_COMPATIBILITY}>Compatibilite technique / continuite</option>
              <option value={SoleSourceReason.CONTRACTUAL_REQUIREMENT}>Fournisseur impose par contrat / garantie</option>
              <option value={SoleSourceReason.OTHER}>Autre</option>
            </select>
          </label>
          <label className="text-sm">
            Si "Autre" : precisez
            <input name="otherReason" className="mt-1 block w-full rounded-md border bg-white px-3 py-2 text-sm" />
          </label>
          <label className="text-sm">
            Montant estime *
            <input name="estimatedAmount" type="number" min="1" step="0.01" required className="mt-1 block w-full rounded-md border bg-white px-3 py-2 text-sm tabular-nums" />
          </label>
          <label className="text-sm">
            Devise
            <input name="currency" defaultValue="XOF" maxLength={3} className="mt-1 block w-full rounded-md border bg-white px-3 py-2 text-sm uppercase" />
          </label>
        </div>

        <label className="block text-sm">
          Justification detaillee * (&gt;= 50 caracteres)
          <textarea name="justification" rows={4} required minLength={50} className="mt-1 block w-full rounded-md border bg-white px-3 py-2 text-sm" />
        </label>

        <fieldset className="rounded-md border p-4">
          <legend className="px-2 text-sm font-semibold">Mesures de securisation (au moins 2 sur 4 requises pour approbation)</legend>
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="hasNegotiatedPrice" /> Negociation prix / remise obtenue
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="hasReinforcedPaymentTerms" /> Conditions paiement renforcees (solde apres PV)
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="hasWarrantyOrPenalty" /> Garantie / penalites integrees au BC
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="hasReinforcedReception" /> Controle reception renforce
            </label>
          </div>
        </fieldset>

        <div className="flex gap-2">
          <button type="submit" className="rounded-md bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-[var(--color-primary-foreground)] hover:opacity-90">
            Creer la justification
          </button>
          <Link href="/expense-requests" className="rounded-md border px-4 py-2 text-sm hover:bg-[var(--color-muted)]">
            Annuler
          </Link>
        </div>
      </form>
    </div>
  );
}
