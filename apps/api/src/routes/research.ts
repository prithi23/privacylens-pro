import { Router } from 'express';
import {
  datasetMetadata,
  trackerProviders,
} from '@privacylens/shared/trackers';
import { methodology } from '@privacylens/shared/methodology';
import evaluation from '../../../../docs/research/evaluation.json' with { type: 'json' };
import { emptySchema } from '../validators/api.js';
import type { PrismaClient } from '@prisma/client';
import { authenticatedUser } from '../services/session.js';
import { scanWhere } from '../repositories/scans.js';
/** Immutable measured build artifact, never generated statistics in a request handler. */
export function researchRouter(db: PrismaClient) {
  const router = Router();
  router.get('/reference', (req, res) => {
    emptySchema.parse(req.query);
    res.json({
      dataset: {
        ...datasetMetadata,
        providerCount: trackerProviders.length,
        domainCount: trackerProviders.reduce(
          (sum, provider) => sum + provider.domains.length,
          0,
        ),
      },
      methodology,
    });
  });
  router.get('/evaluation', (req, res) => {
    emptySchema.parse(req.query);
    res.json(evaluation);
  });
  router.get('/evidence', async (req, res) => {
    emptySchema.parse(req.query);
    const user = authenticatedUser(res);
    const items = await db.finding.findMany({
      where: { scan: scanWhere(user.id, user.preference?.retentionDays ?? 30) },
      select: {
        id: true,
        evidenceHostname: true,
        category: true,
        description: true,
        scan: {
          select: { id: true, hostname: true, scannedAt: true, analysis: true },
        },
      },
      orderBy: [{ scan: { scannedAt: 'desc' } }, { id: 'asc' }],
      take: 20,
    });
    res.json({ items });
  });
  return router;
}
