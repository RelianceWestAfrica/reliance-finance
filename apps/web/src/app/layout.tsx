import type { Metadata } from 'next';
import { Outfit } from 'next/font/google';
import '@/styles/globals.css';

const outfit = Outfit({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700', '800'],
  variable: '--font-outfit',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Reliance Finance',
  description: 'Plateforme de gestion financiere Holding/Filiales/SPV - Reliance West Africa',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={outfit.variable}>
      <body>{children}</body>
    </html>
  );
}
