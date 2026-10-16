import { scanSchema, type ScanInput } from '@privacylens/shared';
import type { ScanResult } from '../analysis/engine';
/** Construct a fresh allowlisted payload, never serialize the collector/report wholesale. */
export function toSyncScan(result: ScanResult): ScanInput {
  if (result.score === null || result.concernLevel === 'unknown')
    throw new Error(
      'This scan has insufficient coverage for a stored score. Scan again before syncing.',
    );
  const parsed = scanSchema.safeParse({
    hostname: result.hostname,
    privacyScore: result.score,
    concernLevel: result.concernLevel,
    httpsStatus:
      result.protocol === 'https:'
        ? 'https'
        : result.protocol === 'http:'
          ? 'http'
          : 'unknown',
    thirdPartyDomainCount: result.thirdPartyDomains.length,
    trackerMatchCount: result.trackers.length,
    scannedAt: result.scannedAt,
    findings: result.trackers.flatMap((tracker) =>
      tracker.hostnames.map((hostname) => ({
        category: tracker.category,
        severity: 'low' as const,
        evidenceHostname: hostname,
        description: `${tracker.category} resource reference observed.`,
      })),
    ),
    analysis: {
      scoringVersion: result.scoringVersion,
      datasetVersion: result.datasetVersion,
      coverage: result.coverage,
      assessment: result.assessment,
      components: result.components,
    },
  });
  if (!parsed.success)
    throw new Error(
      'This scan cannot be stored: uploads require a public-style hostname and at most 1,000 valid findings. Local IP/localhost scans remain local.',
    );
  if (new TextEncoder().encode(JSON.stringify(parsed.data)).length > 60000)
    throw new Error(
      'The sanitized scan is too large to upload safely. It remains available locally.',
    );
  return parsed.data;
}
