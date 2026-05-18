import { prisma } from '@reliance-finance/database';
import { redirect } from 'next/navigation';

import { formatCurrency } from '@/lib/format';
import {
  createProject,
  archiveProject,
  createCostCenter,
  archiveCostCenter,
} from './actions';

export default async function ProjectsSettingsPage(props: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await props.searchParams;
  const errorMessage = params.error ? decodeURIComponent(params.error) : null;

  async function handleCreateProject(formData: FormData) {
    'use server';
    const r = await createProject(formData);
    if (!r.ok) {
      redirect('/settings/projects?error=' + encodeURIComponent(r.error ?? 'Echec'));
    }
  }
  async function handleArchiveProject(formData: FormData) {
    'use server';
    const r = await archiveProject(formData);
    if (!r.ok) redirect('/settings/projects?error=' + encodeURIComponent(r.error ?? 'Echec'));
  }
  async function handleCreateCostCenter(formData: FormData) {
    'use server';
    const r = await createCostCenter(formData);
    if (!r.ok) redirect('/settings/projects?error=' + encodeURIComponent(r.error ?? 'Echec'));
  }
  async function handleArchiveCostCenter(formData: FormData) {
    'use server';
    const r = await archiveCostCenter(formData);
    if (!r.ok) redirect('/settings/projects?error=' + encodeURIComponent(r.error ?? 'Echec'));
  }

  const [entities, projects, costCenters] = await Promise.all([
    prisma.entity.findMany({
      where: { isActive: true },
      orderBy: { code: 'asc' },
      select: { id: true, code: true, name: true, kind: true },
    }),
    prisma.project.findMany({
      orderBy: [{ entityId: 'asc' }, { code: 'asc' }],
      include: {
        entity: { select: { code: true } },
        _count: { select: { costCenters: true, expenseRequests: true } },
      },
    }),
    prisma.costCenter.findMany({
      orderBy: [{ entityId: 'asc' }, { code: 'asc' }],
      include: {
        entity: { select: { code: true } },
        project: { select: { code: true } },
      },
    }),
  ]);

  return (
    <div className="space-y-10">
      <header>
        <h1 className="text-2xl font-semibold">Projets &amp; centres de cout</h1>
        <p className="text-sm text-[var(--color-muted-foreground)]">
          Rattachement budgetaire des depenses (cadre §2.1).
        </p>
      </header>

      {errorMessage && (
        <div role="alert" className="rounded-md border border-[var(--color-destructive)] bg-[var(--color-destructive)]/10 px-3 py-2 text-sm text-[var(--color-destructive)]">
          {errorMessage}
        </div>
      )}

      {/* PROJETS */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Projets</h2>

        <div className="rounded-lg border bg-[var(--color-card)] p-6 shadow-sm">
          <form action={handleCreateProject} className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <select name="entityId" required className="rounded-md border bg-white px-3 py-2 text-sm">
              <option value="">-- Entite --</option>
              {entities.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.code} ({e.kind})
                </option>
              ))}
            </select>
            <input
              name="code"
              required
              placeholder="Code (ex: CIDPE)"
              className="rounded-md border bg-white px-3 py-2 text-sm uppercase"
            />
            <input
              name="name"
              required
              placeholder="Nom complet du projet"
              className="rounded-md border bg-white px-3 py-2 text-sm"
            />
            <div className="flex gap-2">
              <input
                name="budget"
                type="number"
                min="0"
                step="0.01"
                placeholder="Budget"
                className="flex-1 rounded-md border bg-white px-3 py-2 text-sm"
              />
              <input
                name="currency"
                defaultValue="XOF"
                maxLength={3}
                className="w-16 rounded-md border bg-white px-3 py-2 text-sm uppercase"
              />
            </div>
            <input
              name="startDate"
              type="date"
              className="rounded-md border bg-white px-3 py-2 text-sm"
            />
            <input
              name="endDate"
              type="date"
              className="rounded-md border bg-white px-3 py-2 text-sm"
            />
            <input
              name="description"
              placeholder="Description (optionnel)"
              className="rounded-md border bg-white px-3 py-2 text-sm sm:col-span-2"
            />
            <button
              type="submit"
              className="rounded-md bg-[var(--color-primary)] px-3 py-2 text-sm font-medium text-[var(--color-primary-foreground)] hover:opacity-90 sm:col-span-2 lg:col-span-4"
            >
              Creer le projet
            </button>
          </form>
        </div>

        <div className="rounded-lg border bg-[var(--color-card)] shadow-sm">
          <table className="w-full text-sm">
            <thead className="border-b text-left text-xs uppercase text-[var(--color-muted-foreground)]">
              <tr>
                <th className="px-4 py-3 font-medium">Entite</th>
                <th className="px-4 py-3 font-medium">Code</th>
                <th className="px-4 py-3 font-medium">Nom</th>
                <th className="px-4 py-3 font-medium">Budget</th>
                <th className="px-4 py-3 font-medium">CC / Demandes</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {projects.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-[var(--color-muted-foreground)]">
                    Aucun projet.
                  </td>
                </tr>
              )}
              {projects.map((p) => (
                <tr key={p.id} className={'border-b last:border-0 ' + (p.isActive ? '' : 'opacity-50')}>
                  <td className="px-4 py-3 font-mono text-xs">{p.entity.code}</td>
                  <td className="px-4 py-3 font-mono text-xs font-semibold">{p.code}</td>
                  <td className="px-4 py-3">{p.name}</td>
                  <td className="px-4 py-3 text-xs tabular-nums">
                    {p.budget ? formatCurrency(Number(p.budget.toString()), p.currency) : '-'}
                  </td>
                  <td className="px-4 py-3 text-xs text-[var(--color-muted-foreground)]">
                    {p._count.costCenters} / {p._count.expenseRequests}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {p.isActive ? (
                      <form action={handleArchiveProject}>
                        <input type="hidden" name="id" value={p.id} />
                        <button className="text-xs text-[var(--color-destructive)] hover:underline">
                          Archiver
                        </button>
                      </form>
                    ) : (
                      <span className="text-xs text-[var(--color-muted-foreground)]">Archive</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* CENTRES DE COUT */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Centres de cout</h2>

        <div className="rounded-lg border bg-[var(--color-card)] p-6 shadow-sm">
          <form action={handleCreateCostCenter} className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <select name="entityId" required className="rounded-md border bg-white px-3 py-2 text-sm">
              <option value="">-- Entite --</option>
              {entities.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.code}
                </option>
              ))}
            </select>
            <select name="projectId" defaultValue="" className="rounded-md border bg-white px-3 py-2 text-sm">
              <option value="">-- Projet (optionnel) --</option>
              {projects
                .filter((p) => p.isActive)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.entity.code} / {p.code}
                  </option>
                ))}
            </select>
            <input
              name="code"
              required
              placeholder="Code (CC-ADMIN)"
              className="rounded-md border bg-white px-3 py-2 text-sm uppercase"
            />
            <input
              name="name"
              required
              placeholder="Libelle"
              className="rounded-md border bg-white px-3 py-2 text-sm sm:col-span-2 lg:col-span-1"
            />
            <button
              type="submit"
              className="rounded-md bg-[var(--color-primary)] px-3 py-2 text-sm font-medium text-[var(--color-primary-foreground)] hover:opacity-90"
            >
              Ajouter
            </button>
          </form>
        </div>

        <div className="rounded-lg border bg-[var(--color-card)] shadow-sm">
          <table className="w-full text-sm">
            <thead className="border-b text-left text-xs uppercase text-[var(--color-muted-foreground)]">
              <tr>
                <th className="px-4 py-3 font-medium">Entite</th>
                <th className="px-4 py-3 font-medium">Projet</th>
                <th className="px-4 py-3 font-medium">Code</th>
                <th className="px-4 py-3 font-medium">Libelle</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {costCenters.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-[var(--color-muted-foreground)]">
                    Aucun centre de cout.
                  </td>
                </tr>
              )}
              {costCenters.map((c) => (
                <tr key={c.id} className={'border-b last:border-0 ' + (c.isActive ? '' : 'opacity-50')}>
                  <td className="px-4 py-3 font-mono text-xs">{c.entity.code}</td>
                  <td className="px-4 py-3 font-mono text-xs">{c.project?.code ?? '-'}</td>
                  <td className="px-4 py-3 font-mono text-xs font-semibold">{c.code}</td>
                  <td className="px-4 py-3">{c.name}</td>
                  <td className="px-4 py-3 text-right">
                    {c.isActive ? (
                      <form action={handleArchiveCostCenter}>
                        <input type="hidden" name="id" value={c.id} />
                        <button className="text-xs text-[var(--color-destructive)] hover:underline">
                          Archiver
                        </button>
                      </form>
                    ) : (
                      <span className="text-xs text-[var(--color-muted-foreground)]">Archive</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
