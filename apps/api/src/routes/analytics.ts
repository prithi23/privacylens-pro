import { Router } from 'express';
import type { PrismaClient } from '@prisma/client';
import { authenticatedUser } from '../services/session.js';
import { comparisonSchema, filtersSchema } from '../validators/api.js';
import { compareDomains, overview } from '../services/analytics.js';
import { emptySchema, trackerQuerySchema } from '../validators/api.js';
import { scanWhere } from '../repositories/scans.js';
export function analyticsRouter(db: PrismaClient) {
  const router = Router();
  router.get('/domains', async (req, res) => {
    emptySchema.parse(req.query);
    const user = authenticatedUser(res);
    const items = await db.scan.groupBy({
      by: ['hostname'],
      where: scanWhere(user.id, user.preference?.retentionDays ?? 30, {}),
      _count: { _all: true },
      orderBy: { hostname: 'asc' },
    });
    res.json({
      items: items.map((item) => ({
        hostname: item.hostname,
        scans: item._count._all,
      })),
    });
  });
  router.get('/providers', async (req, res) => {
    const q = trackerQuerySchema.parse(req.query).q;
    const items = await db.trackerProvider.findMany({
      where: {
        OR: [
          { name: { contains: q, mode: 'insensitive' } },
          { category: { contains: q, mode: 'insensitive' } },
          {
            domains: { some: { domain: { contains: q, mode: 'insensitive' } } },
          },
        ],
      },
      include: {
        domains: { select: { domain: true }, orderBy: { domain: 'asc' } },
      },
      orderBy: { name: 'asc' },
    });
    res.json({
      items: items.map((item) => ({
        ...item,
        domains: item.domains.map((domain) => domain.domain),
      })),
      source: 'postgresql-reference',
    });
  });
  router.get('/overview', async (req, res) => {
    const user = authenticatedUser(res);
    res.json(
      await overview(
        db,
        user.id,
        user.preference?.retentionDays ?? 30,
        filtersSchema.parse(req.query),
      ),
    );
  });
  router.get('/compare', async (req, res) => {
    const user = authenticatedUser(res);
    const { hostnames, ...filters } = comparisonSchema.parse(req.query);
    res.json({
      items: await compareDomains(
        db,
        user.id,
        user.preference?.retentionDays ?? 30,
        hostnames,
        filters,
      ),
    });
  });
  return router;
}
