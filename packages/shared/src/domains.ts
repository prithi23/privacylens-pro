import { getDomain } from 'tldts';

export function normalizeHostname(hostname: string): string {
  return hostname.toLowerCase().replace(/\.$/, '');
}

/** Private suffixes keep unrelated tenants (e.g. github.io) separate. */
export function siteDomain(hostname: string): string {
  const normalized = normalizeHostname(hostname);
  return getDomain(normalized, { allowPrivateDomains: true }) ?? normalized;
}

export function isThirdParty(hostname: string, pageHostname: string): boolean {
  return siteDomain(hostname) !== siteDomain(pageHostname);
}

/** A label boundary is mandatory: notgoogle-analytics.com is not a match. */
export function matchesDomain(hostname: string, reference: string): boolean {
  const host = normalizeHostname(hostname);
  const domain = normalizeHostname(reference);
  return host === domain || host.endsWith(`.${domain}`);
}
