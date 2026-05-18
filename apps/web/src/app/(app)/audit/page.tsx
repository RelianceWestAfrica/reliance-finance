import { prisma, RoleCode } from '@reliance-finance/database';
import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { getUserMemberships, requireAnyRole } from '@/lib/rbac';
import { formatDateTime } from '@/lib/format';
import Link from 'next/link';

interface SearchParams {
  entityType?: string;
  entityId?: string;
  action?: string;
}

export default async function AuditPage(props: { searchParams: Promise<SearchParams> }) {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');

  const memberships = await getUserMemberships(session.user.id);
  requireAnyRole(memberships, [
    RoleCode.ADMIN,
    RoleCode.DFG,
    RoleCode.CONTROLEUR_INTERNE,
    RoleCode.AUDITEUR,
  ]);

  const params = await props.searchParams;

  const logs = await prisma.auditLog.findMany({
    where: {
      ...(params.entityType ? { entityType: params.entityType } : {}),
      ...(params.entityId ? { entityId: params.entityId } : {}),
      ...(params.action ? { action: { contains: params.action } } : {}),
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: 100,
    include: {
      actor: { select: { email: true, name: true } },
    },
  });

  // Groupes uniques pour offrir un bouton "verifier la chaine"
  const uniqueChains = Array.from(
    new Map(
      logs.map((l) => [l.entityType + '|' + l.entityId, { entityType: l.entityType, entityId: l.entityId }]),
    ).values(),
  ).slice(0, 5);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Journal d&apos;audit</h1>
        <p className="text-sm text-[var(--color-muted-foreground)]">
          Append-only avec chainage SHA-256. Verifiable via{' '}
          <code className="font-mono text-xs">/api/audit/verify/[entityType]/[entityId]</code>.
        </p>
      </header>

      <section className="rounded-lg border bg-[var(--color-card)] p-4 shadow-sm">
        <form className="grid grid-cols-1 gap-3 sm:grid-cols-4">
          <input
            name="entityType"
            placeholder="entityType (ex: User)"
            defaultValue={params.entityType ?? ''}
            className="rounded-md border bg-white px-3 py-2 text-sm shadow-sm"
          />
          <input
            name="entityId"
            placeholder="entityId (cuid)"
            defaultValue={params.entityId ?? ''}
            className="rounded-md border bg-white px-3 py-2 text-sm shadow-sm"
          />
          <input
            name="action"
            placeholder="action contient..."
            defaultValue={params.action ?? ''}
            className="rounded-md border bg-white px-3 py-2 text-sm shadow-sm"
          />
          <button
            type="submit"
            className="rounded-md bg-[var(--color-primary)] px-3 py-2 text-sm font-medium text-[var(--color-primary-foreground)] hover:opacity-90"
          >
            Filtrer
          </button>
        </form>
      </section>

      {uniqueChains.length > 0 && (
        <section className="rounded-lg border bg-[var(--color-card)] p-4 shadow-sm">
          <h2 className="text-sm font-semibold">Verifier l&apos;integrite d&apos;une chaine</h2>
          <ul className="mt-2 flex flex-wrap gap-2">
            {uniqueChains.map((c) => (
              <li key={c.entityType + '|' + c.entityId}>
                <Link
                  href={'/api/audit/verify/' + c.entityType + '/' + c.entityId}
                  target="_blank"
                  className="rounded-full border px-3 py-1 text-xs font-mono text-[var(--color-primary)] hover:bg-[var(--color-muted)]"
                >
                  {c.entityType}/{c.entityId.slice(0, 12)}...
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="overflow-x-auto rounded-lg border bg-[var(--color-card)] shadow-sm">
        <table className="w-full text-sm">
          <thead className="border-b text-left text-xs uppercase text-[var(--color-muted-foreground)]">
            <tr>
              <th className="px-3 py-3 font-medium">Date</th>
              <th className="px-3 py-3 font-medium">Action</th>
              <th className="px-3 py-3 font-medium">Acteur</th>
              <th className="px-3 py-3 font-medium">Cible</th>
              <th className="px-3 py-3 font-medium">Hash</th>
            </tr>
          </thead>
          <tbody>
            {logs.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-[var(--color-muted-foreground)]">
                  Aucune entree.
                </td>
              </tr>
            ) : (
              logs.map((log) => (
                <tr key={log.id} className="border-b last:border-0 align-top">
                  <td className="whitespace-nowrap px-3 py-2 text-xs text-[var(--color-muted-foreground)]">
                    {formatDateTime(log.createdAt)}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">{log.action}</td>
                  <td className="px-3 py-2 text-xs">
                    {log.actor?.email ?? <span className="italic">systeme</span>}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    <div className="font-mono">{log.entityType}</div>
                    <div className="font-mono text-[var(--color-muted-foreground)]">
                      {log.entityId.slice(0, 16)}...
                    </div>
                  </td>
                  <td className="px-3 py-2 font-mono text-[10px] text-[var(--color-muted-foreground)]">
                    {log.hash.slice(0, 16)}...
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>

      <p className="text-xs text-[var(--color-muted-foreground)]">
        Affichage limite aux 100 entrees les plus recentes. Pagination + export CSV : session 9
        (M13).
      </p>
    </div>
  );
}
