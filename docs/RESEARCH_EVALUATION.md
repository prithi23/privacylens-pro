# Reproducible research evaluation

Measured **2026-10-16T10:14:34.420Z**, v24.12.0/win32. Dataset **privacylens-reference-2026.10.16**, 13 providers/19 domains; scoring **exposure-v2**. Source fingerprint: 858e168786f23100d4973dab14c4668062305a3a3992daed9cb94d0e8bab7e59.

## Task, labels and scope

One independently labeled scenario per row. TP/TN/FP/FN assess provider-domain exposure under the fixture design, not actual tracking execution. Includes deliberate out-of-band coverage-stress misses. CPU timings use performance.now, warmup and repeated samples; no DOM/network timing is implied.

The 29 checked-in cases in fixtures/research/cases.ts are independently specified, not generated from the registry. They cover known provider endpoints, first parties, benign resource controls, subdomains, co.uk/private-suffix tenants, prefix/suffix impersonation, mixed transport, missing timing and restricted sources. Four deliberately out-of-band cases represent an unlisted synthetic provider, a first-party CNAME alias, hidden timing activity and a restricted environment. Their positive scenario labels are known by construction; the scanner cannot observe the missing evidence and correctly documents this limitation. They are not measurements of real DNS behavior or actual personal-data transmission. Generic CDN negatives are fixture controls, not universal claims that those services never track.

| Corpus                 | TP  | FP  | TN  | FN  | Precision | Recall  | F1      |
| ---------------------- | --- | --- | --- | --- | --------- | ------- | ------- |
| All scenarios          | 16  | 0   | 9   | 4   | 100.00%   | 80.00%  | 88.89%  |
| Observable subset      | 16  | 0   | 9   | 0   | 100.00%   | 100.00% | 100.00% |
| Coverage stress subset | 0   | 0   | 0   | 4   | undefined | 0.00%   | 0.00%   |

Precision=TP/(TP+FP), recall=TP/(TP+FN), F1=2TP/(2TP+FP+FN). Undefined denominators remain null in JSON and an em dash in the UI; they are never displayed as perfect performance. Each scenario is one sample, regardless of duplicate resource observations.

## Case results

| Case                   | Family                 | Outcome | Coverage    | Score    | Median CPU ms | Label rationale                                                                                     |
| ---------------------- | ---------------------- | ------- | ----------- | -------- | ------------- | --------------------------------------------------------------------------------------------------- |
| ga                     | known-provider         | TP      | snapshot    | 92       | 0.068         | Documented analytics endpoint.                                                                      |
| ads                    | known-provider         | TP      | snapshot    | 88       | 0.033         | Documented advertising domain subdomain.                                                            |
| meta                   | known-provider         | TP      | snapshot    | 88       | 0.033         | Advertising SDK reference.                                                                          |
| hotjar                 | known-provider         | TP      | snapshot    | 86       | 0.028         | Behavior/session replay provider association.                                                       |
| segment                | behavioral-analytics   | TP      | snapshot    | 92       | 0.028         | Documented event SDK delivery.                                                                      |
| mixpanel               | behavioral-analytics   | TP      | snapshot    | 92       | 0.036         | Documented behavioral SDK delivery.                                                                 |
| amplitude              | behavioral-analytics   | TP      | snapshot    | 92       | 0.030         | Documented event ingestion endpoint.                                                                |
| clarity                | session-replay         | TP      | snapshot    | 86       | 0.019         | Documented behavioral service hostname.                                                             |
| fullstory              | session-replay         | TP      | snapshot    | 86       | 0.020         | Documented capture SDK endpoint.                                                                    |
| linkedin               | social                 | TP      | snapshot    | 90       | 0.036         | Documented social conversion endpoint.                                                              |
| pinterest              | social                 | TP      | snapshot    | 90       | 0.021         | Documented social conversion endpoint.                                                              |
| x                      | social                 | TP      | snapshot    | 90       | 0.022         | Documented conversion measurement endpoint.                                                         |
| diagnostics            | diagnostics            | TP      | snapshot    | 96       | 0.018         | Privacy-relevant diagnostic SDK association; not a malware or advertising verdict.                  |
| normalization          | subdomains             | TP      | snapshot    | 92       | 0.019         | Case normalization; collectors remove trailing DNS dots before the observation contract.            |
| first-party            | first-party            | TN      | snapshot    | 100      | 0.012         | Same registrable domain; benign fixture resource.                                                   |
| provider-first-party   | first-party            | TN      | snapshot    | 100      | 0.012         | Known provider host is first-party in this scenario and excluded from third-party scoring.          |
| cdn                    | benign-control         | TN      | snapshot    | 97       | 0.014         | Generic CDN reference is not automatically labeled tracking.                                        |
| font                   | benign-control         | TN      | snapshot    | 97       | 0.014         | Font delivery is outside this curated tracker registry.                                             |
| mixed-cdn              | benign-control         | TN      | snapshot    | 97       | 0.025         | Mixed-purpose image CDN deliberately excluded from host-only rules.                                 |
| prefix-impersonation   | false-positive-control | TN      | snapshot    | 97       | 0.025         | Substring prefix must not match.                                                                    |
| suffix-impersonation   | false-positive-control | TN      | snapshot    | 97       | 0.024         | Embedded domain must not match.                                                                     |
| public-suffix          | public-suffix          | TN      | snapshot    | 100      | 0.017         | Registrable site example.co.uk remains first-party.                                                 |
| private-suffix         | public-suffix          | TN      | snapshot    | 97       | 0.021         | Different private-suffix tenant is third-party, but not a reference match.                          |
| mixed-http             | transport              | TP      | snapshot    | 87       | 0.027         | An HTTP reference on HTTPS is observable, not proof that the browser completed it.                  |
| missing-timing-visible | missing-timing         | TP      | partial     | 92       | 0.026         | DOM evidence still permits a partial score.                                                         |
| unlisted               | coverage-stress        | FN      | snapshot    | 97       | 0.011         | Synthetic known-by-construction provider intentionally absent from reference; expected miss.        |
| cname                  | coverage-stress        | FN      | snapshot    | 100      | 0.015         | Out-of-band fixture label says first-party alias points to analytics; no DNS capability exists.     |
| missing-timing-hidden  | coverage-stress        | FN      | partial     | withheld | 0.017         | Out-of-band activity exists but is absent from DOM and unavailable timing; expected miss.           |
| restricted             | restricted             | FN      | unavailable | withheld | 0.010         | Restricted environment supplies neither source; score must be withheld, with a scenario-level miss. |

Per-case timings use three warmups and 25 actual calls. Full-workload benchmarks use five warmups and 30 samples; see PERFORMANCE.md. Timings exclude DOM collection, network and browser permissions. The source hash normalizes line endings and includes detection/scoring contracts, fixtures, runner and dependency lockfile. It is a freshness/provenance check, not a cryptographic certification of vendor behavior.

## Reproduce and interpret

Run npm run evaluate, npm run evaluate:check, npm run research:report, then rebuild/restart the API. The dashboard Evaluation lab reads this generated JSON through the authenticated /research/evaluation endpoint and provides scope/outcome filters, charts and case evidence. Nothing generates random results at request time.

Run npm run test:browser-scanner and npm run test:browser-sync for actual Chrome collection/action/approved-sync evidence. The controlled browser fixture uses CSP-blocked external references; four observed providers do not establish four executed trackers. Native sync additionally checks PostgreSQL provenance and owner dashboard pages. The second comparison site is an explicit HTTP test fixture. All database fixtures are isolated and cleaned up.

The sample is small, synthetic, deliberately designed and not a held-out or representative Web corpus. Perfect observable-subset scores do not establish real-world precision/recall. No confidence interval, Internet-wide false-positive rate, malware detection capability or behavioral tracking accuracy is claimed. Future research should use independently curated larger corpora, versioned real-browser sessions with consent states, representative benign CDNs, independently established DNS/proxy ground truth and repeated hardware-controlled timing runs. A first-party proxy or unavailable browser evidence is an expected failure mode, not hidden from the reported denominator.
