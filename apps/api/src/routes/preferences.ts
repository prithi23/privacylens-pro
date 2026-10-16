import { Router } from 'express';
import type { PrismaClient } from '@prisma/client';
import { authenticatedUser } from '../services/session.js';
import { emptySchema, preferencesSchema } from '../validators/api.js';
export function preferencesRouter(db: PrismaClient) {
  const router = Router();
  router.use((req, _res, next) => {
    emptySchema.parse(req.query);
    next();
  });
  router.get('/', (_req, res) =>
    res.json({
      preferences: authenticatedUser(res).preference ?? {
        syncEnabled: false,
        retentionDays: 30,
      },
    }),
  );
  router.patch('/', async (req, res) => {
    const data = preferencesSchema.parse(req.body);
    const userId = authenticatedUser(res).id;
    const result = await db.$transaction(async (tx) => {
      const preferences = await tx.userPreference.upsert({
        where: { userId },
        create: { userId, ...data },
        update: data,
        select: { syncEnabled: true, retentionDays: true },
      });
      const purged = await tx.scan.deleteMany({
        where: {
          userId,
          scannedAt: {
            lt: new Date(Date.now() - data.retentionDays * 86400000),
          },
        },
      });
      return { preferences, purged: purged.count };
    });
    res.json(result);
  });
  return router;
}
