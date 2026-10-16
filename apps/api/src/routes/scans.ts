import { Router } from 'express';
import type { PrismaClient } from '@prisma/client';
import { authenticatedUser } from '../services/session.js';
import {
  createScanSchema,
  emptySchema,
  idSchema,
  listSchema,
} from '../validators/api.js';
import {
  listScans,
  saveScan,
  scanSelect,
  scanWhere,
} from '../repositories/scans.js';
import { HttpError } from '../middleware/error.js';

export function scansRouter(db: PrismaClient) {
  const router = Router();
  router.post('/', async (req, res) => {
    emptySchema.parse(req.query);
    const scan = await saveScan(
      db,
      authenticatedUser(res).id,
      createScanSchema.parse(req.body),
    );
    res.status(201).json({ scan });
  });
  router.get('/', async (req, res) => {
    const user = authenticatedUser(res);
    res.json(
      await listScans(
        db,
        user.id,
        user.preference?.retentionDays ?? 30,
        listSchema.parse(req.query),
      ),
    );
  });
  router.delete('/', async (req, res) => {
    emptySchema.parse(req.query);
    emptySchema.parse(req.body ?? {});
    res.json({
      deleted: (
        await db.scan.deleteMany({
          where: { userId: authenticatedUser(res).id },
        })
      ).count,
    });
  });
  router.get('/:id', async (req, res) => {
    emptySchema.parse(req.query);
    const { id } = idSchema.parse(req.params);
    const user = authenticatedUser(res);
    const scan = await db.scan.findFirst({
      where: {
        ...scanWhere(user.id, user.preference?.retentionDays ?? 30),
        id,
      },
      select: {
        ...scanSelect,
        findings: {
          select: {
            id: true,
            category: true,
            severity: true,
            description: true,
            evidenceHostname: true,
          },
        },
      },
    });
    if (!scan) throw new HttpError(404, 'SCAN_NOT_FOUND', 'Scan not found.');
    res.json({ scan });
  });
  router.delete('/:id', async (req, res) => {
    emptySchema.parse(req.query);
    emptySchema.parse(req.body ?? {});
    const { id } = idSchema.parse(req.params);
    const result = await db.scan.deleteMany({
      where: { id, userId: authenticatedUser(res).id },
    });
    if (!result.count)
      throw new HttpError(404, 'SCAN_NOT_FOUND', 'Scan not found.');
    res.status(204).end();
  });
  return router;
}
