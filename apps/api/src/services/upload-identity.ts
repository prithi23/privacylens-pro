import { createHash } from 'node:crypto';
function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value !== null && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, stable(item)]),
    );
  return value;
}
export function uploadIdentity(value: {
  hostname: string;
  privacyScore: number;
  concernLevel: string;
  httpsStatus: string;
  thirdPartyDomainCount: number;
  trackerMatchCount: number;
  scannedAt: Date | string;
  analysis?: unknown;
  findings: { category: string; severity: string; evidenceHostname: string }[];
}) {
  const normalized = {
    hostname: value.hostname,
    privacyScore: value.privacyScore,
    concernLevel: value.concernLevel,
    httpsStatus: value.httpsStatus,
    thirdPartyDomainCount: value.thirdPartyDomainCount,
    trackerMatchCount: value.trackerMatchCount,
    scannedAt: new Date(value.scannedAt).toISOString(),
    analysis: value.analysis ?? null,
    findings: [
      ...new Set(
        value.findings.map(
          (finding) =>
            `${finding.category}|${finding.severity}|${finding.evidenceHostname}`,
        ),
      ),
    ].sort(),
  };
  return createHash('sha256')
    .update(JSON.stringify(stable(normalized)))
    .digest('hex');
}
