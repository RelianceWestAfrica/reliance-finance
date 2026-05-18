import { prisma, EntityKind } from '@reliance-finance/database';
import { redirect } from 'next/navigation';

import { createEntity, archiveEntity, updateEntity } from './actions';
import { formatDateTime } from '@/lib/format';

const KIND_LABELS: Record<EntityKind, string> = {
  HOLDING: 'Holding',
  SUBSIDIARY: 'Filiale',
  SPV: 'SPV / Projet vehicule',
};

export default async function EntitiesSettingsPage(props: {
  searchParams: Promise<{ error?: string; edit?: string }>;
}) {
  const params = await props.searchParams;
  const errorMessage = params.error ? decodeURIComponent(params.error) : null;

  async function handleCreate(formData: FormData) {
    'use server';
    const result = await createEntity(formData);
    if (!result.ok) {
      redirect('/settings/entities?error=' + encodeURIComponent(result.error ?? 'Echec'));
    }
  }

  async function handleArchive(formData: FormData) {
    'use server';
    const result = await archiveEntity(formData);
    if (!result.ok) {
      redirect('/settings/entities?error=' + encodeURIComponent(result.error ?? 'Echec'));
    }
  }

  async function handleUpdate(formData: FormData) {
    'use server';
    const result = await updateEntity(formData);
    if (!result.ok) {
      redirect('/settings/entities?error=' + encodeURIComponent(result.error ?? 'Echec'));
    }
    redirect('/settings/entities');
  }

  const entities = await prisma.entity.findMany({
    orderBy: [{ kind: 'asc' }, { code: 'asc' }],
    include: {
      parentEntity: { select: { code: true } },
      _count: { select: { children: true, projects: true, suppliers: true } },
    },
  });

  const editing = params.edit ? entities.find((e) => e.id === params.edit) : null;
  const possibleParents = entities.filter((e) => e.isActive && e.kind !== EntityKind.SPV);

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold">Entites du Groupe</h1>
        <p className="text-sm text-[var(--color-muted-foreground)]">
          Hierarchie Holding -&gt; Filiales -&gt; SPV. Toute creation est journalisee
          (cadre §2.2 + §12).
        </p>
      </header>

      {errorMessage && (
        <div role="alert" className="rounded-md border border-[var(--color-destructive)] bg-[var(--color-destructive)]/10 px-3 py-2 text-sm text-[var(--color-destructive)]">
          {errorMessage}
        </div>
      )}

      {editing ? (
        <section className="rounded-lg border bg-[var(--color-card)] p-6 shadow-sm">
          <h2 className="text-lg font-semibold">Modifier {editing.code}</h2>
          <form action={handleUpdate} className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <input type="hidden" name="id" value={editing.id} />
            <label className="text-sm">
              Nom
              <input
                name="name"
                required
                defaultValue={editing.name}
                className="mt-1 block w-full rounded-md border bg-white px-3 py-2 text-sm"
              />
            </label>
            <label className="text-sm">
              Pays (ISO 3166-1 alpha-2)
              <input
                name="country"
                defaultValue={editing.country ?? ''}
                maxLength={2}
                placeholder="TG"
                className="mt-1 block w-full rounded-md border bg-white px-3 py-2 text-sm uppercase"
              />
            </label>
            <label className="text-sm">
              Devise par defaut
              <input
                name="defaultCurrency"
                required
                defaultValue={editing.defaultCurrency}
                maxLength={3}
                className="mt-1 block w-full rounded-md border bg-white px-3 py-2 text-sm uppercase"
              />
            </label>
            <label className="text-sm">
              RCCM
              <input
                name="rccm"
                defaultValue={editing.rccm ?? ''}
                className="mt-1 block w-full rounded-md border bg-white px-3 py-2 text-sm"
              />
            </label>
            <label className="text-sm">
              IFU / NIF
              <input
                name="ifu"
                defaultValue={editing.ifu ?? ''}
                className="mt-1 block w-full rounded-md border bg-white px-3 py-2 text-sm"
              />
            </label>
            <label className="text-sm sm:col-span-2">
              Adresse
              <input
                name="address"
                defaultValue={editing.address ?? ''}
                className="mt-1 block w-full rounded-md border bg-white px-3 py-2 text-sm"
              />
            </label>
            <div className="flex gap-2 sm:col-span-2">
              <button
                type="submit"
                className="rounded-md bg-[var(--color-primary)] px-3 py-2 text-sm font-medium text-[var(--color-primary-foreground)] hover:opacity-90"
              >
                Enregistrer
              </button>
              <a
                href="/settings/entities"
                className="rounded-md border px-3 py-2 text-sm hover:bg-[var(--color-muted)]"
              >
                Annuler
              </a>
            </div>
          </form>
        </section>
      ) : (
        <section className="rounded-lg border bg-[var(--color-card)] p-6 shadow-sm">
          <h2 className="text-lg font-semibold">Creer une entite</h2>
          <form action={handleCreate} className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <label className="text-sm">
              Code (unique, MAJUSCULES)
              <input
                name="code"
                required
                placeholder="BENIN, CIV1, SPV-LOME-2"
                className="mt-1 block w-full rounded-md border bg-white px-3 py-2 text-sm uppercase"
              />
            </label>
            <label className="text-sm">
              Nom complet
              <input
                name="name"
                required
                placeholder="Reliance Benin SARL"
                className="mt-1 block w-full rounded-md border bg-white px-3 py-2 text-sm"
              />
            </label>
            <label className="text-sm">
              Type
              <select
                name="kind"
                required
                defaultValue={EntityKind.SUBSIDIARY}
                className="mt-1 block w-full rounded-md border bg-white px-3 py-2 text-sm"
              >
                {Object.values(EntityKind).map((k) => (
                  <option key={k} value={k}>
                    {KIND_LABELS[k]}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              Entite parente (sauf Holding)
              <select
                name="parentEntityId"
                defaultValue=""
                className="mt-1 block w-full rounded-md border bg-white px-3 py-2 text-sm"
              >
                <option value="">-- Aucune (Holding) --</option>
                {possibleParents.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.code} ({KIND_LABELS[p.kind]})
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              Pays (ISO 2 lettres)
              <input
                name="country"
                maxLength={2}
                placeholder="TG"
                className="mt-1 block w-full rounded-md border bg-white px-3 py-2 text-sm uppercase"
              />
            </label>
            <label className="text-sm">
              Devise par defaut
              <input
                name="defaultCurrency"
                defaultValue="XOF"
                maxLength={3}
                className="mt-1 block w-full rounded-md border bg-white px-3 py-2 text-sm uppercase"
              />
            </label>
            <button
              type="submit"
              className="sm:col-span-2 lg:col-span-3 rounded-md bg-[var(--color-primary)] px-3 py-2 text-sm font-medium text-[var(--color-primary-foreground)] hover:opacity-90"
            >
              Creer l&apos;entite
            </button>
          </form>
        </section>
      )}

      <section className="rounded-lg border bg-[var(--color-card)] shadow-sm">
        <table className="w-full text-sm">
          <thead className="border-b text-left text-xs uppercase text-[var(--color-muted-foreground)]">
            <tr>
              <th className="px-4 py-3 font-medium">Code</th>
              <th className="px-4 py-3 font-medium">Type</th>
              <th className="px-4 py-3 font-medium">Nom</th>
              <th className="px-4 py-3 font-medium">Parent</th>
              <th className="px-4 py-3 font-medium">Pays / Devise</th>
              <th className="px-4 py-3 font-medium">Enfants / Projets / Fourn.</th>
              <th className="px-4 py-3 font-medium">Cree</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {entities.map((e) => (
              <tr key={e.id} className={'border-b last:border-0 ' + (e.isActive ? '' : 'opacity-50')}>
                <td className="px-4 py-3 font-mono text-xs font-semibold">{e.code}</td>
                <td className="px-4 py-3 text-xs">{KIND_LABELS[e.kind]}</td>
                <td className="px-4 py-3">{e.name}</td>
                <td className="px-4 py-3 font-mono text-xs">{e.parentEntity?.code ?? '-'}</td>
                <td className="px-4 py-3 text-xs">
                  {e.country ?? '-'} / {e.defaultCurrency}
                </td>
                <td className="px-4 py-3 text-xs text-[var(--color-muted-foreground)]">
                  {e._count.children} / {e._count.projects} / {e._count.suppliers}
                </td>
                <td className="px-4 py-3 text-xs text-[var(--color-muted-foreground)]">
                  {formatDateTime(e.createdAt)}
                </td>
                <td className="px-4 py-3 text-right">
                  {e.isActive ? (
                    <div className="flex justify-end gap-2">
                      <a
                        href={'/settings/entities?edit=' + e.id}
                        className="text-xs text-[var(--color-primary)] hover:underline"
                      >
                        Modifier
                      </a>
                      <form action={handleArchive}>
                        <input type="hidden" name="id" value={e.id} />
                        <input
                          type="hidden"
                          name="reason"
                          value="Archive manuel via /settings/entities"
                        />
                        <button
                          type="submit"
                          className="text-xs text-[var(--color-destructive)] hover:underline"
                        >
                          Archiver
                        </button>
                      </form>
                    </div>
                  ) : (
                    <span className="text-xs text-[var(--color-muted-foreground)]">Archive</span>
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
