import type { Metadata } from 'next';
import { Outfit } from 'next/font/google';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages } from 'next-intl/server';

import { htmlLang, type Locale } from '@/i18n/locales';
import '@/styles/globals.css';

const outfit = Outfit({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700', '800'],
  variable: '--font-outfit',
  display: 'swap',
});

export const metadata: Metadata = {
  title: { default: 'RWA Finances', template: '%s · RWA Finances' },
  description: 'Plateforme de gestion financière Holding / Filiales / SPV — Reliance West Africa',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = (await getLocale()) as Locale;
  const messages = await getMessages();

  return (
    <html lang={htmlLang(locale)} data-app="finances" className={outfit.variable}>
      <body>
        <NextIntlClientProvider locale={locale} messages={messages}>
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
