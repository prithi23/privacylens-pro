import { Prisma, type PrismaClient } from '@prisma/client';
import type { ScanInput } from '@privacylens/shared';
import type { Filters, ListQuery } from '../validators/api.js';
import { HttpError } from '../middleware/error.js';
import { uploadIdentity } from '../services/upload-identity.js';
export const scanSelect = {
  id: true,
  hostname: true,
  privacyScore: true,
  concernLevel: true,
  httpsStatus: true,
  thirdPartyDomainCount: true,
  trackerMatchCount: true,
  scannedAt: true,
  createdAt: true,
  analysis: true,
} as const;
export function scanWhere(
  userId: string,
  retentionDays: number,
  filters: Filters = {},
): Prisma.ScanWhereInput {
  const cutoff = new Date(Date.now() - retentionDays * 86400000);
  return {
    userId,
    ...(filters.hostname ? { hostname: filters.hostname } : {}),
    scannedAt: {
      gte:
        filters.from && new Date(filters.from) > cutoff
          ? new Date(filters.from)
          : cutoff,
      ...(filters.to ? { lte: new Date(filters.to) } : {}),
    },
  };
}
export async function saveScan(
  db: PrismaClient,
  userId: string,
  input: ScanInput,
  device?: { id: string; uploadId: string },
) {
  return db.$transaction(async (tx) => {
    if (device) {
      const active = await tx.$queryRaw<
        { revokedAt: Date | null; createdAt: Date; userId: string }[]
      >`SELECT "revokedAt", "createdAt", "userId" FROM "Device" WHERE id = ${device.id} FOR UPDATE`;
      if (
        !active[0] ||
        active[0].userId !== userId ||
        active[0].revokedAt ||
        active[0].createdAt.getTime() + 90 * 86400000 <= Date.now()
      )
        throw new HttpError(
          401,
          'DEVICE_UNAUTHORIZED',
          'Extension authorization expired or was revoked. Pair again.',
        );
    }
    // Serialize consent changes against uploads; no upload can bypass disabled consent.
    const rows = await tx.$queryRaw<
      { syncEnabled: boolean; retentionDays: number }[]
    >`SELECT "syncEnabled", "retentionDays" FROM "UserPreference" WHERE "userId" = ${userId} FOR UPDATE`;
    if (!rows[0]?.syncEnabled)
      throw new HttpError(
        403,
        'SYNC_DISABLED',
        'Explicitly enable scan storage in preferences before saving scans.',
      );
    const cutoff = new Date(Date.now() - rows[0].retentionDays * 86400000);
    if (new Date(input.scannedAt) < cutoff)
      throw new HttpError(
        400,
        'OUTSIDE_RETENTION',
        'The scan timestamp is outside your retention window.',
      );
    await tx.scan.deleteMany({ where: { userId, scannedAt: { lt: cutoff } } });
    if (device) {
      const existing = await tx.scan.findUnique({
        where: {
          deviceId_clientUploadId: {
            deviceId: device.id,
            clientUploadId: device.uploadId,
          },
        },
        select: { ...scanSelect, findings: true },
      });
      if (existing) {
        if (uploadIdentity(existing) !== uploadIdentity(input))
          throw new HttpError(
            409,
            'UPLOAD_ID_CONFLICT',
            'This upload ID already belongs to different scan data. Scan again to create a new snapshot.',
          );
        return existing;
      }
      await tx.device.update({
        where: { id: device.id },
        data: { lastUsedAt: new Date() },
      });
    }
    const findings = [
      ...new Map(
        input.findings.map((finding) => [
          `${finding.category}|${finding.severity}|${finding.evidenceHostname}`,
          {
            category: finding.category,
            severity: finding.severity,
            evidenceHostname: finding.evidenceHostname,
            description: `${finding.category} resource reference observed at ${finding.evidenceHostname}. Classification does not prove tracking execution.`,
          },
        ]),
      ).values(),
    ];
    return tx.scan.create({
      data: {
        ...input,
        scannedAt: new Date(input.scannedAt),
        userId,
        ...(device
          ? { deviceId: device.id, clientUploadId: device.uploadId }
          : {}),
        findings: { create: findings },
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
  });
}
export async function listScans(
  db: PrismaClient,
  userId: string,
  retention: number,
  query: ListQuery,
) {
  const where = scanWhere(userId, retention, {
    hostname: query.hostname,
    from: query.from,
    to: query.to,
  });
  const [items, total] = await db.$transaction(
    [
      db.scan.findMany({
        where,
        select: scanSelect,
        orderBy: [{ [query.sort]: query.order }, { id: 'asc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      db.scan.count({ where }),
    ],
    { isolationLevel: 'RepeatableRead' },
  );
  return {
    items,
    total,
    page: query.page,
    limit: query.limit,
    totalPages: Math.ceil(total / query.limit),
  };
}
