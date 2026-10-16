import { config } from 'dotenv';
import { Client } from 'pg';
import { fileURLToPath } from 'node:url';
config({
  path: fileURLToPath(new URL('../.env', import.meta.url)),
  quiet: true,
});
const urls = [process.env.DATABASE_URL, process.env.TEST_DATABASE_URL];
if (urls.some((url) => !url))
  throw new Error('Configure DATABASE_URL and TEST_DATABASE_URL locally.');
const connections = [];
const identities = [];
try {
  for (let index = 0; index < urls.length; index++) {
    const client = new Client({
      connectionString: urls[index],
      connectionTimeoutMillis: 5000,
    });
    connections.push(client);
    try {
      await client.connect();
    } catch (error) {
      console.error(
        JSON.stringify({
          target: index ? 'test' : 'application',
          event: 'connection_rejected',
          code:
            typeof error.code === 'string' ? error.code : 'CONNECTION_FAILED',
          reason:
            error.code === '28P01'
              ? 'PostgreSQL rejected password authentication. No credentials are displayed.'
              : 'Connection failed; credentials are not displayed.',
        }),
      );
      process.exitCode = 1;
      continue;
    }
    const { rows } = await client.query(
      "SELECT current_database() AS database, current_setting('server_version') AS version, inet_server_addr()::text AS address, inet_server_port() AS port",
    );
    const tables = await client.query(
      "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename",
    );
    const identity = rows[0];
    console.info(
      JSON.stringify({
        target: index ? 'test' : 'application',
        database: identity.database,
        version: identity.version,
        tables: tables.rows.map((row) => row.tablename),
      }),
    );
    identities[index] = identity;
    if (index && identities[0]) {
      const app = identities[0];
      if (
        identity.database === app.database &&
        identity.address === app.address &&
        identity.port === app.port
      )
        throw new Error('UNSAFE_DATABASE_TARGETS');
      if (!/(^|_)test(_|$)/.test(identity.database))
        throw new Error('UNSAFE_TEST_NAME');
      console.info(
        'Verified distinct application and test database identities.',
      );
    }
  }
} catch (error) {
  console.error(
    JSON.stringify({
      event: 'database_check_failed',
      code: typeof error.code === 'string' ? error.code : 'CHECK_FAILED',
      reason: ['UNSAFE_DATABASE_TARGETS', 'UNSAFE_TEST_NAME'].includes(
        error.message,
      )
        ? error.message
        : 'Connection or query failed; credentials are not displayed.',
    }),
  );
  process.exitCode = 1;
} finally {
  await Promise.allSettled(connections.map((client) => client.end()));
}
