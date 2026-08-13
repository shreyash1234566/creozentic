import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { creozenticPrisma?: PrismaClient };

export const db =
  globalForPrisma.creozenticPrisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.creozenticPrisma = db;
