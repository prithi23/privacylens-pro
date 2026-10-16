import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
export function createDatabase(connectionString: string) {
  return new PrismaClient({
    adapter: new PrismaPg({
      connectionString,
      connectionTimeoutMillis: 3000,
      statement_timeout: 10000,
      max: 10,
    }),
  });
}
