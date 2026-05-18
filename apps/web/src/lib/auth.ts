// =============================================================================
// NextAuth v5 - Configuration complete (Node runtime, server only)
// =============================================================================

import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import EmailProvider from 'next-auth/providers/nodemailer';
import { PrismaAdapter } from '@auth/prisma-adapter';
import argon2 from 'argon2';
import { z } from 'zod';

import { prisma } from '@reliance-finance/database';
import { authConfig } from './auth.config';

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: PrismaAdapter(prisma),
  providers: [
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
  ],
});
