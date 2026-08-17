import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { creozenticPrisma?: PrismaClient };
const connectionString = process.env.DATABASE_URL ?? "postgresql://localhost:5432/creozentic";

const adapter = new PrismaPg({ connectionString });
export const db =
  globalForPrisma.creozenticPrisma ??
  new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.creozenticPrisma = db;
