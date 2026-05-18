import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';

import { auth } from '@/lib/auth';
import { getTenantedDb } from '@/lib/tenancy';
import { prisma, ReceptionStatus, SignatureStage } from '@reliance-finance/database';
import { getUserMemberships } from '@/lib/rbac';
import { formatDateTime } from '@/lib/format';
import { canActorSignReception } from '@/lib/receptions/can-sign';
import { verifySignatureChain } from '@/lib/signatures/service';
import {
  updateReceptionItem,
  signReception,
  rejectReception,
} from '../actions';

export default async function ReceptionDetailPage(props: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');
  const { id } = await props.params;
  const searchParams = await props.searchParams;
  const errorMessage = searchParams.error ? decodeURIComponent(searchParams.error) : null;

  const db = await getTenantedDb();
  const reception = await db.reception.findUnique({
    where: { id },
    include: {
      entity: { select: { code: true, name: true } },
      project: { select: { code: true } },
      purchaseOrder: {
        select: { id: true, reference: true, supplier: { select: { code: true, name: true } } },
      },
      items: { orderBy: { position: 'asc' } },
    },
  });
  if (!reception) notFound();

  const workflow = await prisma.workflowInstance.findUnique({
    where: { receptionId: id },
    include: {
      signatures: {
        orderBy: [{ signedAt: 'asc' }, { id: 'asc' }],
        include: { actor: { select: { email: true } } },
      },
    },
  });

  const requiresTechnical = reception.decision !== 'NO_TECHNICAL';
  const opsSig = workflow?.signatures.find((s) => s.stage === SignatureStage.RECEPTION_OPS);
  const techSig = workflow?.signatures.find((s) => s.stage === SignatureStage.RECEPTION_TECH);
  const financeSig = workflow?.signatures.find((s) => s.stage === SignatureStage.RECEPTION_FINANCE);

  const memberships = await getUserMemberships(session.user.id);
  const verdict = canActorSignReception(
    {
      status: reception.status,
      createdById: reception.createdById,
      requiresTechnical,
      opsSignerId: opsSig?.actorId ?? null,
      techSignerId: techSig?.actorId ?? null,
      financeSignerId: financeSig?.actorId ?? null,
    },
    { id: session.user.id, roles: memberships.map((m) => m.role) },
  );

  const chainVerify = workflow ? await verifySignatureChain(workflow.id) : { ok: true as const, count: 0 };

  async function handleUpdateItem(formData: FormData) {
    'use server';
    const r = await updateReceptionItem(formData);
    if (!r.ok) redirect('/receptions/' + id + '?error=' + encodeURIComponent(r.error ?? 'Echec'));
  }
  async function handleSign(formData: FormData) {
    'use server';
    const r = await signReception(formData);
    if (!r.ok) redirect('/receptions/' + id + '?error=' + encodeURIComponent(r.error ?? 'Echec'));
  }
  async function handleReject(formData: FormData) {
    'use server';
    const r = await rejectReception(formData);
    if (!r.ok) redirect('/receptions/' + id + '?error=' + encodeURIComponent(r.error ?? 'Echec'));
  }

  const isEditable = reception.status === ReceptionStatus.DRAFT;
  const hasReserves = reception.items.some((i) => !i.isCompliant);

  return (
    <div className="space-y-6">
      <header className="flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-semibold">PV {reception.reference}</h1>
          <p className="text-sm text-[var(--color-muted-foreground)]">
            {reception.entity.code} - BC :{' '}
            <Link href={'/purchase-orders/' + reception.purchaseOrder.id} className="text-[var(--color-primary)] hover:underline">
              {reception.purchaseOrder.reference}
            </Link>
            {' '}({reception.purchaseOrder.supplier.code})
          </p>
        </div>
        <Link href="/receptions" className="text-xs text-[var(--color-primary)] hover:underline">
          &larr; Liste
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
          <div className="mt-1 font-mono text-sm">{reception.status}</div>
        </div>
        <div className="rounded-lg border bg-[var(--color-card)] p-4 shadow-sm">
          <div className="text-xs uppercase text-[var(--color-muted-foreground)]">Type</div>
          <div className="mt-1 font-mono text-sm">{reception.type}</div>
        </div>
        <div className="rounded-lg border bg-[var(--color-card)] p-4 shadow-sm">
          <div className="text-xs uppercase text-[var(--color-muted-foreground)]">Reserves</div>
          <div className={'mt-1 font-mono text-sm ' + (hasReserves ? 'text-[var(--color-warning)]' : 'text-[var(--color-success)]')}>
            {hasReserves ? 'OUI' : 'NON'}
          </div>
        </div>
      </section>

      <section className="rounded-lg border bg-[var(--color-card)] shadow-sm">
        <header className="border-b px-4 py-3">
          <h2 className="text-sm font-semibold">Items receptionnes</h2>
        </header>
        <table className="w-full text-sm">
          <thead className="border-b text-left text-xs uppercase text-[var(--color-muted-foreground)]">
            <tr>
              <th className="px-3 py-2 font-medium">N°</th>
              <th className="px-3 py-2 font-medium">Designation</th>
              <th className="px-3 py-2 font-medium">Qte prevue</th>
              <th className="px-3 py-2 font-medium">Qte recue</th>
              <th className="px-3 py-2 font-medium">Conforme</th>
              <th className="px-3 py-2 font-medium">Observations</th>
            </tr>
          </thead>
          <tbody>
            {reception.items.map((item) => (
              <tr key={item.id} className="border-b last:border-0">
                <td className="px-3 py-2 font-mono text-xs">{item.position}</td>
                <td className="px-3 py-2">{item.description}</td>
                <td className="px-3 py-2 text-right tabular-nums">{item.quantityExpected.toString()}</td>
                {isEditable ? (
                  <td colSpan={3}>
                    <form action={handleUpdateItem} className="flex gap-2 px-3 py-1">
                      <input type="hidden" name="itemId" value={item.id} />
                      <input
                        name="quantityReceived"
                        type="number"
                        min="0"
                        step="0.001"
                        defaultValue={item.quantityReceived.toString()}
                        className="w-24 rounded-md border bg-white px-2 py-1 text-sm tabular-nums"
                      />
                      <label className="flex items-center gap-1 text-xs">
                        <input type="checkbox" name="isCompliant" defaultChecked={item.isCompliant} /> Conforme
                      </label>
                      <input
                        name="observations"
                        defaultValue={item.observations ?? ''}
                        placeholder="Observations"
                        className="flex-1 rounded-md border bg-white px-2 py-1 text-xs"
                      />
                      <button className="rounded-md bg-[var(--color-primary)] px-2 py-1 text-xs font-medium text-[var(--color-primary-foreground)] hover:opacity-90">
                        OK
                      </button>
                    </form>
                  </td>
                ) : (
                  <>
                    <td className="px-3 py-2 text-right tabular-nums">{item.quantityReceived.toString()}</td>
                    <td className="px-3 py-2 text-xs">
                      {item.isCompliant ? (
                        <span className="text-[var(--color-success)]">Oui</span>
                      ) : (
                        <span className="text-[var(--color-destructive)]">Non</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs text-[var(--color-muted-foreground)]">
                      {item.observations ?? '-'}
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {workflow && (
        <section className="rounded-lg border bg-[var(--color-card)] shadow-sm">
          <header className="flex items-baseline justify-between border-b px-4 py-3">
            <h3 className="text-sm font-semibold">Signatures</h3>
            <div className="flex items-center gap-2 text-xs">
              <span className={'h-2 w-2 rounded-full ' + (chainVerify.ok ? 'bg-[var(--color-success)]' : 'bg-[var(--color-destructive)]')} />
              <span className="font-mono text-[var(--color-muted-foreground)]">
                Chaine : {chainVerify.ok ? 'OK (' + chainVerify.count + ')' : 'KO'}
              </span>
            </div>
          </header>
          <ol className="divide-y px-4 py-3 text-xs space-y-2">
            {['OPS', requiresTechnical ? 'TECH' : null, 'FINANCE']
              .filter(Boolean)
              .map((stage) => {
                const stg = stage as string;
                const sig = workflow.signatures.find((s) => s.stage === ('RECEPTION_' + stg as SignatureStage));
                return (
                  <li key={stg} className="flex justify-between">
                    <span className="font-mono">{stg}</span>
                    {sig ? (
                      <span>
                        {sig.actor.email ?? sig.actorId} - {formatDateTime(sig.signedAt)}
                      </span>
                    ) : (
                      <span className="text-[var(--color-muted-foreground)]">en attente</span>
                    )}
                  </li>
                );
              })}
          </ol>
        </section>
      )}

      <section className="rounded-lg border bg-[var(--color-card)] p-6 shadow-sm">
        <h3 className="text-sm font-semibold">Actions</h3>
        <div className="mt-3 flex flex-wrap gap-2">
          {verdict.canSign && (
            <form action={handleSign} className="flex flex-1 gap-2">
              <input type="hidden" name="id" value={reception.id} />
              <input name="comment" placeholder="Commentaire (optionnel)" className="flex-1 rounded-md border bg-white px-3 py-2 text-sm" />
              <button className="rounded-md bg-[var(--color-primary)] px-3 py-2 text-sm font-medium text-[var(--color-primary-foreground)] hover:opacity-90">
                Signer {verdict.stage}
              </button>
            </form>
          )}
          {!verdict.canSign && (
            <p className="text-xs text-[var(--color-muted-foreground)]">{verdict.reason}</p>
          )}

          {reception.status !== ReceptionStatus.DEFINITIVE &&
            reception.status !== ReceptionStatus.PROVISIONAL &&
            reception.status !== ReceptionStatus.REJECTED && (
              <form action={handleReject} className="flex flex-1 gap-2">
                <input type="hidden" name="id" value={reception.id} />
                <input
                  name="reason"
                  required
                  minLength={5}
                  placeholder="Motif rejet"
                  className="flex-1 rounded-md border bg-white px-3 py-2 text-sm"
                />
                <button className="rounded-md border border-[var(--color-destructive)] bg-white px-3 py-2 text-xs font-medium text-[var(--color-destructive)] hover:bg-[var(--color-destructive)]/10">
                  Rejeter
                </button>
              </form>
            )}
        </div>
      </section>
    </div>
  );
}
