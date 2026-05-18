import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';

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

const STATUS_LABELS: Record<BankAccountChangeStatus, string> = {
  REQUESTED: 'En attente N1',
  DUAL_VALIDATION_PENDING: 'En attente N2',
  QUARANTINE: 'Quarantaine 24h',
  ACTIVE: 'Actif',
  REJECTED: 'Rejete',
};

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
      redirect('/suppliers/' + id + '/bank-accounts?error=' + encodeURIComponent(r.error ?? 'Echec'));
    }
  }
  async function handleApprove1(formData: FormData) {
    'use server';
    const r = await approveChangeLevel1(formData);
    if (!r.ok) {
      redirect('/suppliers/' + id + '/bank-accounts?error=' + encodeURIComponent(r.error ?? 'Echec'));
    }
  }
  async function handleApprove2(formData: FormData) {
    'use server';
    const r = await approveChangeLevel2(formData);
    if (!r.ok) {
      redirect('/suppliers/' + id + '/bank-accounts?error=' + encodeURIComponent(r.error ?? 'Echec'));
    }
  }
  async function handleReject(formData: FormData) {
    'use server';
    const r = await rejectChange(formData);
    if (!r.ok) {
      redirect('/suppliers/' + id + '/bank-accounts?error=' + encodeURIComponent(r.error ?? 'Echec'));
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
      redirect('/suppliers/' + id + '/bank-accounts?error=' + encodeURIComponent(r.error ?? 'Echec'));
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-semibold">RIBs - {supplier.name}</h1>
          <p className="text-sm text-[var(--color-muted-foreground)]">
            Cycle anti-fraude RIB : demande -&gt; N1 -&gt; N2 -&gt; quarantaine 24h -&gt; actif (cadre §8).
          </p>
          <Link href={'/suppliers/' + id} className="mt-2 inline-block text-xs text-[var(--color-primary)] hover:underline">
            &larr; Retour fiche fournisseur
          </Link>
        </div>
        <form action={handleActivate}>
          <button className="rounded-md border px-3 py-1.5 text-xs hover:bg-[var(--color-muted)]" type="submit">
            Activer quarantaines echues
          </button>
        </form>
      </header>

      {errorMessage && (
        <div role="alert" className="rounded-md border border-[var(--color-destructive)] bg-[var(--color-destructive)]/10 px-3 py-2 text-sm text-[var(--color-destructive)]">
          {errorMessage}
        </div>
      )}

      <section className="rounded-lg border bg-[var(--color-card)] shadow-sm">
        <h2 className="border-b px-4 py-3 text-sm font-semibold">RIBs enregistres</h2>
        <table className="w-full text-sm">
          <thead className="border-b text-left text-xs uppercase text-[var(--color-muted-foreground)]">
            <tr>
              <th className="px-4 py-3 font-medium">Banque / Titulaire</th>
              <th className="px-4 py-3 font-medium">IBAN / RIB</th>
              <th className="px-4 py-3 font-medium">Utilisable</th>
              <th className="px-4 py-3 font-medium">Verifie</th>
              <th className="px-4 py-3 font-medium">Quarantaine</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {accounts.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-[var(--color-muted-foreground)]">
                  Aucun RIB.
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
                <tr key={a.id} className={'border-b last:border-0 ' + (a.isActive ? '' : 'opacity-50')}>
                  <td className="px-4 py-3">
                    <div className="font-medium">{a.bankName}</div>
                    <div className="text-xs text-[var(--color-muted-foreground)]">{a.holderName}</div>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">
                    {a.iban ?? a.rib ?? '-'}
                    {a.swift && <div className="text-[var(--color-muted-foreground)]">{a.swift}</div>}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {u.usable ? (
                      <span className="text-[var(--color-success)]">OK</span>
                    ) : (
                      <span className="text-[var(--color-warning)]" title={u.message}>
                        {u.reason}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {a.verifiedAt ? formatDateTime(a.verifiedAt) : <span className="text-[var(--color-warning)]">Non</span>}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {a.quarantineUntil ? formatDateTime(a.quarantineUntil) : '-'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {!a.verifiedAt && a.isActive && (
                      <form action={handleVerifyAccount}>
                        <input type="hidden" name="id" value={a.id} />
                        <button className="text-xs text-[var(--color-primary)] hover:underline">
                          Verifier (appel retour)
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
        <h2 className="text-sm font-semibold">Demande de changement RIB</h2>
        <p className="mt-1 mb-4 text-xs text-[var(--color-muted-foreground)]">
          Double validation obligatoire (N1 + N2) puis quarantaine 24h avant utilisation.
        </p>
        <form action={handleRequest} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <input type="hidden" name="supplierId" value={supplier.id} />
          <label className="text-sm sm:col-span-2">
            Remplace le RIB existant (optionnel)
            <select
              name="oldBankAccountId"
              defaultValue=""
              className="mt-1 block w-full rounded-md border bg-white px-3 py-2 text-sm"
            >
              <option value="">-- Aucun (nouveau RIB) --</option>
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
            placeholder="Nouvelle banque"
            className="rounded-md border bg-white px-3 py-2 text-sm"
          />
          <input
            name="newHolderName"
            required
            placeholder="Titulaire (= raison sociale)"
            className="rounded-md border bg-white px-3 py-2 text-sm"
          />
          <input
            name="newIban"
            placeholder="IBAN"
            className="rounded-md border bg-white px-3 py-2 text-sm font-mono"
          />
          <input
            name="newRib"
            placeholder="RIB"
            className="rounded-md border bg-white px-3 py-2 text-sm font-mono"
          />
          <textarea
            name="justification"
            required
            minLength={10}
            rows={3}
            placeholder="Justification ecrite obligatoire (cadre §8) - ex: nouveau compte ouvert, changement de banque, etc."
            className="rounded-md border bg-white px-3 py-2 text-sm sm:col-span-2"
          />
          <button
            type="submit"
            className="rounded-md bg-[var(--color-primary)] px-3 py-2 text-sm font-medium text-[var(--color-primary-foreground)] hover:opacity-90 sm:col-span-2"
          >
            Soumettre la demande
          </button>
        </form>
      </section>

      <section className="rounded-lg border bg-[var(--color-card)] shadow-sm">
        <h2 className="border-b px-4 py-3 text-sm font-semibold">
          Historique des demandes de changement
        </h2>
        <table className="w-full text-sm">
          <thead className="border-b text-left text-xs uppercase text-[var(--color-muted-foreground)]">
            <tr>
              <th className="px-4 py-3 font-medium">Date</th>
              <th className="px-4 py-3 font-medium">Demandeur</th>
              <th className="px-4 py-3 font-medium">Ancien -&gt; Nouveau</th>
              <th className="px-4 py-3 font-medium">Statut</th>
              <th className="px-4 py-3 font-medium">Validations</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {changes.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-[var(--color-muted-foreground)]">
                  Aucune demande.
                </td>
              </tr>
            )}
            {changes.map((c) => (
              <tr key={c.id} className="border-b last:border-0 align-top">
                <td className="px-4 py-3 text-xs">{formatDateTime(c.createdAt)}</td>
                <td className="px-4 py-3 text-xs">{c.requestedBy.email}</td>
                <td className="px-4 py-3 text-xs font-mono">
                  {c.oldIban ?? c.oldRib ?? <span className="italic">creation</span>}
                  <br />
                  &rarr; {c.newIban ?? c.newRib}
                </td>
                <td className="px-4 py-3">
                  <span className={'rounded-full px-2 py-0.5 text-[10px] font-medium ' + STATUS_BADGE[c.status]}>
                    {STATUS_LABELS[c.status]}
                  </span>
                  {c.status === BankAccountChangeStatus.QUARANTINE && c.quarantineUntil && (
                    <div className="mt-1 text-[10px] text-[var(--color-muted-foreground)]">
                      jusque {formatDateTime(c.quarantineUntil)}
                    </div>
                  )}
                  {c.rejectedReason && (
                    <div className="mt-1 text-[10px] text-[var(--color-destructive)]">
                      {c.rejectedReason}
                    </div>
                  )}
                </td>
                <td className="px-4 py-3 text-xs text-[var(--color-muted-foreground)]">
                  {c.approvedBy1 ? 'N1 : ' + c.approvedBy1.email : 'N1 attendu'}
                  <br />
                  {c.approvedBy2 ? 'N2 : ' + c.approvedBy2.email : 'N2 attendu'}
                </td>
                <td className="px-4 py-3 text-right">
                  {c.status === BankAccountChangeStatus.REQUESTED && (
                    <div className="flex flex-col gap-1">
                      <form action={handleApprove1}>
                        <input type="hidden" name="changeId" value={c.id} />
                        <button className="text-xs text-[var(--color-primary)] hover:underline">
                          Valider N1
                        </button>
                      </form>
                      <form action={handleReject}>
                        <input type="hidden" name="changeId" value={c.id} />
                        <input type="hidden" name="reason" value="Rejete depuis UI (motif a documenter)" />
                        <button className="text-xs text-[var(--color-destructive)] hover:underline">
                          Rejeter
                        </button>
                      </form>
                    </div>
                  )}
                  {c.status === BankAccountChangeStatus.DUAL_VALIDATION_PENDING && (
                    <div className="flex flex-col gap-1">
                      <form action={handleApprove2}>
                        <input type="hidden" name="changeId" value={c.id} />
                        <button className="text-xs text-[var(--color-primary)] hover:underline">
                          Valider N2 (DFG)
                        </button>
                      </form>
                      <form action={handleReject}>
                        <input type="hidden" name="changeId" value={c.id} />
                        <input type="hidden" name="reason" value="Rejete N2" />
                        <button className="text-xs text-[var(--color-destructive)] hover:underline">
                          Rejeter
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
