import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function extractPgUrl(): string {
  const raw = process.env.DATABASE_URL || "";
  // Extract the api_key from prisma+postgres:// URL
  const match = raw.match(/api_key=([^&]+)/);
  if (!match) return raw;
  try {
    const decoded = Buffer.from(match[1], "base64").toString("utf-8");
    const config = JSON.parse(decoded);
    // Use the main database URL, replace template1 with postgres
    return (config.databaseUrl as string).replace("/template1", "/postgres");
  } catch {
    return raw.replace("prisma+postgres://", "postgres://");
  }
}

function createPrismaClient() {
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString: extractPgUrl() }),
  });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
