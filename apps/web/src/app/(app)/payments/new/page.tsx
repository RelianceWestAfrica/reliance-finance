import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

import { auth } from '@/lib/auth';
import { getTenantedDb } from '@/lib/tenancy';
import { prisma, PaymentMethod } from '@reliance-finance/database';
import { createPayment } from '../actions';
import { computeInvoiceBalance } from '@/lib/invoices/balance';
import { formatCurrency } from '@/lib/format';

export default async function NewPaymentPage(props: {
  searchParams: Promise<{ error?: string; invoiceId?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');
  const params = await props.searchParams;
  const errorMessage = params.error ? decodeURIComponent(params.error) : null;
  const t = await getTranslations('pages.payments');

  const db = await getTenantedDb();
  const invoices = await db.invoice.findMany({
    where: {
      status: { in: ['APPROVED', 'PARTIALLY_PAID', 'CONTROL_3WAY_OK'] },
      type: 'STANDARD',
    },
    orderBy: { dueDate: 'asc' },
    take: 50,
    include: {
      supplier: { select: { name: true, code: true } },
      payments: { select: { amount: true, status: true } },
      creditNotes: { select: { totalTtc: true } },
      reception: { select: { status: true } },
    },
  });

  // RIB candidats : ceux des fournisseurs des factures listees
  const supplierIds = Array.from(new Set(invoices.map((i) => i.supplierId)));
  const bankAccounts = await prisma.bankAccount.findMany({
    where: { supplierId: { in: supplierIds }, isActive: true },
    select: {
      id: true,
      supplierId: true,
      bankName: true,
      holderName: true,
      iban: true,
      rib: true,
      verifiedAt: true,
      quarantineUntil: true,
    },
    orderBy: { isPrimary: 'desc' },
  });

  async function handleCreate(formData: FormData) {
    'use server';
    const r = await createPayment(formData);
    if (!r.ok || !r.id) {
      redirect('/payments/new?error=' + encodeURIComponent(r.error ?? 'Echec'));
    }
    redirect('/payments/' + r.id);
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">{t('new.title')}</h1>
        <Link
          href="/payments"
          className="mt-2 inline-block text-xs text-[var(--color-primary)] hover:underline"
        >
          &larr; {t('new.backShort')}
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

      <form
        action={handleCreate}
        className="space-y-4 rounded-lg border bg-[var(--color-card)] p-6 shadow-sm"
      >
        <label className="block text-sm">
          {t('new.fields.invoiceToPay')}
          <select
            name="invoiceId"
            required
            defaultValue={params.invoiceId ?? ''}
            className="mt-1 block w-full rounded-md border bg-white px-3 py-2 text-sm"
          >
            <option value="">{t('new.options.invoicePlaceholder')}</option>
            {invoices.map((i) => {
              const sumPaid = i.payments
                .filter((p) => p.status === 'EXECUTED' || p.status === 'RECONCILED')
                .reduce((s, p) => s + Number(p.amount.toString()), 0);
              const balance = computeInvoiceBalance(
                { totalTtc: Number(i.totalTtc.toString()), amountPaid: sumPaid },
                i.creditNotes.map((cn) => ({ totalTtc: Number(cn.totalTtc.toString()) })),
              );
              return (
                <option key={i.id} value={i.id}>
                  {i.reference} - {i.supplier.code} {i.supplier.name} - {t('new.options.remaining')}{' '}
                  {formatCurrency(balance.amountDue, i.currency)}{' '}
                  {i.reception?.status !== 'DEFINITIVE' ? t('new.options.pvNotDefinitive') : ''}
                </option>
              );
            })}
          </select>
        </label>

        <label className="block text-sm">
          {t('new.fields.beneficiaryBank')}
          <select
            name="bankAccountId"
            required
            className="mt-1 block w-full rounded-md border bg-white px-3 py-2 text-sm"
          >
            <option value="">{t('new.options.bankPlaceholder')}</option>
            {bankAccounts.map((ba) => (
              <option key={ba.id} value={ba.id}>
                {ba.bankName} - {ba.holderName} - {ba.iban ?? ba.rib}{' '}
                {!ba.verifiedAt ? t('new.options.notVerified') : ''}{' '}
                {ba.quarantineUntil && ba.quarantineUntil > new Date()
                  ? t('new.options.quarantine')
                  : ''}
              </option>
            ))}
          </select>
        </label>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label className="text-sm">
            {t('new.fields.amountRequired')}
            <input
              name="amount"
              type="number"
              min="1"
              step="0.01"
              required
              className="mt-1 block w-full rounded-md border bg-white px-3 py-2 text-sm tabular-nums"
            />
          </label>
          <label className="text-sm">
            {t('new.fields.methodRequired')}
            <select
              name="method"
              required
              defaultValue={PaymentMethod.BANK_TRANSFER}
              className="mt-1 block w-full rounded-md border bg-white px-3 py-2 text-sm"
            >
              {Object.values(PaymentMethod).map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            {t('new.fields.scheduledDate')}
            <input
              name="scheduledAt"
              type="date"
              className="mt-1 block w-full rounded-md border bg-white px-3 py-2 text-sm"
            />
          </label>
        </div>

        <div className="flex gap-2">
          <button
            type="submit"
            className="rounded-md bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-[var(--color-primary-foreground)] hover:opacity-90"
          >
            {t('new.submitDraft')}
          </button>
          <Link
            href="/payments"
            className="rounded-md border px-4 py-2 text-sm hover:bg-[var(--color-muted)]"
          >
            {t('new.cancel')}
          </Link>
        </div>
      </form>
    </div>
  );
}
