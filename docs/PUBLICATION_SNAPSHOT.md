# Clean publication snapshot

Phase 7 Part B originally prepared a separate, allowlisted copy of the audited working tree with **no `.git` directory or original commit history**. The owner subsequently initialized the publication repository and ran GitHub CI. The source inventory below excludes that new Git metadata. The CI remediation changes working files only; it does not stage, commit, push, rewrite history, deploy or access databases. The original project and its history/accounts/databases remain unchanged.

## Contents and verification

The reviewed 182-file inventory is retained. The initial snapshot added this guide, `scripts/publication-policy.mjs`, its regression tests, and `scripts/prepare-publication.mjs` (187 files including the manifest). The CI run #3 remediation explicitly adds `scripts/container-smoke.mjs` and `scripts/container-smoke.test.mjs`. The current source inventory is therefore **188 payload files plus `PUBLICATION_MANIFEST.json` = 189 files**, excluding Git metadata and ignored local tooling. Both additions are recorded in the manifest and publication preparation allowlist. The manifest records byte sizes and SHA-256 fingerprints for every payload file; its own filename is included by the verifier's exact file-set check rather than a circular self-hash. Hashes detect subsequent changes; they do not independently prove provenance or replace review.

Source/tests, MIT license, README, architecture/ER documentation, reviewed fixture screenshots/research reports, all four Prisma migrations, seed and CI/deployment configuration are included. Only `.env.example` and `deploy/.env.production.example` are included as explicitly public templates. They contain documented placeholders, never working secrets. The local `.env`, private exports, SQL dumps, HAR/SQLite files, caches, dependencies, builds, generated Prisma output, audit/browser folders and history are excluded. Arbitrarily renamed secrets are additionally checked by content, with narrow documented fixture exceptions; no scanner can guarantee detection of all future leaks.

For a fresh history-free snapshot, run from the source repository without initializing Git in that snapshot:

```powershell
node scripts/security-repo.mjs --snapshot ../privacylens-publication
node scripts/prepare-publication.mjs --verify ../privacylens-publication
node scripts/release-check.mjs --root ../privacylens-publication
npm run test:publication
```

These commands validate actual snapshot files using installed source tooling; they do not install dependencies or modify the snapshot/database. `--snapshot` walks every file without consulting any parent Git repository and rejects Git metadata, symlinks and forbidden artifacts. The verifier also compares current local environment secrets in memory when run from the original source, without printing their values. Snapshot verification intentionally rejects `.git`; for the already initialized publication repository, use `npm run security`, `npm run release`, `npm run test:publication` and `npm run test:containers` instead. The security scanner covers the working tree, index and reachable history without changing them.

Reproduction of creation requires the previously reviewed local 182-path allowlist. The creation command refuses unreviewed additions, unsafe paths, existing destinations, content findings and symlinks, and never recursively deletes an output. The allowlist and private audit evidence remain outside the snapshot. Do not re-create over a reviewed snapshot; choose a new sibling name and review again.

## Research and operational limits

Measured evaluation JSON and the self-contained `npm run evaluate` experiment are included and retain their source fingerprint. Historical performance comparisons reference original checkpoint `a97e5e0`, which intentionally is **not included**. `npm run benchmark:backend` and independent Phase 5 baseline recreation require that original private checkpoint and cannot reproduce that historical baseline from the clean snapshot alone. They are optional research tools, not installation or CI gates; the reports remain actual historical evidence. No baseline source archive was copied, because it contains the old profile metadata. Do not invent a replacement baseline or initialize/import history to hide this limitation.

After any separately authorized Git initialization/dependency install, ordinary source checks can run as documented in SETUP.md. Keep personal database configuration local and separate. Do not run database tests against the application database. Existing historical test results are recorded in VALIDATION.md; this preparation does not claim new database/browser test runs or hosted HTTPS verification.

Public GitHub creation/push, branch naming, hosting resources, managed-database/TLS/backups, remote CI and deployment still need explicit approval/execution. Historical profile paths remain in the untouched original repository; publish only the reviewed clean snapshot, not the original `.git` directory. MIT and third-party terms remain unchanged. Screenshots are controlled-fixture captures, not private account records.
