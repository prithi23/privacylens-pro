import { Prisma, type PrismaClient } from '@prisma/client';
import type { Filters } from '../validators/api.js';
import { scanSelect, scanWhere } from '../repositories/scans.js';
function conditions(userId: string, retention: number, filters: Filters) {
  const cutoff = new Date(Date.now() - retention * 86400000);
  const lower =
    filters.from && new Date(filters.from) > cutoff
      ? new Date(filters.from)
      : cutoff;
  const parts = [
    Prisma.sql`"userId" = ${userId}`,
    Prisma.sql`"scannedAt" >= ${lower}`,
  ];
  if (filters.to)
    parts.push(Prisma.sql`"scannedAt" <= ${new Date(filters.to)}`);
  if (filters.hostname)
    parts.push(Prisma.sql`"hostname" = ${filters.hostname}`);
  return Prisma.join(parts, ' AND ');
}
export async function overview(
  db: PrismaClient,
  userId: string,
  retention: number,
  filters: Filters,
) {
  const where = conditions(userId, retention, filters);
  return db.$transaction(
    async (tx) => {
      const [
        metrics,
        trends,
        trackerDistribution,
        recentScans,
        frequentProviders,
      ] = await Promise.all([
        tx.$queryRaw<
          {
            totalScans: number;
            uniqueDomains: number;
            trackerMatches: number;
            averageScore: number | null;
            scoreVersions: { version: string; scans: number }[];
          }[]
        >(
          Prisma.sql`SELECT COUNT(*)::float8 AS "totalScans", COUNT(DISTINCT "hostname")::float8 AS "uniqueDomains", COALESCE(SUM("trackerMatchCount"),0)::float8 AS "trackerMatches", AVG("privacyScore")::float8 AS "averageScore", COALESCE((SELECT jsonb_agg(jsonb_build_object('version',v.version,'scans',v.scans) ORDER BY v.version) FROM (SELECT COALESCE(analysis->>'scoringVersion','legacy-unversioned') AS version,COUNT(*)::float8 AS scans FROM "Scan" WHERE ${where} GROUP BY 1) v),'[]'::jsonb) AS "scoreVersions" FROM "Scan" WHERE ${where}`,
        ),
        tx.$queryRaw<{ date: string; scans: number; averageScore: number }[]>(
          Prisma.sql`SELECT date_trunc('day',"scannedAt")::date::text AS date, COUNT(*)::float8 AS scans, AVG("privacyScore")::float8 AS "averageScore" FROM "Scan" WHERE ${where} GROUP BY 1 ORDER BY 1`,
        ),
        tx.$queryRaw<
          { category: string; findingCount: number; scanCount: number }[]
        >(
          Prisma.sql`SELECT f.category, COUNT(*)::float8 AS "findingCount", COUNT(DISTINCT s.id)::float8 AS "scanCount" FROM "Finding" f JOIN "Scan" s ON s.id = f."scanId" WHERE ${where} GROUP BY f.category ORDER BY "findingCount" DESC, f.category ASC`,
        ),
        tx.scan.findMany({
          where: scanWhere(userId, retention, filters),
          select: scanSelect,
          take: 10,
          orderBy: [{ scannedAt: 'desc' }, { id: 'asc' }],
        }),
        tx.$queryRaw<{ name: string; scanCount: number }[]>(
          Prisma.sql`SELECT p.name, COUNT(DISTINCT s.id)::float8 AS "scanCount" FROM "Finding" f JOIN "Scan" s ON s.id = f."scanId" JOIN "TrackerDomain" d ON (f."evidenceHostname" = d.domain OR right(f."evidenceHostname", length(d.domain)+1) = '.' || d.domain) JOIN "TrackerProvider" p ON p.id = d."providerId" WHERE ${where} GROUP BY p.id, p.name ORDER BY "scanCount" DESC, p.name LIMIT 10`,
        ),
      ]);
      const { scoreVersions, ...summary } = metrics[0];
      return {
        metrics: summary,
        trends,
        trackerDistribution,
        recentScans,
        frequentProviders,
        scoreVersions,
        scoreSource: 'authenticated-client-metadata',
        trendTimezone: 'UTC',
      };
    },
    { isolationLevel: 'RepeatableRead' },
  );
}
export async function compareDomains(
  db: PrismaClient,
  userId: string,
  retention: number,
  hostnames: string[],
  filters: Filters,
) {
  const where = {
    ...scanWhere(userId, retention, filters),
    hostname: { in: hostnames },
  };
  return db.$transaction(
    async (tx) => {
      const aggregates = await tx.scan.groupBy({
        by: ['hostname'],
        where,
        _count: { _all: true },
        _avg: { privacyScore: true },
        _sum: { trackerMatchCount: true },
      });
      return Promise.all(
        hostnames.map(async (hostname) => {
          const aggregate = aggregates.find(
            (item) => item.hostname === hostname,
          );
          const domainWhere = { ...where, hostname };
          const [first, latest] = await Promise.all([
            tx.scan.findFirst({
              where: domainWhere,
              orderBy: [{ scannedAt: 'asc' }, { id: 'asc' }],
              select: { privacyScore: true },
            }),
            tx.scan.findFirst({
              where: domainWhere,
              orderBy: [{ scannedAt: 'desc' }, { id: 'desc' }],
              select: scanSelect,
            }),
          ]);
          return {
            latest,
            history: await tx.scan.findMany({
              where: domainWhere,
              select: { scannedAt: true, privacyScore: true },
              orderBy: [{ scannedAt: 'desc' }, { id: 'desc' }],
              take: 100,
            }),
            hostname,
            scans: aggregate?._count._all ?? 0,
            averageScore: aggregate?._avg.privacyScore ?? null,
            trackerMatches: aggregate?._sum.trackerMatchCount ?? 0,
            latestScore: latest?.privacyScore ?? null,
            scoreChangeFromFirst:
              first && latest ? latest.privacyScore - first.privacyScore : null,
          };
        }),
      );
    },
    { isolationLevel: 'RepeatableRead' },
  );
}
