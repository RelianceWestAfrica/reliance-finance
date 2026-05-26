'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';

const s = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const;
type Tab = 'infos' | 'securite' | 'prefs';

// Locales activables côté UI. fr-CI reste accepté en base mais n'est pas
// exposé tant qu'il n'a pas son propre fichier de messages.
type UiLocale = 'fr-FR' | 'en-US' | 'zh-CN';

function toUiLocale(value: string): UiLocale {
  if (value === 'en-US') return 'en-US';
  if (value === 'zh-CN') return 'zh-CN';
  return 'fr-FR';
}

export function ProfileView({
  firstName,
  lastName,
  name,
  email,
  image,
  roleLabel,
  lastLogin,
  isActive,
  preferredTimezone,
  preferredLocale,
  timezones,
  changePasswordHref,
  updateAction,
  logoutAction,
}: {
  firstName: string;
  lastName: string;
  name: string;
  email: string;
  image: string | null;
  roleLabel: string;
  lastLogin: string;
  isActive: boolean;
  preferredTimezone: string;
  preferredLocale: string;
  timezones: readonly string[];
  changePasswordHref: string;
  updateAction: (fd: FormData) => Promise<void>;
  logoutAction: () => Promise<void>;
}) {
  const t = useTranslations('profile');
  const tCommon = useTranslations('common');
  const [tab, setTab] = useState<Tab>('infos');
  const [fn, setFn] = useState(firstName);
  const [ln, setLn] = useState(lastName);
  const [locale, setLocale] = useState<UiLocale>(toUiLocale(preferredLocale));

  const initials =
    ((firstName[0] ?? '') + (lastName[0] ?? '')).toUpperCase() || name.slice(0, 2).toUpperCase();
  const reset = () => {
    setFn(firstName);
    setLn(lastName);
    setLocale(toUiLocale(preferredLocale));
  };

  const tabBtn = (id: Tab, label: string, icon: React.ReactNode) => (
    <button
      type="button"
      onClick={() => setTab(id)}
      className={
        'relative flex items-center gap-2 px-3 py-3 text-[13.5px] font-medium transition-colors ' +
        (tab === id
          ? 'text-[var(--color-primary)] after:absolute after:inset-x-0 after:-bottom-px after:h-[2px] after:rounded-full after:bg-[var(--color-primary)] after:content-[""]'
          : 'text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]')
      }
    >
      <span className="h-[15px] w-[15px] [&>svg]:h-full [&>svg]:w-full">{icon}</span>
      {label}
    </button>
  );

  const fieldLabel =
    'mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--color-faint)]';
  const inputCls =
    'block w-full rounded-[10px] border border-[var(--color-border)] bg-[var(--color-surface-white)] px-3.5 py-2.5 text-[14px] text-[var(--color-foreground)] outline-none transition-colors focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/15';

  return (
    <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
      {/* ---- LEFT CARD ---- */}
      <aside className="h-fit rounded-[14px] border border-[var(--color-border)] bg-[var(--color-card)] p-6 shadow-[var(--shadow-sm)]">
        <div className="flex flex-col items-center text-center">
          <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-full bg-[var(--color-primary-soft)] text-[26px] font-semibold text-[var(--color-primary)]">
            {image ? <img src={image} alt="" className="h-full w-full object-cover" /> : initials}
          </div>
          <div className="mt-4 text-[17px] font-semibold text-[var(--color-foreground)]">
            {name}
          </div>
          <div className="text-[13px] text-[var(--color-faint)]">{email}</div>
          <div className="mt-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--color-primary)]">
            {roleLabel}
          </div>
        </div>

        <div className="my-5 h-px bg-[var(--color-border)]" />

        <div className="space-y-4 text-[13px]">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--color-faint)]">
              {t('card.lastLogin')}
            </div>
            <div className="mt-1 text-[var(--color-foreground)]">{lastLogin}</div>
          </div>
          <div className="flex items-center justify-between">
            <div className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--color-faint)]">
              {t('card.status')}
            </div>
            <span
              className={
                'rounded-full px-2.5 py-0.5 text-[11px] font-semibold ' +
                (isActive
                  ? 'bg-[var(--color-success-soft)] text-[var(--color-success)]'
                  : 'bg-[var(--color-muted)] text-[var(--color-muted-foreground)]')
              }
            >
              {isActive ? t('card.active') : t('card.inactive')}
            </span>
          </div>
        </div>
      </aside>

      {/* ---- RIGHT PANEL ---- */}
      <section className="rounded-[14px] border border-[var(--color-border)] bg-[var(--color-card)] shadow-[var(--shadow-sm)]">
        <div className="flex gap-1 border-b border-[var(--color-border)] px-4">
          {tabBtn(
            'infos',
            t('tabs.infos'),
            <svg viewBox="0 0 24 24" {...s}>
              <circle cx="12" cy="8" r="4" />
              <path d="M4 21c0-4 3.5-6 8-6s8 2 8 6" />
            </svg>,
          )}
          {tabBtn(
            'securite',
            t('tabs.security'),
            <svg viewBox="0 0 24 24" {...s}>
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>,
          )}
          {tabBtn(
            'prefs',
            t('tabs.preferences'),
            <svg viewBox="0 0 24 24" {...s}>
              <line x1="4" y1="21" x2="4" y2="14" />
              <line x1="4" y1="10" x2="4" y2="3" />
              <line x1="12" y1="21" x2="12" y2="12" />
              <line x1="12" y1="8" x2="12" y2="3" />
              <line x1="20" y1="21" x2="20" y2="16" />
              <line x1="20" y1="12" x2="20" y2="3" />
              <line x1="1" y1="14" x2="7" y2="14" />
              <line x1="9" y1="8" x2="15" y2="8" />
              <line x1="17" y1="16" x2="23" y2="16" />
            </svg>,
          )}
        </div>

        <form action={updateAction} className="p-6">
          {/* hidden submitted fields (always in DOM regardless of active tab) */}
          <input type="hidden" name="name" value={`${fn} ${ln}`.trim()} />
          <input type="hidden" name="preferredLocale" value={locale} />

          {/* INFORMATIONS */}
          <div className={tab === 'infos' ? 'space-y-5' : 'hidden'}>
            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <label className={fieldLabel}>{t('infos.firstName')}</label>
                <input value={fn} onChange={(e) => setFn(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={fieldLabel}>{t('infos.lastName')}</label>
                <input value={ln} onChange={(e) => setLn(e.target.value)} className={inputCls} />
              </div>
            </div>
            <div>
              <label className={fieldLabel}>{t('infos.email')}</label>
              <input
                value={email}
                readOnly
                className={
                  inputCls + ' bg-[var(--color-surface-2)] text-[var(--color-muted-foreground)]'
                }
              />
              <p className="mt-1.5 text-[12px] text-[var(--color-faint)]">{t('infos.emailHelp')}</p>
            </div>
          </div>

          {/* SÉCURITÉ */}
          <div className={tab === 'securite' ? 'space-y-4' : 'hidden'}>
            <div>
              <label className={fieldLabel}>{t('security.passwordLabel')}</label>
              <a
                href={changePasswordHref}
                className="inline-flex items-center gap-2 rounded-[10px] border border-[var(--color-border)] px-3.5 py-2.5 text-[13.5px] font-medium text-[var(--color-foreground)] transition-colors hover:bg-[var(--color-surface-2)]"
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4" {...s}>
                  <circle cx="8" cy="15" r="4" />
                  <path d="M10.8 12.2 20 3M16 6l3 3M14 8l2 2" />
                </svg>
                {t('security.resetPassword')}
              </a>
            </div>
            <p className="text-[12px] text-[var(--color-faint)]">
              {t('security.lastLoginAt', { date: lastLogin })}
            </p>
          </div>

          {/* PRÉFÉRENCES */}
          <div className={tab === 'prefs' ? 'space-y-6' : 'hidden'}>
            <div>
              <label className={fieldLabel}>{t('preferences.languageLabel')}</label>
              <div className="inline-flex rounded-[12px] border border-[var(--color-border)] bg-[var(--color-surface-2)] p-1">
                {[
                  { v: 'fr-FR' as const, code: 'FR', label: 'Français' },
                  { v: 'en-US' as const, code: 'EN', label: 'English' },
                  { v: 'zh-CN' as const, code: 'CN', label: '中文' },
                ].map((o) => (
                  <button
                    key={o.v}
                    type="button"
                    onClick={() => setLocale(o.v)}
                    className={
                      'flex items-center gap-1.5 rounded-[9px] px-3 py-1.5 text-[13px] font-medium transition-colors ' +
                      (locale === o.v
                        ? 'bg-[var(--color-surface-white)] text-[var(--color-foreground)] shadow-[var(--shadow-xs)]'
                        : 'text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]')
                    }
                  >
                    <span className="text-[10px] font-semibold text-[var(--color-faint)]">
                      {o.code}
                    </span>
                    {o.label}
                  </button>
                ))}
              </div>
              <p className="mt-1.5 text-[12px] text-[var(--color-faint)]">
                {t('preferences.languageHelp')}
              </p>
            </div>
            <div className="max-w-sm">
              <label className={fieldLabel}>{t('preferences.timezoneLabel')}</label>
              <select
                name="preferredTimezone"
                defaultValue={preferredTimezone}
                className={inputCls}
              >
                {timezones.map((tz) => (
                  <option key={tz} value={tz}>
                    {tz}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* actions */}
          <div className="mt-7 flex items-center justify-end gap-2 border-t border-[var(--color-border)] pt-5">
            <button
              type="button"
              onClick={reset}
              className="rounded-[10px] border border-[var(--color-border)] px-4 py-2 text-[13.5px] font-medium text-[var(--color-muted-foreground)] transition-colors hover:bg-[var(--color-surface-2)]"
            >
              {tCommon('cancel')}
            </button>
            <button
              type="submit"
              className="rounded-[10px] bg-[var(--color-primary)] px-4 py-2 text-[13.5px] font-semibold text-[var(--color-primary-foreground)] transition-colors hover:bg-[var(--color-primary-hover)]"
            >
              {tCommon('save')}
            </button>
          </div>
        </form>

        {/* SESSION (separate form — cannot nest forms) */}
        <div className="border-t border-[var(--color-border)] px-6 py-5">
          <div className={fieldLabel}>{t('session.title')}</div>
          <p className="mb-3 text-[12px] text-[var(--color-faint)]">{t('session.help')}</p>
          <form action={logoutAction}>
            <button
              type="submit"
              className="flex w-full items-center justify-center gap-2 rounded-[10px] border border-[var(--color-border)] px-4 py-2.5 text-[13.5px] font-medium text-[var(--color-destructive)] transition-colors hover:bg-[var(--color-destructive-soft)]"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" {...s}>
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
              {t('session.logout')}
            </button>
          </form>
        </div>
      </section>
    </div>
  );
}
