import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createApp } from './app.js';
import { createDatabase } from './repositories/database.js';
import { getTestDatabaseUrl } from './config/test-database.js';
import { tokenHash } from './services/session.js';

const db = createDatabase(getTestDatabaseUrl());
const application = createDatabase(process.env.DATABASE_URL!); // Read-only verification ONLY.
const origin = 'http://localhost:5173';
const password = 'integration-fixture-password-123!';
const prefix = `http-${randomUUID()}`;
const a = { email: `${prefix}-a@example.test`, cookie: '', id: '' };
const b = { email: `${prefix}-b@example.test`, cookie: '', id: '' };
const createdUsers: string[] = [];
let server: Server;
let base: string;
let appBaseline: number[];
const scanIds: string[] = [];
const now = Date.now();
const payload = (changes: Record<string, unknown> = {}) => ({
  hostname: 'example.com',
  privacyScore: 92,
  concernLevel: 'low',
  httpsStatus: 'https',
  thirdPartyDomainCount: 1,
  trackerMatchCount: 1,
  scannedAt: new Date().toISOString(),
  findings: [
    {
      category: 'analytics',
      severity: 'low',
      description: 'must-not-persist-client-text',
      evidenceHostname: 'google-analytics.com',
    },
  ],
  ...changes,
});
async function request(
  path: string,
  method = 'GET',
  body?: unknown,
  cookie = '',
  extraHeaders: Record<string, string> = {},
) {
  const response = await fetch(`${base}/api/v1${path}`, {
    method,
    headers: {
      ...(method !== 'GET'
        ? { Origin: origin, 'Content-Type': 'application/json' }
        : {}),
      ...(cookie ? { Cookie: cookie } : {}),
      ...extraHeaders,
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const text = await response.text();
  return { response, body: text ? JSON.parse(text) : null };
}
async function counts() {
  return Promise.all([
    application.user.count(),
    application.scan.count(),
    application.session.count(),
    application.finding.count(),
  ]);
}
beforeAll(async () => {
  appBaseline = await counts();
  const app = createApp({
    db,
    origins: [origin],
    databaseReady: async () => {
      await db.$queryRaw`SELECT 1`;
    },
    authLimit: 200,
  });
  server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.on('listening', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  for (const actor of [a, b]) {
    const result = await request('/auth/register', 'POST', {
      email: actor.email,
      password,
    });
    expect(result.response.status).toBe(201);
    actor.id = result.body.user.id;
    createdUsers.push(actor.id);
    actor.cookie = result.response.headers.getSetCookie()[0].split(';')[0];
  }
});
afterAll(async () => {
  if (server)
    await new Promise<void>((resolve) => server.close(() => resolve()));
  if (createdUsers.length)
    await db.user.deleteMany({ where: { id: { in: createdUsers } } });
  try {
    if (appBaseline) expect(await counts()).toEqual(appBaseline);
  } finally {
    await Promise.all([db.$disconnect(), application.$disconnect()]);
  }
});

describe('real HTTP + PostgreSQL authentication and scans', () => {
  it('registers with consent off, stores salted hashes and returns no password hash', async () => {
    const { response, body } = await request(
      '/auth/me',
      'GET',
      undefined,
      a.cookie,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(body.user.preference.syncEnabled).toBe(false);
    expect('passwordHash' in body.user).toBe(false);
    const stored = await db.user.findUniqueOrThrow({ where: { id: a.id } });
    expect(stored.passwordHash.startsWith('scrypt$131072$8$1$')).toBe(true);
    expect(stored.passwordHash === password).toBe(false);
    const rawToken = a.cookie.split('=')[1];
    const session = await db.session.findUniqueOrThrow({
      where: { tokenHash: tokenHash(rawToken) },
    });
    expect(session.tokenHash === rawToken).toBe(false);
    expect(session.userId).toBe(a.id);
  });
  it('serves database-backed readiness', async () =>
    expect((await request('/ready')).response.status).toBe(200));
  it('normalizes emails and rejects duplicate accounts', async () => {
    const result = await request('/auth/register', 'POST', {
      email: ` ${a.email.toUpperCase()} `,
      password,
    });
    expect(result.response.status).toBe(409);
  });
  it('rejects weak registration input', async () =>
    expect(
      (
        await request('/auth/register', 'POST', {
          email: 'bad',
          password: 'short',
        })
      ).response.status,
    ).toBe(400));
  it('rejects wrong passwords and unknown accounts with the same error', async () => {
    const wrong = await request('/auth/login', 'POST', {
      email: a.email,
      password: 'incorrect-password-123!',
    });
    const unknown = await request('/auth/login', 'POST', {
      email: `${prefix}-missing@example.test`,
      password,
    });
    expect(wrong.response.status).toBe(401);
    expect(unknown.response.status).toBe(401);
    expect(wrong.body.error.code).toBe(unknown.body.error.code);
  });
  it('requires a session for private endpoints', async () => {
    for (const path of [
      '/scans',
      '/auth/me',
      '/analytics/overview',
      '/preferences',
    ])
      expect((await request(path)).response.status).toBe(401);
  });
  it('rejects forged and duplicate session cookies', async () => {
    expect(
      (
        await request(
          '/auth/me',
          'GET',
          undefined,
          `privacylens_session=${'a'.repeat(43)}`,
        )
      ).response.status,
    ).toBe(401);
    expect(
      (await request('/auth/me', 'GET', undefined, `${a.cookie}; ${a.cookie}`))
        .response.status,
    ).toBe(401);
  });
  it('blocks CSRF writes with missing or hostile Origin', async () => {
    const result = await fetch(`${base}/api/v1/preferences`, {
      method: 'PATCH',
      headers: { Cookie: a.cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ syncEnabled: true, retentionDays: 30 }),
    });
    expect(result.status).toBe(403);
    expect(
      (
        await request(
          '/preferences',
          'PATCH',
          { syncEnabled: true, retentionDays: 30 },
          a.cookie,
          { Origin: 'https://evil.example' },
        )
      ).response.status,
    ).toBe(403);
  });
  it('rejects non-JSON writes', async () => {
    const response = await fetch(`${base}/api/v1/auth/logout`, {
      method: 'POST',
      headers: {
        Origin: origin,
        Cookie: a.cookie,
        'Content-Type': 'text/plain',
      },
      body: '{}',
    });
    expect(response.status).toBe(415);
  });
  it('refuses scan storage without explicit consent', async () => {
    const result = await request('/scans', 'POST', payload(), a.cookie);
    expect(result.response.status).toBe(403);
    expect(result.body.error.code).toBe('SYNC_DISABLED');
    expect(await db.scan.count({ where: { userId: a.id } })).toBe(0);
  });
  it('allows explicit preference consent and records only owner-scoped metadata', async () => {
    for (const actor of [a, b])
      expect(
        (
          await request(
            '/preferences',
            'PATCH',
            { syncEnabled: true, retentionDays: 30 },
            actor.cookie,
          )
        ).response.status,
      ).toBe(200);
    for (const [index, score] of [92, 80, 40].entries()) {
      const result = await request(
        '/scans',
        'POST',
        payload({
          hostname: index === 2 ? 'other.example.net' : 'example.com',
          privacyScore: score,
          concernLevel: score >= 75 ? 'low' : 'high',
          trackerMatchCount: index + 1,
          scannedAt: new Date(now - (2 - index) * 86400000).toISOString(),
          findings: [
            {
              category: index === 2 ? 'advertising' : 'analytics',
              severity: 'low',
              description: 'must-not-persist-client-text',
              evidenceHostname: 'google-analytics.com',
            },
            {
              category: index === 2 ? 'advertising' : 'analytics',
              severity: 'low',
              description: 'duplicate',
              evidenceHostname: 'google-analytics.com',
            },
          ],
        }),
        a.cookie,
      );
      expect(result.response.status).toBe(201);
      scanIds.push(result.body.scan.id);
      expect(result.body.scan.findings).toHaveLength(1);
      expect(JSON.stringify(result.body)).not.toContain(
        'must-not-persist-client-text',
      );
      expect('userId' in result.body.scan).toBe(false);
    }
    const other = await request(
      '/scans',
      'POST',
      payload({
        hostname: 'private-other.example.org',
        privacyScore: 10,
        concernLevel: 'high',
        trackerMatchCount: 9,
      }),
      b.cookie,
    );
    expect(other.response.status).toBe(201);
    expect(await db.scan.count({ where: { userId: a.id } })).toBe(3);
    expect(await db.scan.count({ where: { userId: b.id } })).toBe(1);
  });
  it('lists only the signed-in user’s history with pagination and sorting', async () => {
    const result = await request(
      '/scans?limit=1&page=2&sort=scannedAt&order=asc',
      'GET',
      undefined,
      a.cookie,
    );
    expect(result.response.status).toBe(200);
    expect(result.body.total).toBe(3);
    expect(result.body.totalPages).toBe(3);
    expect(result.body.items[0].id).toBe(scanIds[1]);
  });
  it('filters normalized hostnames and timestamps', async () => {
    const from = encodeURIComponent(new Date(now - 3 * 86400000).toISOString());
    const to = encodeURIComponent(new Date(now - 0.5 * 86400000).toISOString());
    const result = await request(
      `/scans?hostname=EXAMPLE.COM&from=${from}&to=${to}`,
      'GET',
      undefined,
      a.cookie,
    );
    expect(result.body.total).toBe(2);
  });
  it('returns persisted finding details and does not reveal another user’s records', async () => {
    expect(
      (await request(`/scans/${scanIds[0]}`, 'GET', undefined, a.cookie)).body
        .scan.findings[0].evidenceHostname,
    ).toBe('google-analytics.com');
    expect(
      (await request(`/scans/${scanIds[0]}`, 'GET', undefined, b.cookie))
        .response.status,
    ).toBe(404);
    expect(
      (await request(`/scans/${scanIds[0]}`, 'DELETE', {}, b.cookie)).response
        .status,
    ).toBe(404);
    expect(
      await db.scan.findUnique({ where: { id: scanIds[0] } }),
    ).not.toBeNull();
  });
  it.each([
    { userId: 'attacker-selected-owner' },
    { cookies: 'secret' },
    { hostname: 'https://example.com/private?secret=x' },
    { privacyScore: 101 },
    { concernLevel: 'high' },
    { scannedAt: new Date(now + 86400000).toISOString() },
  ])('rejects invalid or sensitive scan fields %j', async (changes) => {
    expect(
      (await request('/scans', 'POST', payload(changes), a.cookie)).response
        .status,
    ).toBe(400);
  });
  it.each([
    'page=0',
    'limit=101',
    'sort=userId',
    'from=not-a-date',
    'userId=other',
    `from=${encodeURIComponent('2026-10-20T00:00:00Z')}&to=${encodeURIComponent('2026-10-19T00:00:00Z')}`,
  ])('rejects invalid history query %s', async (query) => {
    expect(
      (await request(`/scans?${query}`, 'GET', undefined, a.cookie)).response
        .status,
    ).toBe(400);
  });
  it('aggregates only actual owner records, with truthful category and trend counts', async () => {
    const result = await request(
      '/analytics/overview',
      'GET',
      undefined,
      a.cookie,
    );
    expect(result.response.status).toBe(200);
    expect(result.body.metrics.totalScans).toBe(3);
    expect(result.body.metrics.uniqueDomains).toBe(2);
    expect(result.body.metrics.trackerMatches).toBe(6);
    expect(result.body.metrics.averageScore).toBeCloseTo((92 + 80 + 40) / 3);
    expect(result.body.trends).toHaveLength(3);
    expect(
      result.body.trackerDistribution.find(
        (item: { category: string }) => item.category === 'analytics',
      ),
    ).toMatchObject({ findingCount: 2, scanCount: 2 });
    expect(result.body.recentScans).toHaveLength(3);
    expect(result.body.frequentProviders).toEqual([
      { name: 'Google Analytics', scanCount: 3 },
    ]);
    expect(JSON.stringify(result.body)).not.toContain(
      'private-other.example.org',
    );
  });
  it('compares actual domain histories and labels absent history with null scores', async () => {
    const result = await request(
      '/analytics/compare?hostnames=example.com,unknown.example.net',
      'GET',
      undefined,
      a.cookie,
    );
    expect(result.body.items[0]).toMatchObject({
      scans: 2,
      averageScore: 86,
      latestScore: 80,
      scoreChangeFromFirst: -12,
    });
    expect(result.body.items[1]).toMatchObject({
      scans: 0,
      averageScore: null,
      latestScore: null,
    });
    expect(result.body.items[0].latest.hostname).toBe('example.com');
    expect(result.body.items[0].history).toHaveLength(2);
    expect(result.body.items[1].history).toEqual([]);
  });
  it('lists only retained owner domains for comparison selection', async () => {
    const result = await request(
      '/analytics/domains',
      'GET',
      undefined,
      a.cookie,
    );
    expect(result.response.status).toBe(200);
    expect(result.body.items).toEqual([
      { hostname: 'example.com', scans: 2 },
      { hostname: 'other.example.net', scans: 1 },
    ]);
    expect((await request('/analytics/domains')).response.status).toBe(401);
    expect(
      (
        await request(
          '/analytics/domains?userId=foreign',
          'GET',
          undefined,
          a.cookie,
        )
      ).response.status,
    ).toBe(400);
  });
  it('searches actual seeded PostgreSQL provider/domain records', async () => {
    const result = await request(
      '/analytics/providers?q=google-analytics.com',
      'GET',
      undefined,
      a.cookie,
    );
    expect(result.response.status).toBe(200);
    expect(result.body.source).toBe('postgresql-reference');
    const stored = await db.trackerProvider.findMany({
      where: { domains: { some: { domain: 'google-analytics.com' } } },
      include: { domains: true },
    });
    expect(result.body.items.map((item: { id: string }) => item.id)).toEqual(
      stored.map((item) => item.id),
    );
    expect(result.body.items[0].domains).toContain('google-analytics.com');
    expect((await request('/analytics/providers')).response.status).toBe(401);
    expect(
      (
        await request(
          '/analytics/providers?q=not-in-reference',
          'GET',
          undefined,
          a.cookie,
        )
      ).body.items,
    ).toEqual([]);
  });
  it('serves measured research and owner evidence while preserving legacy provenance', async () => {
    const evaluation = await request(
      '/research/evaluation',
      'GET',
      undefined,
      a.cookie,
    );
    expect(evaluation.response.status).toBe(200);
    expect(evaluation.body.overall).toMatchObject({
      total: 29,
      falseNegatives: 4,
    });
    expect((await request('/research/evaluation')).response.status).toBe(401);
    expect(
      (
        await request(
          '/research/evaluation?userId=foreign',
          'GET',
          undefined,
          a.cookie,
        )
      ).response.status,
    ).toBe(400);
    const evidence = await request(
      '/research/evidence',
      'GET',
      undefined,
      a.cookie,
    );
    expect(evidence.response.status).toBe(200);
    expect(JSON.stringify(evidence.body)).not.toContain(
      'private-other.example.org',
    );
    const legacy = await request(
      `/scans/${scanIds[0]}`,
      'GET',
      undefined,
      a.cookie,
    );
    expect(legacy.body.scan.analysis).toBeNull();
  });
  it('returns honest empty analytics for a hostname with no saved history', async () => {
    const result = await request(
      '/analytics/overview?hostname=unseen.example.net',
      'GET',
      undefined,
      a.cookie,
    );
    expect(result.body.metrics).toEqual({
      totalScans: 0,
      uniqueDomains: 0,
      trackerMatches: 0,
      averageScore: null,
    });
    expect(result.body.trends).toEqual([]);
    expect(result.body.trackerDistribution).toEqual([]);
  });
  it('deletes a single owned scan and cascades findings', async () => {
    expect(
      (await request(`/scans/${scanIds[2]}`, 'DELETE', {}, a.cookie)).response
        .status,
    ).toBe(204);
    expect(await db.finding.count({ where: { scanId: scanIds[2] } })).toBe(0);
    expect(
      (await request(`/scans/${scanIds[2]}`, 'GET', undefined, a.cookie))
        .response.status,
    ).toBe(404);
  });
  it('enforces retention without deleting another account’s data', async () => {
    expect(
      (
        await request(
          '/scans',
          'POST',
          payload({ scannedAt: new Date(now - 40 * 86400000).toISOString() }),
          a.cookie,
        )
      ).response.status,
    ).toBe(400);
    await db.scan.create({
      data: {
        userId: a.id,
        hostname: 'old.example.com',
        privacyScore: 90,
        concernLevel: 'low',
        httpsStatus: 'https',
        thirdPartyDomainCount: 0,
        trackerMatchCount: 0,
        scannedAt: new Date(now - 40 * 86400000),
      },
    });
    expect(
      (await request('/scans', 'GET', undefined, a.cookie)).body.total,
    ).toBe(2);
    const result = await request(
      '/preferences',
      'PATCH',
      { syncEnabled: true, retentionDays: 1 },
      a.cookie,
    );
    expect(result.body.purged).toBe(3);
    expect(await db.scan.count({ where: { userId: b.id } })).toBe(1);
  });
  it('revokes storage consent and rejects subsequent saves', async () => {
    expect(
      (
        await request(
          '/preferences',
          'PATCH',
          { syncEnabled: false, retentionDays: 30 },
          a.cookie,
        )
      ).response.status,
    ).toBe(200);
    expect(
      (await request('/scans', 'POST', payload(), a.cookie)).body.error.code,
    ).toBe('SYNC_DISABLED');
  });
  it('clears only the requesting user’s data', async () => {
    await request(
      '/preferences',
      'PATCH',
      { syncEnabled: true, retentionDays: 30 },
      a.cookie,
    );
    expect(
      (await request('/scans', 'POST', payload(), a.cookie)).response.status,
    ).toBe(201);
    expect((await request('/scans', 'DELETE', {}, a.cookie)).body.deleted).toBe(
      1,
    );
    expect(await db.scan.count({ where: { userId: b.id } })).toBe(1);
  });
  it('rotates session credentials on login and sets HttpOnly/SameSite cookies', async () => {
    const old = a.cookie;
    const result = await request(
      '/auth/login',
      'POST',
      { email: a.email, password },
      a.cookie,
    );
    expect(result.response.status).toBe(200);
    const cookies = result.response.headers.getSetCookie();
    expect(
      cookies.some(
        (value) =>
          value.includes('HttpOnly') && value.includes('SameSite=Strict'),
      ),
    ).toBe(true);
    a.cookie = cookies[0].split(';')[0];
    expect(a.cookie === old).toBe(false);
    expect(
      (await request('/auth/me', 'GET', undefined, old)).response.status,
    ).toBe(401);
    expect(
      (await request('/auth/me', 'GET', undefined, a.cookie)).response.status,
    ).toBe(200);
  });
  it('rejects expired sessions', async () => {
    await db.session.updateMany({
      where: { userId: b.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    expect(
      (await request('/auth/me', 'GET', undefined, b.cookie)).response.status,
    ).toBe(401);
  });
  it('logs out with server-side revocation and supports idempotent logout', async () => {
    expect(
      (await request('/auth/logout', 'POST', {}, a.cookie)).response.status,
    ).toBe(204);
    expect(
      (await request('/auth/me', 'GET', undefined, a.cookie)).response.status,
    ).toBe(401);
    expect((await request('/auth/logout', 'POST', {})).response.status).toBe(
      204,
    );
  });
  it('rate limits authentication attempts', async () => {
    const limited = createApp({
      db,
      origins: [origin],
      databaseReady: async () => {},
      authLimit: 2,
    }).listen(0, '127.0.0.1');
    await new Promise<void>((resolve) => limited.on('listening', resolve));
    const url = `http://127.0.0.1:${(limited.address() as AddressInfo).port}/api/v1/auth/login`;
    try {
      const statuses = [];
      for (let i = 0; i < 3; i++)
        statuses.push(
          (
            await fetch(url, {
              method: 'POST',
              headers: { Origin: origin, 'Content-Type': 'application/json' },
              body: JSON.stringify({ email: 'bad', password: 'short' }),
            })
          ).status,
        );
      expect(statuses).toEqual([400, 400, 429]);
    } finally {
      await new Promise<void>((resolve) => limited.close(() => resolve()));
    }
  });
  it('sets production Secure and __Host- cookie attributes', async () => {
    const secureOrigin = 'https://dashboard.example.test';
    const secure = createApp({
      db,
      origins: [secureOrigin],
      production: true,
      databaseReady: async () => {},
    }).listen(0, '127.0.0.1');
    await new Promise<void>((resolve) => secure.on('listening', resolve));
    try {
      const response = await fetch(
        `http://127.0.0.1:${(secure.address() as AddressInfo).port}/api/v1/auth/login`,
        {
          method: 'POST',
          headers: { Origin: secureOrigin, 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: a.email, password }),
        },
      );
      expect(response.status).toBe(200);
      const cookie = response.headers.getSetCookie()[0];
      expect(cookie.startsWith('__Host-privacylens_session=')).toBe(true);
      expect(
        cookie.includes('Secure') &&
          cookie.includes('HttpOnly') &&
          cookie.includes('Path=/') &&
          !cookie.includes('Domain='),
      ).toBe(true);
    } finally {
      await new Promise<void>((resolve) => secure.close(() => resolve()));
    }
  });
});
