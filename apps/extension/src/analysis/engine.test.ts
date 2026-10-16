import { describe, expect, it } from 'vitest';
import type {
  PageObservation,
  ResourceObservation,
} from '@privacylens/shared/observations';
import { analyzePage } from './engine';

export const page = (
  resources: ResourceObservation[] = [],
  changes: Partial<PageObservation> = {},
): PageObservation => ({
  hostname: 'example.com',
  protocol: 'https:',
  scannedAt: '2026-10-16T10:00:00.000Z',
  domStatus: 'available',
  timingStatus: 'available',
  truncated: false,
  ignoredResourceCount: 0,
  resources,
  ...changes,
});
export const resource = (
  hostname: string,
  changes: Partial<ResourceObservation> = {},
): ResourceObservation => ({
  hostname,
  protocol: 'https:',
  kind: 'script',
  source: 'dom',
  ...changes,
});

describe('deterministic exposure indicator', () => {
  it('handles an empty snapshot honestly without inventing matches', () => {
    const result = analyzePage(page());
    expect(result.score).toBeNull();
    expect(result.coverage).toBe('partial');
    expect(result.trackers).toEqual([]);
    expect(result.observationCount).toBe(0);
    expect(result.limitations.join(' ')).toContain(
      'not a safety certification',
    );
    expect(result.recommendations.join(' ')).toContain(
      'cannot recognize every',
    );
  });
  it('charges HTTP once and does not double-charge its HTTP resources', () => {
    const result = analyzePage(
      page([resource('example.com', { protocol: 'http:' })], {
        protocol: 'http:',
      }),
    );
    expect(result.score).toBe(75);
    expect(
      result.components.find((item) => item.id === 'insecure')?.deduction,
    ).toBe(0);
  });
  it('matches known subdomains with exact observed evidence', () => {
    const result = analyzePage(page([resource('www.google-analytics.com')]));
    expect(result.score).toBe(92);
    expect(result.trackers[0].hostnames).toEqual(['www.google-analytics.com']);
    expect(result.unclassifiedDomains).toEqual([]);
  });
  it('does not double-count provider domains, categories, sources, or repeated resources', () => {
    const result = analyzePage(
      page([
        resource('www.google-analytics.com'),
        resource('www.google-analytics.com', { source: 'timing' }),
        resource('region1.google-analytics.com', { kind: 'image' }),
      ]),
    );
    expect(result.score).toBe(92);
    expect(result.trackers).toHaveLength(1);
    expect(result.thirdPartyDomains).toEqual(['google-analytics.com']);
    expect(result.categories).toEqual([{ category: 'analytics', count: 1 }]);
    expect(result.observationCount).toBe(3);
    expect(
      result.hosts.find((host) => host.hostname === 'www.google-analytics.com')
        ?.sources,
    ).toEqual(['dom', 'timing']);
  });
  it('does not charge a first-party reference match as a third-party tracker', () => {
    const result = analyzePage(
      page([resource('www.google-analytics.com')], {
        hostname: 'google-analytics.com',
      }),
    );
    expect(result.trackers).toHaveLength(0);
    expect(result.score).toBe(100);
  });
  it('does not falsely match suffix impersonation', () => {
    const result = analyzePage(
      page([
        resource('google-analytics.com.evil.test'),
        resource('notgoogle-analytics.com'),
      ]),
    );
    expect(result.trackers).toHaveLength(0);
    expect(result.score).toBe(94);
  });
  it('groups unclassified hosts by site, not subdomain count', () => {
    const result = analyzePage(
      page([resource('a.cdn-example.net'), resource('b.cdn-example.net')]),
    );
    expect(result.score).toBe(97);
    expect(result.thirdPartyDomains).toEqual(['cdn-example.net']);
  });
  it('counts separate private-suffix tenants as separate third parties', () => {
    const result = analyzePage(
      page([resource('alice.github.io'), resource('bob.github.io')]),
    );
    expect(result.thirdPartyDomains).toHaveLength(2);
    expect(result.score).toBe(94);
  });
  it('penalizes each insecure hostname once, independently of provider classification', () => {
    const result = analyzePage(
      page([
        resource('example.com', { protocol: 'http:' }),
        resource('example.com', { protocol: 'http:', source: 'timing' }),
        resource('google-analytics.com', { protocol: 'http:' }),
      ]),
    );
    expect(result.insecureHostnames).toEqual([
      'example.com',
      'google-analytics.com',
    ]);
    expect(result.score).toBe(82);
  });
  it('caps every component and clamps the final score', () => {
    const hosts = [
      'google-analytics.com',
      'doubleclick.net',
      'connect.facebook.net',
      'hotjar.com',
      ...Array.from(
        { length: 20 },
        (_, index) => `site${index}.example.net${index}`,
      ),
    ];
    const result = analyzePage(
      page(hosts.map((host) => resource(host, { protocol: 'http:' }))),
    );
    expect(result.components.map((item) => item.deduction)).toEqual([
      0, 45, 25, 30,
    ]);
    expect(result.score).toBe(0);
    expect(result.concernLevel).toBe('high');
  });
  it('counts category providers rather than resource entries', () => {
    const result = analyzePage(
      page([resource('doubleclick.net'), resource('connect.facebook.net')]),
    );
    expect(result.categories).toEqual([{ category: 'advertising', count: 2 }]);
    expect(result.score).toBe(76);
  });
  it('is deterministic and independent of input order', () => {
    const resources = [
      resource('hotjar.io'),
      resource('cdn.example.com'),
      resource('other.example.net'),
    ];
    expect(analyzePage(page(resources))).toEqual(
      analyzePage(page([...resources].reverse())),
    );
  });
  it.each([
    { domStatus: 'unavailable' as const },
    { timingStatus: 'unavailable' as const },
    { truncated: true },
  ])('marks missing or capped observations as partial: %j', (changes) => {
    const result = analyzePage(page([], changes));
    expect(result.coverage).toBe('partial');
    expect(result.recommendations.join(' ')).toContain(
      'Coverage is incomplete',
    );
  });
  it('withholds scoring when both collection sources are unavailable', () => {
    const result = analyzePage(
      page([], { domStatus: 'unavailable', timingStatus: 'unavailable' }),
    );
    expect(result.score).toBeNull();
    expect(result.concernLevel).toBe('unknown');
    expect(result.coverage).toBe('unavailable');
  });
  it('withholds scoring when transport is unknown', () =>
    expect(analyzePage(page([], { protocol: 'unknown' })).score).toBeNull());
  it('rejects sensitive fields or malformed hostnames rather than exposing them', () => {
    expect(() =>
      analyzePage({ ...page(), cookies: 'secret' } as PageObservation),
    ).toThrow();
    expect(() =>
      analyzePage(page([resource('https://example.com/private?secret=1')])),
    ).toThrow();
  });
  it('reports ignored nonnetwork resources', () =>
    expect(
      analyzePage(page([], { ignoredResourceCount: 4 })).limitations.join(' '),
    ).toContain('4 unsupported or malformed'));
});
