// ===================================================================
// Database Configuration — Singleton PrismaClient
// ===================================================================
// Exports a single PrismaClient instance used throughout the app.
// Includes query logging in development mode.
// ===================================================================

import { PrismaClient } from '@prisma/client';

/**
 * Singleton PrismaClient instance.
 *
 * In development we attach the client to `globalThis` so that
 * hot-reloads (ts-node-dev --respawn) don't create new connections
 * on every restart.
 */

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma: PrismaClient =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === 'development'
        ? ['query', 'info', 'warn', 'error']
        : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

export default prisma;
