import { describe, expect, it } from 'vitest';
import { isThirdParty, matchesDomain, siteDomain } from './domains';

describe('public-suffix-aware classification', () => {
  it('groups normal subdomains', () =>
    expect(isThirdParty('cdn.shop.example.co.uk', 'www.example.co.uk')).toBe(
      false,
    ));
  it('does not group unrelated private-suffix tenants', () => {
    expect(siteDomain('cdn.alice.github.io')).toBe('alice.github.io');
    expect(isThirdParty('bob.github.io', 'alice.github.io')).toBe(true);
    expect(isThirdParty('cdn.alice.github.io', 'alice.github.io')).toBe(false);
  });
  it('keeps IPs and local hosts comparable without inventing registrable domains', () => {
    expect(siteDomain('127.0.0.1')).toBe('127.0.0.1');
    expect(isThirdParty('127.0.0.1', '127.0.0.1')).toBe(false);
    expect(isThirdParty('localhost', '127.0.0.1')).toBe(true);
    expect(isThirdParty('[::1]', '[::1]')).toBe(false);
  });
  it('normalizes casing and a trailing dot', () =>
    expect(isThirdParty('CDN.EXAMPLE.COM.', 'example.com')).toBe(false));
});
describe('tracker domain boundaries', () => {
  it.each([
    'google-analytics.com',
    'www.google-analytics.com',
    'A.B.GOOGLE-ANALYTICS.COM.',
  ])('matches %s', (host) =>
    expect(matchesDomain(host, 'google-analytics.com')).toBe(true),
  );
  it.each([
    'notgoogle-analytics.com',
    'google-analytics.com.evil.test',
    'google-analytics-com.example',
    'facebook.net',
  ])('rejects lookalike or nonmatching %s', (host) =>
    expect(matchesDomain(host, 'google-analytics.com')).toBe(false),
  );
  it('does not expand a precise subdomain rule to an entire provider-owned site', () => {
    expect(matchesDomain('connect.facebook.net', 'connect.facebook.net')).toBe(
      true,
    );
    expect(matchesDomain('static.facebook.net', 'connect.facebook.net')).toBe(
      false,
    );
  });
});
