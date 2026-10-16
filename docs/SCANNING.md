# Phase 2: local website scanning

Phase 6 retains this collection flow and expands the offline registry to 13 providers/19 domains. Current scoring is `exposure-v2`: an empty observable snapshot withholds the numeric score. New approved uploads preserve methodology, dataset, coverage and deductions; legacy scores are never recalculated. See [TRACKER_INTELLIGENCE.md](TRACKER_INTELLIGENCE.md) and [SCORING_METHODOLOGY.md](SCORING_METHODOLOGY.md) for the current rules; the original fixture still matches four providers.

## What runs

`Popup.tsx` calls `services/scan.ts` only after a button click. It queries the active tab and injects `content/collect.ts` using `chrome.scripting.executeScript`, `world:'ISOLATED'`, and `frameIds:[0]`. Scanning uses activeTab/scripting with no automatic content scripts, navigation listeners, scan storage writes or backend requests. Phase 5 separately adds trusted local credential storage and a loopback API host grant for explicit pairing/status/unpair/approved upload actions. Merely scanning never uploads. See PHASE5.md.

The collector observes `script[src]`, images (both declared `src` and selected `currentSrc`), `iframe[src]`, and `performance.getEntriesByType('resource')`. Relative references use `document.baseURI`. Only HTTP(S) resources are included. Each returned observation contains hostname, protocol, resource kind and source; no full URL, query, fragment, page text, cookie, password, request body or header is returned. Non-HTTP(S), empty and malformed references are skipped; unsupported/malformed nonempty references are counted.

Collection is bounded at 5,000 DOM elements, 5,000 timing entries and 10,000 normalized observations. Truncation and source failures explicitly mark coverage as partial. An unavailable source is never represented as a successful empty scan. Both sources unavailable, or unknown page protocol, withhold the score. Counts describe observations: DOM and timing can report the same resource, so they must not be presented as unique request totals.

Returned payloads pass a strict Zod contract. The service checks the tab URL and observed hostname/protocol, then performs a small confirmation injection to compare Chrome document IDs. Navigation/reloads during collection discard the result. A 12-second timeout restores the UI; Chrome cannot cancel an already submitted synchronous collector, but late results never overwrite the rejected scan. Errors never echo visited URLs. A failed rescan retains the last completed snapshot, not an invented result.

## Domain and provider rules

`packages/shared/src/domains.ts` uses `tldts` with private suffix support. Normal site subdomains share a registrable site domain; unrelated tenants such as `alice.github.io` and `bob.github.io` remain third parties. IP literals/localhost fall back to exact normalized hostname comparisons. This is a site-boundary heuristic, not proof of common ownership.

Matching requires an exact reference domain or a dot-delimited subdomain. `www.google-analytics.com` matches; `notgoogle-analytics.com` and `google-analytics.com.evil.test` do not. Precise rules remain precise: `connect.facebook.net` does not imply every `facebook.net` hostname is a tracker.

The reviewed local reference v1 has four providers: Google Analytics, Google DoubleClick, Meta Pixel and Hotjar. A match is displayed only for third-party observed hosts and includes the exact observed hostname, matching rule and provider explanation. First-party provider references are not charged as third-party tracking. Provider presence does not prove tracking executed, consent was violated or malware is present.

## Score v1

`apps/extension/src/analysis/engine.ts` is pure and deterministic. Start at 100, subtract the four components, clamp to 0–100. Higher scores mean fewer observed exposure signals; the score is educational and is not a safety certification.

| Component                        | Deduction                                                        | Deduplication                                                                                        |
| -------------------------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| HTTP page                        | 25 (HTTPS: 0)                                                    | Once for the page; HTTP pages get no additional mixed-reference penalty                              |
| Recognized third-party providers | analytics 8; advertising 12; session-replay 14; sum capped at 45 | Once per provider regardless of hostnames, resources or sources; category weight is already included |
| Other third-party site domains   | 3 per site domain, capped at 25                                  | Registrable domains/private tenants; exclude every recognized-provider site domain                   |
| HTTP references on an HTTPS page | 5 per unique HTTP-referenced hostname, capped at 30              | Once per hostname, regardless of repeated sources                                                    |

Tracker classification and insecure transport describe separate signals; a recognized provider referenced over HTTP on HTTPS can contribute to both, with each separate reason shown. Concern labels: score ≥75 lower observed exposure, 45–74 moderate, <45 higher; unavailable score → unknown. Labels are heuristic, not security verdicts. A well-observed empty snapshot can score 100, but the UI explicitly warns that the small dataset and unobservable tracking techniques prevent a tracker-free conclusion.

## Rebuild and reload (Windows)

```powershell
# Run from the privacylens repository root.
npm run build -w @privacylens/extension
npm run verify:extension
```

Open `chrome://extensions`, find PrivacyLens Pro and click **Reload**. If loading for the first time, enable Developer mode, choose Load unpacked and select `apps\extension\dist`. Reopen the popup on a normal website and click Scan Website. No running API/database is needed.

## Controlled fixture and real-browser check

```powershell
npm run dev:fixtures
# Open http://127.0.0.1:4174, then scan using the extension.
```

The fixture contains actual DOM resource references. CSP blocks all external resources; only local script/image requests are permitted. Expected: four provider matches; six third-party site domains; HTTP score `100 − 25 − 45 − 6 = 24`. A lookalike must remain unclassified. CSP failures in this fixture's browser console are intentional.

```powershell
npm run test:browser-scanner
```

This launches installed Chrome headlessly with a separate profile, serves the fixture on an ephemeral loopback port, and evaluates the real collector and engine in a CDP isolated world. It validates real DOM/timing signals, host-only sanitization and expected findings/score. It uses no Chrome API mocks. It does **not** prove toolbar `activeTab` grants or popup interactions; those remain manual. Windows defaults to the usual Chrome install path. Set `CHROME_PATH` for another installation/platform. Reports and isolated test profiles are ignored under `.browser-smoke/`; the script closes the browser/server when finished.

## Manual acceptance checklist

- Supported HTTPS website: scan, expand every panel, confirm hostname evidence, arithmetic, timestamp, category counts and actual non-simulated values.
- Controlled HTTP fixture: four providers, six third-party domains, score 24, exact evidence and no first-party provider penalty; turn off the API/database and repeat.
- `chrome://settings`, Chrome Web Store and a `file:` page: understandable unsupported state with scanning disabled. Restricted enterprise pages may instead show a permission failure.
- Deny extension site access, close a tab, or navigate/reload during a scan: graceful failure and retry; no stale result attributed to the new page.
- Rescan twice: no accumulation/double counting; a previous snapshot remains explicitly labeled if the new scan fails.
- Close/reopen popup: results clear; opening alone does not start collection. No backend requests or browsing-history storage.
- Keyboard: focus Scan Website and details panels; expand/collapse with keyboard; inspect long hostnames and scroll. Enable reduced motion to suppress the score animation.
- Empty or partial signals: no invented trackers; missing coverage and educational-score limitations remain visible.

## Unsupported checks

No continuous network interception, cross-origin iframe contents, worker internals, closed/open shadow-tree traversal, inline fingerprinting analysis, CNAME uncloaking, first-party tracking proxies, cookies, headers, TLS certificate verification or privacy-policy compliance checks. Resource Timing buffers may be incomplete and cross-origin details restricted; a DOM reference may be lazy, blocked, upgraded or unused. Optional advanced network monitoring is not enabled or implemented in Phase 2.
