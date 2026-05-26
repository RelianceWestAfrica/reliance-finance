import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

import { auth } from '@/lib/auth';
import { getTenantedDb } from '@/lib/tenancy';
import { prisma, BankAccountChangeStatus } from '@reliance-finance/database';
import { formatDateTime } from '@/lib/format';
import { isBankAccountUsable } from '@/lib/bank-accounts/usability';
import {
  requestBankAccountChange,
  approveChangeLevel1,
  approveChangeLevel2,
  rejectChange,
  activateMatureQuarantines,
  verifyExistingBankAccount,
} from './actions';

const STATUS_BADGE: Record<BankAccountChangeStatus, string> = {
  REQUESTED: 'bg-[var(--color-muted)] text-[var(--color-foreground)]',
  DUAL_VALIDATION_PENDING: 'bg-[var(--color-warning)]/10 text-[var(--color-warning)]',
  QUARANTINE: 'bg-[var(--color-warning)]/10 text-[var(--color-warning)]',
  ACTIVE: 'bg-[var(--color-success)]/10 text-[var(--color-success)]',
  REJECTED: 'bg-[var(--color-destructive)]/10 text-[var(--color-destructive)]',
};

export default async function BankAccountsPage(props: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');
  const { id } = await props.params;
  const searchParams = await props.searchParams;
  const errorMessage = searchParams.error ? decodeURIComponent(searchParams.error) : null;

  const t = await getTranslations('pages.suppliers.bankAccounts');

  const db = await getTenantedDb();
  const supplier = await db.supplier.findUnique({
    where: { id },
    select: { id: true, code: true, name: true },
  });
  if (!supplier) notFound();

  const [accounts, changes] = await Promise.all([
    prisma.bankAccount.findMany({
      where: { supplierId: id },
      orderBy: [{ isActive: 'desc' }, { createdAt: 'desc' }],
    }),
    prisma.bankAccountChangeRequest.findMany({
      where: { supplierId: id },
      orderBy: { createdAt: 'desc' },
      take: 20,
      include: {
        requestedBy: { select: { email: true } },
        approvedBy1: { select: { email: true } },
        approvedBy2: { select: { email: true } },
      },
    }),
  ]);

  async function handleRequest(formData: FormData) {
    'use server';
    const r = await requestBankAccountChange(formData);
    if (!r.ok) {
      redirect(
        '/suppliers/' + id + '/bank-accounts?error=' + encodeURIComponent(r.error ?? 'Echec'),
      );
    }
  }
  async function handleApprove1(formData: FormData) {
    'use server';
    const r = await approveChangeLevel1(formData);
    if (!r.ok) {
      redirect(
        '/suppliers/' + id + '/bank-accounts?error=' + encodeURIComponent(r.error ?? 'Echec'),
      );
    }
  }
  async function handleApprove2(formData: FormData) {
    'use server';
    const r = await approveChangeLevel2(formData);
    if (!r.ok) {
      redirect(
        '/suppliers/' + id + '/bank-accounts?error=' + encodeURIComponent(r.error ?? 'Echec'),
      );
    }
  }
  async function handleReject(formData: FormData) {
    'use server';
    const r = await rejectChange(formData);
    if (!r.ok) {
      redirect(
        '/suppliers/' + id + '/bank-accounts?error=' + encodeURIComponent(r.error ?? 'Echec'),
      );
    }
  }
  async function handleActivate() {
    'use server';
    await activateMatureQuarantines();
  }
  async function handleVerifyAccount(formData: FormData) {
    'use server';
    const r = await verifyExistingBankAccount(formData);
    if (!r.ok) {
      redirect(
        '/suppliers/' + id + '/bank-accounts?error=' + encodeURIComponent(r.error ?? 'Echec'),
      );
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{t('title', { supplierName: supplier.name })}</h1>
          <p className="text-sm text-[var(--color-muted-foreground)]">{t('subtitle')}</p>
          <Link
            href={'/suppliers/' + id}
            className="mt-2 inline-block text-xs text-[var(--color-primary)] hover:underline"
          >
            {t('back')}
          </Link>
        </div>
        <form action={handleActivate}>
          <button
            className="rounded-md border px-3 py-1.5 text-xs hover:bg-[var(--color-muted)]"
            type="submit"
          >
            {t('activateMatured')}
          </button>
        </form>
      </header>

      {errorMessage && (
        <div
          role="alert"
          className="bg-[var(--color-destructive)]/10 rounded-md border border-[var(--color-destructive)] px-3 py-2 text-sm text-[var(--color-destructive)]"
        >
          {errorMessage}
        </div>
      )}

      <section className="rounded-lg border bg-[var(--color-card)] shadow-sm">
        <h2 className="border-b px-4 py-3 text-sm font-semibold">{t('registeredTitle')}</h2>
        <table className="w-full text-sm">
          <thead className="border-b text-left text-xs uppercase text-[var(--color-muted-foreground)]">
            <tr>
              <th className="px-4 py-3 font-medium">{t('columns.bankHolder')}</th>
              <th className="px-4 py-3 font-medium">{t('columns.ibanRib')}</th>
              <th className="px-4 py-3 font-medium">{t('columns.usable')}</th>
              <th className="px-4 py-3 font-medium">{t('columns.verified')}</th>
              <th className="px-4 py-3 font-medium">{t('columns.quarantine')}</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {accounts.length === 0 && (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-6 text-center text-[var(--color-muted-foreground)]"
                >
                  {t('empty')}
                </td>
              </tr>
            )}
            {accounts.map((a) => {
              const u = isBankAccountUsable({
                isActive: a.isActive,
                verifiedAt: a.verifiedAt,
                quarantineUntil: a.quarantineUntil,
              });
              return (
                <tr
                  key={a.id}
                  className={'border-b last:border-0 ' + (a.isActive ? '' : 'opacity-50')}
                >
                  <td className="px-4 py-3">
                    <div className="font-medium">{a.bankName}</div>
                    <div className="text-xs text-[var(--color-muted-foreground)]">
                      {a.holderName}
                    </div>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">
                    {a.iban ?? a.rib ?? '-'}
                    {a.swift && (
                      <div className="text-[var(--color-muted-foreground)]">{a.swift}</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {u.usable ? (
                      <span className="text-[var(--color-success)]">{t('values.usable')}</span>
                    ) : (
                      <span className="text-[var(--color-warning)]" title={u.message}>
                        {u.reason}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {a.verifiedAt ? (
                      formatDateTime(a.verifiedAt)
                    ) : (
                      <span className="text-[var(--color-warning)]">{t('values.notVerified')}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {a.quarantineUntil ? formatDateTime(a.quarantineUntil) : '-'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {!a.verifiedAt && a.isActive && (
                      <form action={handleVerifyAccount}>
                        <input type="hidden" name="id" value={a.id} />
                        <button className="text-xs text-[var(--color-primary)] hover:underline">
                          {t('verifyCta')}
                        </button>
                      </form>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <section className="rounded-lg border bg-[var(--color-card)] p-6 shadow-sm">
        <h2 className="text-sm font-semibold">{t('changeForm.title')}</h2>
        <p className="mb-4 mt-1 text-xs text-[var(--color-muted-foreground)]">
          {t('changeForm.help')}
        </p>
        <form action={handleRequest} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <input type="hidden" name="supplierId" value={supplier.id} />
          <label className="text-sm sm:col-span-2">
            {t('changeForm.replaces')}
            <select
              name="oldBankAccountId"
              defaultValue=""
              className="mt-1 block w-full rounded-md border bg-white px-3 py-2 text-sm"
            >
              <option value="">{t('changeForm.noReplacement')}</option>
              {accounts
                .filter((a) => a.isActive)
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.bankName} - {a.iban ?? a.rib}
                  </option>
                ))}
            </select>
          </label>
          <input
            name="newBankName"
            required
            placeholder={t('changeForm.newBankNamePlaceholder')}
            className="rounded-md border bg-white px-3 py-2 text-sm"
          />
          <input
            name="newHolderName"
            required
            placeholder={t('changeForm.newHolderNamePlaceholder')}
            className="rounded-md border bg-white px-3 py-2 text-sm"
          />
          <input
            name="newIban"
            placeholder={t('changeForm.newIbanPlaceholder')}
            className="rounded-md border bg-white px-3 py-2 font-mono text-sm"
          />
          <input
            name="newRib"
            placeholder={t('changeForm.newRibPlaceholder')}
            className="rounded-md border bg-white px-3 py-2 font-mono text-sm"
          />
          <textarea
            name="justification"
            required
            minLength={10}
            rows={3}
            placeholder={t('changeForm.justificationPlaceholder')}
            className="rounded-md border bg-white px-3 py-2 text-sm sm:col-span-2"
          />
          <button
            type="submit"
            className="rounded-md bg-[var(--color-primary)] px-3 py-2 text-sm font-medium text-[var(--color-primary-foreground)] hover:opacity-90 sm:col-span-2"
          >
            {t('changeForm.submit')}
          </button>
        </form>
      </section>

      <section className="rounded-lg border bg-[var(--color-card)] shadow-sm">
        <h2 className="border-b px-4 py-3 text-sm font-semibold">{t('changesTitle')}</h2>
        <table className="w-full text-sm">
          <thead className="border-b text-left text-xs uppercase text-[var(--color-muted-foreground)]">
            <tr>
              <th className="px-4 py-3 font-medium">{t('changesColumns.date')}</th>
              <th className="px-4 py-3 font-medium">{t('changesColumns.requester')}</th>
              <th className="px-4 py-3 font-medium">{t('changesColumns.oldNew')}</th>
              <th className="px-4 py-3 font-medium">{t('changesColumns.status')}</th>
              <th className="px-4 py-3 font-medium">{t('changesColumns.validations')}</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {changes.length === 0 && (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-6 text-center text-[var(--color-muted-foreground)]"
                >
                  {t('changesEmpty')}
                </td>
              </tr>
            )}
            {changes.map((c) => (
              <tr key={c.id} className="border-b align-top last:border-0">
                <td className="px-4 py-3 text-xs">{formatDateTime(c.createdAt)}</td>
                <td className="px-4 py-3 text-xs">{c.requestedBy.email}</td>
                <td className="px-4 py-3 font-mono text-xs">
                  {c.oldIban ?? c.oldRib ?? (
                    <span className="italic">{t('changeRow.creation')}</span>
                  )}
                  <br />
                  &rarr; {c.newIban ?? c.newRib}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={
                      'rounded-full px-2 py-0.5 text-[10px] font-medium ' + STATUS_BADGE[c.status]
                    }
                  >
                    {t(`changeStatus.${c.status}`)}
                  </span>
                  {c.status === BankAccountChangeStatus.QUARANTINE && c.quarantineUntil && (
                    <div className="mt-1 text-[10px] text-[var(--color-muted-foreground)]">
                      {t('changeRow.quarantineUntil', { date: formatDateTime(c.quarantineUntil) })}
                    </div>
                  )}
                  {c.rejectedReason && (
                    <div className="mt-1 text-[10px] text-[var(--color-destructive)]">
                      {c.rejectedReason}
                    </div>
                  )}
                </td>
                <td className="px-4 py-3 text-xs text-[var(--color-muted-foreground)]">
                  {c.approvedBy1
                    ? t('changeRow.n1Done', { email: c.approvedBy1.email })
                    : t('changeRow.n1Pending')}
                  <br />
                  {c.approvedBy2
                    ? t('changeRow.n2Done', { email: c.approvedBy2.email })
                    : t('changeRow.n2Pending')}
                </td>
                <td className="px-4 py-3 text-right">
                  {c.status === BankAccountChangeStatus.REQUESTED && (
                    <div className="flex flex-col gap-1">
                      <form action={handleApprove1}>
                        <input type="hidden" name="changeId" value={c.id} />
                        <button className="text-xs text-[var(--color-primary)] hover:underline">
                          {t('changeRow.approveN1')}
                        </button>
                      </form>
                      <form action={handleReject}>
                        <input type="hidden" name="changeId" value={c.id} />
                        <input type="hidden" name="reason" value={t('changeRow.rejectReasonN1')} />
                        <button className="text-xs text-[var(--color-destructive)] hover:underline">
                          {t('changeRow.reject')}
                        </button>
                      </form>
                    </div>
                  )}
                  {c.status === BankAccountChangeStatus.DUAL_VALIDATION_PENDING && (
                    <div className="flex flex-col gap-1">
                      <form action={handleApprove2}>
                        <input type="hidden" name="changeId" value={c.id} />
                        <button className="text-xs text-[var(--color-primary)] hover:underline">
                          {t('changeRow.approveN2')}
                        </button>
                      </form>
                      <form action={handleReject}>
                        <input type="hidden" name="changeId" value={c.id} />
                        <input type="hidden" name="reason" value={t('changeRow.rejectReasonN2')} />
                        <button className="text-xs text-[var(--color-destructive)] hover:underline">
                          {t('changeRow.reject')}
                        </button>
                      </form>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
