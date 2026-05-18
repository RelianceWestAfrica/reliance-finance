import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';

import { auth } from '@/lib/auth';
import { prisma } from '@reliance-finance/database';
import { formatCurrency, formatDateTime } from '@/lib/format';
import { approveSoleSourceJustification } from '../actions';
import { AuditAction } from '@/lib/audit/log';

export default async function SoleSourceJustificationDetailPage(props: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');
  const { id } = await props.params;
  const searchParams = await props.searchParams;
  const errorMessage = searchParams.error ? decodeURIComponent(searchParams.error) : null;

  const ssj = await prisma.soleSourceJustification.findUnique({
    where: { id },
    include: {
      expenseRequest: { select: { id: true, reference: true, title: true } },
    },
  });
  if (!ssj) notFound();

  // Statut derive de l'audit log
  const approvedAudit = await prisma.auditLog.findFirst({
    where: {
      entityType: 'SoleSourceJustification',
      entityId: id,
      action: AuditAction.SOLE_SOURCE_APPROVED,
    },
    select: { createdAt: true, actor: { select: { email: true } } },
  });
  const isApproved = !!approvedAudit;

  const safeguards =
    Number(ssj.hasNegotiatedPrice) +
    Number(ssj.hasReinforcedPaymentTerms) +
    Number(ssj.hasWarrantyOrPenalty) +
    Number(ssj.hasReinforcedReception);

  async function handleApprove(formData: FormData) {
    'use server';
    const r = await approveSoleSourceJustification(formData);
    if (!r.ok) redirect('/sole-source-justifications/' + id + '?error=' + encodeURIComponent(r.error ?? 'Echec'));
  }

  return (
    <div className="space-y-6">
      <header className="flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{ssj.reference}</h1>
          <p className="text-sm text-[var(--color-muted-foreground)]">
            Justification offre unique - Modele 2 (cadre §6)
            {ssj.expenseRequest && (
              <>
                {' - '}
                <Link href={'/expense-requests/' + ssj.expenseRequest.id} className="text-[var(--color-primary)] hover:underline">
                  {ssj.expenseRequest.reference}
                </Link>
              </>
            )}
          </p>
        </div>
        <Link href="/expense-requests" className="text-xs text-[var(--color-primary)] hover:underline">
          &larr; Demandes
        </Link>
      </header>

      {errorMessage && (
        <div role="alert" className="rounded-md border border-[var(--color-destructive)] bg-[var(--color-destructive)]/10 px-3 py-2 text-sm text-[var(--color-destructive)]">
          {errorMessage}
        </div>
      )}

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-lg border bg-[var(--color-card)] p-4 shadow-sm">
          <div className="text-xs uppercase text-[var(--color-muted-foreground)]">Statut</div>
          <div className={'mt-1 font-mono text-sm ' + (isApproved ? 'text-[var(--color-success)]' : 'text-[var(--color-warning)]')}>
            {isApproved ? 'APPROVED' : 'PENDING'}
          </div>
        </div>
        <div className="rounded-lg border bg-[var(--color-card)] p-4 shadow-sm">
          <div className="text-xs uppercase text-[var(--color-muted-foreground)]">Montant estime</div>
          <div className="mt-1 text-xl font-semibold tabular-nums">
            {formatCurrency(Number(ssj.estimatedAmount.toString()), ssj.currency)}
          </div>
        </div>
        <div className="rounded-lg border bg-[var(--color-card)] p-4 shadow-sm">
          <div className="text-xs uppercase text-[var(--color-muted-foreground)]">Mesures de securisation</div>
          <div className={'mt-1 font-mono text-sm ' + (safeguards >= 2 ? 'text-[var(--color-success)]' : 'text-[var(--color-warning)]')}>
            {safeguards} / 4 (min 2)
          </div>
        </div>
      </section>

      <section className="rounded-lg border bg-[var(--color-card)] p-6 shadow-sm">
        <h3 className="text-sm font-semibold">Motif</h3>
        <p className="mt-2 font-mono text-xs">{ssj.reason}</p>
        {ssj.otherReason && (
          <p className="mt-1 text-xs italic">{ssj.otherReason}</p>
        )}
        <h3 className="mt-4 text-sm font-semibold">Justification</h3>
        <p className="mt-2 whitespace-pre-wrap text-sm">{ssj.justification}</p>

        <h3 className="mt-4 text-sm font-semibold">Mesures de securisation cochees</h3>
        <ul className="mt-2 space-y-1 text-xs">
          <li>{ssj.hasNegotiatedPrice ? '✓' : '✗'} Negociation prix / remise</li>
          <li>{ssj.hasReinforcedPaymentTerms ? '✓' : '✗'} Conditions paiement renforcees</li>
          <li>{ssj.hasWarrantyOrPenalty ? '✓' : '✗'} Garantie / penalites integrees</li>
          <li>{ssj.hasReinforcedReception ? '✓' : '✗'} Reception renforcee</li>
        </ul>
      </section>

      {isApproved && approvedAudit && (
        <section className="rounded-lg border bg-[var(--color-success)]/5 border-[var(--color-success)] p-4 text-sm">
          Approuvee le {formatDateTime(approvedAudit.createdAt)} par {approvedAudit.actor?.email ?? 'systeme'}.
        </section>
      )}

      {!isApproved && (
        <section className="rounded-lg border bg-[var(--color-card)] p-6 shadow-sm">
          <form action={handleApprove}>
            <input type="hidden" name="id" value={ssj.id} />
            <button className="rounded-md bg-[var(--color-success)] px-3 py-2 text-sm font-medium text-[var(--color-success-foreground)] hover:opacity-90">
              Approuver (DFG / Finance Groupe / AG)
            </button>
            <p className="mt-2 text-xs text-[var(--color-muted-foreground)]">
              Approbation possible si au moins 2 mesures de securisation sont cochees.
            </p>
          </form>
        </section>
      )}
    </div>
  );
}
