# Phase 6: research intelligence, evaluation and hardening

The existing monorepo now includes a 13-provider/19-domain offline registry with sources/licensing, indexed matching, `exposure-v2` provenance, a measured Evaluation dashboard page, a security audit, performance experiments, and updated CI. Pairing, approved synchronization, account history and local scanning remain functional. Nothing was deployed or pushed.

## Baseline and data preservation

Local checkpoint **a97e5e0** preserves the pre-change Phase 5 source. Baseline checks were 121 unit and 57 PostgreSQL tests. Baseline analysis timings/build sizes were recorded before editing in `docs/research/phase5-baseline.json`. The checkpoint used only a command-scoped safe-directory override for differing sandbox ownership, not global Git configuration.

Migration `20261016000400_analysis_provenance` adds nullable JSONB columns to Scan and TrackerProvider. Existing account/session/scan records are not reset or backfilled. New reference seeds contain 13 providers/19 domains with source metadata; they create no users or scans. Existing historical scores stay exactly as reported and display unversioned provenance. No experimental performance index was added to the application database.

## Rebuild, migrate and run

From `privacylens`, with Node 24/npm 11, PostgreSQL running and the existing private `.env` configured:

```powershell
npm run db:check
npm run db:generate
npm run db:migrate
npm run db:migrate:test
npm run db:seed
npm run db:seed:test
npm run evaluate:check
npm run build
npm run verify:extension
npm run dev
```

Restart existing dev processes after migration/client generation. Open **http://localhost:5173**. Sign in, open **Tracker Intelligence** for database sources/evidence/methodology, or **Evaluation lab** for the actual measured report, scope selector, charts, case search and outcome filter. Existing pairing instructions in PHASE5.md remain applicable. At `chrome://extensions`, reload **apps/extension/dist** (v0.6), scan normally and explicitly approve synchronization. New detail reports include reported deductions and coverage; legacy records never receive a fabricated breakdown.

## Reproduce evaluation and performance

```powershell
npm run evaluate
npm run evaluate:check
npm run benchmark:backend
npm run test:browser-scanner
npm run test:browser-sync
npm run research:report
```

Evaluation uses the actual engine and independently labeled fixture scenarios. The backend benchmark uses real isolated PostgreSQL and a real session fixture, 2,000 temporary scans, serial HTTP and EXPLAIN ANALYZE. It reads baseline API source from local Git checkpoint `a97e5e0`; that commit must be present. No test writes target the application DB. Native Chrome evidence includes action/activeTab, versioned upload persistence, dashboard Evaluation interaction and owner pages; controlled fixtures are explicitly identified.

`evaluate:check` hashes normalized source, methodology, contracts, runner, fixtures and lockfile. Regenerate/review the report after any change to those inputs. `npm run evaluate` updates the artifact; rebuild/restart the API to serve that newly measured snapshot. Statistics are embedded build artifacts, not random/generated API responses. The original Phase 5 baseline capture script refuses to overwrite history from a newer engine. To reproduce a fresh Phase 5 baseline, use a separate checkout/worktree at the checkpoint, copy the capture script there, install/build, then run it; do not roll back the active project.

## Validation and limits

Run TypeScript, ESLint, formatting, unit tests, isolated PostgreSQL integration tests, production builds, API smoke, MV3 packaging, scanner and native sync workflows. See VALIDATION.md for executed counts and docs/research for actual measurements. CI now checks report freshness, regenerates fixture measurements, runs native Chrome flows and uploads reports/screenshots. The edited remote workflow has not been executed by this local agent; installed Chrome must expose its Extensions automation domain.

All favorable and unfavorable measurements are retained. The corpus includes deliberate unlisted/CNAME/unavailable-source misses and is not a held-out Internet sample. CPU timings, browser observations and network/API timings have different scopes; no cross-scope speedup is claimed. The local endpoint is still 127.0.0.1:4000; remote HTTPS deployment, automatic sync/offline queues, DNS monitoring, recovery/MFA and production operations remain out of scope. Screen readers, physical devices, varied real website consent states and Internet-scale ground truth need further manual/research evaluation.

Read TRACKER_INTELLIGENCE.md, SCORING_METHODOLOGY.md, RESEARCH_EVALUATION.md, SECURITY_AUDIT.md and PERFORMANCE.md for sources, assumptions and measured decisions.
