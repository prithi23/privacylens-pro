import '../config/env.js';
import { getTestDatabaseUrl } from '../config/test-database.js';
import { createDatabase } from '../repositories/database.js';
const testUrl = getTestDatabaseUrl();
const clients = [
  createDatabase(process.env.DATABASE_URL!),
  createDatabase(testUrl),
];
try {
  const identities = await Promise.all(
    clients.map(
      (db) =>
        db.$queryRaw<
          { name: string; address: string; port: number }[]
        >`SELECT current_database() AS name, inet_server_addr()::text AS address, inet_server_port() AS port`,
    ),
  );
  const [application, test] = identities.map((rows) => rows[0]);
  if (
    test.name !== decodeURIComponent(new URL(testUrl).pathname.slice(1)) ||
    application.name !==
      decodeURIComponent(
        new URL(process.env.DATABASE_URL!).pathname.slice(1),
      ) ||
    (test.name === application.name &&
      test.address === application.address &&
      test.port === application.port)
  )
    throw new Error('UNSAFE');
} catch {
  throw new Error(
    'Integration database identity preflight failed. No tests may write. Run npm run db:check; verify separate application/test credentials and database identities.',
  );
} finally {
  await Promise.all(clients.map((client) => client.$disconnect()));
}
