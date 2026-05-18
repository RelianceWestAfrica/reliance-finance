import { redirect } from 'next/navigation';
import Link from 'next/link';

import { auth } from '@/lib/auth';
import { getTenantedDb } from '@/lib/tenancy';
import { prisma, JournalEntryStatus } from '@reliance-finance/database';
import { formatDateTime } from '@/lib/format';
import {
  openAccountingPeriod,
  closeAccountingPeriod,
} from './actions';

export default async function AccountingPeriodsPage(props: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');
  const params = await props.searchParams;
  const errorMessage = params.error ? decodeURIComponent(params.error) : null;

  const db = await getTenantedDb();
  const [entities, periods, recentEntries] = await Promise.all([
    db.entity.findMany({ where: { isActive: true }, orderBy: { code: 'asc' }, select: { id: true, code: true, name: true } }),
    db.accountingPeriod.findMany({
      orderBy: [{ year: 'desc' }, { month: 'desc' }],
      take: 50,
      include: {
        entity: { select: { code: true, name: true } },
        _count: { select: { journalEntries: true } },
      },
    }),
    // 10 dernieres ecritures (raw client, hors tenancy car JournalEntry n'est pas tenant-scoped)
    prisma.journalEntry.findMany({
      orderBy: { createdAt: 'desc' },
      take: 10,
      include: {
        entity: { select: { code: true } },
        _count: { select: { lines: true } },
      },
    }),
  ]);

  async function handleOpen(formData: FormData) {
    'use server';
    const r = await openAccountingPeriod(formData);
    if (!r.ok) redirect('/accounting?error=' + encodeURIComponent(r.error ?? 'Echec'));
  }
  async function handleClose(formData: FormData) {
    'use server';
    const r = await closeAccountingPeriod(formData);
    if (!r.ok) redirect('/accounting?error=' + encodeURIComponent(r.error ?? 'Echec'));
  }

  const currentYear = new Date().getUTCFullYear();
  const currentMonth = new Date().getUTCMonth() + 1;

  return (
    <div className="space-y-6">
      <header className="flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Comptabilite</h1>
          <p className="text-sm text-[var(--color-muted-foreground)]">
            Periodes mensuelles + ecritures generees auto depuis paiements/factures
            (cadre §5 etape 8). Cloture = blocage retroactif.
          </p>
        </div>
      </header>

      {errorMessage && (
        <div role="alert" className="rounded-md border border-[var(--color-destructive)] bg-[var(--color-destructive)]/10 px-3 py-2 text-sm text-[var(--color-destructive)]">
          {errorMessage}
        </div>
      )}

      <section className="rounded-lg border bg-[var(--color-card)] p-6 shadow-sm">
        <h2 className="text-lg font-semibold">Ouvrir / cloturer une periode</h2>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <form action={handleOpen} className="space-y-2">
            <h3 className="text-sm font-semibold">Ouvrir</h3>
            <div className="flex gap-2">
              <select name="entityId" required className="flex-1 rounded-md border bg-white px-3 py-2 text-sm">
                <option value="">-- Entite --</option>
                {entities.map((e) => (
                  <option key={e.id} value={e.id}>{e.code}</option>
                ))}
              </select>
              <input name="year" type="number" min="2020" max="2100" required defaultValue={currentYear} className="w-24 rounded-md border bg-white px-3 py-2 text-sm tabular-nums" />
              <input name="month" type="number" min="1" max="12" required defaultValue={currentMonth} className="w-16 rounded-md border bg-white px-3 py-2 text-sm tabular-nums" />
              <button className="rounded-md bg-[var(--color-primary)] px-3 py-2 text-sm font-medium text-[var(--color-primary-foreground)] hover:opacity-90">
                Ouvrir
              </button>
            </div>
          </form>
          <form action={handleClose} className="space-y-2">
            <h3 className="text-sm font-semibold">Cloturer</h3>
            <div className="flex gap-2">
              <select name="entityId" required className="flex-1 rounded-md border bg-white px-3 py-2 text-sm">
                <option value="">-- Entite --</option>
                {entities.map((e) => (
                  <option key={e.id} value={e.id}>{e.code}</option>
                ))}
              </select>
              <input name="year" type="number" min="2020" max="2100" required defaultValue={currentYear} className="w-24 rounded-md border bg-white px-3 py-2 text-sm tabular-nums" />
              <input name="month" type="number" min="1" max="12" required defaultValue={currentMonth} className="w-16 rounded-md border bg-white px-3 py-2 text-sm tabular-nums" />
              <button className="rounded-md border border-[var(--color-destructive)] bg-white px-3 py-2 text-xs font-medium text-[var(--color-destructive)] hover:bg-[var(--color-destructive)]/10">
                Cloturer
              </button>
            </div>
            <p className="text-[10px] text-[var(--color-muted-foreground)]">
              Exige que toutes les ecritures DRAFT soient postees ou supprimees.
            </p>
          </form>
        </div>
      </section>

      <section className="rounded-lg border bg-[var(--color-card)] shadow-sm">
        <header className="border-b px-4 py-3">
          <h2 className="text-sm font-semibold">Periodes ({periods.length})</h2>
        </header>
        <table className="w-full text-sm">
          <thead className="border-b text-left text-xs uppercase text-[var(--color-muted-foreground)]">
            <tr>
              <th className="px-3 py-2 font-medium">Entite</th>
              <th className="px-3 py-2 font-medium">Annee</th>
              <th className="px-3 py-2 font-medium">Mois</th>
              <th className="px-3 py-2 font-medium">Statut</th>
              <th className="px-3 py-2 font-medium">Ecritures</th>
              <th className="px-3 py-2 font-medium">Export</th>
            </tr>
          </thead>
          <tbody>
            {periods.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-[var(--color-muted-foreground)]">
                  Aucune periode. Creez-en une via le formulaire ci-dessus.
                </td>
              </tr>
            )}
            {periods.map((p) => (
              <tr key={p.id} className="border-b last:border-0">
                <td className="px-3 py-2 font-mono text-xs">{p.entity.code}</td>
                <td className="px-3 py-2 tabular-nums">{p.year}</td>
                <td className="px-3 py-2 tabular-nums">{String(p.month).padStart(2, '0')}</td>
                <td className="px-3 py-2 text-xs">
                  {p.isClosed ? (
                    <span className="rounded-full bg-[var(--color-muted)] px-2 py-0.5 font-mono text-[10px]">
                      CLOTUREE le {p.closedAt && formatDateTime(p.closedAt)}
                    </span>
                  ) : (
                    <span className="rounded-full bg-[var(--color-success)]/10 px-2 py-0.5 text-[10px] font-medium text-[var(--color-success)]">
                      OUVERTE
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 text-xs">{p._count.journalEntries}</td>
                <td className="px-3 py-2 text-xs">
                  <a
                    href={'/api/v1/accounting/entries?entityId=' + p.entityId + '&year=' + p.year + '&month=' + p.month + '&format=fec'}
                    target="_blank"
                    rel="noreferrer"
                    className="mr-2 text-[var(--color-primary)] hover:underline"
                  >
                    FEC
                  </a>
                  <a
                    href={'/api/v1/accounting/entries?entityId=' + p.entityId + '&year=' + p.year + '&month=' + p.month + '&format=balance'}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[var(--color-primary)] hover:underline"
                  >
                    Balance
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="rounded-lg border bg-[var(--color-card)] shadow-sm">
        <header className="border-b px-4 py-3 flex items-baseline justify-between">
          <h2 className="text-sm font-semibold">10 dernieres ecritures</h2>
          <Link href="/accounting/entries" className="text-xs text-[var(--color-primary)] hover:underline">
            Voir toutes
          </Link>
        </header>
        <table className="w-full text-sm">
          <thead className="border-b text-left text-xs uppercase text-[var(--color-muted-foreground)]">
            <tr>
              <th className="px-3 py-2 font-medium">Reference</th>
              <th className="px-3 py-2 font-medium">Entite</th>
              <th className="px-3 py-2 font-medium">Journal</th>
              <th className="px-3 py-2 font-medium">Date</th>
              <th className="px-3 py-2 font-medium">Montant</th>
              <th className="px-3 py-2 font-medium">Statut</th>
            </tr>
          </thead>
          <tbody>
            {recentEntries.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-[var(--color-muted-foreground)]">
                  Aucune ecriture.
                </td>
              </tr>
            )}
            {recentEntries.map((e) => (
              <tr key={e.id} className="border-b last:border-0">
                <td className="px-3 py-2 font-mono text-xs">
                  <Link href={'/accounting/entries/' + e.id} className="text-[var(--color-primary)] hover:underline">
                    {e.reference}
                  </Link>
                </td>
                <td className="px-3 py-2 font-mono text-xs">{e.entity.code}</td>
                <td className="px-3 py-2 font-mono text-xs">{e.journalCode}</td>
                <td className="px-3 py-2 text-xs">{formatDateTime(e.entryDate)}</td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {e.totalDebit.toString()} {e.currency}
                </td>
                <td className="px-3 py-2 text-xs">
                  <span className={e.status === JournalEntryStatus.POSTED ? 'text-[var(--color-success)]' : 'text-[var(--color-muted-foreground)]'}>
                    {e.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
