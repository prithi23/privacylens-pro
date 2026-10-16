export type TrackerCategory =
  'analytics' | 'advertising' | 'social' | 'session-replay' | 'other';
export type TrackerProvider = {
  id: string;
  name: string;
  category: TrackerCategory;
  domains: readonly string[];
  description: string;
  sources: readonly string[];
  purposes: readonly string[];
  reviewedAt: string;
  rule: 'hostname-boundary-v1';
};
export const datasetMetadata = {
  version: 'privacylens-reference-2026.10.16',
  reviewedAt: '2026-10-16',
  license: 'CC0-1.0',
  attribution:
    'PrivacyLens contributors; independently curated factual endpoint references and original descriptions. Vendor documentation is linked, not redistributed.',
  rule: 'hostname-boundary-v1',
  coverage:
    'Curated endpoint associations, not an exhaustive tracker list; no DNS/CNAME resolution or behavior verification.',
} as const;
const entry = (
  id: string,
  name: string,
  category: TrackerCategory,
  domains: string[],
  description: string,
  source: string,
  purposes: string[],
): TrackerProvider => ({
  id,
  name,
  category,
  domains,
  description,
  sources: [source],
  purposes,
  reviewedAt: datasetMetadata.reviewedAt,
  rule: 'hostname-boundary-v1',
});
export const trackerProviders: readonly TrackerProvider[] = [
  entry(
    'google-analytics',
    'Google Analytics',
    'analytics',
    ['google-analytics.com'],
    'Audience and event measurement endpoints.',
    'https://developers.google.com/analytics/devguides/collection/ga4',
    ['audience-measurement'],
  ),
  entry(
    'doubleclick',
    'Google DoubleClick',
    'advertising',
    ['doubleclick.net'],
    'Advertising delivery and conversion measurement endpoints.',
    'https://policies.google.com/technologies/ads',
    ['advertising'],
  ),
  entry(
    'meta',
    'Meta Pixel',
    'advertising',
    ['connect.facebook.net'],
    'Social advertising conversion SDK reference.',
    'https://developers.facebook.com/docs/meta-pixel/',
    ['advertising'],
  ),
  entry(
    'hotjar',
    'Hotjar',
    'session-replay',
    ['hotjar.com', 'hotjar.io'],
    'Behavioral analysis and session replay service references.',
    'https://help.hotjar.com/',
    ['behavioral-analytics', 'session-replay'],
  ),
  entry(
    'segment',
    'Twilio Segment',
    'analytics',
    ['cdn.segment.com', 'api.segment.io'],
    'Analytics SDK delivery and event ingestion references; first-party proxying is possible.',
    'https://segment.com/blog/twilio-segment-edge-sdk/',
    ['event-collection'],
  ),
  entry(
    'mixpanel',
    'Mixpanel',
    'analytics',
    ['cdn.mxpnl.com'],
    'Product and behavioral analytics SDK delivery. Custom ingestion domains are outside this reference.',
    'https://docs.mixpanel.com/docs/tracking-methods/sdks/javascript',
    ['behavioral-analytics'],
  ),
  entry(
    'amplitude',
    'Amplitude',
    'analytics',
    ['api2.amplitude.com', 'api.eu.amplitude.com'],
    'Product analytics event ingestion endpoints; not the vendor dashboard hostname.',
    'https://www.amplitude.com/docs/apis/analytics/http-v2',
    ['behavioral-analytics'],
  ),
  entry(
    'clarity',
    'Microsoft Clarity',
    'session-replay',
    ['clarity.ms'],
    'Behavioral analysis, heatmap and recording service references.',
    'https://learn.microsoft.com/en-us/clarity/setup-and-installation/clarity-csp',
    ['behavioral-analytics', 'session-replay'],
  ),
  entry(
    'fullstory',
    'Fullstory',
    'session-replay',
    ['edge.fullstory.com', 'rs.fullstory.com'],
    'Capture SDK and recorder host associations; presence does not establish a recording.',
    'https://developer.fullstory.com/browser/fullcapture/configure-capture/',
    ['session-replay'],
  ),
  entry(
    'linkedin',
    'LinkedIn Insight',
    'social',
    ['px.ads.linkedin.com'],
    'Social advertising conversion pixel endpoint. General LinkedIn media CDN domains are excluded.',
    'https://www.linkedin.com/help/linkedin/answer/a420861/',
    ['advertising', 'social-measurement'],
  ),
  entry(
    'pinterest',
    'Pinterest Tag',
    'social',
    ['ct.pinterest.com'],
    'Social advertising event collection endpoint. The mixed-purpose pinimg CDN is excluded.',
    'https://help.pinterest.com/en/business/article/install-the-base-code',
    ['advertising', 'social-measurement'],
  ),
  entry(
    'x-pixel',
    'X Pixel',
    'social',
    ['static.ads-twitter.com', 'analytics.twitter.com', 'ads-api.twitter.com'],
    'Social advertising SDK and conversion measurement endpoint associations.',
    'https://help.x.com/en/business-and-advertising/conversion-tracking-for-websites',
    ['advertising', 'social-measurement'],
  ),
  entry(
    'sentry',
    'Sentry Browser Diagnostics',
    'other',
    ['browser.sentry-cdn.com'],
    'Diagnostic SDK delivery; error telemetry can be privacy relevant, but is not necessarily advertising or cross-site tracking.',
    'https://sentry.io/for/javascript/',
    ['diagnostics'],
  ),
];
