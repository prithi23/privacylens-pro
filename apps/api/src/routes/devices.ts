import { Router, type RequestHandler } from 'express';
import { rateLimit } from 'express-rate-limit';
import { randomBytes } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { pairRequestSchema, uploadSchema } from '@privacylens/shared/sync';
import { authenticatedUser, newToken, tokenHash } from '../services/session.js';
import { emptySchema, idSchema, createScanSchema } from '../validators/api.js';
import { HttpError } from '../middleware/error.js';
import { saveScan } from '../repositories/scans.js';
export const DEVICE_LIFETIME_MS = 90 * 86400000;
const limitMessage = {
  error: {
    code: 'DEVICE_RATE_LIMITED',
    message: 'Too many extension requests. Wait before trying again.',
  },
};
export const deviceSelect = {
  id: true,
  displayName: true,
  createdAt: true,
  lastUsedAt: true,
  revokedAt: true,
} as const;
export const publicDevice = (device: {
  id: string;
  displayName: string;
  createdAt: Date;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
}) => ({
  ...device,
  expiresAt: new Date(device.createdAt.getTime() + DEVICE_LIFETIME_MS),
});
export function devicesRouter(db: PrismaClient) {
  const router = Router();
  router.get('/', async (req, res) => {
    emptySchema.parse(req.query);
    const items = await db.device.findMany({
      where: { userId: authenticatedUser(res).id },
      select: deviceSelect,
      orderBy: { createdAt: 'desc' },
    });
    res.json({ items: items.map(publicDevice) });
  });
  router.post(
    '/pairing-code',
    rateLimit({
      windowMs: 900000,
      limit: 10,
      keyGenerator: (_req, res) => authenticatedUser(res).id,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      message: limitMessage,
    }),
    async (req, res) => {
      emptySchema.parse(req.query);
      emptySchema.parse(req.body);
      const userId = authenticatedUser(res).id;
      const code = randomBytes(16).toString('base64url');
      const expiresAt = new Date(Date.now() + 300000);
      await db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`;
        await tx.pairingCode.updateMany({
          where: { userId, usedAt: null },
          data: { usedAt: new Date() },
        });
        await tx.pairingCode.create({
          data: { userId, codeHash: tokenHash(code), expiresAt },
        });
      });
      res.status(201).json({ code, expiresAt });
    },
  );
  router.delete('/:id', async (req, res) => {
    emptySchema.parse(req.query);
    emptySchema.parse(req.body ?? {});
    const { id } = idSchema.parse(req.params);
    const result = await db.device.updateMany({
      where: { id, userId: authenticatedUser(res).id },
      data: { revokedAt: new Date() },
    });
    if (!result.count)
      throw new HttpError(404, 'DEVICE_NOT_FOUND', 'Extension not found.');
    res.status(204).end();
  });
  return router;
}
export function deviceApi(db: PrismaClient) {
  const router = Router();
  router.post(
    '/pair',
    rateLimit({
      windowMs: 900000,
      limit: 10,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      message: limitMessage,
    }),
    async (req, res) => {
      emptySchema.parse(req.query);
      const data = pairRequestSchema.parse(req.body);
      const credential = `pld_${newToken()}`;
      const device = await db.$transaction(async (tx) => {
        const pairing = await tx.pairingCode.findUnique({
          where: { codeHash: tokenHash(data.code) },
        });
        if (!pairing)
          throw new HttpError(
            400,
            'PAIRING_INVALID',
            'Pairing code is invalid, expired, or already used.',
          );
        const claimed = await tx.pairingCode.updateMany({
          where: {
            id: pairing.id,
            usedAt: null,
            expiresAt: { gt: new Date() },
          },
          data: { usedAt: new Date() },
        });
        if (!claimed.count)
          throw new HttpError(
            400,
            'PAIRING_INVALID',
            'Pairing code is invalid, expired, or already used.',
          );
        return tx.device.create({
          data: {
            userId: pairing.userId,
            displayName: data.displayName,
            credentialHash: tokenHash(credential),
          },
          select: {
            ...deviceSelect,
            user: {
              select: {
                preference: {
                  select: { syncEnabled: true, retentionDays: true },
                },
              },
            },
          },
        });
      });
      const { user, ...metadata } = device;
      res.status(201).json({
        credential,
        device: publicDevice(metadata),
        storageEnabled: user.preference?.syncEnabled ?? false,
        retentionDays: user.preference?.retentionDays ?? 30,
      });
    },
  );
  const authenticate: RequestHandler = async (req, res, next) => {
    const authorization = req.get('authorization');
    if (!authorization || !/^Bearer pld_[A-Za-z0-9_-]{43}$/.test(authorization))
      throw new HttpError(
        401,
        'DEVICE_UNAUTHORIZED',
        'Pair this extension to continue.',
      );
    const device = await db.device.findUnique({
      where: { credentialHash: tokenHash(authorization.slice(7)) },
      include: {
        user: {
          select: {
            preference: { select: { syncEnabled: true, retentionDays: true } },
          },
        },
      },
    });
    if (
      !device ||
      device.revokedAt ||
      device.createdAt.getTime() + DEVICE_LIFETIME_MS <= Date.now()
    )
      throw new HttpError(
        401,
        'DEVICE_UNAUTHORIZED',
        'Extension authorization expired or was revoked. Pair again.',
      );
    res.locals.device = device;
    next();
  };
  router.use(authenticate);
  router.use(
    rateLimit({
      windowMs: 60000,
      limit: 30,
      keyGenerator: (_req, res) => res.locals.device.id as string,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      message: limitMessage,
    }),
  );
  router.get('/status', (req, res) => {
    emptySchema.parse(req.query);
    const { id, displayName, createdAt, lastUsedAt, revokedAt, user } =
      res.locals.device;
    res.json({
      device: publicDevice({
        id,
        displayName,
        createdAt,
        lastUsedAt,
        revokedAt,
      }),
      storageEnabled: user.preference?.syncEnabled ?? false,
      retentionDays: user.preference?.retentionDays ?? 30,
    });
  });
  router.delete('/connection', async (req, res) => {
    emptySchema.parse(req.query);
    emptySchema.parse(req.body ?? {});
    await db.device.update({
      where: { id: res.locals.device.id },
      data: { revokedAt: new Date() },
    });
    res.status(204).end();
  });
  router.post('/scans', async (req, res) => {
    emptySchema.parse(req.query);
    const data = uploadSchema.parse(req.body);
    const scan = createScanSchema.parse(data.scan);
    const device = res.locals.device;
    const saved = await saveScan(db, device.userId, scan, {
      id: device.id,
      uploadId: data.uploadId,
    });
    res.status(201).json({ scan: saved });
  });
  return router;
}
