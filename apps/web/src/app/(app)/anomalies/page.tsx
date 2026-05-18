import { redirect } from 'next/navigation';
import Link from 'next/link';

import { auth } from '@/lib/auth';
import { getTenantedDb } from '@/lib/tenancy';
import { formatDateTime } from '@/lib/format';
import { AnomalyStatus, AnomalySeverity, AnomalyType } from '@reliance-finance/database';
import { runControlChecks } from './actions';

const SEVERITY_COLOR: Record<AnomalySeverity, string> = {
  LOW: 'bg-[var(--color-muted)] text-[var(--color-foreground)]',
  MEDIUM: 'bg-[var(--color-warning)]/10 text-[var(--color-warning)]',
  HIGH: 'bg-[var(--color-warning)]/20 text-[var(--color-warning)]',
  CRITICAL: 'bg-[var(--color-destructive)]/10 text-[var(--color-destructive)]',
};

const STATUS_COLOR: Record<AnomalyStatus, string> = {
  OPEN: 'text-[var(--color-destructive)]',
  INVESTIGATING: 'text-[var(--color-warning)]',
  RESOLVED: 'text-[var(--color-success)]',
  FALSE_POSITIVE: 'text-[var(--color-muted-foreground)]',
  SANCTION_REQUESTED: 'text-[var(--color-destructive)]',
};

export default async function AnomaliesListPage(props: {
  searchParams: Promise<{ status?: AnomalyStatus; severity?: AnomalySeverity; type?: AnomalyType }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');
  const params = await props.searchParams;

  const db = await getTenantedDb();
  const anomalies = await db.anomaly.findMany({
    where: {
      ...(params.status ? { status: params.status } : {}),
      ...(params.severity ? { severity: params.severity } : {}),
      ...(params.type ? { type: params.type } : {}),
    },
    orderBy: [{ severity: 'desc' }, { createdAt: 'desc' }],
    take: 100,
    include: {
      entity: { select: { code: true } },
      assignee: { select: { email: true } },
    },
  });

  async function handleRun() {
    'use server';
    await runControlChecks();
  }

  return (
    <div className="space-y-6">
      <header className="flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Anomalies</h1>
          <p className="text-sm text-[var(--color-muted-foreground)]">
            Detection automatique : doublons facture, fractionnement paiements, PV manquants,
            DRAFT &gt; 30j, urgences repetees, RIB suspects (cadre §13).
          </p>
        </div>
        <form action={handleRun}>
          <button className="rounded-md bg-[var(--color-primary)] px-3 py-2 text-sm font-medium text-[var(--color-primary-foreground)] hover:opacity-90">
            Lancer les controles
          </button>
        </form>
      </header>

      <form className="rounded-lg border bg-[var(--color-card)] p-4 shadow-sm">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
          <select name="status" defaultValue={params.status ?? ''} className="rounded-md border bg-white px-3 py-2 text-sm">
            <option value="">-- Tous statuts --</option>
            {Object.values(AnomalyStatus).map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <select name="severity" defaultValue={params.severity ?? ''} className="rounded-md border bg-white px-3 py-2 text-sm">
            <option value="">-- Toutes severites --</option>
            {Object.values(AnomalySeverity).map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <select name="type" defaultValue={params.type ?? ''} className="rounded-md border bg-white px-3 py-2 text-sm">
            <option value="">-- Tous types --</option>
            {Object.values(AnomalyType).map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
          <button type="submit" className="rounded-md bg-[var(--color-foreground)] px-3 py-2 text-xs font-medium text-white hover:opacity-90">
            Filtrer
          </button>
        </div>
      </form>

      <section className="overflow-x-auto rounded-lg border bg-[var(--color-card)] shadow-sm">
        <table className="w-full text-sm">
          <thead className="border-b text-left text-xs uppercase text-[var(--color-muted-foreground)]">
            <tr>
              <th className="px-3 py-3 font-medium">Reference</th>
              <th className="px-3 py-3 font-medium">Severite</th>
              <th className="px-3 py-3 font-medium">Type</th>
              <th className="px-3 py-3 font-medium">Titre</th>
              <th className="px-3 py-3 font-medium">Entite</th>
              <th className="px-3 py-3 font-medium">Statut</th>
              <th className="px-3 py-3 font-medium">Assigne</th>
              <th className="px-3 py-3 font-medium">Detecte</th>
            </tr>
          </thead>
          <tbody>
            {anomalies.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-6 text-center text-[var(--color-muted-foreground)]">
                  Aucune anomalie. Lancez les controles pour scanner.
                </td>
              </tr>
            )}
            {anomalies.map((a) => (
              <tr key={a.id} className="border-b last:border-0">
                <td className="px-3 py-2 font-mono text-xs">
                  <Link href={'/anomalies/' + a.id} className="text-[var(--color-primary)] hover:underline">
                    {a.reference}
                  </Link>
                </td>
                <td className="px-3 py-2">
                  <span className={'rounded-full px-2 py-0.5 text-[10px] font-medium ' + SEVERITY_COLOR[a.severity]}>
                    {a.severity}
                  </span>
                </td>
                <td className="px-3 py-2 font-mono text-xs">{a.type}</td>
                <td className="px-3 py-2 text-xs">{a.title}</td>
                <td className="px-3 py-2 font-mono text-xs">{a.entity.code}</td>
                <td className={'px-3 py-2 text-xs font-medium ' + STATUS_COLOR[a.status]}>
                  {a.status}
                </td>
                <td className="px-3 py-2 text-xs">{a.assignee?.email ?? '-'}</td>
                <td className="px-3 py-2 text-xs text-[var(--color-muted-foreground)]">
                  {formatDateTime(a.createdAt)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
