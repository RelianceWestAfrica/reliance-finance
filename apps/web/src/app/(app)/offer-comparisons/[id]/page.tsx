import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';

import { auth } from '@/lib/auth';
import { getTenantedDb } from '@/lib/tenancy';
import { prisma, OfferComparisonStatus } from '@reliance-finance/database';
import { formatCurrency, formatDateTime } from '@/lib/format';
import { rankOffers } from '@/lib/offer-comparisons/validation';
import {
  addOffer,
  recommendOffer,
  submitOfferComparison,
  approveOfferComparison,
  rejectOfferComparison,
} from '../actions';

export default async function OfferComparisonDetailPage(props: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');
  const { id } = await props.params;
  const searchParams = await props.searchParams;
  const errorMessage = searchParams.error ? decodeURIComponent(searchParams.error) : null;

  const db = await getTenantedDb();
  const comparison = await db.offerComparison.findUnique({
    where: { id },
    include: {
      entity: { select: { code: true } },
      project: { select: { code: true } },
      expenseRequest: { select: { reference: true, id: true } },
      offers: {
        include: { supplier: { select: { code: true, name: true } } },
        orderBy: { priceTtc: 'asc' },
      },
    },
  });
  if (!comparison) notFound();

  const suppliers = await prisma.supplier.findMany({
    where: { entityId: comparison.entityId, status: 'ACTIVE' },
    orderBy: { code: 'asc' },
    select: { id: true, code: true, name: true },
  });

  const ranking = rankOffers(
    comparison.offers.map((o) => ({
      id: o.id,
      supplierId: o.supplierId,
      priceTtc: Number(o.priceTtc.toString()),
      technicallyCompliant: o.technicallyCompliant,
    })),
  );

  const isEditable = comparison.status === OfferComparisonStatus.DRAFT;

  async function handleAddOffer(formData: FormData) {
    'use server';
    const r = await addOffer(formData);
    if (!r.ok) redirect('/offer-comparisons/' + id + '?error=' + encodeURIComponent(r.error ?? 'Echec'));
  }
  async function handleRecommend(formData: FormData) {
    'use server';
    const r = await recommendOffer(formData);
    if (!r.ok) redirect('/offer-comparisons/' + id + '?error=' + encodeURIComponent(r.error ?? 'Echec'));
  }
  async function handleSubmit(formData: FormData) {
    'use server';
    const r = await submitOfferComparison(formData);
    if (!r.ok) redirect('/offer-comparisons/' + id + '?error=' + encodeURIComponent(r.error ?? 'Echec'));
  }
  async function handleApprove(formData: FormData) {
    'use server';
    const r = await approveOfferComparison(formData);
    if (!r.ok) redirect('/offer-comparisons/' + id + '?error=' + encodeURIComponent(r.error ?? 'Echec'));
  }
  async function handleReject(formData: FormData) {
    'use server';
    const r = await rejectOfferComparison(formData);
    if (!r.ok) redirect('/offer-comparisons/' + id + '?error=' + encodeURIComponent(r.error ?? 'Echec'));
  }

  return (
    <div className="space-y-6">
      <header className="flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Comparatif {comparison.reference}</h1>
          <p className="text-sm text-[var(--color-muted-foreground)]">
            {comparison.entity.code}
            {comparison.project && ' / ' + comparison.project.code}
            {comparison.expenseRequest && (
              <>
                {' - '}
                <Link href={'/expense-requests/' + comparison.expenseRequest.id} className="text-[var(--color-primary)] hover:underline">
                  {comparison.expenseRequest.reference}
                </Link>
              </>
            )}
          </p>
        </div>
        <Link href="/offer-comparisons" className="text-xs text-[var(--color-primary)] hover:underline">
          &larr; Liste
        </Link>
      </header>

      {errorMessage && (
        <div role="alert" className="rounded-md border border-[var(--color-destructive)] bg-[var(--color-destructive)]/10 px-3 py-2 text-sm text-[var(--color-destructive)]">
          {errorMessage}
        </div>
      )}

      <section className="rounded-lg border bg-[var(--color-card)] p-4 shadow-sm">
        <div className="flex items-center gap-3">
          <span className="text-xs uppercase text-[var(--color-muted-foreground)]">Statut</span>
          <span className="font-mono text-sm">{comparison.status}</span>
          <span className="ml-4 text-xs text-[var(--color-muted-foreground)]">
            Cree {formatDateTime(comparison.createdAt)}
          </span>
        </div>
      </section>

      <section className="rounded-lg border bg-[var(--color-card)] shadow-sm">
        <header className="border-b px-4 py-3">
          <h2 className="text-sm font-semibold">Offres reçues ({comparison.offers.length})</h2>
        </header>
        <table className="w-full text-sm">
          <thead className="border-b text-left text-xs uppercase text-[var(--color-muted-foreground)]">
            <tr>
              <th className="px-3 py-2 font-medium">Fournisseur</th>
              <th className="px-3 py-2 font-medium">Prix HT</th>
              <th className="px-3 py-2 font-medium">Prix TTC</th>
              <th className="px-3 py-2 font-medium">Delai</th>
              <th className="px-3 py-2 font-medium">Tech OK</th>
              <th className="px-3 py-2 font-medium">Score auto</th>
            </tr>
          </thead>
          <tbody>
            {comparison.offers.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-[var(--color-muted-foreground)]">
                  Aucune offre. Ajoutez-en au moins 2.
                </td>
              </tr>
            )}
            {comparison.offers.map((o) => {
              const rank = ranking.find((r) => r.offer.id === o.id);
              const isRecommended = comparison.recommendedOfferId === o.id;
              return (
                <tr key={o.id} className={'border-b last:border-0 ' + (isRecommended ? 'bg-[var(--color-success)]/5' : '')}>
                  <td className="px-3 py-2">
                    <div className="font-medium">{o.supplier.name}</div>
                    <div className="font-mono text-xs text-[var(--color-muted-foreground)]">{o.supplier.code}</div>
                  </td>
                  <td className="px-3 py-2 text-right text-xs tabular-nums">
                    {formatCurrency(Number(o.priceHt.toString()), o.currency)}
                  </td>
                  <td className="px-3 py-2 text-right text-sm tabular-nums font-semibold">
                    {formatCurrency(Number(o.priceTtc.toString()), o.currency)}
                  </td>
                  <td className="px-3 py-2 text-xs">{o.deliveryDelay ?? '-'}</td>
                  <td className="px-3 py-2 text-xs">
                    {o.technicallyCompliant ? (
                      <span className="text-[var(--color-success)]">Oui</span>
                    ) : (
                      <span className="text-[var(--color-warning)]">Non</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right text-xs font-mono">
                    {rank ? rank.score.toFixed(3) : '-'}
                    {isRecommended && (
                      <div className="text-[10px] text-[var(--color-success)]">RECOMMANDEE</div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      {isEditable && (
        <>
          <section className="rounded-lg border bg-[var(--color-card)] p-6 shadow-sm">
            <h2 className="text-sm font-semibold">Ajouter une offre</h2>
            <form action={handleAddOffer} className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <input type="hidden" name="comparisonId" value={comparison.id} />
              <select name="supplierId" required className="rounded-md border bg-white px-3 py-2 text-sm">
                <option value="">-- Fournisseur --</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>{s.code} - {s.name}</option>
                ))}
              </select>
              <input name="reference" placeholder="Ref devis" className="rounded-md border bg-white px-3 py-2 text-sm" />
              <input name="priceHt" type="number" min="0" step="0.01" required placeholder="Prix HT" className="rounded-md border bg-white px-3 py-2 text-sm tabular-nums" />
              <input name="priceTtc" type="number" min="1" step="0.01" required placeholder="Prix TTC" className="rounded-md border bg-white px-3 py-2 text-sm tabular-nums" />
              <input name="taxAmount" type="number" min="0" step="0.01" defaultValue="0" placeholder="TVA" className="rounded-md border bg-white px-3 py-2 text-sm tabular-nums" />
              <input name="currency" defaultValue="XOF" maxLength={3} className="rounded-md border bg-white px-3 py-2 text-sm uppercase" />
              <input name="deliveryDelay" placeholder="Delai" className="rounded-md border bg-white px-3 py-2 text-sm" />
              <input name="warranty" placeholder="Garantie" className="rounded-md border bg-white px-3 py-2 text-sm" />
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="technicallyCompliant" /> Tech conforme
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="immediatelyAvailable" /> Dispo immediat
              </label>
              <input name="observations" placeholder="Observations" className="rounded-md border bg-white px-3 py-2 text-sm sm:col-span-2" />
              <button type="submit" className="rounded-md bg-[var(--color-primary)] px-3 py-2 text-sm font-medium text-[var(--color-primary-foreground)] hover:opacity-90 sm:col-span-2 lg:col-span-4">
                Ajouter l&apos;offre
              </button>
            </form>
          </section>

          {comparison.offers.length >= 2 && (
            <section className="rounded-lg border bg-[var(--color-card)] p-6 shadow-sm">
              <h2 className="text-sm font-semibold">Recommandation</h2>
              <form action={handleRecommend} className="mt-3 space-y-3">
                <input type="hidden" name="comparisonId" value={comparison.id} />
                <select name="offerId" required defaultValue={comparison.recommendedOfferId ?? ''} className="block w-full rounded-md border bg-white px-3 py-2 text-sm">
                  <option value="">-- Offre recommandee --</option>
                  {comparison.offers.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.supplier.code} - {formatCurrency(Number(o.priceTtc.toString()), o.currency)}
                    </option>
                  ))}
                </select>
                <textarea
                  name="justification"
                  rows={3}
                  required
                  minLength={30}
                  defaultValue={comparison.recommendationJustification ?? ''}
                  placeholder="Justification (>= 30 caracteres) : pourquoi cette offre vs les autres ?"
                  className="block w-full rounded-md border bg-white px-3 py-2 text-sm"
                />
                <button type="submit" className="rounded-md bg-[var(--color-primary)] px-3 py-2 text-sm font-medium text-[var(--color-primary-foreground)] hover:opacity-90">
                  Fixer la recommandation
                </button>
              </form>
            </section>
          )}
        </>
      )}

      <section className="rounded-lg border bg-[var(--color-card)] p-6 shadow-sm">
        <h2 className="text-sm font-semibold">Actions</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {comparison.status === OfferComparisonStatus.DRAFT && (
            <form action={handleSubmit}>
              <input type="hidden" name="id" value={comparison.id} />
              <button className="rounded-md bg-[var(--color-primary)] px-3 py-2 text-sm font-medium text-[var(--color-primary-foreground)] hover:opacity-90">
                Soumettre pour approbation
              </button>
            </form>
          )}
          {comparison.status === OfferComparisonStatus.SUBMITTED && (
            <>
              <form action={handleApprove}>
                <input type="hidden" name="id" value={comparison.id} />
                <button className="rounded-md bg-[var(--color-success)] px-3 py-2 text-sm font-medium text-[var(--color-success-foreground)] hover:opacity-90">
                  Approuver
                </button>
              </form>
              <form action={handleReject}>
                <input type="hidden" name="id" value={comparison.id} />
                <button className="rounded-md border border-[var(--color-destructive)] bg-white px-3 py-2 text-xs font-medium text-[var(--color-destructive)] hover:bg-[var(--color-destructive)]/10">
                  Rejeter
                </button>
              </form>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
