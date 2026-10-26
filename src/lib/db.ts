import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

// Shared by Next.js code and the custom server. Cached on globalThis because
// the two load separate copies of this module in the same process (and dev
// hot reloads re-evaluate it): one connection pool for everything.
// Must not import "server-only": the custom server runs outside React Server.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createPrismaClient() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  return new PrismaClient({ adapter });
}

export const db = (globalForPrisma.prisma ??= createPrismaClient());
