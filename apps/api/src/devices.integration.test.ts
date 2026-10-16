import { beforeAll, afterAll, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createApp } from './app.js';
import { createDatabase } from './repositories/database.js';
import { getTestDatabaseUrl } from './config/test-database.js';
import { tokenHash } from './services/session.js';
const db = createDatabase(getTestDatabaseUrl());
const application = createDatabase(process.env.DATABASE_URL!);
const origin = 'http://localhost:5173';
const extensionOrigin = `chrome-extension://${'a'.repeat(32)}`;
let server: Server, base: string, baseline: number[];
const users: string[] = [];
const actors = [
  { cookie: '', id: '' },
  { cookie: '', id: '' },
];
let code = '',
  credential = '',
  deviceId = '',
  scanId = '';
const uploadId = randomUUID();
const scan = {
  hostname: 'example.com',
  privacyScore: 92,
  concernLevel: 'low',
  httpsStatus: 'https',
  trackerMatchCount: 1,
  thirdPartyDomainCount: 1,
  scannedAt: new Date().toISOString(),
  findings: [
    {
      category: 'analytics',
      severity: 'low',
      description: 'Untrusted client text',
      evidenceHostname: 'google-analytics.com',
    },
  ],
};
const counts = () =>
  Promise.all([
    application.user.count(),
    application.scan.count(),
    application.session.count(),
    application.device.count(),
    application.pairingCode.count(),
  ]);
async function call(
  path: string,
  method = 'GET',
  body?: unknown,
  auth = '',
  requestOrigin = origin,
) {
  const device = path.startsWith('/extension/');
  const response = await fetch(`${base}/api/v1${path}`, {
    method,
    headers: {
      Origin: requestOrigin,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(auth
        ? device
          ? { Authorization: `Bearer ${auth}` }
          : { Cookie: auth }
        : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await response.text();
  return {
    status: response.status,
    body: text ? JSON.parse(text) : null,
    response,
  };
}
const deviceCall = (
  path: string,
  method = 'GET',
  body?: unknown,
  token = credential,
) => call(`/extension${path}`, method, body, token, extensionOrigin);
beforeAll(async () => {
  baseline = await counts();
  server = createApp({
    db,
    origins: [origin],
    databaseReady: async () => {
      await db.$queryRaw`SELECT 1`;
    },
  }).listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.on('listening', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  for (const actor of actors) {
    const result = await call('/auth/register', 'POST', {
      email: `device-${randomUUID()}@example.test`,
      password: 'device-integration-password-123!',
    });
    expect(result.status).toBe(201);
    actor.id = result.body.user.id;
    users.push(actor.id);
    actor.cookie = result.response.headers.getSetCookie()[0].split(';')[0];
  }
});
afterAll(async () => {
  if (server)
    await new Promise<void>((resolve) => server.close(() => resolve()));
  try {
    if (users.length)
      await db.user.deleteMany({ where: { id: { in: users } } });
    if (baseline) expect(await counts()).toEqual(baseline);
  } finally {
    await Promise.all([db.$disconnect(), application.$disconnect()]);
  }
});
it('requires account authentication and existing CSRF protections for pairing-code issuance', async () => {
  expect((await call('/devices')).status).toBe(401);
  expect(
    (
      await call(
        '/devices/pairing-code',
        'POST',
        {},
        actors[0].cookie,
        'https://evil.example',
      )
    ).status,
  ).toBe(403);
  expect(
    (
      await call(
        '/devices/pairing-code',
        'POST',
        { userId: actors[1].id },
        actors[0].cookie,
      )
    ).status,
  ).toBe(400);
});
it('issues a five-minute high-entropy code and persists only its digest', async () => {
  const result = await call(
    '/devices/pairing-code',
    'POST',
    {},
    actors[0].cookie,
  );
  expect(result.status).toBe(201);
  code = result.body.code;
  expect(code).toMatch(/^[\w-]{22}$/);
  const stored = await db.pairingCode.findUniqueOrThrow({
    where: { codeHash: tokenHash(code) },
  });
  expect(stored.userId).toBe(actors[0].id);
  expect(stored.codeHash).not.toBe(code);
  expect(Date.parse(result.body.expiresAt) - Date.now()).toBeGreaterThan(
    290000,
  );
  expect(result.response.headers.get('cache-control')).toBe('no-store');
});
it('rejects website-origin pairing, malformed input and invalid codes', async () => {
  expect(
    (
      await call(
        '/extension/pair',
        'POST',
        { code, displayName: 'Test extension' },
        '',
        origin,
      )
    ).status,
  ).toBe(403);
  expect(
    (
      await deviceCall(
        '/pair',
        'POST',
        { code, displayName: '', userId: actors[1].id },
        '',
      )
    ).status,
  ).toBe(400);
  expect(
    (
      await deviceCall(
        '/pair',
        'POST',
        { code: 'x'.repeat(22), displayName: 'Test extension' },
        '',
      )
    ).body.error.code,
  ).toBe('PAIRING_INVALID');
});
it('atomically consumes a pairing code exactly once under concurrent redemption', async () => {
  const results = await Promise.all(
    [1, 2].map(() =>
      deviceCall('/pair', 'POST', { code, displayName: 'Test Chrome' }, ''),
    ),
  );
  expect(results.map((result) => result.status).sort()).toEqual([201, 400]);
  const paired = results.find((result) => result.status === 201)!;
  credential = paired.body.credential;
  deviceId = paired.body.device.id;
  expect(paired.body.storageEnabled).toBe(false);
  expect(credential).toMatch(/^pld_[\w-]{43}$/);
  expect(paired.response.headers.get('set-cookie')).toBeNull();
  expect(
    paired.response.headers.get('access-control-allow-credentials'),
  ).toBeNull();
  expect(
    (await db.device.findUniqueOrThrow({ where: { id: deviceId } }))
      .credentialHash,
  ).toBe(tokenHash(credential));
  expect(
    (await deviceCall('/pair', 'POST', { code, displayName: 'Replay' }, ''))
      .status,
  ).toBe(400);
});
it('keeps cookie and device authentication separate and credentials scoped', async () => {
  expect((await deviceCall('/status', 'GET', undefined, 'wrong')).status).toBe(
    401,
  );
  expect(
    (await call('/extension/status', 'GET', undefined, '', extensionOrigin))
      .status,
  ).toBe(401);
  expect((await call('/scans', 'GET', undefined, credential)).status).toBe(401);
  expect((await deviceCall('/status')).body.device.id).toBe(deviceId);
});
it('rejects missing per-scan consent and account storage disabled', async () => {
  expect((await deviceCall('/scans', 'POST', { uploadId, scan })).status).toBe(
    400,
  );
  expect(
    (await deviceCall('/scans', 'POST', { uploadId, consent: false, scan }))
      .status,
  ).toBe(400);
  expect(
    (await deviceCall('/scans', 'POST', { uploadId, consent: true, scan })).body
      .error.code,
  ).toBe('SYNC_DISABLED');
  expect(await db.scan.count({ where: { userId: actors[0].id } })).toBe(0);
});
it('stores approved sanitized metadata exactly once and updates last successful upload', async () => {
  expect(
    (
      await call(
        '/preferences',
        'PATCH',
        { syncEnabled: true, retentionDays: 30 },
        actors[0].cookie,
      )
    ).status,
  ).toBe(200);
  const results = await Promise.all(
    [1, 2].map(() =>
      deviceCall('/scans', 'POST', { uploadId, consent: true, scan }),
    ),
  );
  expect(results.map((result) => result.status)).toEqual([201, 201]);
  scanId = results[0].body.scan.id;
  expect(results[1].body.scan.id).toBe(scanId);
  expect(await db.scan.count({ where: { userId: actors[0].id } })).toBe(1);
  const saved = await db.scan.findUniqueOrThrow({
    where: { id: scanId },
    include: { findings: true },
  });
  expect(saved.deviceId).toBe(deviceId);
  expect(saved.userId).toBe(actors[0].id);
  expect(saved.findings[0].description).not.toContain('Untrusted');
  expect(
    (await db.device.findUniqueOrThrow({ where: { id: deviceId } })).lastUsedAt,
  ).not.toBeNull();
});
it('shows the actual uploaded record in owner history, overview and comparison only', async () => {
  const conflict = await deviceCall('/scans', 'POST', {
    uploadId,
    consent: true,
    scan: { ...scan, privacyScore: 91 },
  });
  expect(conflict.status).toBe(409);
  expect(conflict.body.error.code).toBe('UPLOAD_ID_CONFLICT');
  expect(
    (await call('/scans', 'GET', undefined, actors[0].cookie)).body.items[0].id,
  ).toBe(scanId);
  expect(
    (await call('/analytics/overview', 'GET', undefined, actors[0].cookie)).body
      .metrics.totalScans,
  ).toBe(1);
  expect(
    (
      await call(
        '/analytics/compare?hostnames=example.com,other.example.net',
        'GET',
        undefined,
        actors[0].cookie,
      )
    ).body.items[0].latest.id,
  ).toBe(scanId);
  expect(
    (await call('/scans', 'GET', undefined, actors[1].cookie)).body.total,
  ).toBe(0);
  expect(
    (await call(`/scans/${scanId}`, 'GET', undefined, actors[1].cookie)).status,
  ).toBe(404);
});
it('persists versioned deductions and distinguishes legacy records without recalculation', async () => {
  const analysis = {
    scoringVersion: 'exposure-v2',
    datasetVersion: 'privacylens-reference-2026.10.16',
    coverage: 'snapshot',
    assessment: {
      domAvailable: true,
      timingAvailable: true,
      truncated: false,
      ignoredResources: 0,
    },
    components: ['transport', 'trackers', 'unclassified', 'insecure'].map(
      (id) => ({
        id,
        label: id,
        deduction: id === 'trackers' ? 8 : 0,
        explanation: 'Controlled integration fixture deduction',
      }),
    ),
  };
  const saved = await deviceCall('/scans', 'POST', {
    uploadId: randomUUID(),
    consent: true,
    scan: { ...scan, analysis },
  });
  expect(saved.status).toBe(201);
  expect(saved.body.scan.analysis).toEqual(analysis);
  const stored = await call(
    `/scans/${saved.body.scan.id}`,
    'GET',
    undefined,
    actors[0].cookie,
  );
  expect(stored.body.scan.analysis.scoringVersion).toBe('exposure-v2');
  const versions = (
    await call('/analytics/overview', 'GET', undefined, actors[0].cookie)
  ).body.scoreVersions;
  expect(versions).toEqual([
    { version: 'exposure-v2', scans: 1 },
    { version: 'legacy-unversioned', scans: 1 },
  ]);
  expect(
    (await call(`/scans/${scanId}`, 'GET', undefined, actors[0].cookie)).body
      .scan.analysis,
  ).toBeNull();
  expect(
    (await call(`/scans/${saved.body.scan.id}`, 'DELETE', {}, actors[0].cookie))
      .status,
  ).toBe(204);
});
it('rejects unsanitized fields, inconsistent scores and owner injection', async () => {
  for (const changes of [
    { url: 'https://example.com/private?secret=value' },
    { userId: actors[1].id },
    { concernLevel: 'high' },
    { hostname: 'https://example.com/path' },
  ])
    expect(
      (
        await deviceCall('/scans', 'POST', {
          consent: true,
          uploadId: randomUUID(),
          scan: { ...scan, ...changes },
        })
      ).status,
    ).toBe(400);
});
it('lists no credential digests and prevents another user revoking the extension', async () => {
  const result = await call('/devices', 'GET', undefined, actors[0].cookie);
  expect(result.body.items[0].id).toBe(deviceId);
  expect(JSON.stringify(result.body)).not.toContain('credential');
  expect(
    (await call(`/devices/${deviceId}`, 'DELETE', {}, actors[1].cookie)).status,
  ).toBe(404);
  expect(
    (await call('/devices', 'GET', undefined, actors[1].cookie)).body.items,
  ).toEqual([]);
});
it('rechecks storage consent for subsequent uploads', async () => {
  await call(
    '/preferences',
    'PATCH',
    { syncEnabled: false, retentionDays: 30 },
    actors[0].cookie,
  );
  expect(
    (
      await deviceCall('/scans', 'POST', {
        consent: true,
        uploadId: randomUUID(),
        scan,
      })
    ).body.error.code,
  ).toBe('SYNC_DISABLED');
  expect((await deviceCall('/status')).body.storageEnabled).toBe(false);
});
it('revokes the credential immediately without deleting saved scans', async () => {
  expect(
    (await call(`/devices/${deviceId}`, 'DELETE', {}, actors[0].cookie)).status,
  ).toBe(204);
  expect((await deviceCall('/status')).status).toBe(401);
  expect(
    (
      await deviceCall('/scans', 'POST', {
        consent: true,
        uploadId: randomUUID(),
        scan,
      })
    ).status,
  ).toBe(401);
  expect(await db.scan.count({ where: { userId: actors[0].id } })).toBe(1);
});
it('invalidates older unused codes and rejects expired codes', async () => {
  const old = await call('/devices/pairing-code', 'POST', {}, actors[0].cookie);
  const fresh = await call(
    '/devices/pairing-code',
    'POST',
    {},
    actors[0].cookie,
  );
  expect(
    (
      await deviceCall(
        '/pair',
        'POST',
        { code: old.body.code, displayName: 'Old code' },
        '',
      )
    ).status,
  ).toBe(400);
  await db.pairingCode.update({
    where: { codeHash: tokenHash(fresh.body.code) },
    data: { expiresAt: new Date(Date.now() - 1000) },
  });
  expect(
    (
      await deviceCall(
        '/pair',
        'POST',
        { code: fresh.body.code, displayName: 'Expired' },
        '',
      )
    ).status,
  ).toBe(400);
});
it('supports device-initiated unpairing and enforces credential lifetime', async () => {
  const generated = await call(
    '/devices/pairing-code',
    'POST',
    {},
    actors[0].cookie,
  );
  const paired = await deviceCall(
    '/pair',
    'POST',
    { code: generated.body.code, displayName: 'Unpair test' },
    '',
  );
  expect(paired.status).toBe(201);
  expect(
    (await deviceCall('/connection', 'DELETE', {}, paired.body.credential))
      .status,
  ).toBe(204);
  expect(
    (await deviceCall('/status', 'GET', undefined, paired.body.credential))
      .status,
  ).toBe(401);
  await db.device.update({
    where: { id: paired.body.device.id },
    data: { revokedAt: null, createdAt: new Date(Date.now() - 91 * 86400000) },
  });
  expect(
    (await deviceCall('/status', 'GET', undefined, paired.body.credential))
      .status,
  ).toBe(401);
});
it('rate limits pairing-code generation per authenticated owner', async () => {
  const statuses: number[] = [];
  for (let index = 0; index < 7; index++)
    statuses.push(
      (await call('/devices/pairing-code', 'POST', {}, actors[0].cookie))
        .status,
    );
  expect(statuses).toEqual([201, 201, 201, 201, 201, 429, 429]);
});
it('rate limits code redemption attempts including invalid guesses', async () => {
  const statuses: number[] = [];
  for (let index = 0; index < 3; index++)
    statuses.push(
      (
        await deviceCall(
          '/pair',
          'POST',
          { code: 'z'.repeat(22), displayName: 'Rate limit' },
          '',
        )
      ).status,
    );
  expect(statuses).toEqual([400, 400, 429]);
});
