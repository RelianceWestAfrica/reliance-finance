import { PrismaClient } from './generated/client/index.js';

declare global {
  // eslint-disable-next-line no-var
  var __relianceFinancePrisma: PrismaClient | undefined;
}

const createPrismaClient = (): PrismaClient =>
  new PrismaClient({
    log:
      process.env.NODE_ENV === 'development'
        ? ['query', 'error', 'warn']
        : ['error', 'warn'],
  });

export const prisma: PrismaClient =
  globalThis.__relianceFinancePrisma ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalThis.__relianceFinancePrisma = prisma;
}

export * from './generated/client/index.js';
export { Prisma } from './generated/client/index.js';
