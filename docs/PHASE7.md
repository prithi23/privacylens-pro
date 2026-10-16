# Phase 7 Part A: professional release preparation

Implemented in the existing project: MIT licensing, current portfolio README, accurate architecture/ER diagrams, reproducible developer setup, five-minute technical demo, release risk register, heuristic repository/history secret guard with optional Git hook, expanded CI gates, Docker/Caddy preparation for same-origin HTTPS and managed PostgreSQL, explicit HTTPS extension production configuration, configurable API binding and restricted proxy trust. Production extension artifacts are isolated in `apps/extension/dist-production`; normal local builds keep `apps/extension/dist` working.

No application schema/data changes are required for this phase. Existing accounts/history are preserved; test writes remain confined to the isolated test database. No Git push, remote repository, paid resource, public deployment, production migration or real domain/certificate operation was performed.

## Verification record

Final local results: **160 unit tests / 16 files**, **59 real PostgreSQL tests / three files**, and **19 native Chrome workflow checks**, with zero uncaught dashboard exceptions. TypeScript, ESLint, formatting, research fingerprint, local/HTTPS-targeted builds, production HTTP smoke, standalone scanner and both MV3 packaging checks passed. The added native check verified that an API-origin mismatch blocks use of a saved credential. Actual fixture screenshots were inspected for secrets/personal data and copied into `docs/screenshots` for the README. No invented screenshot was used.

Phase 6 baseline: 135 unit tests, 59 real PostgreSQL integration tests and 18 native Chrome workflow checks passed. Phase 7 results are recorded in [VALIDATION.md](VALIDATION.md) after checks execute. Local full and production-only npm advisory checks returned zero reported vulnerabilities on 2026-10-16; this is registry evidence, not a penetration test. The heuristic Git guard passed current publish candidates and reachable history after explicitly recognizing documented password placeholders. No secret values were printed.

`npm run release:check` statically parses workflow/Compose YAML, verifies required CI gates, checks deployment topology and local documentation links. It is not a Docker/Caddy runtime test or GitHub Actions execution. Docker and Caddy are not installed on the laptop; their executable validation is prepared in CI and must run before a hosted release.

## Production extension preparation

In a terminal scoped to this build, set the actual approved HTTPS origin (no `/api` path, non-default port, credentials, query or fragment):

```powershell
$env:EXTENSION_API_ORIGIN = 'https://privacy.example.com'
try {
  npm run build:extension:production
} finally {
  Remove-Item Env:EXTENSION_API_ORIGIN -ErrorAction SilentlyContinue
}
```

`privacy.example.com` is an illustrative non-live target, not an implemented service. The command validates configuration, builds and verifies `dist-production`. It does not contact that host. Replace it with an approved deployed origin before distribution. No localhost fallback is compiled as the network target. The release manifest gets only that HTTPS host grant and matching `connect-src`; private codes/credentials never enter build settings. Saved credentials are bound to the API origin; a mismatched or legacy local credential cannot be sent to a new host. Clear it locally and revoke it at the old dashboard before re-pairing.

Normal rebuild remains `npm run build` followed by `npm run verify:extension`; reload `apps/extension/dist` at `chrome://extensions`. Keep development and production directories distinct and verify `release-config.json`/manifest before choosing Load unpacked. See [DEPLOYMENT.md](DEPLOYMENT.md) for all server/managed database controls and [SETUP.md](SETUP.md) for local reproduction.

## Ready and pending

Source/documentation/configuration are prepared for owner review. Actual publishing, hosting selection, public DNS/TLS, managed PostgreSQL connectivity/backups, remote CI completion and real HTTPS end-to-end acceptance remain pending approval/execution. Production recovery/MFA, distributed rate limits, scheduled inactive-record cleanup and operational monitoring remain documented limits. No production readiness or invented screenshots/performance results are claimed.
