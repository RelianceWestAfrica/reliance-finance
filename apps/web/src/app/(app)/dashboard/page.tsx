import { auth } from '@/lib/auth';
import { getUserMemberships } from '@/lib/rbac';
import { getTenantedDb } from '@/lib/tenancy';
import { prisma } from '@/lib/prisma';
import { redirect } from 'next/navigation';

const iconProps = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

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
    {
      label: 'Entités',
      value: entityCount,
      note: 'Holding + filiales + SPV',
      icon: (
        <svg viewBox="0 0 24 24" {...iconProps} className="h-4 w-4">
          <path d="M3 21h18M5 21V7l7-4 7 4v14" />
          <path d="M9 21v-5h6v5" />
        </svg>
      ),
    },
    {
      label: 'Fournisseurs',
      value: supplierCount,
      note: 'Actifs · statut ACTIVE',
      icon: (
        <svg viewBox="0 0 24 24" {...iconProps} className="h-4 w-4">
          <path d="M3 7h18M3 12h18M3 17h12" />
        </svg>
      ),
    },
    {
      label: 'Projets',
      value: projectCount,
      note: 'Périodes en cours',
      icon: (
        <svg viewBox="0 0 24 24" {...iconProps} className="h-4 w-4">
          <path d="M3 7l9-4 9 4-9 4z" />
          <path d="M3 7v10l9 4 9-4V7" />
        </svg>
      ),
    },
    {
      label: 'Seuils',
      value: thresholdCount,
      note: 'Configurés · cadre §5',
      icon: (
        <svg viewBox="0 0 24 24" {...iconProps} className="h-4 w-4">
          <path d="M4 21V10M12 21V4M20 21v-7" />
          <circle cx="4" cy="7" r="2" />
          <circle cx="20" cy="11" r="2" />
        </svg>
      ),
    },
  ];

  const firstName = (session.user.name ?? session.user.email ?? '').split(/[@.\s]/)[0];

  return (
    <div className="space-y-7">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">
          Bonjour{firstName ? ', ' + firstName.charAt(0).toUpperCase() + firstName.slice(1) : ''}
        </h1>
        <p className="max-w-2xl text-sm leading-relaxed text-[var(--color-muted-foreground)]">
          Vue consolidée du cycle financier — fournisseurs, demandes de dépense, comparatifs,
          bons de commande, réceptions, factures (3-way match), trésorerie et comptabilité
          SYSCOHADA.
        </p>
      </header>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="group relative overflow-hidden rounded-[var(--radius)] border bg-[var(--color-card)] p-5 shadow-[var(--shadow-card)]"
          >
            <span className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-[var(--color-primary)] to-transparent opacity-0 transition-opacity group-hover:opacity-70" />
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--color-muted-foreground)]">
                {stat.label}
              </span>
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--color-primary-soft)] text-[var(--color-primary)]">
                {stat.icon}
              </span>
            </div>
            <div className="mt-3.5 text-4xl font-bold tabular-nums leading-none">{stat.value}</div>
            <div className="mt-2 text-xs text-[var(--color-faint)]">{stat.note}</div>
          </div>
        ))}
      </section>

      <section className="rounded-[var(--radius)] border bg-[var(--color-card)] shadow-[var(--shadow-card)]">
        <div className="flex items-baseline justify-between border-b border-[var(--color-border-soft)] px-5 py-4">
          <h2 className="text-base font-semibold">Vos rôles</h2>
          <span className="font-mono text-[11px] text-[var(--color-faint)]">docs/rbac-matrix.md</span>
        </div>
        {memberships.length === 0 ? (
          <p className="px-5 py-5 text-sm text-[var(--color-warning)]">
            Aucun rôle actif. Contactez votre administrateur pour obtenir vos permissions.
          </p>
        ) : (
          <ul>
            {memberships.map((m) => (
              <li
                key={m.entityId + '-' + m.role}
                className="flex items-center justify-between border-b border-[var(--color-border-soft)] px-5 py-3.5 last:border-0"
              >
                <span className="rounded-md bg-[var(--color-primary-soft)] px-2.5 py-1 font-mono text-[11.5px] font-semibold text-[var(--color-primary)]">
                  {m.role}
                </span>
                <span className="text-[13px] text-[var(--color-muted-foreground)]">{m.entityCode}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="flex items-center gap-2 text-[11.5px] text-[var(--color-faint)]">
        <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-success)]" />
        Système opérationnel · toute connexion est journalisée (cadre normatif §10).
      </p>
    </div>
  );
}
