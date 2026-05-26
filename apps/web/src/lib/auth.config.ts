// =============================================================================
// NextAuth v5 - Configuration de base (Edge-compatible)
// =============================================================================
// Ce fichier contient UNIQUEMENT la config edge-safe (pas d'adapter Prisma,
// pas d'argon2). Utilise par le middleware Next.js pour les checks d'auth.
// La config complete avec adapter et providers vit dans auth.ts (Node only).
// =============================================================================

import type { NextAuthConfig } from 'next-auth';

declare module 'next-auth/jwt' {
  interface JWT {
    userId?: string;
    email?: string;
    image?: string | null;
  }
}

// Portail SSO RWA Core — c'est lui qui héberge les avatars sous /avatars/{sub}.{ext}.
// Keycloak distribue le `picture` claim sous forme d'URL relative ; chaque app
// métier doit la préfixer avec l'origine du portail sinon le browser tape
// `finances.rwa-core.com/avatars/...` et reçoit un 404.
const PORTAL_ORIGIN = process.env.PORTAL_PUBLIC_URL ?? 'https://portal.rwa-core.com';
function absolutizeAvatar(p: string | null | undefined): string | null {
  if (!p) return null;
  if (/^https?:\/\//i.test(p)) return p;
  try {
    return new URL(p, PORTAL_ORIGIN).toString();
  } catch {
    return null;
  }
}

export const authConfig: NextAuthConfig = {
  pages: {
    signIn: '/login',
    verifyRequest: '/verify-request',
    error: '/login',
  },
  session: {
    strategy: 'jwt',
    maxAge: Number(process.env.AUTH_SESSION_MAX_AGE_SECONDS ?? 900),
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        if (typeof user.id === 'string') {
          token.userId = user.id;
        }
        if (typeof user.email === 'string') {
          token.email = user.email;
        }
        // Avatar — propagé depuis le `picture` claim Keycloak (mappé par NextAuth
        // en `user.image`) OU depuis la colonne Prisma `User.image` pour les
        // connexions locales. Préfixé avec l'origine du portail si relatif.
        if (typeof user.image === 'string' || user.image === null) {
          token.image = absolutizeAvatar(user.image ?? null);
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (token && session.user) {
        if (typeof token.userId === 'string') {
          session.user.id = token.userId;
        }
        if (typeof token.email === 'string') {
          session.user.email = token.email;
        }
        // Avatar — disponible côté client via useSession().data.user.image,
        // côté serveur via auth().user.image.
        if (typeof token.image === 'string' || token.image === null) {
          session.user.image = token.image ?? null;
        }
      }
      return session;
    },
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const isOnApp = nextUrl.pathname.startsWith('/dashboard') ||
        nextUrl.pathname.startsWith('/expense-requests') ||
        nextUrl.pathname.startsWith('/purchase-orders') ||
        nextUrl.pathname.startsWith('/receptions') ||
        nextUrl.pathname.startsWith('/invoices') ||
        nextUrl.pathname.startsWith('/payments') ||
        nextUrl.pathname.startsWith('/suppliers') ||
        nextUrl.pathname.startsWith('/settings');

      if (isOnApp) {
        return isLoggedIn;
      }
      if (isLoggedIn && (nextUrl.pathname === '/login' || nextUrl.pathname === '/')) {
        return Response.redirect(new URL('/dashboard', nextUrl));
      }
      return true;
    },
  },
  providers: [],
};
