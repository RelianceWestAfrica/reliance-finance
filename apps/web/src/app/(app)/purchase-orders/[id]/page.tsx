import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';

import { auth } from '@/lib/auth';
import { getTenantedDb } from '@/lib/tenancy';
import { getUserMemberships } from '@/lib/rbac';
import { prisma, PurchaseOrderStatus } from '@reliance-finance/database';
import { formatCurrency, formatDateTime } from '@/lib/format';
import { verifySignatureChain } from '@/lib/signatures/service';
import { isBankAccountUsable } from '@/lib/bank-accounts/usability';
import { canActorSignNext } from '@/lib/expense-requests/can-act';
import type { ApprovalSlot } from '@/lib/expense-requests/approval-chain';
import {
  addPurchaseOrderItem,
  removePurchaseOrderItem,
  submitPurchaseOrder,
  signPurchaseOrder,
  cancelPurchaseOrder,
  sendPurchaseOrderToSupplier,
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

export default async function PurchaseOrderDetailPage(props: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');
  const { id } = await props.params;
  const searchParams = await props.searchParams;
  const errorMessage = searchParams.error ? decodeURIComponent(searchParams.error) : null;

  const db = await getTenantedDb();
  const po = await db.purchaseOrder.findUnique({
    where: { id },
    include: {
      entity: { select: { code: true, name: true } },
      project: { select: { code: true } },
      supplier: { select: { code: true, name: true, sensitivity: true, isStrategic: true } },
      expenseRequest: { select: { id: true, reference: true } },
      items: { orderBy: { position: 'asc' } },
      createdBy: { select: { email: true } },
    },
  });
  if (!po) notFound();

  const workflow = await prisma.workflowInstance.findUnique({
    where: { purchaseOrderId: id },
    include: {
      steps: { orderBy: { position: 'asc' } },
      signatures: {
        orderBy: [{ signedAt: 'asc' }, { id: 'asc' }],
        include: { actor: { select: { email: true } } },
      },
    },
  });

  // RIB snapshot
  const bankAccount = po.bankAccountSnapshotId
    ? await prisma.bankAccount.findUnique({
        where: { id: po.bankAccountSnapshotId },
        select: { id: true, bankName: true, holderName: true, iban: true, rib: true, isActive: true, verifiedAt: true, quarantineUntil: true },
      })
    : null;
  const bankUsability = bankAccount ? isBankAccountUsable(bankAccount) : null;

  const memberships = await getUserMemberships(session.user.id);
  const actorRoles = memberships.map((m) => m.role);

  let actableSlot: ApprovalSlot | null = null;
  let nonActableReason: string | null = null;
  let chainVerify: { ok: boolean; count: number; reason?: string } = { ok: true, count: 0 };

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
      { approvalChain, existingSignatures, requesterId: po.createdById },
      { id: session.user.id, roles: actorRoles },
    );
    if (verdict.canAct) actableSlot = verdict.slot;
    else nonActableReason = verdict.reason;

    const check = await verifySignatureChain(workflow.id);
    chainVerify = check.ok
      ? { ok: true, count: check.count }
      : { ok: false, count: check.count, reason: check.reason };
  }

  async function handleAddItem(formData: FormData) {
    'use server';
    const r = await addPurchaseOrderItem(formData);
    if (!r.ok) redirect('/purchase-orders/' + id + '?error=' + encodeURIComponent(r.error ?? 'Echec'));
  }
  async function handleRemoveItem(formData: FormData) {
    'use server';
    const r = await removePurchaseOrderItem(formData);
    if (!r.ok) redirect('/purchase-orders/' + id + '?error=' + encodeURIComponent(r.error ?? 'Echec'));
  }
  async function handleSubmit(formData: FormData) {
    'use server';
    const r = await submitPurchaseOrder(formData);
    if (!r.ok) redirect('/purchase-orders/' + id + '?error=' + encodeURIComponent(r.error ?? 'Echec'));
  }
  async function handleSign(formData: FormData) {
    'use server';
    const r = await signPurchaseOrder(formData);
    if (!r.ok) redirect('/purchase-orders/' + id + '?error=' + encodeURIComponent(r.error ?? 'Echec'));
  }
  async function handleSend(formData: FormData) {
    'use server';
    const r = await sendPurchaseOrderToSupplier(formData);
    if (!r.ok) redirect('/purchase-orders/' + id + '?error=' + encodeURIComponent(r.error ?? 'Echec'));
  }
  async function handleCancel(formData: FormData) {
    'use server';
    const r = await cancelPurchaseOrder(formData);
    if (!r.ok) redirect('/purchase-orders/' + id + '?error=' + encodeURIComponent(r.error ?? 'Echec'));
  }

  const isEditable = po.status === PurchaseOrderStatus.DRAFT;

  return (
    <div className="space-y-6">
      <header className="flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{po.objet}</h1>
          <p className="font-mono text-sm text-[var(--color-muted-foreground)]">
            {po.reference} - {po.type}
          </p>
          <p className="mt-1 text-xs text-[var(--color-muted-foreground)]">
            {po.entity.code}
            {po.project && ' / ' + po.project.code}
            {po.expenseRequest && (
              <>
                {' - FD : '}
                <Link href={'/expense-requests/' + po.expenseRequest.id} className="text-[var(--color-primary)] hover:underline">
                  {po.expenseRequest.reference}
                </Link>
              </>
            )}
          </p>
        </div>
        <Link href="/purchase-orders" className="text-xs text-[var(--color-primary)] hover:underline">
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
          <div className="mt-1 font-mono text-sm">{po.status}</div>
        </div>
        <div className="rounded-lg border bg-[var(--color-card)] p-4 shadow-sm">
          <div className="text-xs uppercase text-[var(--color-muted-foreground)]">Total TTC</div>
          <div className="mt-1 text-xl font-semibold tabular-nums">
            {formatCurrency(Number(po.totalTtc.toString()), po.currency)}
          </div>
        </div>
        <div className="rounded-lg border bg-[var(--color-card)] p-4 shadow-sm">
          <div className="text-xs uppercase text-[var(--color-muted-foreground)]">Fournisseur</div>
          <div className="mt-1 font-mono text-sm">{po.supplier.code}</div>
          <div className="text-xs text-[var(--color-muted-foreground)]">{po.supplier.name}</div>
        </div>
        <div className="rounded-lg border bg-[var(--color-card)] p-4 shadow-sm">
          <div className="text-xs uppercase text-[var(--color-muted-foreground)]">RIB snapshot</div>
          {bankAccount ? (
            <>
              <div className="mt-1 font-mono text-xs">{bankAccount.iban ?? bankAccount.rib}</div>
              <div className={'text-xs ' + (bankUsability?.usable ? 'text-[var(--color-success)]' : 'text-[var(--color-warning)]')}>
                {bankUsability?.usable ? 'OK' : bankUsability?.usable === false ? bankUsability.reason : '-'}
              </div>
            </>
          ) : (
            <div className="mt-1 text-xs text-[var(--color-destructive)]">Aucun RIB snapshot - paiement bloque</div>
          )}
        </div>
      </section>

      <section className="rounded-lg border bg-[var(--color-card)] shadow-sm">
        <header className="border-b px-4 py-3 flex items-baseline justify-between">
          <h2 className="text-sm font-semibold">Lignes du BC</h2>
          <span className="text-xs text-[var(--color-muted-foreground)]">{po.items.length} item(s)</span>
        </header>
        <table className="w-full text-sm">
          <thead className="border-b text-left text-xs uppercase text-[var(--color-muted-foreground)]">
            <tr>
              <th className="px-3 py-2 font-medium">N°</th>
              <th className="px-3 py-2 font-medium">Designation</th>
              <th className="px-3 py-2 font-medium">Qte</th>
              <th className="px-3 py-2 font-medium">Unite</th>
              <th className="px-3 py-2 font-medium">PU HT</th>
              <th className="px-3 py-2 font-medium">Total HT</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {po.items.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-[var(--color-muted-foreground)]">
                  Aucun item.
                </td>
              </tr>
            )}
            {po.items.map((item) => (
              <tr key={item.id} className="border-b last:border-0">
                <td className="px-3 py-2 font-mono text-xs">{item.position}</td>
                <td className="px-3 py-2">{item.description}</td>
                <td className="px-3 py-2 text-right text-xs tabular-nums">{item.quantity.toString()}</td>
                <td className="px-3 py-2 text-xs">{item.unit ?? '-'}</td>
                <td className="px-3 py-2 text-right text-xs tabular-nums">
                  {formatCurrency(Number(item.unitPrice.toString()), po.currency)}
                </td>
                <td className="px-3 py-2 text-right text-sm tabular-nums font-semibold">
                  {formatCurrency(Number(item.totalHt.toString()), po.currency)}
                </td>
                <td className="px-3 py-2 text-right">
                  {isEditable && (
                    <form action={handleRemoveItem}>
                      <input type="hidden" name="id" value={item.id} />
                      <button className="text-xs text-[var(--color-destructive)] hover:underline">Supprimer</button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {isEditable && (
          <div className="border-t p-4">
            <form action={handleAddItem} className="grid grid-cols-1 gap-3 sm:grid-cols-6">
              <input type="hidden" name="purchaseOrderId" value={po.id} />
              <input name="position" type="number" required min="1" defaultValue={po.items.length + 1} placeholder="N°" className="rounded-md border bg-white px-3 py-2 text-sm" />
              <input name="description" required minLength={2} placeholder="Designation" className="rounded-md border bg-white px-3 py-2 text-sm sm:col-span-2" />
              <input name="quantity" type="number" min="0.001" step="0.001" required placeholder="Qte" className="rounded-md border bg-white px-3 py-2 text-sm tabular-nums" />
              <input name="unit" placeholder="Unite" className="rounded-md border bg-white px-3 py-2 text-sm" />
              <input name="unitPrice" type="number" min="0.01" step="0.01" required placeholder="PU HT" className="rounded-md border bg-white px-3 py-2 text-sm tabular-nums" />
              <button type="submit" className="rounded-md bg-[var(--color-primary)] px-3 py-2 text-sm font-medium text-[var(--color-primary-foreground)] hover:opacity-90 sm:col-span-6">
                + Ajouter une ligne
              </button>
            </form>
          </div>
        )}
      </section>

      {workflow && (
        <section className="rounded-lg border bg-[var(--color-card)] shadow-sm">
          <header className="flex items-baseline justify-between border-b px-4 py-3">
            <h3 className="text-sm font-semibold">Workflow signatures</h3>
            <div className="flex items-center gap-2 text-xs">
              <span className={'h-2 w-2 rounded-full ' + (chainVerify.ok ? 'bg-[var(--color-success)]' : 'bg-[var(--color-destructive)]')} />
              <span className="font-mono text-[var(--color-muted-foreground)]">
                Chaine : {chainVerify.ok ? 'OK (' + chainVerify.count + ')' : chainVerify.reason}
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
                        ? 'Signe par ' + (sig.actor.email ?? sig.actorId) + ' le ' + formatDateTime(sig.signedAt)
                        : step.status === 'PENDING'
                          ? 'En attente'
                          : step.status}
                    </div>
                    {sig?.comment && (
                      <div className="text-xs italic text-[var(--color-muted-foreground)]">{sig.comment}</div>
                    )}
                  </div>
                  <div className="text-xs">
                    {sig ? <span className="text-[var(--color-success)]">OK</span> : step.status === 'PENDING' ? <span className="text-[var(--color-warning)]">attente</span> : '-'}
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
          {isEditable && (
            <form action={handleSubmit}>
              <input type="hidden" name="id" value={po.id} />
              <button className="rounded-md bg-[var(--color-primary)] px-3 py-2 text-sm font-medium text-[var(--color-primary-foreground)] hover:opacity-90">
                Soumettre pour signatures
              </button>
            </form>
          )}

          {actableSlot && (
            <form action={handleSign} className="flex flex-1 gap-2">
              <input type="hidden" name="id" value={po.id} />
              <input name="comment" placeholder="Commentaire (optionnel, dans le hash)" className="flex-1 rounded-md border bg-white px-3 py-2 text-sm" />
              <button className="rounded-md bg-[var(--color-primary)] px-3 py-2 text-sm font-medium text-[var(--color-primary-foreground)] hover:opacity-90">
                Signer {actableSlot.stage}
              </button>
            </form>
          )}

          {!actableSlot && nonActableReason && workflow && (
            <p className="text-xs text-[var(--color-muted-foreground)]">{nonActableReason}</p>
          )}

          {po.status === PurchaseOrderStatus.SIGNED && (
            <form action={handleSend}>
              <input type="hidden" name="id" value={po.id} />
              <button className="rounded-md bg-[var(--color-success)] px-3 py-2 text-sm font-medium text-[var(--color-success-foreground)] hover:opacity-90">
                Envoyer au fournisseur
              </button>
            </form>
          )}

          {(po.status === PurchaseOrderStatus.DRAFT || po.status === PurchaseOrderStatus.PENDING_SIGNATURES) && (
            <form action={handleCancel} className="flex gap-2">
              <input type="hidden" name="id" value={po.id} />
              <input name="reason" required minLength={5} placeholder="Motif annulation" className="rounded-md border bg-white px-3 py-2 text-sm" />
              <button className="rounded-md border border-[var(--color-destructive)] bg-white px-3 py-2 text-xs font-medium text-[var(--color-destructive)] hover:bg-[var(--color-destructive)]/10">
                Annuler le BC
              </button>
            </form>
          )}
        </div>
        {!isEditable && (
          <p className="mt-2 text-xs text-[var(--color-muted-foreground)]">
            BC verrouille apres soumission. Modifications post-signature : procedure d&apos;avenant
            (a livrer en session de polish).
          </p>
        )}
      </section>
    </div>
  );
}
