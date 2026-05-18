import { auth } from '@/lib/auth';
import { getUserMemberships } from '@/lib/rbac';
import { getTenantedDb } from '@/lib/tenancy';
import { prisma } from '@/lib/prisma';
import { redirect } from 'next/navigation';

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect('/login');
  }

  const memberships = await getUserMemberships(session.user.id);
  // Client Prisma tenante - filtre automatique sur entityId visibles
  const db = await getTenantedDb();

  const [entityCount, supplierCount, projectCount, thresholdCount] = await Promise.all([
    db.entity.count(),
    db.supplier.count({ where: { status: 'ACTIVE' } }),
    db.project.count({ where: { isActive: true } }),
    // Threshold est tenant-scoped mais aussi global (entityId null) => raw
    prisma.threshold.count({ where: { isActive: true } }),
  ]);

  const stats = [
    { label: 'Entites accessibles', value: entityCount, note: 'Holding + filiales + SPV' },
    { label: 'Fournisseurs actifs', value: supplierCount, note: 'Statut ACTIVE' },
    { label: 'Projets actifs', value: projectCount, note: 'Periodes en cours' },
    { label: 'Seuils configures', value: thresholdCount, note: 'Cadre normatif §5' },
  ];

  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          Bienvenue, {session.user.name ?? session.user.email}
        </h1>
        <p className="text-sm text-[var(--color-muted-foreground)]">
          Squelette de l&apos;application Reliance Finance - les modules fonctionnels
          (M1 a M14) seront livres dans les sessions suivantes. Voir{' '}
          <code className="font-mono text-xs">docs/roadmap.md</code>.
        </p>
      </div>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="rounded-lg border bg-[var(--color-card)] p-5 shadow-sm"
          >
            <div className="text-sm font-medium text-[var(--color-muted-foreground)]">
              {stat.label}
            </div>
            <div className="mt-2 text-3xl font-semibold tabular-nums">{stat.value}</div>
            <div className="mt-1 text-xs text-[var(--color-muted-foreground)]">
              {stat.note}
            </div>
          </div>
        ))}
      </section>

      <section className="rounded-lg border bg-[var(--color-card)] p-6 shadow-sm">
        <h2 className="text-lg font-semibold">Vos roles</h2>
        <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
          Permissions decrites dans{' '}
          <code className="font-mono text-xs">docs/rbac-matrix.md</code>.
        </p>
        {memberships.length === 0 ? (
          <p className="mt-4 text-sm text-[var(--color-warning)]">
            Aucun role actif. Contactez votre administrateur pour obtenir vos
            permissions.
          </p>
        ) : (
          <table className="mt-4 w-full text-sm">
            <thead className="border-b text-left text-xs uppercase text-[var(--color-muted-foreground)]">
              <tr>
                <th className="pb-2 font-medium">Role</th>
                <th className="pb-2 font-medium">Entite</th>
              </tr>
            </thead>
            <tbody>
              {memberships.map((m) => (
                <tr key={m.entityId + '-' + m.role} className="border-b last:border-0">
                  <td className="py-2 font-mono text-xs">{m.role}</td>
                  <td className="py-2">{m.entityCode}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="rounded-lg border border-dashed bg-[var(--color-card)] p-6">
        <h2 className="text-lg font-semibold">Prochaines fonctionnalites</h2>
        <ul className="mt-3 space-y-2 text-sm text-[var(--color-muted-foreground)]">
          <li>
            <span className="font-mono text-xs">M1</span> Auth & RBAC complet (groupes,
            invitations, audit log)
          </li>
          <li>
            <span className="font-mono text-xs">M2</span> Gestion entites, projets, plan
            comptable
          </li>
          <li>
            <span className="font-mono text-xs">M3</span> Cycle fournisseur + anti-fraude RIB
          </li>
          <li>
            <span className="font-mono text-xs">M4</span> Demande de depense (FDA/FD) +
            workflow
          </li>
        </ul>
      </section>
    </div>
  );
}
