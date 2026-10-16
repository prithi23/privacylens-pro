import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { randomUUID } from 'node:crypto';
import { trackerProviders, type HealthResponse } from '@privacylens/shared';
import { errorHandler, HttpError } from './middleware/error.js';
import type { PrismaClient } from '@prisma/client';
import { authRouter } from './routes/auth.js';
import { scansRouter } from './routes/scans.js';
import { preferencesRouter } from './routes/preferences.js';
import { analyticsRouter } from './routes/analytics.js';
import { protectWrites } from './middleware/origin.js';
import { requireSession } from './services/session.js';
import { emptySchema, trackerQuerySchema } from './validators/api.js';
import { deviceApi, devicesRouter } from './routes/devices.js';
import { researchRouter } from './routes/research.js';
import { datasetMetadata } from '@privacylens/shared/trackers';

export function createApp(options: {
  origins: string[];
  databaseReady: () => Promise<void>;
  db?: PrismaClient;
  production?: boolean;
  sessionHours?: number;
  authLimit?: number;
  trustedProxies?: string[];
}) {
  const app = express();
  app.disable('x-powered-by');
  app.set(
    'trust proxy',
    options.trustedProxies?.length ? options.trustedProxies : false,
  );
  app.use((_req, res, next) => {
    res.locals.requestId = randomUUID();
    res.setHeader('X-Request-ID', res.locals.requestId);
    next();
  });
  app.use(
    helmet({
      strictTransportSecurity: options.production
        ? { maxAge: 31536000, includeSubDomains: false }
        : false,
    }),
  );
  const originPolicy = (device: boolean) =>
    cors({
      credentials: !device,
      origin(origin, callback) {
        const allowed = device
          ? Boolean(origin && /^chrome-extension:\/\/[a-p]{32}$/.test(origin))
          : Boolean(origin && options.origins.includes(origin));
        if (!origin || allowed) callback(null, true);
        else
          callback(
            new HttpError(403, 'ORIGIN_DENIED', 'Origin is not allowed.'),
          );
      },
    });
  const sessionCors = originPolicy(false);
  const extensionCors = originPolicy(true);
  app.use((req, res, next) =>
    (req.path.startsWith('/api/v1/extension/') ? extensionCors : sessionCors)(
      req,
      res,
      next,
    ),
  );
  app.use(
    rateLimit({
      windowMs: 60000,
      limit: 120,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      message: {
        error: {
          code: 'RATE_LIMITED',
          message: 'Too many requests; try again later.',
        },
      },
    }),
  );
  app.use(express.json({ limit: '64kb' }));
  app.get('/api/v1/health', (req, res) => {
    emptySchema.parse(req.query);
    const body: HealthResponse = {
      status: 'ok',
      service: 'privacylens-api',
      phase: options.db ? 3 : 1,
    };
    res.json(body);
  });
  app.get('/api/v1/ready', async (req, res) => {
    emptySchema.parse(req.query);
    try {
      await options.databaseReady();
      res.json({ status: 'ready', database: 'connected' });
    } catch {
      res.status(503).json({ status: 'not_ready', database: 'unavailable' });
    }
  });
  app.get('/api/v1/trackers', (req, res) => {
    const q = trackerQuerySchema.parse(req.query).q.toLowerCase();
    res.json({
      items: trackerProviders.filter((provider) =>
        `${provider.name} ${provider.domains.join(' ')} ${provider.category}`
          .toLowerCase()
          .includes(q),
      ),
      source: 'bundled-reference',
      datasetVersion: datasetMetadata.version,
    });
  });
  if (options.db) {
    const db = options.db;
    const sessionOptions = {
      production: options.production ?? false,
      sessionHours: options.sessionHours ?? 24,
    };
    app.use('/api/v1', (_req, res, next) => {
      res.setHeader('Cache-Control', 'no-store');
      next();
    });
    app.use(
      '/api/v1/extension',
      (req, _res, next) => {
        if (
          !['GET', 'HEAD', 'OPTIONS'].includes(req.method) &&
          !req.is('application/json')
        )
          throw new HttpError(415, 'JSON_REQUIRED', 'Use application/json.');
        next();
      },
      deviceApi(db),
    );
    app.use('/api/v1', protectWrites(options.origins));
    app.use('/api/v1/auth', authRouter(db, sessionOptions, options.authLimit));
    const privateApi = express.Router();
    privateApi.use(requireSession(db, sessionOptions));
    privateApi.use('/scans', scansRouter(db));
    privateApi.use('/preferences', preferencesRouter(db));
    privateApi.use('/analytics', analyticsRouter(db));
    privateApi.use('/research', researchRouter(db));
    privateApi.use('/devices', devicesRouter(db));
    app.use('/api/v1', privateApi);
  }
  app.use((_req, _res, next) =>
    next(new HttpError(404, 'NOT_FOUND', 'Endpoint not found.')),
  );
  app.use(errorHandler);
  return app;
}
