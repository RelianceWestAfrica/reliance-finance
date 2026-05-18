import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';

import { auth } from '@/lib/auth';
import { getTenantedDb } from '@/lib/tenancy';
import { getUserMemberships } from '@/lib/rbac';
import { prisma, ExpenseRequestStatus, ExpenseRequestType } from '@reliance-finance/database';
import { formatCurrency, formatDateTime } from '@/lib/format';
import { verifySignatureChain } from '@/lib/signatures/service';
import { canActorSignNext } from '@/lib/expense-requests/can-act';
import type { ApprovalSlot } from '@/lib/expense-requests/approval-chain';
import {
  submitExpenseRequest,
  signExpenseRequest,
  rejectExpenseRequest,
  cancelExpenseRequest,
  regularizeEmergency,
} from '../actions';

function stageFromSig(s: string) {
  if (s === 'VISA_FILIALE_N1') return 'VISA_FILIALE_N1' as const;
  if (s === 'VISA_FILIALE_N2') return 'VISA_FILIALE_N2' as const;
  if (s === 'VISA_GROUPE') return 'VISA_GROUPE' as const;
  if (s === 'AUTHORIZATION_AG') return 'AUTHORIZATION_AG' as const;
  return 'VISA_FILIALE_N1' as const;
}

function rolesForStage(s: string) {
  if (s === 'VISA_FILIALE_N1') return ['FINANCE_FIL_N1', 'DAF_PAYS'] as const;
  if (s === 'VISA_FILIALE_N2') return ['FINANCE_FIL_N2', 'DAF_PAYS'] as const;
  if (s === 'VISA_GROUPE') return ['FINANCE_GROUPE', 'DFG'] as const;
  if (s === 'AUTHORIZATION_AG') return ['AG', 'DFG'] as const;
  return [] as const;
}

export default async function ExpenseRequestDetailPage(props: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');
  const { id } = await props.params;
  const searchParams = await props.searchParams;
  const errorMessage = searchParams.error ? decodeURIComponent(searchParams.error) : null;

  const db = await getTenantedDb();
  const er = await db.expenseRequest.findUnique({
    where: { id },
    include: {
      entity: { select: { code: true, name: true } },
      project: { select: { code: true, name: true } },
      costCenter: { select: { code: true, name: true } },
      supplier: { select: { code: true, name: true, sensitivity: true, isStrategic: true } },
      createdBy: { select: { email: true, name: true } },
    },
  });
  if (!er) notFound();

  // Le workflow + signatures sont stockes hors du tenancy (modeles globaux)
  const workflow = await prisma.workflowInstance.findUnique({
    where: { expenseRequestId: id },
    include: {
      steps: { orderBy: { position: 'asc' } },
      signatures: {
        orderBy: [{ signedAt: 'asc' }, { id: 'asc' }],
        include: { actor: { select: { email: true, name: true } } },
      },
    },
  });

  const memberships = await getUserMemberships(session.user.id);
  const actorRoles = memberships.map((m) => m.role);

  // Si le workflow existe, determiner si l'utilisateur peut signer
  let actableSlot: ApprovalSlot | null = null;
  let nonActableReason: string | null = null;

  if (workflow) {
    const approvalChain: ApprovalSlot[] = workflow.steps
      .filter((s) => s.status !== 'SKIPPED')
      .map((s) => ({
        stage: stageFromSig(s.stage),
        allowedRoles: rolesForStage(s.stage) as never,
        reason: '',
        position: s.position,
      }));

    const existingSignatures = workflow.signatures.map((s) => ({
      stage: stageFromSig(s.stage),
      actorId: s.actorId,
    }));

    const verdict = canActorSignNext(
      { approvalChain, existingSignatures, requesterId: er.createdById },
      { id: session.user.id, roles: actorRoles },
    );
    if (verdict.canAct) actableSlot = verdict.slot;
    else nonActableReason = verdict.reason;
  }

  const chainVerify = workflow
    ? await verifySignatureChain(workflow.id)
    : { ok: true as const, count: 0 };

  async function handleSubmit(formData: FormData) {
    'use server';
    const r = await submitExpenseRequest(formData);
    if (!r.ok) redirect('/expense-requests/' + id + '?error=' + encodeURIComponent(r.error ?? 'Echec'));
  }
  async function handleSign(formData: FormData) {
    'use server';
    const r = await signExpenseRequest(formData);
    if (!r.ok) redirect('/expense-requests/' + id + '?error=' + encodeURIComponent(r.error ?? 'Echec'));
  }
  async function handleReject(formData: FormData) {
    'use server';
    const r = await rejectExpenseRequest(formData);
    if (!r.ok) redirect('/expense-requests/' + id + '?error=' + encodeURIComponent(r.error ?? 'Echec'));
  }
  async function handleCancel(formData: FormData) {
    'use server';
    const r = await cancelExpenseRequest(formData);
    if (!r.ok) redirect('/expense-requests/' + id + '?error=' + encodeURIComponent(r.error ?? 'Echec'));
  }
  async function handleRegularize(formData: FormData) {
    'use server';
    const r = await regularizeEmergency(formData);
    if (!r.ok) redirect('/expense-requests/' + id + '?error=' + encodeURIComponent(r.error ?? 'Echec'));
  }

  const isMyDraft = er.status === ExpenseRequestStatus.DRAFT && er.createdById === session.user.id;
  const isEmergency = er.type === ExpenseRequestType.FD_URGENCE;
  const canRegularize =
    isEmergency &&
    er.status === ExpenseRequestStatus.APPROVED &&
    !er.regularizedAt;

  return (
    <div className="space-y-6">
      <header className="flex items-baseline justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{er.title}</h1>
          <p className="font-mono text-sm text-[var(--color-muted-foreground)]">{er.reference}</p>
          <p className="mt-1 text-xs text-[var(--color-muted-foreground)]">
            Demandeur : {er.createdBy.email} - Cree le {formatDateTime(er.createdAt)}
          </p>
        </div>
        <Link href="/expense-requests" className="text-xs text-[var(--color-primary)] hover:underline">
          &larr; Liste
        </Link>
      </header>

      {errorMessage && (
        <div role="alert" className="rounded-md border border-[var(--color-destructive)] bg-[var(--color-destructive)]/10 px-3 py-2 text-sm text-[var(--color-destructive)]">
          {errorMessage}
        </div>
      )}

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <div className="rounded-lg border bg-[var(--color-card)] p-4 shadow-sm">
          <div className="text-xs uppercase text-[var(--color-muted-foreground)]">Statut</div>
          <div className="mt-1 font-mono text-sm">{er.status}</div>
        </div>
        <div className="rounded-lg border bg-[var(--color-card)] p-4 shadow-sm">
          <div className="text-xs uppercase text-[var(--color-muted-foreground)]">Type</div>
          <div className="mt-1 font-mono text-sm">{er.type}</div>
        </div>
        <div className="rounded-lg border bg-[var(--color-card)] p-4 shadow-sm">
          <div className="text-xs uppercase text-[var(--color-muted-foreground)]">Montant</div>
          <div className="mt-1 text-xl font-semibold tabular-nums">
            {formatCurrency(Number(er.amount.toString()), er.currency)}
          </div>
        </div>
        <div className="rounded-lg border bg-[var(--color-card)] p-4 shadow-sm">
          <div className="text-xs uppercase text-[var(--color-muted-foreground)]">Urgence</div>
          <div className="mt-1 font-mono text-sm">{er.urgency}</div>
        </div>
      </section>

      {isEmergency && er.emergencyDeadlineAt && (
        <section className="rounded-lg border border-[var(--color-warning)] bg-[var(--color-warning)]/5 p-4">
          <div className="text-sm font-semibold text-[var(--color-warning)]">
            FD_URGENCE - regularisation requise
          </div>
          <div className="mt-1 text-xs">
            Deadline : {formatDateTime(er.emergencyDeadlineAt)} -
            {er.regularizedAt
              ? ' Regularise le ' + formatDateTime(er.regularizedAt)
              : ' Non regularise'}
          </div>
        </section>
      )}

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="rounded-lg border bg-[var(--color-card)] p-4 shadow-sm">
          <h3 className="text-sm font-semibold">Contexte</h3>
          <dl className="mt-2 grid grid-cols-2 gap-y-1 text-xs">
            <dt className="text-[var(--color-muted-foreground)]">Entite</dt>
            <dd className="font-mono">{er.entity.code}</dd>
            <dt className="text-[var(--color-muted-foreground)]">Projet</dt>
            <dd className="font-mono">{er.project?.code ?? '-'}</dd>
            <dt className="text-[var(--color-muted-foreground)]">Centre cout</dt>
            <dd className="font-mono">{er.costCenter?.code ?? '-'}</dd>
            <dt className="text-[var(--color-muted-foreground)]">Fournisseur</dt>
            <dd>{er.supplier ? er.supplier.code + ' - ' + er.supplier.name : '-'}</dd>
            <dt className="text-[var(--color-muted-foreground)]">Sensibilite</dt>
            <dd>{er.supplier?.sensitivity ?? '-'}{er.supplier?.isStrategic ? ' (strategique)' : ''}</dd>
            <dt className="text-[var(--color-muted-foreground)]">Nature</dt>
            <dd>{er.opexCapex}</dd>
            <dt className="text-[var(--color-muted-foreground)]">Hors budget</dt>
            <dd>{er.isOutOfBudget ? 'Oui' : 'Non'}</dd>
            <dt className="text-[var(--color-muted-foreground)]">Ligne budget</dt>
            <dd className="font-mono">{er.budgetLineRef ?? '-'}</dd>
          </dl>
        </div>
        <div className="rounded-lg border bg-[var(--color-card)] p-4 shadow-sm">
          <h3 className="text-sm font-semibold">Justification</h3>
          <p className="mt-2 whitespace-pre-wrap text-xs">{er.justification ?? <span className="italic">(aucune)</span>}</p>
          {er.description && (
            <>
              <h3 className="mt-4 text-sm font-semibold">Description</h3>
              <p className="mt-2 whitespace-pre-wrap text-xs">{er.description}</p>
            </>
          )}
        </div>
      </section>

      {workflow && (
        <section className="rounded-lg border bg-[var(--color-card)] shadow-sm">
          <header className="flex items-baseline justify-between border-b px-4 py-3">
            <h3 className="text-sm font-semibold">Workflow et signatures</h3>
            <div className="flex items-center gap-2 text-xs">
              <span className={'h-2 w-2 rounded-full ' + (chainVerify.ok ? 'bg-[var(--color-success)]' : 'bg-[var(--color-destructive)]')} />
              <span className="font-mono text-[var(--color-muted-foreground)]">
                Chaine sigs : {chainVerify.ok ? 'OK (' + chainVerify.count + ')' : (chainVerify as { reason: string }).reason}
              </span>
            </div>
          </header>
          <ol className="divide-y">
            {workflow.steps.map((step) => {
              const sig = workflow.signatures.find((s) => s.stepId === step.id);
              return (
                <li key={step.id} className="flex items-center gap-4 px-4 py-3">
                  <div className="flex h-7 w-7 items-center justify-center rounded-full border bg-[var(--color-muted)] text-xs font-semibold">
                    {step.position}
                  </div>
                  <div className="flex-1">
                    <div className="font-mono text-xs">{step.stage}</div>
                    <div className="text-xs text-[var(--color-muted-foreground)]">
                      {sig
                        ? 'Signe par ' +
                          (sig.actor.email ?? sig.actorId) +
                          ' le ' +
                          formatDateTime(sig.signedAt)
                        : step.status === 'PENDING'
                          ? 'En attente'
                          : step.status}
                    </div>
                    {sig?.comment && (
                      <div className="text-xs italic text-[var(--color-muted-foreground)]">
                        {sig.comment}
                      </div>
                    )}
                  </div>
                  <div className="text-xs">
                    {sig ? (
                      <span className="text-[var(--color-success)]">OK</span>
                    ) : step.status === 'PENDING' ? (
                      <span className="text-[var(--color-warning)]">attente</span>
                    ) : (
                      <span className="text-[var(--color-muted-foreground)]">-</span>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        </section>
      )}

      <section className="space-y-3 rounded-lg border bg-[var(--color-card)] p-6 shadow-sm">
        <h3 className="text-sm font-semibold">Actions</h3>
        <div className="flex flex-wrap gap-2">
          {isMyDraft && (
            <>
              <form action={handleSubmit}>
                <input type="hidden" name="id" value={er.id} />
                <button className="rounded-md bg-[var(--color-primary)] px-3 py-2 text-sm font-medium text-[var(--color-primary-foreground)] hover:opacity-90">
                  Soumettre pour validation
                </button>
              </form>
              <form action={handleCancel}>
                <input type="hidden" name="id" value={er.id} />
                <button className="rounded-md border px-3 py-2 text-xs hover:bg-[var(--color-muted)]">
                  Annuler le brouillon
                </button>
              </form>
            </>
          )}

          {actableSlot && (
            <form action={handleSign} className="flex flex-1 gap-2">
              <input type="hidden" name="id" value={er.id} />
              <input
                name="comment"
                placeholder="Commentaire (optionnel, conserve dans le hash)"
                className="flex-1 rounded-md border bg-white px-3 py-2 text-sm"
              />
              <button className="rounded-md bg-[var(--color-primary)] px-3 py-2 text-sm font-medium text-[var(--color-primary-foreground)] hover:opacity-90">
                Signer {actableSlot.stage}
              </button>
            </form>
          )}

          {!actableSlot && nonActableReason && workflow && (
            <p className="text-xs text-[var(--color-muted-foreground)]">{nonActableReason}</p>
          )}

          {workflow &&
            er.status !== ExpenseRequestStatus.APPROVED &&
            er.status !== ExpenseRequestStatus.REJECTED &&
            er.status !== ExpenseRequestStatus.CANCELLED &&
            er.status !== ExpenseRequestStatus.ARCHIVED && (
              <form action={handleReject} className="flex flex-1 gap-2">
                <input type="hidden" name="id" value={er.id} />
                <input
                  name="reason"
                  required
                  minLength={5}
                  placeholder="Motif du rejet"
                  className="flex-1 rounded-md border bg-white px-3 py-2 text-sm"
                />
                <button className="rounded-md border border-[var(--color-destructive)] bg-white px-3 py-2 text-xs font-medium text-[var(--color-destructive)] hover:bg-[var(--color-destructive)]/10">
                  Rejeter
                </button>
              </form>
            )}

          {canRegularize && (
            <form action={handleRegularize}>
              <input type="hidden" name="id" value={er.id} />
              <button className="rounded-md border border-[var(--color-success)] bg-white px-3 py-2 text-xs font-medium text-[var(--color-success)] hover:bg-[var(--color-success)]/10">
                Marquer regularise (cloture urgence)
              </button>
            </form>
          )}
        </div>
      </section>
    </div>
  );
}
