import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

import { auth } from '@/lib/auth';
import { getTenantedDb } from '@/lib/tenancy';
import { prisma, PaymentStatus } from '@reliance-finance/database';
import { formatCurrency, formatDateTime } from '@/lib/format';
import { verifySignatureChain } from '@/lib/signatures/service';
import { isBankAccountUsable } from '@/lib/bank-accounts/usability';
import {
  submitPayment,
  signPayment,
  executePayment,
  reconcilePayment,
  cancelPayment,
} from '../actions';

export default async function PaymentDetailPage(props: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');
  const { id } = await props.params;
  const searchParams = await props.searchParams;
  const errorMessage = searchParams.error ? decodeURIComponent(searchParams.error) : null;
  const t = await getTranslations('pages.payments');

  const db = await getTenantedDb();
  const payment = await db.payment.findUnique({
    where: { id },
    include: {
      entity: { select: { code: true } },
      invoice: {
        include: {
          supplier: { select: { code: true, name: true } },
          reception: { select: { reference: true, status: true } },
        },
      },
      bankAccount: true,
      createdBy: { select: { email: true } },
    },
  });
  if (!payment) notFound();

  const workflow = await prisma.workflowInstance.findUnique({
    where: { paymentId: id },
    include: {
      steps: { orderBy: { position: 'asc' } },
      signatures: {
        orderBy: [{ signedAt: 'asc' }, { id: 'asc' }],
        include: { actor: { select: { email: true } } },
      },
    },
  });
  const chainVerify = workflow
    ? await verifySignatureChain(workflow.id)
    : { ok: true as const, count: 0 };
  const usability = isBankAccountUsable(payment.bankAccount);

  async function handleSubmit(formData: FormData) {
    'use server';
    const r = await submitPayment(formData);
    if (!r.ok) redirect('/payments/' + id + '?error=' + encodeURIComponent(r.error ?? 'Echec'));
  }
  async function handleSign(formData: FormData) {
    'use server';
    const r = await signPayment(formData);
    if (!r.ok) redirect('/payments/' + id + '?error=' + encodeURIComponent(r.error ?? 'Echec'));
  }
  async function handleExecute(formData: FormData) {
    'use server';
    const r = await executePayment(formData);
    if (!r.ok) redirect('/payments/' + id + '?error=' + encodeURIComponent(r.error ?? 'Echec'));
  }
  async function handleReconcile(formData: FormData) {
    'use server';
    const r = await reconcilePayment(formData);
    if (!r.ok) redirect('/payments/' + id + '?error=' + encodeURIComponent(r.error ?? 'Echec'));
  }
  async function handleCancel(formData: FormData) {
    'use server';
    const r = await cancelPayment(formData);
    if (!r.ok) redirect('/payments/' + id + '?error=' + encodeURIComponent(r.error ?? 'Echec'));
  }

  return (
    <div className="space-y-6">
      <header className="flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{payment.reference}</h1>
          <p className="text-sm text-[var(--color-muted-foreground)]">
            {t('detail.beneficiaryLabel')} {payment.beneficiaryName}
          </p>
          {payment.invoice && (
            <p className="text-xs">
              {t('detail.invoiceLabel')}{' '}
              <Link
                href={'/invoices/' + payment.invoice.id}
                className="font-mono text-[var(--color-primary)] hover:underline"
              >
                {payment.invoice.reference}
              </Link>{' '}
              - {payment.invoice.supplier.name}
            </p>
          )}
        </div>
        <Link href="/payments" className="text-xs text-[var(--color-primary)] hover:underline">
          &larr; {t('detail.backShort')}
        </Link>
      </header>

      {errorMessage && (
        <div
          role="alert"
          className="bg-[var(--color-destructive)]/10 rounded-md border border-[var(--color-destructive)] px-3 py-2 text-sm text-[var(--color-destructive)]"
        >
          {errorMessage}
        </div>
      )}

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <div className="rounded-lg border bg-[var(--color-card)] p-4 shadow-sm">
          <div className="text-xs uppercase text-[var(--color-muted-foreground)]">
            {t('detail.kpi.status')}
          </div>
          <div className="mt-1 font-mono text-sm">{payment.status}</div>
        </div>
        <div className="rounded-lg border bg-[var(--color-card)] p-4 shadow-sm">
          <div className="text-xs uppercase text-[var(--color-muted-foreground)]">
            {t('detail.kpi.amount')}
          </div>
          <div className="mt-1 text-xl font-semibold tabular-nums">
            {formatCurrency(Number(payment.amount.toString()), payment.currency)}
          </div>
        </div>
        <div className="rounded-lg border bg-[var(--color-card)] p-4 shadow-sm">
          <div className="text-xs uppercase text-[var(--color-muted-foreground)]">
            {t('detail.kpi.ribUsable')}
          </div>
          <div
            className={
              'mt-1 font-mono text-sm ' +
              (usability.usable ? 'text-[var(--color-success)]' : 'text-[var(--color-destructive)]')
            }
          >
            {usability.usable ? t('detail.kpi.yes') : t('detail.kpi.no')}
          </div>
          {!usability.usable && (
            <div className="mt-1 text-[10px] text-[var(--color-muted-foreground)]">
              {usability.message}
            </div>
          )}
        </div>
        <div className="rounded-lg border bg-[var(--color-card)] p-4 shadow-sm">
          <div className="text-xs uppercase text-[var(--color-muted-foreground)]">
            {t('detail.kpi.reception')}
          </div>
          <div
            className={
              'mt-1 font-mono text-sm ' +
              (payment.invoice?.reception?.status === 'DEFINITIVE'
                ? 'text-[var(--color-success)]'
                : 'text-[var(--color-warning)]')
            }
          >
            {payment.invoice?.reception?.status ?? t('detail.kpi.none')}
          </div>
        </div>
      </section>

      <section className="rounded-lg border bg-[var(--color-card)] p-4 shadow-sm">
        <h3 className="text-sm font-semibold">{t('detail.section.ribSnapshot')}</h3>
        <dl className="mt-2 grid grid-cols-2 gap-y-1 text-xs">
          <dt className="text-[var(--color-muted-foreground)]">{t('detail.rib.bank')}</dt>
          <dd>{payment.bankAccount.bankName}</dd>
          <dt className="text-[var(--color-muted-foreground)]">{t('detail.rib.holder')}</dt>
          <dd>{payment.beneficiaryName}</dd>
          <dt className="text-[var(--color-muted-foreground)]">{t('detail.rib.ibanRib')}</dt>
          <dd className="font-mono">{payment.beneficiaryIban ?? payment.beneficiaryRib}</dd>
          <dt className="text-[var(--color-muted-foreground)]">{t('detail.rib.verifiedAt')}</dt>
          <dd>{payment.ribVerifiedAt ? formatDateTime(payment.ribVerifiedAt) : '-'}</dd>
        </dl>
      </section>

      {payment.swiftReference && (
        <section className="bg-[var(--color-success)]/5 rounded-lg border border-[var(--color-success)] p-4">
          <h3 className="text-sm font-semibold text-[var(--color-success)]">
            {t('detail.section.bankProof')}
          </h3>
          <dl className="mt-2 grid grid-cols-2 gap-y-1 text-xs">
            <dt className="text-[var(--color-muted-foreground)]">{t('detail.proof.swift')}</dt>
            <dd className="font-mono">{payment.swiftReference}</dd>
            <dt className="text-[var(--color-muted-foreground)]">
              {t('detail.proof.transaction')}
            </dt>
            <dd className="font-mono">{payment.transactionNumber}</dd>
            <dt className="text-[var(--color-muted-foreground)]">{t('detail.proof.executedAt')}</dt>
            <dd>{payment.executedAt ? formatDateTime(payment.executedAt) : '-'}</dd>
            {payment.bankProofUrl && (
              <>
                <dt className="text-[var(--color-muted-foreground)]">{t('detail.proof.proof')}</dt>
                <dd>
                  <a
                    href={payment.bankProofUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[var(--color-primary)] hover:underline"
                  >
                    {t('detail.proof.download')}
                  </a>
                </dd>
              </>
            )}
          </dl>
        </section>
      )}

      {workflow && workflow.steps.length > 0 && (
        <section className="rounded-lg border bg-[var(--color-card)] shadow-sm">
          <header className="flex items-baseline justify-between border-b px-4 py-3">
            <h3 className="text-sm font-semibold">{t('detail.section.workflow')}</h3>
            <div className="flex items-center gap-2 text-xs">
              <span
                className={
                  'h-2 w-2 rounded-full ' +
                  (chainVerify.ok ? 'bg-[var(--color-success)]' : 'bg-[var(--color-destructive)]')
                }
              />
              <span className="font-mono text-[var(--color-muted-foreground)]">
                {chainVerify.ok
                  ? t('detail.workflow.chainOk', { count: chainVerify.count })
                  : t('detail.workflow.chainKo')}
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
                        ? t('detail.workflow.signedBy', {
                            actor: sig.actor.email ?? sig.actorId,
                            date: formatDateTime(sig.signedAt),
                          })
                        : t('detail.workflow.pending')}
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        </section>
      )}

      <section className="rounded-lg border bg-[var(--color-card)] p-6 shadow-sm">
        <h3 className="text-sm font-semibold">{t('detail.section.actions')}</h3>
        <div className="mt-3 flex flex-col gap-3">
          {payment.status === PaymentStatus.DRAFT && (
            <form action={handleSubmit} className="inline">
              <input type="hidden" name="id" value={payment.id} />
              <button className="rounded-md bg-[var(--color-primary)] px-3 py-2 text-sm font-medium text-[var(--color-primary-foreground)] hover:opacity-90">
                {t('detail.actions.submit')}
              </button>
            </form>
          )}

          {payment.status === PaymentStatus.ANTI_FRAUD_PENDING && (
            <form action={handleSign} className="flex gap-2">
              <input type="hidden" name="id" value={payment.id} />
              <input
                name="comment"
                placeholder={t('detail.actions.commentPlaceholder')}
                className="flex-1 rounded-md border bg-white px-3 py-2 text-sm"
              />
              <button className="rounded-md bg-[var(--color-primary)] px-3 py-2 text-sm font-medium text-[var(--color-primary-foreground)] hover:opacity-90">
                {t('detail.actions.sign')}
              </button>
            </form>
          )}

          {payment.status === PaymentStatus.SCHEDULED && (
            <form action={handleExecute} className="space-y-2">
              <input type="hidden" name="id" value={payment.id} />
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                <input
                  name="swiftReference"
                  required
                  minLength={3}
                  placeholder={t('detail.actions.swiftPlaceholder')}
                  className="rounded-md border bg-white px-3 py-2 text-sm"
                />
                <input
                  name="transactionNumber"
                  required
                  placeholder={t('detail.actions.transactionPlaceholder')}
                  className="rounded-md border bg-white px-3 py-2 text-sm"
                />
                <input
                  name="bankProofUrl"
                  placeholder={t('detail.actions.proofUrlPlaceholder')}
                  className="rounded-md border bg-white px-3 py-2 text-sm"
                />
              </div>
              <button className="rounded-md bg-[var(--color-success)] px-3 py-2 text-sm font-medium text-[var(--color-success-foreground)] hover:opacity-90">
                {t('detail.actions.executePayment')}
              </button>
            </form>
          )}

          {payment.status === PaymentStatus.EXECUTED && (
            <form action={handleReconcile}>
              <input type="hidden" name="id" value={payment.id} />
              <button className="rounded-md bg-[var(--color-success)] px-3 py-2 text-sm font-medium text-[var(--color-success-foreground)] hover:opacity-90">
                {t('detail.actions.reconcile')}
              </button>
            </form>
          )}

          {payment.status !== PaymentStatus.EXECUTED &&
            payment.status !== PaymentStatus.RECONCILED &&
            payment.status !== PaymentStatus.CANCELLED && (
              <form action={handleCancel} className="flex gap-2">
                <input type="hidden" name="id" value={payment.id} />
                <input
                  name="reason"
                  required
                  minLength={5}
                  placeholder={t('detail.actions.cancelReasonPlaceholder')}
                  className="flex-1 rounded-md border bg-white px-3 py-2 text-sm"
                />
                <button className="hover:bg-[var(--color-destructive)]/10 rounded-md border border-[var(--color-destructive)] bg-white px-3 py-2 text-xs font-medium text-[var(--color-destructive)]">
                  {t('detail.actions.cancelPayment')}
                </button>
              </form>
            )}
        </div>
      </section>
    </div>
  );
}
