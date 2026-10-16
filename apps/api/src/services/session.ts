import { createHash, randomBytes } from 'node:crypto';
import type { Request, Response, CookieOptions, RequestHandler } from 'express';
import type { PrismaClient } from '@prisma/client';
import { HttpError } from '../middleware/error.js';

export const userSelect = {
  id: true,
  email: true,
  createdAt: true,
  preference: { select: { syncEnabled: true, retentionDays: true } },
} as const;
export type SessionUser = {
  id: string;
  email: string;
  createdAt: Date;
  preference: { syncEnabled: boolean; retentionDays: number } | null;
};
export type SessionOptions = { production: boolean; sessionHours: number };
export const tokenHash = (token: string) =>
  createHash('sha256').update(token).digest('hex');
export const newToken = () => randomBytes(32).toString('base64url');
export const cookieName = (options: SessionOptions) =>
  options.production ? '__Host-privacylens_session' : 'privacylens_session';
export const cookieOptions = (options: SessionOptions): CookieOptions => ({
  httpOnly: true,
  secure: options.production,
  sameSite: 'strict',
  path: '/',
});
export function sessionToken(
  req: Request,
  options: SessionOptions,
): string | undefined {
  const header = req.headers.cookie;
  if (!header || header.length > 8192) return;
  const candidates = header
    .split(';')
    .map((value) => value.trim())
    .filter((value) => value.startsWith(`${cookieName(options)}=`));
  if (candidates.length !== 1) return;
  const token = candidates[0].slice(cookieName(options).length + 1);
  return /^[A-Za-z0-9_-]{43}$/.test(token) ? token : undefined;
}
export function setSessionCookie(
  res: Response,
  token: string,
  options: SessionOptions,
) {
  res.cookie(cookieName(options), token, {
    ...cookieOptions(options),
    maxAge: options.sessionHours * 3600000,
  });
}
export function authenticatedUser(res: Response): SessionUser {
  return res.locals.auth.user as SessionUser;
}
export function requireSession(
  db: PrismaClient,
  options: SessionOptions,
): RequestHandler {
  return async (req, res, next) => {
    const token = sessionToken(req, options);
    if (!token)
      throw new HttpError(401, 'UNAUTHENTICATED', 'Sign in to continue.');
    const session = await db.session.findUnique({
      where: { tokenHash: tokenHash(token) },
      select: { id: true, expiresAt: true, user: { select: userSelect } },
    });
    if (!session || session.expiresAt <= new Date()) {
      res.clearCookie(cookieName(options), cookieOptions(options));
      throw new HttpError(
        401,
        'UNAUTHENTICATED',
        'Your session is invalid or expired.',
      );
    }
    res.locals.auth = session;
    next();
  };
}
