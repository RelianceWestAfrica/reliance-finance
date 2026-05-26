import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

import { auth } from '@/lib/auth';
import { getTenantedDb } from '@/lib/tenancy';
import { prisma, InvoiceStatus, InvoiceType } from '@reliance-finance/database';
import { formatCurrency, formatDateTime } from '@/lib/format';
import { computeInvoiceBalance, checkPaymentEligibility } from '@/lib/invoices/balance';
import { addInvoiceLine, runThreeWayMatch, approveInvoice, disputeInvoice } from '../actions';

export default async function InvoiceDetailPage(props: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');
  const { id } = await props.params;
  const searchParams = await props.searchParams;
  const errorMessage = searchParams.error ? decodeURIComponent(searchParams.error) : null;
  const t = await getTranslations('pages.invoices');

  const db = await getTenantedDb();
  const invoice = await db.invoice.findUnique({
    where: { id },
    include: {
      entity: { select: { code: true } },
      supplier: { select: { code: true, name: true } },
      purchaseOrder: { select: { id: true, reference: true, totalTtc: true, currency: true } },
      reception: { select: { id: true, reference: true, status: true } },
      lines: { orderBy: { position: 'asc' } },
      threeWayMatch: true,
    },
  });
  if (!invoice) notFound();

  // Avoirs lies (raw client - pas dans tenancy via id)
  const creditNotes = await prisma.invoice.findMany({
    where: { originalInvoiceId: id, type: InvoiceType.CREDIT_NOTE },
    select: {
      id: true,
      reference: true,
      totalTtc: true,
      currency: true,
      invoiceDate: true,
      status: true,
    },
    orderBy: { invoiceDate: 'asc' },
  });

  const balance = computeInvoiceBalance(
    {
      totalTtc: Number(invoice.totalTtc.toString()),
      amountPaid: Number(invoice.amountPaid.toString()),
    },
    creditNotes.map((cn) => ({ totalTtc: Number(cn.totalTtc.toString()) })),
  );

  const eligibility = checkPaymentEligibility({
    hasPVDefinitif: invoice.reception?.status === 'DEFINITIVE',
    threeWayMatchOk: invoice.threeWayMatch
      ? invoice.threeWayMatch.quantityMatch &&
        invoice.threeWayMatch.priceMatch &&
        invoice.threeWayMatch.totalMatch
      : null,
    invoiceStatus: invoice.status,
    amountDue: balance.amountDue,
  });

  async function handleAddLine(formData: FormData) {
    'use server';
    const r = await addInvoiceLine(formData);
    if (!r.ok) redirect('/invoices/' + id + '?error=' + encodeURIComponent(r.error ?? 'Echec'));
  }
  async function handleRunMatch(formData: FormData) {
    'use server';
    const r = await runThreeWayMatch(formData);
    if (!r.ok) redirect('/invoices/' + id + '?error=' + encodeURIComponent(r.error ?? 'Echec'));
  }
  async function handleApprove(formData: FormData) {
    'use server';
    const r = await approveInvoice(formData);
    if (!r.ok) redirect('/invoices/' + id + '?error=' + encodeURIComponent(r.error ?? 'Echec'));
  }
  async function handleDispute(formData: FormData) {
    'use server';
    const r = await disputeInvoice(formData);
    if (!r.ok) redirect('/invoices/' + id + '?error=' + encodeURIComponent(r.error ?? 'Echec'));
  }

  const isEditable = invoice.status === InvoiceStatus.RECEIVED;
  const discrepancies = invoice.threeWayMatch?.discrepancies as
    | { type: string; message: string; variancePercent?: number }[]
    | null;

  return (
    <div className="space-y-6">
      <header className="flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-semibold">
            {invoice.type === InvoiceType.CREDIT_NOTE && (
              <span className="bg-[var(--color-warning)]/10 mr-2 rounded px-2 py-0.5 text-xs font-medium text-[var(--color-warning)]">
                {t('detail.creditBadge')}
              </span>
            )}
            {invoice.invoiceNumber}
          </h1>
          <p className="font-mono text-sm text-[var(--color-muted-foreground)]">
            {invoice.reference}
          </p>
          <p className="mt-1 text-xs text-[var(--color-muted-foreground)]">
            {invoice.entity.code} - {invoice.supplier.code} - {invoice.supplier.name}
          </p>
        </div>
        <Link href="/invoices" className="text-xs text-[var(--color-primary)] hover:underline">
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
          <div className="mt-1 font-mono text-sm">{invoice.status}</div>
        </div>
        <div className="rounded-lg border bg-[var(--color-card)] p-4 shadow-sm">
          <div className="text-xs uppercase text-[var(--color-muted-foreground)]">
            {t('detail.kpi.totalTtc')}
          </div>
          <div className="mt-1 text-xl font-semibold tabular-nums">
            {formatCurrency(Number(invoice.totalTtc.toString()), invoice.currency)}
          </div>
        </div>
        <div className="rounded-lg border bg-[var(--color-card)] p-4 shadow-sm">
          <div className="text-xs uppercase text-[var(--color-muted-foreground)]">
            {t('detail.kpi.amountDue')}
          </div>
          <div
            className={
              'mt-1 text-xl font-semibold tabular-nums ' +
              (balance.amountDue > 0
                ? 'text-[var(--color-warning)]'
                : 'text-[var(--color-success)]')
            }
          >
            {formatCurrency(balance.amountDue, invoice.currency)}
          </div>
          <div className="mt-1 text-xs text-[var(--color-muted-foreground)]">{balance.status}</div>
        </div>
        <div className="rounded-lg border bg-[var(--color-card)] p-4 shadow-sm">
          <div className="text-xs uppercase text-[var(--color-muted-foreground)]">
            {t('detail.kpi.paymentEligible')}
          </div>
          <div
            className={
              'mt-1 font-mono text-sm ' +
              (eligibility.eligible ? 'text-[var(--color-success)]' : 'text-[var(--color-warning)]')
            }
          >
            {eligibility.eligible ? t('detail.kpi.yes') : t('detail.kpi.no')}
          </div>
          {!eligibility.eligible && (
            <div className="mt-1 text-[10px] text-[var(--color-muted-foreground)]">
              {eligibility.reason}
            </div>
          )}
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="rounded-lg border bg-[var(--color-card)] p-4 shadow-sm">
          <h3 className="text-sm font-semibold">{t('detail.section.links')}</h3>
          <dl className="mt-2 space-y-1 text-xs">
            <div className="flex justify-between">
              <dt className="text-[var(--color-muted-foreground)]">{t('detail.linksInfo.po')}</dt>
              <dd>
                {invoice.purchaseOrder ? (
                  <Link
                    href={'/purchase-orders/' + invoice.purchaseOrder.id}
                    className="font-mono text-[var(--color-primary)] hover:underline"
                  >
                    {invoice.purchaseOrder.reference}
                  </Link>
                ) : (
                  <span className="text-[var(--color-warning)]">
                    {t('detail.linksInfo.missing')}
                  </span>
                )}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-[var(--color-muted-foreground)]">
                {t('detail.linksInfo.reception')}
              </dt>
              <dd>
                {invoice.reception ? (
                  <>
                    <Link
                      href={'/receptions/' + invoice.reception.id}
                      className="font-mono text-[var(--color-primary)] hover:underline"
                    >
                      {invoice.reception.reference}
                    </Link>{' '}
                    <span
                      className={
                        invoice.reception.status === 'DEFINITIVE'
                          ? 'text-[var(--color-success)]'
                          : 'text-[var(--color-warning)]'
                      }
                    >
                      ({invoice.reception.status})
                    </span>
                  </>
                ) : (
                  <span className="text-[var(--color-destructive)]">
                    {t('detail.linksInfo.missingBlocked')}
                  </span>
                )}
              </dd>
            </div>
          </dl>
        </div>
        <div className="rounded-lg border bg-[var(--color-card)] p-4 shadow-sm">
          <h3 className="text-sm font-semibold">{t('detail.section.threeWay')}</h3>
          {!invoice.threeWayMatch ? (
            <p className="mt-2 text-xs text-[var(--color-muted-foreground)]">
              {t('detail.threeWay.notRun')}
            </p>
          ) : (
            <dl className="mt-2 space-y-1 text-xs">
              <div className="flex justify-between">
                <dt>{t('detail.threeWay.quantities')}</dt>
                <dd>
                  {invoice.threeWayMatch.quantityMatch
                    ? t('detail.threeWay.ok')
                    : t('detail.threeWay.ko')}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt>{t('detail.threeWay.prices')}</dt>
                <dd>
                  {invoice.threeWayMatch.priceMatch
                    ? t('detail.threeWay.ok')
                    : t('detail.threeWay.ko')}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt>{t('detail.threeWay.total')}</dt>
                <dd>
                  {invoice.threeWayMatch.totalMatch
                    ? t('detail.threeWay.ok')
                    : t('detail.threeWay.ko')}
                </dd>
              </div>
              <div className="text-[10px] text-[var(--color-muted-foreground)]">
                {t('detail.threeWay.checkedAt', {
                  date: formatDateTime(invoice.threeWayMatch.checkedAt),
                })}
              </div>
            </dl>
          )}
        </div>
      </section>

      {discrepancies && discrepancies.length > 0 && (
        <section className="bg-[var(--color-warning)]/5 rounded-lg border border-[var(--color-warning)] p-4">
          <h3 className="text-sm font-semibold text-[var(--color-warning)]">
            {t('detail.section.discrepancies')}
          </h3>
          <ul className="mt-2 space-y-1 text-xs">
            {discrepancies.map((d, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="font-mono text-[10px]">[{d.type}]</span>
                <span>{d.message}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="rounded-lg border bg-[var(--color-card)] shadow-sm">
        <header className="flex justify-between border-b px-4 py-3">
          <h3 className="text-sm font-semibold">{t('detail.section.linesTitle')}</h3>
          <span className="text-xs text-[var(--color-muted-foreground)]">
            {invoice.lines.length}
          </span>
        </header>
        <table className="w-full text-sm">
          <thead className="border-b text-left text-xs uppercase text-[var(--color-muted-foreground)]">
            <tr>
              <th className="px-3 py-2 font-medium">{t('detail.lines.columns.position')}</th>
              <th className="px-3 py-2 font-medium">{t('detail.lines.columns.description')}</th>
              <th className="px-3 py-2 font-medium">{t('detail.lines.columns.quantity')}</th>
              <th className="px-3 py-2 font-medium">{t('detail.lines.columns.unitPrice')}</th>
              <th className="px-3 py-2 font-medium">{t('detail.lines.columns.totalHt')}</th>
            </tr>
          </thead>
          <tbody>
            {invoice.lines.length === 0 && (
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-3 text-center text-[var(--color-muted-foreground)]"
                >
                  {t('detail.lines.empty')}
                </td>
              </tr>
            )}
            {invoice.lines.map((l) => (
              <tr key={l.id} className="border-b last:border-0">
                <td className="px-3 py-2 font-mono text-xs">{l.position}</td>
                <td className="px-3 py-2">{l.description}</td>
                <td className="px-3 py-2 text-right tabular-nums">{l.quantity.toString()}</td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {formatCurrency(Number(l.unitPrice.toString()), invoice.currency)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {formatCurrency(Number(l.totalHt.toString()), invoice.currency)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {isEditable && (
          <div className="border-t p-4">
            <form action={handleAddLine} className="grid grid-cols-1 gap-3 sm:grid-cols-5">
              <input type="hidden" name="invoiceId" value={invoice.id} />
              <input
                name="position"
                type="number"
                required
                min="1"
                defaultValue={invoice.lines.length + 1}
                placeholder={t('detail.lines.placeholders.position')}
                className="rounded-md border bg-white px-3 py-2 text-sm"
              />
              <input
                name="description"
                required
                placeholder={t('detail.lines.placeholders.description')}
                className="rounded-md border bg-white px-3 py-2 text-sm sm:col-span-2"
              />
              <input
                name="quantity"
                type="number"
                min="0.001"
                step="0.001"
                required
                placeholder={t('detail.lines.placeholders.quantity')}
                className="rounded-md border bg-white px-3 py-2 text-sm tabular-nums"
              />
              <input
                name="unitPrice"
                type="number"
                min="0.01"
                step="0.01"
                required
                placeholder={t('detail.lines.placeholders.unitPrice')}
                className="rounded-md border bg-white px-3 py-2 text-sm tabular-nums"
              />
              <button
                type="submit"
                className="rounded-md bg-[var(--color-primary)] px-3 py-2 text-sm font-medium text-[var(--color-primary-foreground)] hover:opacity-90 sm:col-span-5"
              >
                {t('detail.lines.addCta')}
              </button>
            </form>
          </div>
        )}
      </section>

      {creditNotes.length > 0 && (
        <section className="rounded-lg border bg-[var(--color-card)] shadow-sm">
          <header className="border-b px-4 py-3">
            <h3 className="text-sm font-semibold">
              {t('detail.section.creditNotes', { count: creditNotes.length })}
            </h3>
          </header>
          <table className="w-full text-sm">
            <thead className="border-b text-left text-xs uppercase text-[var(--color-muted-foreground)]">
              <tr>
                <th className="px-3 py-2 font-medium">
                  {t('detail.creditNotes.columns.reference')}
                </th>
                <th className="px-3 py-2 font-medium">{t('detail.creditNotes.columns.date')}</th>
                <th className="px-3 py-2 font-medium">{t('detail.creditNotes.columns.amount')}</th>
                <th className="px-3 py-2 font-medium">{t('detail.creditNotes.columns.status')}</th>
              </tr>
            </thead>
            <tbody>
              {creditNotes.map((cn) => (
                <tr key={cn.id} className="border-b last:border-0">
                  <td className="px-3 py-2 font-mono text-xs">
                    <Link
                      href={'/invoices/' + cn.id}
                      className="text-[var(--color-primary)] hover:underline"
                    >
                      {cn.reference}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-xs">{formatDateTime(cn.invoiceDate)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-[var(--color-warning)]">
                    -{formatCurrency(Number(cn.totalTtc.toString()), cn.currency)}
                  </td>
                  <td className="px-3 py-2 text-xs">{cn.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <section className="rounded-lg border bg-[var(--color-card)] p-6 shadow-sm">
        <h3 className="text-sm font-semibold">{t('detail.section.actions')}</h3>
        <div className="mt-3 flex flex-wrap gap-2">
          {invoice.purchaseOrder &&
            invoice.lines.length > 0 &&
            invoice.status === InvoiceStatus.RECEIVED && (
              <form action={handleRunMatch}>
                <input type="hidden" name="id" value={invoice.id} />
                <button className="rounded-md bg-[var(--color-primary)] px-3 py-2 text-sm font-medium text-[var(--color-primary-foreground)] hover:opacity-90">
                  {t('detail.actions.runMatch')}
                </button>
              </form>
            )}

          {(invoice.status === InvoiceStatus.CONTROL_3WAY_OK ||
            (invoice.status === InvoiceStatus.RECEIVED && !invoice.purchaseOrder)) && (
            <form action={handleApprove}>
              <input type="hidden" name="id" value={invoice.id} />
              <button className="rounded-md bg-[var(--color-success)] px-3 py-2 text-sm font-medium text-[var(--color-success-foreground)] hover:opacity-90">
                {t('detail.actions.approveForPayment')}
              </button>
            </form>
          )}

          {invoice.status !== InvoiceStatus.PAID &&
            invoice.status !== InvoiceStatus.DISPUTED &&
            invoice.status !== InvoiceStatus.ARCHIVED && (
              <form action={handleDispute} className="flex gap-2">
                <input type="hidden" name="id" value={invoice.id} />
                <input
                  name="reason"
                  required
                  minLength={5}
                  placeholder={t('detail.actions.disputePlaceholder')}
                  className="rounded-md border bg-white px-3 py-2 text-sm"
                />
                <button className="hover:bg-[var(--color-destructive)]/10 rounded-md border border-[var(--color-destructive)] bg-white px-3 py-2 text-xs font-medium text-[var(--color-destructive)]">
                  {t('detail.actions.markDisputed')}
                </button>
              </form>
            )}
        </div>
      </section>
    </div>
  );
}
