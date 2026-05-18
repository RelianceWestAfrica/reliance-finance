import { prisma, ThresholdType } from '@reliance-finance/database';
import { redirect } from 'next/navigation';

import { formatCurrency, formatDateTime, formatNumber } from '@/lib/format';
import { replaceThreshold, deactivateThreshold } from './actions';

const TYPE_LABELS: Record<ThresholdType, string> = {
  FILIALE_N2_REQUIRED_ABOVE: 'Visa Filiale N2 requis au-dessus de',
  GROUPE_REQUIRED_ABOVE: 'Visa Finance Groupe requis au-dessus de',
  AG_REQUIRED_ABOVE: 'Autorisation AG requise au-dessus de',
  CASH_PAYMENT_MAX: 'Plafond paiement cash',
  ADVANCE_MAX_PERCENT: 'Acompte maximum (%)',
  URGENCY_MAX_AMOUNT: 'Plafond procedure urgence',
  URGENCY_REGULARIZATION_HOURS: 'Delai max regularisation urgence (heures)',
  THREE_OFFERS_REQUIRED_ABOVE: 'Comparatif 3 offres requis au-dessus de',
  PROVIDER_ONBOARDING_REQUIRED_ABOVE: 'Onboarding fournisseur complet au-dessus de',
};

// Types numeriques (heures, pourcentages) - amount = null, value = ...
const NON_MONETARY_TYPES = new Set<ThresholdType>([
  ThresholdType.ADVANCE_MAX_PERCENT,
  ThresholdType.URGENCY_REGULARIZATION_HOURS,
]);

export default async function ThresholdsSettingsPage(props: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await props.searchParams;
  const errorMessage = params.error ? decodeURIComponent(params.error) : null;

  async function handleReplace(formData: FormData) {
    'use server';
    const r = await replaceThreshold(formData);
    if (!r.ok) {
      redirect('/settings/thresholds?error=' + encodeURIComponent(r.error ?? 'Echec'));
    }
  }
  async function handleDeactivate(formData: FormData) {
    'use server';
    const r = await deactivateThreshold(formData);
    if (!r.ok) {
      redirect('/settings/thresholds?error=' + encodeURIComponent(r.error ?? 'Echec'));
    }
  }

  const [thresholds, entities] = await Promise.all([
    prisma.threshold.findMany({
      orderBy: [{ type: 'asc' }, { effectiveFrom: 'desc' }],
      include: { entity: { select: { code: true } } },
    }),
    prisma.entity.findMany({
      where: { isActive: true },
      orderBy: { code: 'asc' },
      select: { id: true, code: true, kind: true },
    }),
  ]);

  // Regroupes par (type, entityId)
  type Row = (typeof thresholds)[number];
  const grouped = new Map<string, { active: Row | null; history: Row[] }>();
  for (const t of thresholds) {
    const key = t.type + '|' + (t.entityId ?? 'GLOBAL');
    const bucket = grouped.get(key) ?? { active: null, history: [] };
    if (t.isActive && bucket.active === null) {
      bucket.active = t;
    } else {
      bucket.history.push(t);
    }
    grouped.set(key, bucket);
  }

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold">Seuils de validation</h1>
        <p className="text-sm text-[var(--color-muted-foreground)]">
          Versionnes par effectiveFrom. Toute modification cree une nouvelle entree
          et cloture la precedente. Les dossiers en cours conservent leur seuil
          d&apos;origine, les nouveaux dossiers utilisent le seuil actif (cadre §5).
        </p>
      </header>

      {errorMessage && (
        <div role="alert" className="rounded-md border border-[var(--color-destructive)] bg-[var(--color-destructive)]/10 px-3 py-2 text-sm text-[var(--color-destructive)]">
          {errorMessage}
        </div>
      )}

      <section className="rounded-lg border bg-[var(--color-card)] p-6 shadow-sm">
        <h2 className="text-lg font-semibold">Nouveau seuil ou remplacement</h2>
        <p className="mb-4 text-xs text-[var(--color-muted-foreground)]">
          Si un seuil actif existe deja pour (type, entite), il sera cloture
          automatiquement (effectiveTo = maintenant).
        </p>
        <form action={handleReplace} className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <select name="type" required className="rounded-md border bg-white px-3 py-2 text-sm">
            <option value="">-- Type de seuil --</option>
            {Object.values(ThresholdType).map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <select name="entityId" defaultValue="" className="rounded-md border bg-white px-3 py-2 text-sm">
            <option value="">Global (toutes entites)</option>
            {entities.map((e) => (
              <option key={e.id} value={e.id}>
                {e.code} ({e.kind})
              </option>
            ))}
          </select>
          <div className="flex gap-2">
            <input
              name="amount"
              type="number"
              min="0"
              step="0.01"
              placeholder="Montant (FCFA)"
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
            name="value"
            type="number"
            min="0"
            step="0.01"
            placeholder="Ou valeur (heures, %)"
            className="rounded-md border bg-white px-3 py-2 text-sm"
          />
          <input
            name="description"
            placeholder="Description (optionnel)"
            className="rounded-md border bg-white px-3 py-2 text-sm sm:col-span-2"
          />
          <button
            type="submit"
            className="rounded-md bg-[var(--color-primary)] px-3 py-2 text-sm font-medium text-[var(--color-primary-foreground)] hover:opacity-90 sm:col-span-2 lg:col-span-3"
          >
            Creer / remplacer le seuil
          </button>
        </form>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Seuils actifs et historique</h2>
        {Array.from(grouped.entries()).length === 0 && (
          <p className="rounded-lg border bg-[var(--color-card)] p-6 text-sm text-[var(--color-muted-foreground)]">
            Aucun seuil. Lancez `pnpm db:seed` pour charger les valeurs par defaut.
          </p>
        )}
        {Array.from(grouped.entries()).map(([key, { active, history }]) => {
          const [type] = key.split('|');
          const thresholdType = (type ?? 'OTHER') as ThresholdType;
          const isNonMonetary = NON_MONETARY_TYPES.has(thresholdType);
          const scopeLabel = active?.entity?.code ?? history[0]?.entity?.code ?? 'GLOBAL';

          const renderValue = (t: Row) => {
            if (isNonMonetary) {
              const value = t.value ? Number(t.value.toString()) : 0;
              return formatNumber(value) + (type === 'ADVANCE_MAX_PERCENT' ? ' %' : ' h');
            }
            return t.amount
              ? formatCurrency(Number(t.amount.toString()), t.currency ?? 'XOF')
              : '-';
          };

          return (
            <div key={key} className="rounded-lg border bg-[var(--color-card)] p-5 shadow-sm">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div>
                  <span className="font-mono text-xs text-[var(--color-muted-foreground)]">
                    {type}
                  </span>
                  <span className="ml-2 text-xs text-[var(--color-muted-foreground)]">
                    ({scopeLabel})
                  </span>
                  <h3 className="text-sm">
                    {TYPE_LABELS[thresholdType] ?? type}
                  </h3>
                </div>
                {active && (
                  <div className="text-right">
                    <div className="text-2xl font-semibold tabular-nums">
                      {renderValue(active)}
                    </div>
                    <div className="text-xs text-[var(--color-muted-foreground)]">
                      Actif depuis {formatDateTime(active.effectiveFrom)}
                    </div>
                    <form action={handleDeactivate} className="mt-1">
                      <input type="hidden" name="id" value={active.id} />
                      <button className="text-xs text-[var(--color-destructive)] hover:underline">
                        Desactiver
                      </button>
                    </form>
                  </div>
                )}
              </div>

              {history.length > 0 && (
                <details className="mt-3 text-xs">
                  <summary className="cursor-pointer text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]">
                    Historique ({history.length} version{history.length > 1 ? 's' : ''})
                  </summary>
                  <ul className="mt-2 space-y-1 font-mono">
                    {history.map((h) => (
                      <li key={h.id} className="text-[var(--color-muted-foreground)]">
                        {renderValue(h)} - du {formatDateTime(h.effectiveFrom)}
                        {h.effectiveTo ? ' au ' + formatDateTime(h.effectiveTo) : ''}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          );
        })}
      </section>
    </div>
  );
}
