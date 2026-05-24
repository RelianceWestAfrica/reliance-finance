// =============================================================================
// NextAuth v5 - Configuration complete (Node runtime, server only)
// =============================================================================

import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import EmailProvider from 'next-auth/providers/nodemailer';
import Keycloak from 'next-auth/providers/keycloak';
import { PrismaAdapter } from '@auth/prisma-adapter';
import argon2 from 'argon2';
import { z } from 'zod';

import { prisma } from '@reliance-finance/database';
import { authConfig } from './auth.config';
import { appendAudit, AuditAction } from './audit/log';

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
});

// Connexion locale (email/mot de passe + lien magique) DÉSACTIVÉE par défaut :
// le portail SSO RWA Core (Keycloak) est l'unique point d'entrée. Réactivable
// en secours (panne portail) via LOCAL_LOGIN_ENABLED=true, sans changement de
// code — même convention que les autres plateformes RWA (cf. domains).
// Filet anti-lockout : si le SSO n'est pas configuré (vars Keycloak absentes),
// le login local reste actif pour ne jamais verrouiller totalement l'app.
const keycloakConfigured = Boolean(
  process.env.KEYCLOAK_ISSUER && process.env.KEYCLOAK_ID && process.env.KEYCLOAK_SECRET,
);
export const localLoginEnabled =
  process.env.LOCAL_LOGIN_ENABLED === 'true' || !keycloakConfigured;

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: PrismaAdapter(prisma),
  providers: [
    ...(localLoginEnabled
      ? [
          Credentials({
            name: 'Mot de passe',
            credentials: {
              email: { label: 'Email', type: 'email' },
              password: { label: 'Mot de passe', type: 'password' },
            },
            async authorize(credentials) {
        const parsed = credentialsSchema.safeParse(credentials);
        if (!parsed.success) {
          return null;
        }
        const { email, password } = parsed.data;

        const user = await prisma.user.findUnique({
          where: { email: email.toLowerCase().trim() },
          select: {
            id: true,
            email: true,
            name: true,
            image: true,
            hashedPassword: true,
            isActive: true,
          },
        });

        if (!user || !user.isActive || !user.hashedPassword) {
          return null;
        }

        const valid = await argon2.verify(user.hashedPassword, password);
        if (!valid) {
          await appendAudit({
            entityType: 'User',
            entityId: user.id,
            action: AuditAction.LOGIN_FAILURE,
            actorId: user.id,
            payload: { reason: 'INVALID_PASSWORD', email: user.email },
          }).catch(() => undefined);
          return null;
        }

        await prisma.user.update({
          where: { id: user.id },
          data: { lastLoginAt: new Date() },
        });

        return {
          id: user.id,
          email: user.email,
          name: user.name ?? undefined,
          image: user.image ?? undefined,
        };
      },
    }),
    EmailProvider({
      server: {
        host: process.env.EMAIL_SERVER_HOST,
        port: Number(process.env.EMAIL_SERVER_PORT ?? 1025),
        auth: process.env.EMAIL_SERVER_USER
          ? {
              user: process.env.EMAIL_SERVER_USER,
              pass: process.env.EMAIL_SERVER_PASSWORD,
            }
          : undefined,
      },
            from: process.env.EMAIL_FROM ?? 'no-reply@reliancewestafrica.com',
            maxAge: 15 * 60, // 15 minutes
          }),
        ]
      : []),
    // SSO RWA Core (Keycloak) — point d'entrée unique en fonctionnement normal.
    ...(process.env.KEYCLOAK_ID && process.env.KEYCLOAK_SECRET && process.env.KEYCLOAK_ISSUER
      ? [
          Keycloak({
            clientId: process.env.KEYCLOAK_ID,
            clientSecret: process.env.KEYCLOAK_SECRET,
            issuer: process.env.KEYCLOAK_ISSUER,
            // Lie la connexion SSO au compte Finances existant (meme email)
            allowDangerousEmailAccountLinking: true,
          }),
        ]
      : []),
  ],
  callbacks: {
    ...authConfig.callbacks,
    // Garde d'acces SSO : seuls les comptes Finances existants et actifs
    // (avec au moins un role actif) peuvent entrer via Keycloak.
    async signIn({ user, account }) {
      if (account?.provider === 'keycloak') {
        const email = user?.email?.toLowerCase().trim();
        if (!email) return false;
        const existing = await prisma.user.findUnique({
          where: { email },
          select: { id: true, isActive: true },
        });
        if (!existing || !existing.isActive) return false;
        const activeMemberships = await prisma.membership.count({
          where: { userId: existing.id, isActive: true },
        });
        if (activeMemberships === 0) return false;
      }
      return true;
    },
  },
  events: {
    async signIn({ user, account, isNewUser }) {
      if (!user?.id) return;
      await appendAudit({
        entityType: 'User',
        entityId: user.id,
        action: AuditAction.LOGIN_SUCCESS,
        actorId: user.id,
        payload: {
          provider: account?.provider ?? 'unknown',
          isNewUser: Boolean(isNewUser),
          email: user.email ?? null,
        },
      }).catch(() => undefined);
    },
    async signOut(message) {
      const userId =
        'token' in message ? message.token?.userId : message.session?.userId;
      if (typeof userId !== 'string') return;
      await appendAudit({
        entityType: 'User',
        entityId: userId,
        action: AuditAction.LOGOUT,
        actorId: userId,
        payload: {},
      }).catch(() => undefined);
    },
  },
});
