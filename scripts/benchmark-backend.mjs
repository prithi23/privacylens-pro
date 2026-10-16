import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { relative, resolve } from 'node:path';
import { randomUUID, randomBytes, createHash } from 'node:crypto';
import dotenv from 'dotenv';
import { getTestDatabaseUrl } from '../apps/api/src/config/test-database.ts';
const root = fileURLToPath(new URL('../', import.meta.url));
dotenv.config({ path: `${root}/.env`, quiet: true });
const testUrl = getTestDatabaseUrl();
await mkdir(`${root}/.browser-smoke`, { recursive: true });
const shared = {
  name: 'shared-source',
  setup(builder) {
    builder.onResolve(
      { filter: /^@privacylens\/shared(?:\/[\w-]+)?$/ },
      (args) => ({
        path: resolve(
          root,
          `packages/shared/src/${args.path.includes('/shared/') ? args.path.split('/').at(-1) : 'index'}.ts`,
        ),
      }),
    );
  },
};
const baseline = {
  name: 'phase5-checkpoint',
  setup(builder) {
    builder.onLoad({ filter: /\.ts$/ }, (args) => {
      const path = relative(root, args.path).replaceAll('\\', '/');
      if (
        !path.startsWith('apps/api/src/') &&
        !path.startsWith('packages/shared/src/')
      )
        return;
      return {
        contents: execFileSync(
          'git',
          [
            '-c',
            `safe.directory=${resolve(root).replaceAll('\\', '/')}`,
            'show',
            `a97e5e0:${path}`,
          ],
          { cwd: root, encoding: 'utf8', windowsHide: true },
        ),
        loader: 'ts',
      };
    });
  },
};
for (const version of ['baseline', 'current'])
  await build({
    stdin: {
      contents:
        "export {createApp} from './apps/api/src/app.ts'; export {createDatabase} from './apps/api/src/repositories/database.ts';",
      resolveDir: root,
    },
    outfile: `${root}/.browser-smoke/backend-${version}.mjs`,
    bundle: true,
    packages: 'external',
    platform: 'node',
    format: 'esm',
    plugins: [shared, ...(version === 'baseline' ? [baseline] : [])],
  });
const old = await import(
  pathToFileURL(`${root}/.browser-smoke/backend-baseline.mjs`).href
);
const current = await import(
  pathToFileURL(`${root}/.browser-smoke/backend-current.mjs`).href
);
const db = current.createDatabase(testUrl),
  application = current.createDatabase(process.env.DATABASE_URL);
const counts = () =>
  Promise.all([
    application.user.count(),
    application.scan.count(),
    application.session.count(),
    application.finding.count(),
    application.device.count(),
    application.pairingCode.count(),
  ]);
let appBaseline,
  actor,
  createdIndex = false;
const servers = [];
const stats = (samples) => {
  const sorted = [...samples].sort((a, b) => a - b);
  return {
    medianMs: sorted[Math.floor(sorted.length / 2)],
    p95Ms: sorted[Math.ceil(sorted.length * 0.95) - 1],
    samples: sorted.length,
  };
};
async function measure(operation) {
  for (let i = 0; i < 3; i++) await operation();
  const values = [];
  for (let i = 0; i < 20; i++) {
    const start = performance.now();
    await operation();
    values.push(performance.now() - start);
  }
  return stats(values);
}
try {
  const identities = await Promise.all(
    [application, db].map(
      (client) => client.$queryRaw`SELECT current_database() AS name`,
    ),
  );
  if (
    identities[0][0].name === identities[1][0].name ||
    identities[1][0].name !==
      decodeURIComponent(new URL(testUrl).pathname.slice(1))
  )
    throw Error('Unsafe benchmark database identity');
  appBaseline = await counts();
  const token = randomBytes(32).toString('base64url');
  actor = await db.user.create({
    data: {
      email: `bench-${randomUUID()}@example.test`,
      passwordHash: 'unused-test-fixture',
      preference: { create: { syncEnabled: false, retentionDays: 30 } },
      sessions: {
        create: {
          tokenHash: createHash('sha256').update(token).digest('hex'),
          expiresAt: new Date(Date.now() + 3600000),
        },
      },
    },
  });
  const now = Date.now();
  await db.scan.createMany({
    data: Array.from({ length: 2000 }, (_, index) => ({
      userId: actor.id,
      hostname: index % 2 ? 'example.com' : 'other.example.net',
      privacyScore: 80,
      concernLevel: 'low',
      httpsStatus: 'https',
      thirdPartyDomainCount: 1,
      trackerMatchCount: 0,
      scannedAt: new Date(now - index * 1000),
    })),
  });
  const cutoff = new Date(now - 86400000);
  const query = () =>
    db.$queryRaw`SELECT id,hostname,"privacyScore","scannedAt" FROM "Scan" WHERE "userId"=${actor.id} AND "scannedAt">=${cutoff} ORDER BY "scannedAt" DESC,id ASC LIMIT 20`;
  const plan = () =>
    db.$queryRaw`EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) SELECT id,hostname,"privacyScore","scannedAt" FROM "Scan" WHERE "userId"=${actor.id} AND "scannedAt">=${cutoff} ORDER BY "scannedAt" DESC,id ASC LIMIT 20`;
  const before = { latency: await measure(query), plan: await plan() };
  const exists =
    await db.$queryRaw`SELECT to_regclass('public.research_bench_history_idx')::text AS present`;
  if (exists[0].present)
    throw Error('Benchmark index already exists; refusing to replace it');
  await db.$executeRaw`CREATE INDEX research_bench_history_idx ON "Scan" ("userId","scannedAt" DESC,id ASC)`;
  createdIndex = true;
  const after = { latency: await measure(query), plan: await plan() };
  const http = {};
  for (const [name, module] of [
    ['baseline', old],
    ['current', current],
  ]) {
    const server = module
      .createApp({
        db,
        origins: ['http://localhost:5173'],
        databaseReady: async () => {
          await db.$queryRaw`SELECT 1`;
        },
      })
      .listen(0, '127.0.0.1');
    servers.push(server);
    await new Promise((done) => server.on('listening', done));
    const base = `http://127.0.0.1:${server.address().port}/api/v1`;
    http[name] = {};
    for (const path of ['/health', '/scans?limit=20', '/analytics/overview'])
      http[name][path] = await measure(async () => {
        const response = await fetch(`${base}${path}`, {
          headers: { Cookie: `privacylens_session=${token}` },
        });
        if (!response.ok)
          throw Error(`Benchmark HTTP failed: ${response.status}`);
        await response.json();
      });
  }
  const report = {
    measuredAt: new Date().toISOString(),
    runtime: process.version,
    scope:
      'Actual test PostgreSQL, 2000 owned fixture scans, serial loopback HTTP, 3 warmups/20 samples. Auth uses a real DB session fixture; no login benchmark. Baseline is a97e5e0; current includes new metadata/analytics. Timing variance and changed responses prevent causal attribution.',
    postgres: {
      before,
      after,
      index:
        'temporary identical-order composite index; removed after experiment',
    },
    http,
  };
  await mkdir(`${root}/docs/research`, { recursive: true });
  await writeFile(
    `${root}/docs/research/backend-performance.json`,
    `${JSON.stringify(report, null, 2)}\n`,
  );
  console.log(
    JSON.stringify(
      { postgresBefore: before.latency, postgresAfter: after.latency, http },
      null,
      2,
    ),
  );
} catch (error) {
  console.error(
    JSON.stringify({
      error: 'BENCHMARK_FAILED',
      code:
        typeof error.code === 'string' ? error.code : 'LOCAL_BENCHMARK_ERROR',
      message:
        'Raw database diagnostics withheld. Verify separate database setup and the local baseline checkpoint.',
    }),
  );
  process.exitCode = 1;
} finally {
  for (const server of servers) await new Promise((done) => server.close(done));
  try {
    if (createdIndex)
      await db.$executeRaw`DROP INDEX research_bench_history_idx`;
    if (actor) await db.user.delete({ where: { id: actor.id } });
    if (
      appBaseline &&
      JSON.stringify(await counts()) !== JSON.stringify(appBaseline)
    ) {
      console.error('Application baseline counts changed; benchmark failed.');
      process.exitCode = 1;
    }
  } finally {
    await Promise.all([db.$disconnect(), application.$disconnect()]);
  }
}
