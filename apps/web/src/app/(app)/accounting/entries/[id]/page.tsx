import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

import { auth } from '@/lib/auth';
import { prisma, JournalEntryStatus } from '@reliance-finance/database';
import { formatCurrency, formatDateTime } from '@/lib/format';
import {
  generateJournalEntryFromPayment,
  generateJournalEntryFromInvoice,
  postJournalEntry,
} from '../../actions';

export default async function JournalEntryDetailPage(props: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');
  const { id } = await props.params;
  const searchParams = await props.searchParams;
  const errorMessage = searchParams.error ? decodeURIComponent(searchParams.error) : null;
  const t = await getTranslations('pages.accounting.entry');

  const entry = await prisma.journalEntry.findUnique({
    where: { id },
    include: {
      entity: { select: { code: true, name: true } },
      period: { select: { year: true, month: true, isClosed: true } },
      lines: {
        orderBy: { position: 'asc' },
        include: { account: { select: { label: true, type: true } } },
      },
      payment: { select: { id: true, reference: true } },
    },
  });
  if (!entry) notFound();

  async function handlePost(formData: FormData) {
    'use server';
    const r = await postJournalEntry(formData);
    if (!r.ok)
      redirect('/accounting/entries/' + id + '?error=' + encodeURIComponent(r.error ?? 'Echec'));
  }

  const balanced =
    Math.abs(Number(entry.totalDebit.toString()) - Number(entry.totalCredit.toString())) < 0.01;

  return (
    <div className="space-y-6">
      <header className="flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{entry.reference}</h1>
          <p className="text-sm text-[var(--color-muted-foreground)]">
            {t('headerDescription', {
              description: entry.description ?? '',
              journal: entry.journalCode,
            })}
          </p>
        </div>
        <Link href="/accounting" className="text-xs text-[var(--color-primary)] hover:underline">
          &larr; {t('backShort')}
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
            {t('kpi.status')}
          </div>
          <div className="mt-1 font-mono text-sm">{entry.status}</div>
        </div>
        <div className="rounded-lg border bg-[var(--color-card)] p-4 shadow-sm">
          <div className="text-xs uppercase text-[var(--color-muted-foreground)]">
            {t('kpi.period')}
          </div>
          <div
            className={
              'mt-1 font-mono text-sm ' +
              (entry.period.isClosed
                ? 'text-[var(--color-destructive)]'
                : 'text-[var(--color-success)]')
            }
          >
            {entry.period.year}-{String(entry.period.month).padStart(2, '0')}{' '}
            {entry.period.isClosed ? t('periodClosed') : t('periodOpen')}
          </div>
        </div>
        <div className="rounded-lg border bg-[var(--color-card)] p-4 shadow-sm">
          <div className="text-xs uppercase text-[var(--color-muted-foreground)]">
            {t('kpi.totalDebit')}
          </div>
          <div className="mt-1 text-xl font-semibold tabular-nums">
            {formatCurrency(Number(entry.totalDebit.toString()), entry.currency)}
          </div>
        </div>
        <div className="rounded-lg border bg-[var(--color-card)] p-4 shadow-sm">
          <div className="text-xs uppercase text-[var(--color-muted-foreground)]">
            {t('kpi.balance')}
          </div>
          <div
            className={
              'mt-1 font-mono text-sm ' +
              (balanced ? 'text-[var(--color-success)]' : 'text-[var(--color-destructive)]')
            }
          >
            {balanced ? t('kpi.balanceOk') : t('kpi.balanceKo')}
          </div>
        </div>
      </section>

      <section className="rounded-lg border bg-[var(--color-card)] shadow-sm">
        <header className="border-b px-4 py-3">
          <h2 className="text-sm font-semibold">
            {t('lines.title', { count: entry.lines.length })}
          </h2>
        </header>
        <table className="w-full text-sm">
          <thead className="border-b text-left text-xs uppercase text-[var(--color-muted-foreground)]">
            <tr>
              <th className="px-3 py-2 font-medium">{t('lines.columns.position')}</th>
              <th className="px-3 py-2 font-medium">{t('lines.columns.account')}</th>
              <th className="px-3 py-2 font-medium">{t('lines.columns.label')}</th>
              <th className="px-3 py-2 text-right font-medium">{t('lines.columns.debit')}</th>
              <th className="px-3 py-2 text-right font-medium">{t('lines.columns.credit')}</th>
            </tr>
          </thead>
          <tbody>
            {entry.lines.map((l) => (
              <tr key={l.id} className="border-b last:border-0">
                <td className="px-3 py-2 font-mono text-xs">{l.position}</td>
                <td className="px-3 py-2">
                  <div className="font-mono text-xs">{l.accountCode}</div>
                  <div className="text-[10px] text-[var(--color-muted-foreground)]">
                    {l.account?.label}
                  </div>
                </td>
                <td className="px-3 py-2 text-xs">{l.description ?? '-'}</td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {Number(l.debit.toString()) > 0
                    ? formatCurrency(Number(l.debit.toString()), entry.currency)
                    : ''}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {Number(l.credit.toString()) > 0
                    ? formatCurrency(Number(l.credit.toString()), entry.currency)
                    : ''}
                </td>
              </tr>
            ))}
            <tr className="border-t-2 font-semibold">
              <td colSpan={3} className="px-3 py-2 text-xs uppercase">
                {t('lines.total')}
              </td>
              <td className="px-3 py-2 text-right tabular-nums">
                {formatCurrency(Number(entry.totalDebit.toString()), entry.currency)}
              </td>
              <td className="px-3 py-2 text-right tabular-nums">
                {formatCurrency(Number(entry.totalCredit.toString()), entry.currency)}
              </td>
            </tr>
          </tbody>
        </table>
      </section>

      <section className="rounded-lg border bg-[var(--color-card)] p-6 shadow-sm">
        <h3 className="text-sm font-semibold">{t('actionsTitle')}</h3>
        <div className="mt-3 flex gap-2">
          {entry.status === JournalEntryStatus.DRAFT && balanced && !entry.period.isClosed && (
            <form action={handlePost}>
              <input type="hidden" name="id" value={entry.id} />
              <button className="rounded-md bg-[var(--color-primary)] px-3 py-2 text-sm font-medium text-[var(--color-primary-foreground)] hover:opacity-90">
                {t('postButton')}
              </button>
            </form>
          )}
        </div>
        {entry.payment && (
          <p className="mt-3 text-xs text-[var(--color-muted-foreground)]">
            {t('generatedFromPayment')}{' '}
            <Link
              href={'/payments/' + entry.payment.id}
              className="font-mono text-[var(--color-primary)] hover:underline"
            >
              {entry.payment.reference}
            </Link>
          </p>
        )}
      </section>
    </div>
  );
}
