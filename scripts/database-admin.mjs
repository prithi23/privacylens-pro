import { config } from 'dotenv';
import { Client } from 'pg';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { getTestDatabaseUrl } from '../apps/api/src/config/test-database.ts';
config({
  path: fileURLToPath(new URL('../.env', import.meta.url)),
  quiet: true,
});
const [operation = 'inspect', target = 'application'] = process.argv.slice(2);
const allowed = ['migrate', 'seed', 'inspect', 'status'];
if (!allowed.includes(operation) || !['application', 'test'].includes(target))
  throw new Error('Unsupported database operation or target.');
const testUrl = getTestDatabaseUrl();
const urls = [process.env.DATABASE_URL, testUrl];
const clients = urls.map(
  (connectionString) =>
    new Client({ connectionString, connectionTimeoutMillis: 5000 }),
);
try {
  await Promise.all(clients.map((client) => client.connect()));
  const identities = await Promise.all(
    clients.map(
      async (client) =>
        (
          await client.query(
            'SELECT current_database() AS name, inet_server_addr()::text AS address, inet_server_port() AS port',
          )
        ).rows[0],
    ),
  );
  if (
    identities[0].name === identities[1].name &&
    identities[0].address === identities[1].address &&
    identities[0].port === identities[1].port
  )
    throw new Error('UNSAFE_TARGET');
  if (
    identities.some(
      (identity, index) =>
        identity.name !==
        decodeURIComponent(new URL(urls[index]).pathname.slice(1)),
    )
  )
    throw new Error('DATABASE_ALIAS_MISMATCH');
  const index = target === 'test' ? 1 : 0;
  if (operation !== 'inspect') {
    const args =
      operation === 'migrate'
        ? ['migrate', 'deploy']
        : operation === 'seed'
          ? ['db', 'seed']
          : ['migrate', 'status'];
    const cli = join(
      dirname(createRequire(import.meta.url).resolve('prisma/package.json')),
      'build/index.js',
    );
    const command = spawnSync(process.execPath, [cli, ...args], {
      cwd: fileURLToPath(new URL('../apps/api/', import.meta.url)),
      env: { ...process.env, DATABASE_URL: urls[index] },
      encoding: 'utf8',
      windowsHide: true,
    });
    if (command.status !== 0) {
      const code =
        `${command.stderr ?? ''} ${command.stdout ?? ''}`.match(
          /\bP\d{4}\b/,
        )?.[0] ?? 'PRISMA_COMMAND_FAILED';
      const diagnostic =
        `${command.stderr ?? ''} ${command.stdout ?? ''}`.match(
          /Access is denied|EACCES|EPERM|uv_os_get_passwd|ENOMEM|ERR_MODULE_NOT_FOUND|Cannot find module|Could not resolve/,
        )?.[0] ?? 'No safe diagnostic available';
      console.error(
        JSON.stringify({
          operation,
          target,
          code,
          diagnostic,
          message:
            'Operation failed; raw output withheld to protect credentials.',
        }),
      );
      process.exitCode = 1;
    } else
      console.info(
        JSON.stringify({
          operation,
          target,
          database: identities[index].name,
          status: 'success',
        }),
      );
  }
  if (operation === 'inspect') {
    for (let i = 0; i < clients.length; i++) {
      const tables = (
        await clients[i].query(
          "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename",
        )
      ).rows.map((row) => row.tablename);
      const indexes = (
        await clients[i].query(
          "SELECT indexname FROM pg_indexes WHERE schemaname = 'public' ORDER BY indexname",
        )
      ).rows.map((row) => row.indexname);
      const foreignKeys = (
        await clients[i].query(
          "SELECT count(*)::int AS count FROM information_schema.table_constraints WHERE constraint_schema = 'public' AND constraint_type = 'FOREIGN KEY'",
        )
      ).rows[0].count;
      const checks = (
        await clients[i].query(
          "SELECT c.conname FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace WHERE n.nspname = 'public' AND c.contype = 'c' ORDER BY c.conname",
        )
      ).rows.map((row) => row.conname);
      const migrations = tables.includes('_prisma_migrations')
        ? (
            await clients[i].query(
              'SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY migration_name',
            )
          ).rows.map((row) => row.migration_name)
        : [];
      const counts = tables.includes('TrackerProvider')
        ? (
            await clients[i].query(
              'SELECT (SELECT count(*)::int FROM "TrackerProvider") AS providers, (SELECT count(*)::int FROM "TrackerDomain") AS domains, (SELECT count(*)::int FROM "User") AS users, (SELECT count(*)::int FROM "Scan") AS scans',
            )
          ).rows[0]
        : {};
      console.info(
        JSON.stringify({
          target: i ? 'test' : 'application',
          database: identities[i].name,
          tables,
          indexes,
          foreignKeys,
          checks,
          migrations,
          counts,
        }),
      );
    }
  }
} catch (error) {
  console.error(
    JSON.stringify({
      operation,
      target,
      code: typeof error.code === 'string' ? error.code : 'PREFLIGHT_FAILED',
      message: ['UNSAFE_TARGET', 'DATABASE_ALIAS_MISMATCH'].includes(
        error.message,
      )
        ? error.message
        : 'Operation stopped; connection/query details withheld to protect credentials.',
    }),
  );
  process.exitCode = 1;
} finally {
  await Promise.allSettled(clients.map((client) => client.end()));
}
