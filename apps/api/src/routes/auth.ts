import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import type { PrismaClient } from '@prisma/client';
import { credentialsSchema, emptySchema } from '../validators/api.js';
import {
  hashPassword,
  verifyPassword,
  dummyPasswordHash,
} from '../services/password.js';
import {
  authenticatedUser,
  cookieName,
  cookieOptions,
  newToken,
  requireSession,
  sessionToken,
  setSessionCookie,
  tokenHash,
  userSelect,
  type SessionOptions,
} from '../services/session.js';
import { HttpError } from '../middleware/error.js';

export function authRouter(
  db: PrismaClient,
  options: SessionOptions,
  authLimit = 20,
) {
  const router = Router();
  router.use((req, _res, next) => {
    emptySchema.parse(req.query);
    next();
  });
  const limiter = rateLimit({
    windowMs: 15 * 60000,
    limit: authLimit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: {
      error: {
        code: 'AUTH_RATE_LIMITED',
        message: 'Too many authentication attempts; try again later.',
      },
    },
  });
  router.post('/register', limiter, async (req, res) => {
    const data = credentialsSchema.parse(req.body);
    const passwordHash = await hashPassword(data.password);
    const token = newToken();
    const user = await db.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: data.email,
          passwordHash,
          preference: { create: { syncEnabled: false } },
        },
        select: userSelect,
      });
      await tx.session.create({
        data: {
          userId: user.id,
          tokenHash: tokenHash(token),
          expiresAt: new Date(Date.now() + options.sessionHours * 3600000),
        },
      });
      return user;
    });
    setSessionCookie(res, token, options);
    res.status(201).json({ user });
  });
  router.post('/login', limiter, async (req, res) => {
    const data = credentialsSchema.parse(req.body);
    const user = await db.user.findUnique({ where: { email: data.email } });
    const matches = await verifyPassword(
      data.password,
      user?.passwordHash ?? dummyPasswordHash,
    );
    if (!user || !matches)
      throw new HttpError(
        401,
        'INVALID_CREDENTIALS',
        'Email or password is incorrect.',
      );
    const token = newToken();
    const old = sessionToken(req, options);
    const publicUser = await db.$transaction(async (tx) => {
      if (old)
        await tx.session.deleteMany({
          where: { tokenHash: tokenHash(old), userId: user.id },
        });
      await tx.session.create({
        data: {
          userId: user.id,
          tokenHash: tokenHash(token),
          expiresAt: new Date(Date.now() + options.sessionHours * 3600000),
        },
      });
      return tx.user.findUniqueOrThrow({
        where: { id: user.id },
        select: userSelect,
      });
    });
    setSessionCookie(res, token, options);
    res.json({ user: publicUser });
  });
  router.post('/logout', async (req, res) => {
    emptySchema.parse(req.body ?? {});
    const token = sessionToken(req, options);
    if (token)
      await db.session.deleteMany({ where: { tokenHash: tokenHash(token) } });
    res.clearCookie(cookieName(options), cookieOptions(options));
    res.status(204).end();
  });
  router.get('/me', requireSession(db, options), (_req, res) =>
    res.json({ user: authenticatedUser(res) }),
  );
  return router;
}
