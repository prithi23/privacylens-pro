import { describe, it, expect } from 'vitest';
import {
  matchReference,
  classifyHostname,
  createClassifier,
} from './classification';
import { trackerProviders, datasetMetadata } from './trackers';
import { hostnameSchema } from './schemas/index';
import { confusion } from './research-metrics';
describe('reviewed reference and hostname index', () => {
  it('rejects bare public suffixes in a custom registry', () =>
    expect(() =>
      createClassifier([{ ...trackerProviders[0], domains: ['com'] }]),
    ).toThrow('Invalid reference hostname'));
  it('has offline versioned, attributed, independently sourced providers in all categories', () => {
    expect(trackerProviders.length).toBeGreaterThan(4);
    expect(datasetMetadata.license).toBe('CC0-1.0');
    const domains = trackerProviders.flatMap((item) => [...item.domains]);
    expect(new Set(domains).size).toBe(domains.length);
    expect(new Set(trackerProviders.map((item) => item.category)).size).toBe(5);
    for (const provider of trackerProviders) {
      expect(provider.sources.every((url) => url.startsWith('https://'))).toBe(
        true,
      );
      provider.domains.forEach((domain) =>
        expect(hostnameSchema.safeParse(domain).success).toBe(true),
      );
    }
  });
  it.each([
    'notgoogle-analytics.com',
    'google-analytics.com.attacker.test',
    '-bad.google-analytics.com',
    'https://google-analytics.com/private',
    'a..google-analytics.com',
  ])('does not match invalid or impersonating host %s', (host) =>
    expect(matchReference(host)).toEqual([]),
  );
  it('normalizes boundary-matched subdomains and preserves exact rule evidence', () => {
    expect(matchReference('REGION1.GOOGLE-ANALYTICS.COM.')[0]).toMatchObject({
      referenceDomain: 'google-analytics.com',
      rule: 'hostname-boundary-v1',
      certainty: 'reference-association-only',
    });
  });
  it('does not equate generic third-party or first-party references with tracking', () => {
    expect(
      classifyHostname('assets.example.com', 'www.example.com').scope,
    ).toBe('first-party');
    expect(classifyHostname('bob.github.io', 'alice.github.io').scope).toBe(
      'third-party',
    );
    expect(matchReference('cdn.jsdelivr.net')).toEqual([]);
    expect(matchReference('s.pinimg.com')).toEqual([]);
  });
  it('supports overlapping references without substring matching', () => {
    const provider = trackerProviders[0];
    const match = createClassifier([
      { ...provider, domains: ['example.com', 'metrics.example.com'] },
    ]);
    expect(
      match('a.metrics.example.com').map((row) => row.referenceDomain),
    ).toEqual(['metrics.example.com', 'example.com']);
  });
});
describe('research metric denominators', () => {
  it('computes a complete confusion matrix including misses and false positives', () => {
    expect(
      confusion([
        { expected: true, predicted: true },
        { expected: true, predicted: false },
        { expected: false, predicted: true },
        { expected: false, predicted: false },
      ]),
    ).toEqual({
      truePositives: 1,
      falsePositives: 1,
      trueNegatives: 1,
      falseNegatives: 1,
      precision: 0.5,
      recall: 0.5,
      f1: 0.5,
      total: 4,
    });
  });
  it('uses undefined rates instead of inventing perfect scores for empty evidence', () => {
    expect(confusion([])).toMatchObject({
      precision: null,
      recall: null,
      f1: null,
      total: 0,
    });
  });
});
