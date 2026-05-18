// =============================================================================
// NextAuth v5 - Configuration de base (Edge-compatible)
// =============================================================================
// Ce fichier contient UNIQUEMENT la config edge-safe (pas d'adapter Prisma,
// pas d'argon2). Utilise par le middleware Next.js pour les checks d'auth.
// La config complete avec adapter et providers vit dans auth.ts (Node only).
// =============================================================================

import type { NextAuthConfig } from 'next-auth';

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
