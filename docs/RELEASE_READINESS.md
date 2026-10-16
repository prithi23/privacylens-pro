# Release readiness review

Phase 7 Part B remediation: portable documentation, SQL/HAR/SQLite/export exclusion rules, credential-assignment checks and a strict history-free snapshot verifier now address the local audit findings. [PUBLICATION_SNAPSHOT.md](PUBLICATION_SNAPSHOT.md) describes the exact 187-file snapshot and historical-benchmark limitation. The original repository's historical profile paths are deliberately preserved; only the separately audited snapshot is proposed for publication. Historical profile findings are explicit warnings in repository mode and errors in strict snapshot mode. No Git initialization/publication is authorized.

Scope: Phase 7 Part A, local repository/documentation/deployment preparation. This is a portfolio release candidate, not a claim of public production readiness. No code was pushed, external resource created, certificate requested, or public service deployed. The project owner selected MIT for original source; independently authored reference data retains CC0-1.0. The secret guard inspects both working files and staged index blobs as well as reachable history, so changing a working file cannot conceal a different staged secret.

## Publishing boundary

Ready for source review: implemented monorepo, committed lockfile, additive migration history, source-linked tracker reference, actual controlled evaluation artifacts, architecture/database diagrams, developer setup, five-minute demo, deployment templates and explicit limitations. See [VALIDATION.md](VALIDATION.md) for executed test results and [PHASE7.md](PHASE7.md) for the final release check status.

Before publishing, review the complete diff including untracked Phase 6/7 files, generated public research JSON and license/copyright attribution. Do not use a blind `git add .`. Run `npm run security:repo` and inspect staged content privately. `.env*`, copied local environments, browser profiles/reports, build output, backups, private data and common key formats are ignored. The Docker context separately excludes them. The guard scans current publish candidates, tracked ignored files and reachable Git blobs for selected high-signal secrets and private-record keys; failures emit paths/rules only. Its explicit allowlist contains documentation/CI/unit placeholders, not real credentials. An optional pre-commit hook and CI repeat the check.

Ignore patterns/hooks/regexes cannot guarantee that secrets will never be committed. Arbitrary exports in unrecognized formats, renamed sensitive files, screenshots, low-entropy passwords and unreachable Git objects can evade the guard. Enable GitHub secret scanning/push protection/private vulnerability reporting, review screenshots and staged changes, and rotate any actual leaked credential before removing it from history. No history rewrite or remote action was performed.

## Deployment boundaries and risks

| Area              | Prepared controls                                                                             | Required before public operation                                                                                       |
| ----------------- | --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Frontend/API      | Same-origin Caddy `/api` proxy; static React build; private API port                          | Build/run container images; validate CSP, cookies, routing and graceful shutdown on the approved host                  |
| HTTPS             | Domain-based automatic TLS template; HTTPS-only production extension origin                   | Choose/authorize domain and host; verify DNS/certificates/renewal and appropriate HSTS after HTTPS works               |
| PostgreSQL        | Existing additive Prisma migrations; managed URL environment template; bounded pools/timeouts | Provision approved database; verified TLS/CA, separate migration/runtime roles, connection budget and restore exercise |
| Proxy/rate limits | Explicit IP/CIDR trust, no boolean/hop-count trust; proxy overwrites forwarding headers       | Confirm exact network path/firewall, trusted subnet conflicts, one replica initially; shared limiter before scaling    |
| Accounts          | scrypt, HttpOnly/Strict/Secure production cookies, CSRF, owner scoping, revocable devices     | Recovery/email verification/MFA and inactive session/code/retention cleanup remain unimplemented                       |
| Privacy           | Local-first scanning, account opt-in plus per-scan consent, allowlisted upload                | Privacy policy/retention/support obligations, safe logging, operational access controls and incident handling          |
| Extension         | Explicit HTTPS build; narrow host grant/CSP; origin-bound local credential                    | Pair/revoke/sync against real HTTPS host; Chrome Web Store disclosures/review if distributing there                    |
| Supply chain      | Lockfile, local npm advisory checks, read-only CI token, no deploy jobs                       | Review image/action versions and pin reviewed digests/SHAs; complete distributed binary notice inventory               |
| Research          | Measured fixture artifact, source fingerprint and explicit misses                             | Larger independent corpus; CNAME/cross-frame/network ground truth, representative consent states                       |

Managed-database TLS, container runtime health, real proxy header handling and remote CI cannot be certified from static templates. Docker/Caddy were unavailable locally; CI contains executable builds/validation but has not run remotely. Existing local test evidence does not establish hosted service reliability or a successful backup/restore.

## Approval required

The following require the owner's explicit instruction: push/create a GitHub repository, publish a release or browser-store package, create hosting/database/domain resources, incur charges, upload secrets, or deploy a public service. Prepared examples are not connected to any provider. Local source changes/builds/tests do not publish anything. Decisions still needed: repository visibility/owner, hosting/domain, managed PostgreSQL provider/region, runtime and backup policy, and public reporting contact.

Manual acceptance: extension reload and host permission review; varied real websites/consent states; keyboard/screen reader and physical device checks; HTTPS login/logout/CSRF; pairing expiration/replay/revocation; exact preview and per-scan consent; offline behavior; saved legacy/current score provenance; application data preservation. Use [DEMO.md](DEMO.md) for the five-minute presentation without showing credentials or personal history.
