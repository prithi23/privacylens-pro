# Tracker intelligence

The offline registry is `packages/shared/src/trackers.ts`, version **privacylens-reference-2026.10.16**: 13 providers, 19 explicit domains, five stable API categories. Descriptions and selections are independently authored, with a source URL, reviewed date, purpose, and `hostname-boundary-v1` rule per provider. This is a curated endpoint-association reference, not a malware list or exhaustive tracking census.

| Provider                   | Classification                        | Reviewed primary source                                                                                |
| -------------------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Google Analytics           | Analytics                             | [Collection documentation](https://developers.google.com/analytics/devguides/collection/ga4)           |
| DoubleClick                | Advertising                           | [Google advertising technologies](https://policies.google.com/technologies/ads)                        |
| Meta Pixel                 | Advertising                           | [Pixel documentation](https://developers.facebook.com/docs/meta-pixel/)                                |
| Hotjar                     | Session replay / behavioral analytics | [Vendor documentation](https://help.hotjar.com/)                                                       |
| Twilio Segment             | Analytics / event collection          | [SDK and first-party proxy design](https://segment.com/blog/twilio-segment-edge-sdk/)                  |
| Mixpanel                   | Behavioral analytics                  | [JavaScript integration](https://docs.mixpanel.com/docs/tracking-methods/sdks/javascript)              |
| Amplitude                  | Behavioral analytics                  | [Event ingestion hosts](https://www.amplitude.com/docs/apis/analytics/http-v2)                         |
| Microsoft Clarity          | Session replay / behavioral analytics | [Required host policy](https://learn.microsoft.com/en-us/clarity/setup-and-installation/clarity-csp)   |
| Fullstory                  | Session replay                        | [Capture hosts](https://developer.fullstory.com/browser/fullcapture/configure-capture/)                |
| LinkedIn Insight           | Social conversion measurement         | [Insight troubleshooting](https://www.linkedin.com/help/linkedin/answer/a420861/)                      |
| Pinterest Tag              | Social conversion measurement         | [Tag integration](https://help.pinterest.com/en/business/article/install-the-base-code)                |
| X Pixel                    | Social conversion measurement         | [Conversion tracking](https://help.x.com/en/business-and-advertising/conversion-tracking-for-websites) |
| Sentry Browser Diagnostics | Other / diagnostics                   | [Browser SDK delivery](https://sentry.io/for/javascript/)                                              |

The exact endpoint list is in the registry and seeded PostgreSQL rows. Mixed-purpose CDN hosts such as `s.pinimg.com` and general social media domains are deliberately excluded; a hostname-only rule cannot distinguish their paths. Amplitude's web dashboard is excluded from its ingestion rules. The Sentry SDK association is privacy-relevant diagnostic telemetry, **not necessarily tracking or advertising**. A match never establishes that any SDK executed, recording occurred, or personal data left the browser.

## Sources, licensing and attribution

No third-party tracker list was copied. Vendor integration documentation is linked for factual hostname review; its text, software, graphics and logos are not redistributed. The newly authored registry selection/descriptions/metadata are dedicated under **CC0-1.0**, to the extent the contributors hold rights, without changing the license status of vendor materials or the rest of this repository. See [the CC0 legal instrument](https://creativecommons.org/publicdomain/zero/1.0/legalcode). Vendor names identify associations and do not imply endorsement.

The source review also examined [DuckDuckGo Tracker Radar's license](https://github.com/duckduckgo/tracker-radar/blob/main/LICENSE) and [Ghostery TrackerDB's license](https://github.com/ghostery/trackerdb/blob/main/LICENSE), both CC BY-NC-SA 4.0. Their bulk datasets and metadata are **not bundled or adapted** here. Future imports must undergo a separate license/attribution review rather than treating public GitHub data as unrestricted. The existing `tldts` package and its public-suffix data remain dependency-managed through the lockfile.

## Classification and evidence

`createClassifier` constructs a hostname suffix index once. Each lookup normalizes case/trailing DNS dots, validates label boundaries, then checks whole DNS-label suffixes. `notgoogle-analytics.com` and `google-analytics.com.attacker.test` cannot match. Registry entries cannot be bare public suffixes. Each association retains its observed hostname, matched reference domain, provider, rule ID, and the explicit certainty label `reference-association-only`.

The analysis engine classifies site boundaries with `tldts` including private suffixes. `alice.github.io` and `bob.github.io` are different sites; subdomains of `example.co.uk` are one site. First-party provider hosts are excluded from third-party scoring. Ordinary unmatched third parties stay **unclassified**, with a separately explained exposure heuristic rather than a tracker verdict. Providers, evidence hosts and registrable sites are deduplicated for their respective features.

No DNS or CNAME resolution occurs. First-party proxies, inline scripts, server-side tracking, shadow roots, nested frame contents and later activity can be missed. Current permissions expose top-level DOM references and available Resource Timing entries, not full request logs, payloads, cookies, response headers or certificate validation. No webRequest/debugger/broad website permission was added.

## Offline updates

1. Review vendor endpoint documentation; prefer narrow documented ingestion/SDK hosts. Record the source and purpose, and reject ambiguous shared CDNs.
2. Change the immutable dataset version and review date when rules, domains or categories change. Preserve release history in Git; never relabel saved scans with the new version.
3. Run tests and `npm run evaluate`; inspect intentional misses and false-positive controls. Run `npm run evaluate:check` after formatting.
4. Seed both verified databases with `npm run db:seed` / `npm run db:seed:test`; this updates reference rows only. Rebuild/reload the extension and restart the API.
5. Retain the generated report, source fingerprint, source links and license review with the release. There are no remote updates, silent downloads or automatic website scans.

Dashboard Intelligence shows the database rows' own provenance; `/research/reference` describes the bundled classifier. Historical frequent-provider analytics match saved hostnames against the **current** reference and are labeled associations. Saved numeric scores are not recalculated.
