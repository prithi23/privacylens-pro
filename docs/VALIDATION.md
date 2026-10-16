# Local validation evidence

Environment: Windows, Node v24.12.0, npm 11.7.0, Git 2.54.0. PostgreSQL 17.11 connectivity is now verified. Earlier missing-tool/credential findings below are historical, not current blockers.

## Phase 7 Part A release preparation (2026-10-16)

- **160 unit tests across 16 files**, **59 actual PostgreSQL integration tests across three files**, and **19 installed-Chrome native synchronization/dashboard checks** passed. New coverage includes production extension origin restrictions, separate build output, explicit proxy IP/CIDR validation, HSTS scope and the real worker's refusal to use a credential bound to another API origin. No mock database replaced verification.
- TypeScript checks passed for all four workspaces. ESLint passed. Local full-stack production builds and a separate production extension build against illustrative `https://privacy.example.com` passed. The release build validated worker URL, narrow host grant and CSP and preserved the local `dist` target. It did not contact the illustrative host or establish hosted HTTPS connectivity.
- The actual production API HTTP smoke and standalone installed-Chrome collector check passed; the controlled collector still observed four providers, six third-party domains, score 24, ten DOM and ten timing observations. Native workflow reported zero uncaught dashboard exceptions and unchanged application database counts after cleanup. Its intentional offline check emitted the expected connection-refused proxy log.
- Full `npm audit --json` and production-only audit returned **zero reported vulnerabilities** on 2026-10-16. The first restricted network attempt failed; the approved registry query succeeded. The heuristic Git guard passed current candidates, 133 staged blobs, 177 reachable objects and nine ignored-path canaries. Values were not printed. One documented password-placeholder finding was resolved with an exact placeholder allowlist; it was not a real credential leak.
- Static release checks parsed workflow/Compose YAML, verified required gates and isolated deployment topology, and checked local documentation links/fences. MIT source licensing, third-party notices, accurate Mermaid architecture/ER diagrams, setup/demo/release/runbook documentation and actual reviewed fixture screenshots were prepared. GitHub Actions includes production release packaging, advisory/repository checks and container/proxy validation. No remote CI run or deployment is claimed.
- Windows sandbox access restrictions initially blocked API esbuild resolution; the approved unrestricted build passed. Docker/Caddy are unavailable locally, so container builds, Caddy runtime validation, real hosted HTTPS/proxy/cookie acceptance, managed PostgreSQL TLS and backup/restore remain unexecuted gates. No application schema change, reset, account deletion, push, external resource or public deployment was performed.
- Final Prisma validation/inspection passed: application database retained **one user and two scans**; isolated test database had **zero users/scans** after cleanup. Both retain four migrations, nine model tables plus migration history, 13 providers/19 domains, 27 indexes, eight foreign keys and ten CHECK constraints. No migration/seed/reset was required or run in Phase 7.

See [PHASE7.md](PHASE7.md) and [RELEASE_READINESS.md](RELEASE_READINESS.md) for exact approval boundaries and production limitations. Phase 6 and earlier evidence below remains historical.

## Phase 6 verified research and hardening (2026-10-16)

- **135 unit tests across 14 files** and **59 real PostgreSQL integration tests across three files** passed. Coverage includes boundary-safe indexed matching, independent labeled fixtures, score withholding/caps/provenance, saved analysis, protected research endpoints and conflicting device upload IDs. Existing authentication, consent, isolation and revocation regressions remain passing.
- The additive `20261016000400_analysis_provenance` migration and seeds ran successfully against both identity-verified databases: nine model tables plus migration history, 27 indexes, eight foreign keys, ten CHECK constraints, 13 providers and 19 domains. Nullable columns preserve existing rows and scores. Application User/Scan/Session/Finding/Device/PairingCode counts were checked unchanged by integration, benchmark and browser runs; test fixtures were cleaned up.
- TypeScript checks, ESLint, production builds, production API HTTP smoke and MV3 packaging checks passed. Evaluation source fingerprints guard report freshness. See the final check output and the artifact files for measured timestamps; remote GitHub Actions execution is not claimed.
- Native installed Chrome completed **18 synchronization/dashboard flow checks**, including real action/activeTab scanning, explicit upload consent, worker/API/PostgreSQL provenance, Evaluation page loading and its four-false-negative filter, owner history/comparison, and credential revocation. No uncaught dashboard exceptions were recorded. The controlled scan still produced four providers, six third-party domains and score 24. Hardened MV3 CSP was active. Screenshots and machine-readable results are generated under ignored `.browser-smoke/`.
- The 29 independently labeled research scenarios yielded TP 16, FP 0, TN 9 and FN 4: precision 100%, recall 80%, F1 88.89%. All four misses are deliberate coverage-stress scenarios; the observable subset is reported separately. These are reproducible fixture results, not real-world sensitivity estimates or proof of tracking behavior. No third-party bulk tracker dataset was imported.
- Full analysis median was 3.4535 ms versus the captured Phase 5 baseline 5.7884 ms. Indexed lookup median was 1.1225 ms versus 4.1206 ms linear lookup in the same experiment. Backend measurements retain the slower history endpoint result and rejected experimental index. See [RESEARCH_EVALUATION.md](RESEARCH_EVALUATION.md), [PERFORMANCE.md](PERFORMANCE.md), and their raw JSON artifacts for sampling, environment and limitations.

Manual work remains for screen readers, physical devices, varied real websites and consent states, and production deployment controls. Existing account data remains intact; no application reset or test writes were used. Older milestone reports below describe their historical scope.

## Phase 5 verified synchronization (2026-10-16)

- Prisma generation/validation passed. Additive migration `20261016000300_device_sync` was applied successfully to **both identity-verified databases**, preserving application rows. Actual inspection verified nine model tables plus migration history, **27 indexes, eight FKs and ten CHECK constraints**, with four providers/five domains in each. The existing application account remained present; test users/scans were cleaned up. No reset/drop/truncate or new fixture seed was used.
- **121 unit/regression tests across 12 files** and **57 real PostgreSQL integration tests across 3 files** passed. New tests cover serialization allowlists/refusal of invalid evidence, one-time concurrent redemption/replay/expiry, hashed credentials, auth namespace separation, CSRF/origins, explicit/account consent, concurrent upload deduplication, persisted dashboard analytics, cross-user isolation, device expiry/revocation/unpairing and real HTTP rate-limit behavior.
- TypeScript, ESLint and production builds passed. Generated `.browser-smoke/` bundles and isolated extension copies are explicitly excluded from source linting. Optional popup controls load lazily, retaining about 241 kB initial popup JavaScript; the worker validates sanitized payloads locally. Device metadata schemas are separate so Settings does not pull in the domain parser.
- `npm run test:browser-sync` executed the actual unpacked MV3 action popup through installed Chrome's native Extensions automation, including a real activeTab grant after fixture load. The existing collector/engine observed **four providers, six third-party domains and score 24**. Pairing/status, no upload on scan/cancel, an unchecked per-scan confirmation, real worker upload, PostgreSQL provenance/findings, React Overview/History/Comparison, and rejection after dashboard revocation/reopening were verified. No fake Chrome API implementation or mock database replaced this flow. A separate explicit HTTP fixture supplies comparison's second hostname.
- The browser run retained the earlier dashboard checks: auth, refresh restoration, empty/populated analytics, settings, search/pagination, detailed reports, charts, deletion, expired sessions, login/logout and unavailable-backend UI. Its **17 flow checks passed with zero uncaught dashboard browser exceptions**. Screenshot/report artifacts are under ignored `.browser-smoke/`; native extension sync has a dedicated screenshot. The native extension's successful UI/worker/API behavior is asserted separately from the dashboard exception monitor.
- Test preflight verifies actual DB identities; only uniquely identified test users are written/deleted in `privacylens_test_db`. Read-only application counts for User, Scan, Session, Finding, Device and PairingCode were asserted unchanged after cleanup. No credentials were printed. Expected connection-refused logs are produced by deliberately stopping the test API for the offline dashboard check.

Native-browser harness fixes were necessary: Chrome requires a **tab** target for its action command, the fixture must finish navigating before the activeTab grant, and popup creation/refresh requires awaited DOM targets. Rate-limit tests also exposed plaintext default errors; device limits now return structured JSON. Initial Windows sandbox build restrictions were resolved using the approved unrestricted command. See [PHASE5.md](PHASE5.md) for exact run steps, remaining manual checks and the loopback-only deployment limitation. Older milestone reports below are historical.

## Phase 4 verified dashboard integration (2026-10-16)

- **117 unit/regression tests across 11 files** and **41 real PostgreSQL integration tests across 2 files** passed. New tests cover credentialed client behavior, network/unauthorized errors, response validation, database reference search, owner-only domain selection and enriched analytics/comparison contracts. Existing scanner/auth/isolation tests remain passing.
- TypeScript checking passed in all four workspaces; ESLint passed. Production builds passed for API, extension and web. The dashboard lazily loads pages and chart code. The production API smoke and MV3 artifact checks passed.
- `npm run test:browser-dashboard` passed against installed headless Chrome, actual Vite/Express listeners and `privacylens_test_db`: 16 flow checks, zero uncaught browser exceptions. Covered registration, protected routes, HttpOnly-cookie isolation, password visibility, session restoration/expiry, empty/populated analytics, settings persistence/consent, history/search/pagination/details, actual comparisons/charts, PostgreSQL provider search, single/bulk deletion, wrong/right login, logout revocation and unavailable-backend UI.
- Actual desktop/mobile screenshots were captured and inspected, including populated overview/comparison screenshots clearly named as test fixtures. The mobile intelligence page passed the viewport overflow check. Local artifacts/report are in ignored `.browser-smoke/`.
- Browser fixtures were submitted via actual HTTP into the identity-verified test database, then the unique test account was deleted. Read-only application User/Scan/Session/Finding counts were checked unchanged. No application test writes, database resets or credential output occurred. Existing tables/migrations remain unchanged.
- A parallel verification run exhausted local memory. Unit workers are now capped at two; the sequential rerun passed. Windows filesystem sandbox restrictions blocked API esbuild resolution; the same production build passed with the approved unrestricted command. The offline-browser check intentionally stops Express and produces an expected proxy connection-refused log.

Manual checks still needed: screen-reader/physical-device behavior, preferred date/sort combinations, and extension toolbar permissions/popup interactions after reload. Extension pairing/uploads remain unavailable. See [PHASE4.md](PHASE4.md) for exact run instructions and limitations. Earlier milestone reports below are historical.

## Phase 3 verified database and backend (2026-10-16)

Both `privacylens_db` and `privacylens_test_db` were connected and their actual server/database identities checked before writes. Executed Prisma schema validation/client generation, foundation migration and additive auth-integrity migration against both databases. Executed seeds on both. `db:inspect` verified nine model tables plus migration history, 26 indexes, seven FKs, ten CHECK constraints and both applied migration names in each database. Each contains four provider references/five domains. No database reset/drop was used.

Tables: User, Device, Scan, Finding, TrackerProvider, TrackerDomain, UserPreference, Session, PairingCode; plus `_prisma_migrations`.

- `npm test`: **111 tests passed across 10 files**, preserving scanner/contracts/API regressions and adding real scrypt checks.
- `npm run test:integration`: **39 tests passed across 2 files** against actual PostgreSQL. HTTP tests start a real loopback Express listener and use native fetch, not mocked responses. Covered registration/login/logout, cookie hashing/flags/rotation/expiry, consent, CRUD/filtering/pagination, cross-user denial, analytics, retention, CSRF, validation and auth rate limits.
- Integration preflight checks actual identities before test files execute. Test writes/cleanup use only the test DB and uniquely identified test users; application connections in the suite are read-only and row counts are verified unchanged.
- `npm run typecheck` and `npm run lint`: passed for the final backend changes. `npm run build` passed for API, extension and dashboard. `npm run verify:extension` passed, and `npm run test:smoke` started the actual production API bundle and verified HTTP liveness, offline readiness, reference search and CORS. `npm run format:check` and offline `npm ci --dry-run --ignore-scripts` also passed.

Stored scan records in integration tests are explicitly controlled fixture inputs, not claims about real browser detections. All responses and aggregates are computed from actual PostgreSQL records. User-facing application data remains empty except seeded public reference information.

Resolved implementation issues: Prisma's CLI package has no normal main export, so the admin wrapper resolves its actual executable; tsx seeding encountered a sandbox Windows user-information error and passed outside the sandbox. No credentials or full URLs were printed. Remaining: dashboard auth/history UI, extension pairing/consented sync, recovery/email verification/MFA, scheduled inactive-user/session cleanup and deployment controls. Historical attempts follow.

## Earlier Phase 3 connection retry (resolved)

The PostgreSQL 17 Windows service is running. Root `.env` loading was confirmed without displaying credentials, and configured database names are `privacylens_db` and `privacylens_test_db`. Actual connection attempts to **both** databases failed with SQLSTATE `28P01` (password authentication failed). Exact password placeholders were detected in both configured URLs. No migration, seed, table verification or database-backed HTTP/integration test was run; server-side database separation remains unverified until connections authenticate.

Safe configuration work added `npm run db:check`, protected local `.env` copies from Git, loaded `.env` for integration tests, and updated the test-target guard to accept `_test_db` while rejecting application/test names that match. CI now declares distinct application/test databases; this remote workflow was not executed locally.

After these changes: **109 unit/regression tests passed across 9 files**, lint passed, API TypeScript checking passed, production builds passed for API/extension/dashboard, and formatting checks passed for the changed files. These are not PostgreSQL verification results. The next required step is replacing password placeholders locally and rerunning the read-only connection check. See PHASE3_SETUP.md.

## Phase 2 executed checks (2026-10-16)

- `npm test`: **102 tests passed across 8 files**, including provider domain boundaries, private suffixes, score components/caps, duplicate observations, missing coverage, collector serialization, DOM/timing sanitization, bounded collection, denied permissions, navigation/document identity, and scan timeouts. The original API/contract tests still pass.
- `npm run typecheck`: passed for API, extension, web and shared workspaces.
- `npm run lint`: passed.
- `npm run build`: passed for the production API, MV3 popup/service worker and dashboard. The popup loads approximately 240 kB of initial JavaScript and loads the approximately 358 kB scan/analysis chunk on click (uncompressed).
- `npm run verify:extension`: passed; permissions remain exactly activeTab + scripting, with no host permissions, automatic content scripts or remote executable assets.
- `npm run test:smoke`: passed against the real production API bundle over HTTP; the preserved foundation still starts independently of PostgreSQL.
- `npm run test:browser-scanner`: passed against installed headless Chrome using a separate test profile and real isolated-world DOM/Resource Timing collection. The controlled fixture produced four providers, six third-party site domains, score 24 on HTTP, 10 DOM observations and 10 timing observations. Host-only sanitization and expected matching were asserted. The browser/server were closed afterward.
- `npm run format:check`: passed. `npm ci --dry-run --ignore-scripts --offline` checks the lockfile without replacing installed dependencies.

The browser fixture script tests the collector/engine, not toolbar activeTab grants or popup interactions. See SCANNING.md for those manual checks and EVALUATION.md for the narrowly scoped fixture measurements. Phase 1's popup was manually verified by the user; the new Phase 2 popup requires checking after extension reload.

## Phase 1 baseline (previous milestone)

- `npm run db:generate`: passed; Prisma Client 7.10.1 generated.
- `npm run db:validate`: passed; PostgreSQL Prisma schema valid.
- `npm test`: passed, 37 tests across 3 files. These cover sanitized contracts, score/status input boundaries, hostname edge cases, active-tab context, API status/errors, CORS and public reference search.
- `npm run lint`: passed after correcting an unnecessary regex escape.
- `npm run build`: passed outside the filesystem sandbox, which prevented bundlers from reading parent directories. API, popup, service worker and web artifacts were generated.

- `npm run typecheck`: passed for all four workspaces after unifying Vite on 8.3.4.
- `npm ls vite esbuild`: passed; one Vite version and patched esbuild 0.28.2. The redundant tsup wrapper was removed.
- `npm install`: completed against the final dependency graph and reported zero vulnerabilities.
- `npm run test:smoke`: passed. The actual production API bundle started in a separate Node process and answered real HTTP health, unavailable-database readiness, tracker search and rejected-origin checks. The process was stopped afterward.
- `npm run verify:extension`: passed for MV3 structure, referenced assets, permissions, CSP, icons and worker.
- `npm run format:check`: passed. The final dashboard import optimization also passed its TypeScript check and production rebuild (approximately 298 kB JavaScript before gzip).

## Not established by these checks

- Real PostgreSQL migration application, seed execution, and database integration tests: blocked by missing PostgreSQL setup.
- Phase 2 toolbar grants, popup layout, score animation, details interaction and permission revocation: manual testing required using SCANNING.md. Phase 1 Chrome popup verification was reported by the user.
- Browser-rendered dashboard layout and accessibility: manual testing required.
- Authentication, private scan routes, synchronization, pairing and historical analytics: not implemented; no claims of passing tests for those features. Phase 2 local analysis/scoring is implemented and tested as listed above.
- GitHub Actions: workflow authored, not run on a remote repository.

Run the commands in README after installing PostgreSQL. Preserve actual command output when presenting evidence; do not replace unavailable database tests with mocked results.
