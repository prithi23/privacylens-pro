import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'prisma/config';
config({
  path: fileURLToPath(new URL('../../.env', import.meta.url)),
  quiet: true,
});
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations', seed: 'tsx prisma/seed.ts' },
  // Generation and validation do not require a running database. Migrations do.
  datasource: {
    url:
      process.env.DATABASE_URL ??
      'postgresql://unconfigured:unconfigured@localhost:5432/privacylens',
  },
});
