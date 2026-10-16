# Clean publication snapshot

Phase 7 Part B remediation authorizes local preparation only. The publication directory is a separate, allowlisted copy of the audited working tree with **no `.git` directory or original commit history**. It is not a new Git repository. Nothing has been staged, committed, renamed, pushed or deployed. Original history/accounts/databases remain unchanged.

## Contents and verification

The reviewed 182-file inventory is retained, with four explicit additions: this guide, `scripts/publication-policy.mjs`, its regression tests, and `scripts/prepare-publication.mjs`. The snapshot therefore has **186 payload files plus `PUBLICATION_MANIFEST.json` = 187 files**. The manifest records byte sizes and SHA-256 fingerprints for every payload file; its own filename is included by the verifier's exact file-set check rather than a circular self-hash. Hashes detect subsequent changes; they do not independently prove provenance or replace review.

Source/tests, MIT license, README, architecture/ER documentation, reviewed fixture screenshots/research reports, all four Prisma migrations, seed and CI/deployment configuration are included. Only `.env.example` and `deploy/.env.production.example` are included as explicitly public templates. They contain documented placeholders, never working secrets. The local `.env`, private exports, SQL dumps, HAR/SQLite files, caches, dependencies, builds, generated Prisma output, audit/browser folders and history are excluded. Arbitrarily renamed secrets are additionally checked by content, with narrow documented fixture exceptions; no scanner can guarantee detection of all future leaks.

Run from the original source repository, without initializing Git in the snapshot:

```powershell
node scripts/security-repo.mjs --snapshot ../privacylens-publication
node scripts/prepare-publication.mjs --verify ../privacylens-publication
node scripts/release-check.mjs --root ../privacylens-publication
npm run test:publication
```

These commands validate actual snapshot files using installed source tooling; they do not install dependencies or modify the snapshot/database. `--snapshot` walks every file without consulting any parent Git repository and rejects Git metadata, symlinks and forbidden artifacts. The verifier also compares current local environment secrets in memory when run from the original source, without printing their values. Do not run ordinary repository mode there until Git initialization has been separately authorized.

Reproduction of creation requires the previously reviewed local 182-path allowlist. The creation command refuses unreviewed additions, unsafe paths, existing destinations, content findings and symlinks, and never recursively deletes an output. The allowlist and private audit evidence remain outside the snapshot. Do not re-create over a reviewed snapshot; choose a new sibling name and review again.

## Research and operational limits

Measured evaluation JSON and the self-contained `npm run evaluate` experiment are included and retain their source fingerprint. Historical performance comparisons reference original checkpoint `a97e5e0`, which intentionally is **not included**. `npm run benchmark:backend` and independent Phase 5 baseline recreation require that original private checkpoint and cannot reproduce that historical baseline from the clean snapshot alone. They are optional research tools, not installation or CI gates; the reports remain actual historical evidence. No baseline source archive was copied, because it contains the old profile metadata. Do not invent a replacement baseline or initialize/import history to hide this limitation.

After any separately authorized Git initialization/dependency install, ordinary source checks can run as documented in SETUP.md. Keep personal database configuration local and separate. Do not run database tests against the application database. Existing historical test results are recorded in VALIDATION.md; this preparation does not claim new database/browser test runs or hosted HTTPS verification.

Public GitHub creation/push, branch naming, hosting resources, managed-database/TLS/backups, remote CI and deployment still need explicit approval/execution. Historical profile paths remain in the untouched original repository; publish only the reviewed clean snapshot, not the original `.git` directory. MIT and third-party terms remain unchanged. Screenshots are controlled-fixture captures, not private account records.
