import { it, expect } from 'vitest';
import { analyzePage } from '../analysis/engine';
import { toSyncScan } from './sync-data';
import type { PageObservation } from '@privacylens/shared/observations';
const observation: PageObservation = {
  hostname: 'example.com',
  protocol: 'https:',
  scannedAt: new Date().toISOString(),
  domStatus: 'available',
  timingStatus: 'available',
  truncated: false,
  ignoredResourceCount: 0,
  resources: [
    {
      hostname: 'www.google-analytics.com',
      protocol: 'https:',
      kind: 'script',
      source: 'dom',
    },
  ],
};
it('serializes an explicit metadata allowlist from a real analyzed observation', () => {
  const report = analyzePage(observation);
  const payload = toSyncScan({
    ...report,
    secretCookie: 'must-never-upload',
  } as typeof report);
  expect(payload).toMatchObject({
    hostname: 'example.com',
    privacyScore: 92,
    trackerMatchCount: 1,
    thirdPartyDomainCount: 1,
    httpsStatus: 'https',
  });
  expect(Object.keys(payload).sort()).toEqual(
    [
      'hostname',
      'privacyScore',
      'concernLevel',
      'httpsStatus',
      'thirdPartyDomainCount',
      'trackerMatchCount',
      'scannedAt',
      'findings',
      'analysis',
    ].sort(),
  );
  expect(payload.findings[0].evidenceHostname).toBe('www.google-analytics.com');
  expect(JSON.stringify(payload)).not.toContain('must-never-upload');
  expect(JSON.stringify(payload)).not.toContain('recommendations');
});
it('keeps unsupported storage hostnames local', () => {
  expect(() =>
    toSyncScan(analyzePage({ ...observation, hostname: '127.0.0.1' })),
  ).toThrow('public-style hostname');
  expect(() =>
    toSyncScan(analyzePage({ ...observation, hostname: 'localhost' })),
  ).toThrow('public-style hostname');
});
it('refuses unavailable scores instead of inventing a stored score', () => {
  expect(() =>
    toSyncScan(analyzePage({ ...observation, protocol: 'unknown' })),
  ).toThrow('insufficient coverage');
});
it('rejects invalid domain evidence rather than uploading a full URL', () => {
  const report = analyzePage(observation);
  report.trackers[0].hostnames = ['https://example.com/private?secret=123'];
  expect(() => toSyncScan(report)).toThrow('valid findings');
});
