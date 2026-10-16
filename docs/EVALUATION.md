# Evaluation methodology

This is the historical Phase 2–3 evaluation record. The current 13-provider/19-domain dataset and 29-case measured evaluation are documented in [RESEARCH_EVALUATION.md](RESEARCH_EVALUATION.md), with reproducible raw results and explicit coverage-stress misses. The four-provider description below refers to the earlier milestone.

Phase 1 tests validate sanitized contracts, hostname normalization/rejection, HTTP health/readiness, CORS, security headers, JSON errors and public tracker search. Phase 3 now adds real PostgreSQL schema tests and real loopback HTTP authentication/CRUD/isolation/analytics tests. The database suite does not substitute mocks: inputs are explicit integration fixtures persisted in the separate test database, and responses are computed by the actual API/Prisma/PostgreSQL path. Application database access in tests is read-only and verified unchanged. See VALIDATION.md for executed results.

The reference dataset intentionally contains only four providers. Sources for human review:

- Google Analytics collection: https://developers.google.com/analytics/devguides/collection/ga4
- Google advertising privacy: https://policies.google.com/technologies/ads
- Meta Pixel: https://developers.facebook.com/docs/meta-pixel/
- Hotjar documentation: https://help.hotjar.com/

Before expanding the dataset, verify provider ownership, document the primary source and review the exact domains. Reference inclusion is a classification of privacy relevance, not a maliciousness verdict or proof of actual tracking in a particular visit.

## Phase 2 executed checks

The engine/domain tests cover exact provider domains, legitimate subdomains, suffix impersonation, first-party resources, private-suffix tenants, missing signals, HTTP references, duplicates, caps and deterministic ordering. Collector tests cover URL minimization, responsive images, malformed/non-HTTP references, truncation and function serialization. Service tests mock Chrome only to exercise orchestration, permission errors, safe messages, timeouts, navigation and same-URL document-ID changes.

`npm run test:browser-scanner` additionally runs the real collector/engine against `fixtures/scanner` in installed headless Chrome's isolated world. The fixture's labels are predefined: four provider matches and two unclassified site domains, including a suffix-lookalike negative. Its CSP blocks external references; local script/image Resource Timing entries are real. It tests domain-reference matching, not whether actual tracking occurred.

Observed fixture result on 2026-10-16: four expected provider matches, six third-party site domains, score 24 on HTTP, 10 DOM observations and 10 timing observations. Source counts are browser-dependent and may include duplicates/blocked references. At provider level for this **single controlled fixture**: TP=4, FP=0, FN=0; precision=4/(4+0)=1.00 and recall=4/(4+0)=1.00. This is deliberately simple ground truth, not a general accuracy benchmark, malware test or measurement of Internet-wide tracking coverage. The tiny reference set and synthetic fixture do not establish real-world precision/recall. The script writes the measured report to ignored `.browser-smoke/result.json`.

Toolbar grants and popup interactions remain manual; the browser script does not mock or automate those Chrome extension APIs. DOM/resource observations cannot prove cookie use, fingerprinting, request payload contents, server-side tracking, or privacy-policy compliance. Optional network monitoring remains unimplemented and must require explicit permission.
