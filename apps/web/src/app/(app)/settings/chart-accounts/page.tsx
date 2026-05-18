import { prisma } from '@reliance-finance/database';
import { redirect } from 'next/navigation';

import { createChartAccount, toggleChartAccount } from './actions';

const TYPE_LABELS: Record<string, string> = {
  ASSET: 'Actif',
  LIABILITY: 'Passif',
  EQUITY: 'Capitaux propres',
  INCOME: 'Produit',
  EXPENSE: 'Charge',
};

export default async function ChartAccountsPage(props: {
  searchParams: Promise<{ error?: string; class?: string }>;
}) {
  const params = await props.searchParams;
  const errorMessage = params.error ? decodeURIComponent(params.error) : null;
  const classFilter = params.class;

  async function handleCreate(formData: FormData) {
    'use server';
    const r = await createChartAccount(formData);
    if (!r.ok) {
      redirect('/settings/chart-accounts?error=' + encodeURIComponent(r.error ?? 'Echec'));
    }
  }
  async function handleToggle(formData: FormData) {
    'use server';
    const r = await toggleChartAccount(formData);
    if (!r.ok) {
      redirect('/settings/chart-accounts?error=' + encodeURIComponent(r.error ?? 'Echec'));
    }
  }

  const accounts = await prisma.chartAccount.findMany({
    where: classFilter ? { classCode: classFilter } : undefined,
    orderBy: { code: 'asc' },
  });

  // Liste des classes existantes pour filtre
  const classes = await prisma.chartAccount.findMany({
    distinct: ['classCode'],
    orderBy: { classCode: 'asc' },
    select: { classCode: true, className: true },
  });

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold">Plan comptable SYSCOHADA</h1>
        <p className="text-sm text-[var(--color-muted-foreground)]">
          Extensible sans modification de code. Classes 1-7 selon le referentiel
          SYSCOHADA revise (cadre §12, conformite OHADA).
        </p>
      </header>

      {errorMessage && (
        <div role="alert" className="rounded-md border border-[var(--color-destructive)] bg-[var(--color-destructive)]/10 px-3 py-2 text-sm text-[var(--color-destructive)]">
          {errorMessage}
        </div>
      )}

      <section className="rounded-lg border bg-[var(--color-card)] p-6 shadow-sm">
        <h2 className="text-lg font-semibold">Ajouter un compte</h2>
        <form action={handleCreate} className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <input
            name="code"
            required
            pattern="[0-9]+"
            placeholder="Code (ex: 605100)"
            className="rounded-md border bg-white px-3 py-2 text-sm font-mono"
          />
          <input
            name="label"
            required
            placeholder="Libelle"
            className="rounded-md border bg-white px-3 py-2 text-sm sm:col-span-2"
          />
          <input
            name="classCode"
            required
            maxLength={2}
            placeholder="Classe"
            className="rounded-md border bg-white px-3 py-2 text-sm"
          />
          <select name="type" required className="rounded-md border bg-white px-3 py-2 text-sm">
            <option value="">-- Type --</option>
            {Object.entries(TYPE_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          <input
            name="className"
            required
            placeholder="Nom de la classe"
            className="rounded-md border bg-white px-3 py-2 text-sm sm:col-span-3"
          />
          <button
            type="submit"
            className="rounded-md bg-[var(--color-primary)] px-3 py-2 text-sm font-medium text-[var(--color-primary-foreground)] hover:opacity-90 sm:col-span-2"
          >
            Ajouter
          </button>
        </form>
      </section>

      {classes.length > 0 && (
        <nav className="flex flex-wrap gap-2 text-xs">
          <a
            href="/settings/chart-accounts"
            className={
              'rounded-full border px-3 py-1 hover:bg-[var(--color-muted)] ' +
              (!classFilter ? 'bg-[var(--color-primary)] text-[var(--color-primary-foreground)]' : '')
            }
          >
            Toutes
          </a>
          {classes.map((c) => (
            <a
              key={c.classCode}
              href={'/settings/chart-accounts?class=' + c.classCode}
              className={
                'rounded-full border px-3 py-1 hover:bg-[var(--color-muted)] ' +
                (classFilter === c.classCode
                  ? 'bg-[var(--color-primary)] text-[var(--color-primary-foreground)]'
                  : '')
              }
            >
              Classe {c.classCode} - {c.className}
            </a>
          ))}
        </nav>
      )}

      <section className="rounded-lg border bg-[var(--color-card)] shadow-sm">
        <table className="w-full text-sm">
          <thead className="border-b text-left text-xs uppercase text-[var(--color-muted-foreground)]">
            <tr>
              <th className="px-4 py-3 font-medium">Code</th>
              <th className="px-4 py-3 font-medium">Libelle</th>
              <th className="px-4 py-3 font-medium">Classe</th>
              <th className="px-4 py-3 font-medium">Type</th>
              <th className="px-4 py-3 font-medium">Statut</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {accounts.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-[var(--color-muted-foreground)]">
                  Aucun compte. Lancez `pnpm db:seed` pour charger le SYSCOHADA initial.
                </td>
              </tr>
            )}
            {accounts.map((a) => (
              <tr key={a.id} className={'border-b last:border-0 ' + (a.isActive ? '' : 'opacity-50')}>
                <td className="px-4 py-3 font-mono text-xs font-semibold">{a.code}</td>
                <td className="px-4 py-3">{a.label}</td>
                <td className="px-4 py-3 text-xs">
                  <span className="font-mono">{a.classCode}</span>
                  <span className="ml-2 text-[var(--color-muted-foreground)]">{a.className}</span>
                </td>
                <td className="px-4 py-3 text-xs">{TYPE_LABELS[a.type] ?? a.type}</td>
                <td className="px-4 py-3 text-xs">
                  {a.isActive ? (
                    <span className="text-[var(--color-success)]">Actif</span>
                  ) : (
                    <span className="text-[var(--color-muted-foreground)]">Inactif</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  <form action={handleToggle}>
                    <input type="hidden" name="code" value={a.code} />
                    <button className="text-xs text-[var(--color-primary)] hover:underline">
                      {a.isActive ? 'Desactiver' : 'Reactiver'}
                    </button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
