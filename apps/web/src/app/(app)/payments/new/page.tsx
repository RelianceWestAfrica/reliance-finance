import { redirect } from 'next/navigation';
import Link from 'next/link';

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
    select: { id: true, supplierId: true, bankName: true, holderName: true, iban: true, rib: true, verifiedAt: true, quarantineUntil: true },
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
        <h1 className="text-2xl font-semibold">Nouveau paiement</h1>
        <Link href="/payments" className="mt-2 inline-block text-xs text-[var(--color-primary)] hover:underline">
          &larr; Retour
        </Link>
      </header>

      {errorMessage && (
        <div role="alert" className="rounded-md border border-[var(--color-destructive)] bg-[var(--color-destructive)]/10 px-3 py-2 text-sm text-[var(--color-destructive)]">
          {errorMessage}
        </div>
      )}

      <form action={handleCreate} className="space-y-4 rounded-lg border bg-[var(--color-card)] p-6 shadow-sm">
        <label className="block text-sm">
          Facture a payer *
          <select name="invoiceId" required defaultValue={params.invoiceId ?? ''} className="mt-1 block w-full rounded-md border bg-white px-3 py-2 text-sm">
            <option value="">-- Facture approuvee --</option>
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
                  {i.reference} - {i.supplier.code} {i.supplier.name} - reste {formatCurrency(balance.amountDue, i.currency)} {i.reception?.status !== 'DEFINITIVE' ? '(PV non DEF !)' : ''}
                </option>
              );
            })}
          </select>
        </label>

        <label className="block text-sm">
          RIB beneficiaire *
          <select name="bankAccountId" required className="mt-1 block w-full rounded-md border bg-white px-3 py-2 text-sm">
            <option value="">-- RIB --</option>
            {bankAccounts.map((ba) => (
              <option key={ba.id} value={ba.id}>
                {ba.bankName} - {ba.holderName} - {ba.iban ?? ba.rib} {!ba.verifiedAt ? '(non verifie)' : ''} {ba.quarantineUntil && ba.quarantineUntil > new Date() ? '(quarantaine)' : ''}
              </option>
            ))}
          </select>
        </label>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label className="text-sm">
            Montant *
            <input name="amount" type="number" min="1" step="0.01" required className="mt-1 block w-full rounded-md border bg-white px-3 py-2 text-sm tabular-nums" />
          </label>
          <label className="text-sm">
            Methode *
            <select name="method" required defaultValue={PaymentMethod.BANK_TRANSFER} className="mt-1 block w-full rounded-md border bg-white px-3 py-2 text-sm">
              {Object.values(PaymentMethod).map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            Date prevue
            <input name="scheduledAt" type="date" className="mt-1 block w-full rounded-md border bg-white px-3 py-2 text-sm" />
          </label>
        </div>

        <div className="flex gap-2">
          <button type="submit" className="rounded-md bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-[var(--color-primary-foreground)] hover:opacity-90">
            Creer le paiement (brouillon)
          </button>
          <Link href="/payments" className="rounded-md border px-4 py-2 text-sm hover:bg-[var(--color-muted)]">
            Annuler
          </Link>
        </div>
      </form>
    </div>
  );
}
