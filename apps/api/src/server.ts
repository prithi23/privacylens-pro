import { createApp } from './app.js';
import { loadEnv } from './config/env.js';
import { createDatabase } from './repositories/database.js';
const env = loadEnv();
const db = env.DATABASE_URL ? createDatabase(env.DATABASE_URL) : undefined;
const app = createApp({
  origins: env.origins,
  db,
  production: env.NODE_ENV === 'production',
  sessionHours: env.SESSION_TTL_HOURS,
  trustedProxies: env.trustedProxies,
  databaseReady: async () => {
    if (!db) throw new Error('Database is not configured');
    await db.$queryRaw`SELECT 1`;
  },
});
const server = app.listen(env.PORT, env.HOST, () =>
  console.info(
    JSON.stringify({
      event: 'listening',
      host: env.HOST,
      port: env.PORT,
      phase: db ? 3 : 1,
    }),
  ),
);
let stopping = false;
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () => {
    if (stopping) return;
    stopping = true;
    setTimeout(() => process.exit(1), 15000).unref();
    server.close(() => {
      void (async () => {
        await db?.$disconnect();
        process.exit(0);
      })();
    });
  });
