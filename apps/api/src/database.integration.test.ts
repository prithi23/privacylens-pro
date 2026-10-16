import { afterAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createDatabase } from './repositories/database.js';
import './config/env.js';
import { getTestDatabaseUrl } from './config/test-database.js';

// Fail rather than silently skip. Run only against an explicitly designated disposable DB.
const url = getTestDatabaseUrl();
const db = createDatabase(url);
afterAll(async () => {
  await db.$disconnect();
});
describe('real PostgreSQL schema', () => {
  it('persists preferences and scans and cascades user deletion', async () => {
    const user = await db.user.create({
      data: {
        email: `integration-${randomUUID()}@example.test`,
        passwordHash: 'test-only-placeholder-not-a-login',
        preference: { create: {} },
      },
      include: { preference: true },
    });
    try {
      expect(user.preference?.syncEnabled).toBe(false);
      const scan = await db.scan.create({
        data: {
          userId: user.id,
          hostname: 'example.com',
          privacyScore: 100,
          concernLevel: 'low',
          httpsStatus: 'https',
          thirdPartyDomainCount: 0,
          trackerMatchCount: 0,
          scannedAt: new Date(),
        },
      });
      expect(
        (await db.scan.findUnique({ where: { id: scan.id } }))?.userId,
      ).toBe(user.id);
      await db.user.delete({ where: { id: user.id } });
      expect(await db.scan.findUnique({ where: { id: scan.id } })).toBeNull();
    } finally {
      await db.user.deleteMany({ where: { id: user.id } });
    }
  });
});
