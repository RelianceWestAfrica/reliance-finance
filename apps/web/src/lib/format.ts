// Helpers de formatage conformes localisation africaine (cadre normatif).

const DEFAULT_LOCALE = 'fr-FR';

export function formatCurrency(
  amount: number | bigint | { toString(): string },
  currency: string = 'XOF',
  locale: string = DEFAULT_LOCALE,
): string {
  const value = typeof amount === 'object' ? Number(amount.toString()) : Number(amount);
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    currencyDisplay: 'symbol',
    minimumFractionDigits: currency === 'XOF' || currency === 'XAF' ? 0 : 2,
  }).format(value);
}

export function formatNumber(
  value: number | bigint,
  locale: string = DEFAULT_LOCALE,
): string {
  return new Intl.NumberFormat(locale).format(value);
}

export function formatDate(
  date: Date | string,
  timezone: string = 'Africa/Lome',
  locale: string = DEFAULT_LOCALE,
): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat(locale, {
    timeZone: timezone,
    dateStyle: 'long',
  }).format(d);
}

export function formatDateTime(
  date: Date | string,
  timezone: string = 'Africa/Lome',
  locale: string = DEFAULT_LOCALE,
): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat(locale, {
    timeZone: timezone,
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(d);
}
