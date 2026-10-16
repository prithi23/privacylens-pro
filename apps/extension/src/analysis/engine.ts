import {
  trackerProviders,
  datasetMetadata,
  type TrackerCategory,
} from '@privacylens/shared/trackers';
import { matchReference } from '@privacylens/shared/classification';
import { methodology } from '@privacylens/shared/methodology';
import { normalizeHostname, siteDomain } from '@privacylens/shared/domains';
import {
  pageObservationSchema,
  type PageObservation,
  type ResourceObservation,
} from '@privacylens/shared/observations';

export type Category = TrackerCategory;
export type TrackerMatch = {
  id: string;
  name: string;
  category: Category;
  description: string;
  hostnames: string[];
  referenceDomains: string[];
  weight: number;
  rule: 'hostname-boundary-v1';
  certainty: 'reference-association-only';
  sources: readonly string[];
};
export type HostEvidence = {
  hostname: string;
  siteDomain: string;
  thirdParty: boolean;
  kinds: ResourceObservation['kind'][];
  sources: ResourceObservation['source'][];
  protocols: ResourceObservation['protocol'][];
};
export type ScoreComponent = {
  id: string;
  label: string;
  deduction: number;
  explanation: string;
};
export type ScanResult = {
  hostname: string;
  scannedAt: string;
  protocol: PageObservation['protocol'];
  score: number | null;
  concernLevel: 'low' | 'moderate' | 'high' | 'unknown';
  coverage: 'snapshot' | 'partial' | 'unavailable';
  observationCount: number;
  domCount: number;
  timingCount: number;
  hosts: HostEvidence[];
  thirdPartyDomains: string[];
  unclassifiedDomains: string[];
  trackers: TrackerMatch[];
  categories: { category: Category; count: number }[];
  insecureHostnames: string[];
  components: ScoreComponent[];
  recommendations: string[];
  limitations: string[];
  datasetVersion: string;
  scoringVersion: 'exposure-v2';
  assessment: {
    domAvailable: boolean;
    timingAvailable: boolean;
    truncated: boolean;
    ignoredResources: number;
  };
};

const weights = methodology.weights;
const sorted = <T extends string>(values: Iterable<T>): T[] =>
  [...new Set(values)].sort();

export function analyzePage(input: PageObservation): ScanResult {
  // Fail closed on malformed injected payloads; unknown fields cannot enter results.
  const observation = pageObservationSchema.parse(input);
  const hostname = normalizeHostname(observation.hostname);
  const pageSite = siteDomain(hostname);
  const grouped = new Map<string, ResourceObservation[]>();
  for (const resource of observation.resources) {
    const key = normalizeHostname(resource.hostname);
    const group = grouped.get(key);
    if (group) group.push(resource);
    else grouped.set(key, [resource]);
  }
  const hosts: HostEvidence[] = [...grouped]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([host, resources]) => {
      const resourceSite = siteDomain(host);
      return {
        hostname: host,
        siteDomain: resourceSite,
        thirdParty: resourceSite !== pageSite,
        kinds: sorted(resources.map((item) => item.kind)),
        sources: sorted(resources.map((item) => item.source)),
        protocols: sorted(resources.map((item) => item.protocol)),
      };
    });
  const thirdPartyHosts = hosts.filter((host) => host.thirdParty);
  const thirdPartyDomains = sorted(
    thirdPartyHosts.map((host) => host.siteDomain),
  );
  const providerMatches = new Map<
    string,
    { hostnames: Set<string>; domains: Set<string> }
  >();
  for (const host of thirdPartyHosts)
    for (const match of matchReference(host.hostname)) {
      const current = providerMatches.get(match.provider.id) ?? {
        hostnames: new Set<string>(),
        domains: new Set<string>(),
      };
      current.hostnames.add(host.hostname);
      current.domains.add(match.referenceDomain);
      providerMatches.set(match.provider.id, current);
    }
  const trackers: TrackerMatch[] = trackerProviders.flatMap((provider) => {
    const matches = providerMatches.get(provider.id);
    if (!matches) return [];
    return [
      {
        id: provider.id,
        name: provider.name,
        category: provider.category,
        description: provider.description,
        hostnames: sorted(matches.hostnames),
        referenceDomains: sorted(matches.domains),
        weight: weights[provider.category],
        rule: 'hostname-boundary-v1',
        certainty: 'reference-association-only',
        sources: provider.sources,
      },
    ];
  });
  const recognizedSiteDomains = new Set(
    trackers.flatMap((tracker) => tracker.hostnames.map(siteDomain)),
  );
  const unclassifiedDomains = thirdPartyDomains.filter(
    (domain) => !recognizedSiteDomains.has(domain),
  );
  const insecureHostnames =
    observation.protocol === 'https:'
      ? hosts
          .filter((host) => host.protocols.includes('http:'))
          .map((host) => host.hostname)
      : [];
  const categories = sorted(trackers.map((tracker) => tracker.category)).map(
    (category) => ({
      category,
      count: trackers.filter((tracker) => tracker.category === category).length,
    }),
  );
  const components: ScoreComponent[] = [
    {
      id: 'transport',
      label: 'Page connection',
      deduction: observation.protocol === 'http:' ? 25 : 0,
      explanation:
        observation.protocol === 'http:'
          ? 'HTTP page: 25 points. HTTP resources on this page are not penalized again as mixed references.'
          : observation.protocol === 'https:'
            ? 'HTTPS page observed: no page-transport deduction.'
            : 'Page protocol unknown: the overall score is withheld.',
    },
    {
      id: 'trackers',
      label: 'Recognized third-party providers',
      deduction: Math.min(
        45,
        trackers.reduce((sum, tracker) => sum + tracker.weight, 0),
      ),
      explanation: `One deduction per provider, regardless of duplicate resources or subdomains: ${trackers.length ? trackers.map((tracker) => `${tracker.name} ${tracker.weight}`).join(' + ') : 'no matches'}. Capped at 45. Category weight is included here, never added again.`,
    },
    {
      id: 'unclassified',
      label: 'Other third-party domains',
      deduction: Math.min(25, unclassifiedDomains.length * 3),
      explanation: `${unclassifiedDomains.length} unclassified site domain(s) × 3, capped at 25. Recognized-provider site domains are excluded. This is an exposure heuristic; CDNs and essential services can be legitimate.`,
    },
    {
      id: 'insecure',
      label: 'HTTP references on HTTPS',
      deduction: Math.min(30, insecureHostnames.length * 5),
      explanation: `${insecureHostnames.length} unique HTTP-referenced hostname(s) on HTTPS × 5, capped at 30. A reference does not prove an insecure request completed; Chrome may block or upgrade it.`,
    },
  ];
  const coverage =
    observation.domStatus === 'unavailable' &&
    observation.timingStatus === 'unavailable'
      ? 'unavailable'
      : observation.protocol === 'unknown' ||
          observation.domStatus === 'unavailable' ||
          observation.timingStatus === 'unavailable' ||
          observation.truncated ||
          observation.resources.length === 0
        ? 'partial'
        : 'snapshot';
  const score =
    coverage === 'unavailable' ||
    observation.protocol === 'unknown' ||
    observation.resources.length === 0
      ? null
      : Math.max(
          0,
          Math.min(
            100,
            100 -
              components.reduce(
                (sum, component) => sum + component.deduction,
                0,
              ),
          ),
        );
  const recommendations = [
    ...(observation.protocol === 'http:'
      ? [
          'Avoid entering sensitive information over HTTP. Use the HTTPS version if the site supports it.',
        ]
      : []),
    ...(trackers.length
      ? [
          'Review optional cookie consent and decline nonessential analytics or advertising where offered. Consider browser tracking protection for the listed providers.',
        ]
      : []),
    ...(trackers.some((tracker) => tracker.category === 'session-replay')
      ? [
          'A session-replay provider reference is present. Check the website’s consent choices and privacy policy; this scan cannot establish that a recording occurred.',
        ]
      : []),
    ...(insecureHostnames.length
      ? [
          'Site owners should replace HTTP resource references with HTTPS and verify mixed-content behavior in DevTools.',
        ]
      : []),
    ...(unclassifiedDomains.length
      ? [
          'Review the unclassified domains before blocking them: they may provide required images, scripts, or application services.',
        ]
      : []),
    ...(coverage !== 'snapshot'
      ? [
          'Rescan after the page settles. Coverage is incomplete; missing observations must not be interpreted as safety.',
        ]
      : []),
    ...(!trackers.length
      ? [
          'No reference-provider matches were observed. Continue using normal privacy precautions; the small local dataset cannot recognize every tracking technique.',
        ]
      : []),
  ];
  const limitations = [
    ...(observation.resources.length === 0
      ? [
          'No usable resource observations were collected. exposure-v2 withholds a score rather than converting missing evidence into 100/100.',
        ]
      : []),
    'This is a user-initiated snapshot of the top-level document, not continuous network monitoring. Later activity, workers, nested frame contents and shadow DOM may be missed.',
    'DOM references and Resource Timing entries are observations, not proof of a completed request, cookie use, tracking execution or malicious activity. Observation totals can include the same resource in both sources.',
    `The ${trackerProviders.length}-provider curated reference is not exhaustive. First-party proxies, CNAME cloaking, inline fingerprinting, server-side tracking and unlisted providers are not detected. Diagnostics providers are not necessarily tracking services.`,
    'Cookies, request bodies, response headers, security headers, TLS certificate validity and privacy-policy compliance are not inspected. Cross-origin timing details and buffers may be limited.',
    ...(observation.domStatus === 'unavailable'
      ? ['DOM collection was unavailable.']
      : []),
    ...(observation.timingStatus === 'unavailable'
      ? ['Resource Timing collection was unavailable.']
      : []),
    ...(observation.truncated
      ? [
          'Collection reached a limit (5,000 DOM elements, 5,000 timing entries, or 10,000 observations). Results are partial.',
        ]
      : []),
    ...(observation.ignoredResourceCount
      ? [
          `${observation.ignoredResourceCount} unsupported or malformed resource reference(s) were ignored (for example data: or blob: URLs).`,
        ]
      : []),
    'The score is an educational exposure heuristic, not a safety certification. Higher scores mean fewer observed signals, not proof of privacy.',
  ];
  return {
    hostname,
    scannedAt: observation.scannedAt,
    protocol: observation.protocol,
    score,
    concernLevel:
      score === null
        ? 'unknown'
        : score >= 75
          ? 'low'
          : score >= 45
            ? 'moderate'
            : 'high',
    coverage,
    observationCount: observation.resources.length,
    domCount: observation.resources.filter((item) => item.source === 'dom')
      .length,
    timingCount: observation.resources.filter(
      (item) => item.source === 'timing',
    ).length,
    hosts,
    thirdPartyDomains,
    unclassifiedDomains,
    trackers,
    categories,
    insecureHostnames,
    components,
    recommendations,
    limitations,
    datasetVersion: datasetMetadata.version,
    scoringVersion: methodology.version,
    assessment: {
      domAvailable: observation.domStatus === 'available',
      timingAvailable: observation.timingStatus === 'available',
      truncated: observation.truncated,
      ignoredResources: observation.ignoredResourceCount,
    },
  };
}
