import { prisma, ThresholdType } from '@reliance-finance/database';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

import { formatCurrency, formatDateTime, formatNumber } from '@/lib/format';
import { replaceThreshold, deactivateThreshold } from './actions';

// Types numeriques (heures, pourcentages) - amount = null, value = ...
const NON_MONETARY_TYPES = new Set<ThresholdType>([
  ThresholdType.ADVANCE_MAX_PERCENT,
  ThresholdType.URGENCY_REGULARIZATION_HOURS,
]);

export default async function ThresholdsSettingsPage(props: {
  searchParams: Promise<{ error?: string }>;
}) {
  const t = await getTranslations('pages.settings.thresholds');

  const typeLabels: Record<ThresholdType, string> = {
    FILIALE_N2_REQUIRED_ABOVE: t('typeLabels.FILIALE_N2_REQUIRED_ABOVE'),
    GROUPE_REQUIRED_ABOVE: t('typeLabels.GROUPE_REQUIRED_ABOVE'),
    AG_REQUIRED_ABOVE: t('typeLabels.AG_REQUIRED_ABOVE'),
    CASH_PAYMENT_MAX: t('typeLabels.CASH_PAYMENT_MAX'),
    ADVANCE_MAX_PERCENT: t('typeLabels.ADVANCE_MAX_PERCENT'),
    URGENCY_MAX_AMOUNT: t('typeLabels.URGENCY_MAX_AMOUNT'),
    URGENCY_REGULARIZATION_HOURS: t('typeLabels.URGENCY_REGULARIZATION_HOURS'),
    THREE_OFFERS_REQUIRED_ABOVE: t('typeLabels.THREE_OFFERS_REQUIRED_ABOVE'),
    PROVIDER_ONBOARDING_REQUIRED_ABOVE: t('typeLabels.PROVIDER_ONBOARDING_REQUIRED_ABOVE'),
  };

  const params = await props.searchParams;
  const errorMessage = params.error ? decodeURIComponent(params.error) : null;

  async function handleReplace(formData: FormData) {
    'use server';
    const tServer = await getTranslations('pages.settings.thresholds');
    const r = await replaceThreshold(formData);
    if (!r.ok) {
      redirect(
        '/settings/thresholds?error=' + encodeURIComponent(r.error ?? tServer('errors.failure')),
      );
    }
  }
  async function handleDeactivate(formData: FormData) {
    'use server';
    const tServer = await getTranslations('pages.settings.thresholds');
    const r = await deactivateThreshold(formData);
    if (!r.ok) {
      redirect(
        '/settings/thresholds?error=' + encodeURIComponent(r.error ?? tServer('errors.failure')),
      );
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
  for (const th of thresholds) {
    const key = th.type + '|' + (th.entityId ?? 'GLOBAL');
    const bucket = grouped.get(key) ?? { active: null, history: [] };
    if (th.isActive && bucket.active === null) {
      bucket.active = th;
    } else {
      bucket.history.push(th);
    }
    grouped.set(key, bucket);
  }

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold">{t('title')}</h1>
        <p className="text-sm text-[var(--color-muted-foreground)]">{t('subtitle')}</p>
      </header>

      {errorMessage && (
        <div
          role="alert"
          className="bg-[var(--color-destructive)]/10 rounded-md border border-[var(--color-destructive)] px-3 py-2 text-sm text-[var(--color-destructive)]"
        >
          {errorMessage}
        </div>
      )}

      <section className="rounded-lg border bg-[var(--color-card)] p-6 shadow-sm">
        <h2 className="text-lg font-semibold">{t('form.heading')}</h2>
        <p className="mb-4 text-xs text-[var(--color-muted-foreground)]">{t('form.hint')}</p>
        <form
          action={handleReplace}
          className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
        >
          <select name="type" required className="rounded-md border bg-white px-3 py-2 text-sm">
            <option value="">{t('form.typePlaceholder')}</option>
            {Object.values(ThresholdType).map((tt) => (
              <option key={tt} value={tt}>
                {tt}
              </option>
            ))}
          </select>
          <select
            name="entityId"
            defaultValue=""
            className="rounded-md border bg-white px-3 py-2 text-sm"
          >
            <option value="">{t('form.entityGlobal')}</option>
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
              placeholder={t('form.amountPlaceholder')}
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
            placeholder={t('form.valuePlaceholder')}
            className="rounded-md border bg-white px-3 py-2 text-sm"
          />
          <input
            name="description"
            placeholder={t('form.descriptionPlaceholder')}
            className="rounded-md border bg-white px-3 py-2 text-sm sm:col-span-2"
          />
          <button
            type="submit"
            className="rounded-md bg-[var(--color-primary)] px-3 py-2 text-sm font-medium text-[var(--color-primary-foreground)] hover:opacity-90 sm:col-span-2 lg:col-span-3"
          >
            {t('form.submit')}
          </button>
        </form>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">{t('list.heading')}</h2>
        {Array.from(grouped.entries()).length === 0 && (
          <p className="rounded-lg border bg-[var(--color-card)] p-6 text-sm text-[var(--color-muted-foreground)]">
            {t('list.empty')}
          </p>
        )}
        {Array.from(grouped.entries()).map(([key, { active, history }]) => {
          const [type] = key.split('|');
          const thresholdType = (type ?? 'OTHER') as ThresholdType;
          const isNonMonetary = NON_MONETARY_TYPES.has(thresholdType);
          const scopeLabel =
            active?.entity?.code ?? history[0]?.entity?.code ?? t('list.scopeGlobal');

          const renderValue = (row: Row) => {
            if (isNonMonetary) {
              const value = row.value ? Number(row.value.toString()) : 0;
              const unit = type === 'ADVANCE_MAX_PERCENT' ? t('units.percent') : t('units.hours');
              return formatNumber(value) + ' ' + unit;
            }
            return row.amount
              ? formatCurrency(Number(row.amount.toString()), row.currency ?? 'XOF')
              : '-';
          };

          const historyToggleLabel =
            history.length === 1
              ? t('list.historyToggleOne', { count: history.length })
              : t('list.historyToggleOther', { count: history.length });

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
                  <h3 className="text-sm">{typeLabels[thresholdType] ?? type}</h3>
                </div>
                {active && (
                  <div className="text-right">
                    <div className="text-2xl font-semibold tabular-nums">{renderValue(active)}</div>
                    <div className="text-xs text-[var(--color-muted-foreground)]">
                      {t('list.activeSince', { date: formatDateTime(active.effectiveFrom) })}
                    </div>
                    <form action={handleDeactivate} className="mt-1">
                      <input type="hidden" name="id" value={active.id} />
                      <button className="text-xs text-[var(--color-destructive)] hover:underline">
                        {t('actions.deactivate')}
                      </button>
                    </form>
                  </div>
                )}
              </div>

              {history.length > 0 && (
                <details className="mt-3 text-xs">
                  <summary className="cursor-pointer text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]">
                    {historyToggleLabel}
                  </summary>
                  <ul className="mt-2 space-y-1 font-mono">
                    {history.map((h) => (
                      <li key={h.id} className="text-[var(--color-muted-foreground)]">
                        {h.effectiveTo
                          ? t('list.historyRangeClosed', {
                              value: renderValue(h),
                              from: formatDateTime(h.effectiveFrom),
                              to: formatDateTime(h.effectiveTo),
                            })
                          : t('list.historyRangeOpen', {
                              value: renderValue(h),
                              from: formatDateTime(h.effectiveFrom),
                            })}
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
