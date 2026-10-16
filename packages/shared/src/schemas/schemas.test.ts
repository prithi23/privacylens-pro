import { describe, expect, it } from 'vitest';
import { hostnameSchema, preferenceSchema, scanSchema } from './index.js';
const validScan = {
  hostname: 'example.com',
  privacyScore: 90,
  concernLevel: 'low',
  httpsStatus: 'https',
  thirdPartyDomainCount: 0,
  trackerMatchCount: 0,
  scannedAt: '2026-10-16T00:00:00.000Z',
  findings: [],
};

describe('sanitized data contracts', () => {
  it('normalizes a hostname', () =>
    expect(hostnameSchema.parse('WWW.Example.CO.UK.')).toBe(
      'www.example.co.uk',
    ));
  it.each([
    'https://example.com/?secret=x',
    'user:password@example.com',
    'example.com/path',
    'example.com:80',
    '127.0.0.1',
    '-bad.example.com',
    'example..com',
    '.example.com',
    'example.com..',
    `${'a'.repeat(64)}.example.com`,
  ])('rejects unsafe hostname %s', (value) =>
    expect(hostnameSchema.safeParse(value).success).toBe(false),
  );
  it('rejects extra sensitive fields', () =>
    expect(
      scanSchema.safeParse({
        hostname: 'example.com',
        privacyScore: 90,
        concernLevel: 'low',
        httpsStatus: 'https',
        thirdPartyDomainCount: 0,
        trackerMatchCount: 0,
        scannedAt: new Date().toISOString(),
        findings: [],
        cookies: 'secret',
      }).success,
    ).toBe(false));
  it.each([
    { privacyScore: -1 },
    { privacyScore: 101 },
    { privacyScore: 50.5 },
    { httpsStatus: 'safe' },
    { thirdPartyDomainCount: -1 },
    { scannedAt: 'yesterday' },
  ])('rejects invalid scan field %j', (patch) => {
    expect(scanSchema.safeParse({ ...validScan, ...patch }).success).toBe(
      false,
    );
  });
  it('accepts sanitized scans with explicitly unknown connection status', () => {
    expect(
      scanSchema.parse({ ...validScan, httpsStatus: 'unknown' }).httpsStatus,
    ).toBe('unknown');
  });
  it('requires explicit consent and bounded retention', () => {
    expect(preferenceSchema.safeParse({ retentionDays: 30 }).success).toBe(
      false,
    );
    expect(
      preferenceSchema.safeParse({ syncEnabled: true, retentionDays: 366 })
        .success,
    ).toBe(false);
    expect(
      preferenceSchema.parse({ syncEnabled: false, retentionDays: 30 })
        .syncEnabled,
    ).toBe(false);
  });
});
