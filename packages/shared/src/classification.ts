import { trackerProviders, type TrackerProvider } from './trackers.js';
import { isThirdParty, normalizeHostname } from './domains.js';
import { getDomain } from 'tldts';
export type ReferenceEvidence = {
  provider: TrackerProvider;
  referenceDomain: string;
  evidenceHostname: string;
  rule: 'hostname-boundary-v1';
  certainty: 'reference-association-only';
};
/** Suffix index: inspect DNS label suffixes, never scan every provider or use substring matches. */
export function createClassifier(providers: readonly TrackerProvider[]) {
  const index = new Map<string, TrackerProvider[]>();
  for (const provider of providers)
    for (const domain of provider.domains) {
      const normalized = normalizeHostname(domain);
      if (
        !/^[a-z0-9]+(?:[a-z0-9.-]*[a-z0-9])?$/.test(normalized) ||
        normalized.includes('..') ||
        !getDomain(normalized, { allowPrivateDomains: true })
      )
        throw new Error('Invalid reference hostname');
      index.set(normalized, [...(index.get(normalized) ?? []), provider]);
    }
  return (input: string): ReferenceEvidence[] => {
    const hostname = normalizeHostname(input);
    if (
      hostname.length > 253 ||
      !/^[a-z0-9.-]+$/.test(hostname) ||
      hostname.includes('..')
    )
      return [];
    const labels = hostname.split('.');
    const evidence: ReferenceEvidence[] = [];
    if (
      labels.some(
        (label) =>
          label.length > 63 || !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label),
      )
    )
      return [];
    for (let indexOffset = 0; indexOffset < labels.length; indexOffset++) {
      const suffix = labels.slice(indexOffset).join('.');
      for (const provider of index.get(suffix) ?? [])
        evidence.push({
          provider,
          referenceDomain: suffix,
          evidenceHostname: hostname,
          rule: 'hostname-boundary-v1',
          certainty: 'reference-association-only',
        });
    }
    return evidence;
  };
}
export const matchReference = createClassifier(trackerProviders);
export function classifyHostname(hostname: string, pageHostname: string) {
  const evidence = matchReference(hostname);
  return {
    hostname: normalizeHostname(hostname),
    scope: isThirdParty(hostname, pageHostname)
      ? ('third-party' as const)
      : ('first-party' as const),
    evidence,
  };
}
