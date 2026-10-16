# Deployment preparation and operations runbook

**Prepared, not deployed.** The deployment preparation does not create a host, database, domain, certificate or external account. The templates below require explicit owner approval before provisioning or public operation. Docker and Caddy are not installed locally; YAML/static checks do not establish a successful container/HTTPS deployment. CI run #2 reached container validation but failed because the required service environment file was absent. The workflow fix below still needs a new CI execution.

## Chosen topology

One approved HTTPS origin serves the React dashboard and `/api/*`. Caddy terminates TLS and forwards the path unchanged to a private Express container. The API connects to managed PostgreSQL over verified TLS. This preserves SameSite Strict cookie behavior and avoids requiring third-party cookies. A separate public API subdomain is possible only with deliberate same-site/CORS configuration; unrelated frontend/API sites will not work with this cookie design.

Files: `deploy/Dockerfile` (build, migration, pruned API runtime and Caddy/static targets), `deploy/Caddyfile`, `deploy/compose.production.yml`, and placeholder-only `deploy/.env.production.example`. No database container or destructive database command is included in the production Compose file. `.dockerignore` prevents environment files, generated browser data, backups, private exports, keys and Git history entering the build context. No secrets are Docker build arguments.

## Environment contract

| Variable               | Scope                   | Behavior                                                                                            |
| ---------------------- | ----------------------- | --------------------------------------------------------------------------------------------------- |
| `NODE_ENV`             | API runtime             | `production` requires DATABASE_URL and exact HTTPS web origins; enables Secure `__Host-` cookies    |
| `DATABASE_URL`         | API/release secret      | Managed PostgreSQL connection; never put it in a `VITE_*` variable or image layer                   |
| `HOST`                 | API runtime             | Loopback by default; prepared container explicitly uses `0.0.0.0`                                   |
| `PORT`                 | API runtime             | 4000 by default; no public API host port in Compose                                                 |
| `WEB_ORIGINS`          | API runtime             | Comma-separated exact HTTPS origins, without paths, wildcards or trailing slash                     |
| `TRUST_PROXY`          | API runtime             | Empty by default; only explicit IPs/CIDRs or `loopback`; no boolean/hop count/all-address range     |
| `SESSION_TTL_HOURS`    | API runtime             | 1–168, default 24; opaque session expiry                                                            |
| `PUBLIC_DOMAIN`        | Compose/Caddy           | Approved DNS hostname only; supplies exact web origin and certificate hostname                      |
| `VITE_API_BASE_URL`    | Dashboard build         | Prefer unset: relative `/api`; optional explicit HTTPS origin must be same-site and allowed by CORS |
| `EXTENSION_API_ORIGIN` | Extension release build | Explicit public HTTPS origin on 443; no credentials, path/query/fragment/IP/local hostname          |
| `EXTENSION_TARGET`     | Extension build         | Production wrapper sets `production`; ordinary builds remain `development`                          |
| `TEST_DATABASE_URL`    | Local/CI only           | Separate disposable database; never needed in production runtime                                    |

The frontend never receives database credentials, cookies, pairing secrets or device Bearer tokens through build settings. API secrets belong in the approved hosting secret manager; `deploy/.env.production` is an ignored single-host example, not a secret distribution mechanism. If private CA trust is required, use the provider's CA instructions and a read-only certificate/secret mount, e.g. Node `NODE_EXTRA_CA_CERTS`; do not disable verification.

## Approve and validate before starting a host

Choose provider/region/domain, costs, data retention and backup policy. Review container/action versions and pin reviewed digests/SHAs for the actual release. No digest is invented here. Configure DNS only after host approval. Verify the fixed `172.30.0.0/24` Docker network does not conflict with an existing network; if changing it, update the web IP and API trust CIDR together.

On the approved host, copy the example to `deploy/.env.production`, edit secrets privately, and restrict file access. Do not reuse local application/test URLs or passwords. The following commands are a runbook, not actions executed by this agent:

```sh
docker compose --env-file deploy/.env.production -f deploy/compose.production.yml config --quiet
docker compose --env-file deploy/.env.production -f deploy/compose.production.yml --profile release build
```

Use `config --quiet`; expanded Compose output can reveal environment secrets. Build/run validation should include the Caddy adapter, runtime health and public-port isolation. CI builds the three targets and runs `caddy validate` without starting a public server or contacting the sample hostname.

CI supplies the required service `env_file` by copying only the checked-in placeholder template into an ignored, temporary `deploy/.env.production`. The CLI `--env-file` controls interpolation and does not replace a service's `env_file` requirement. An exclusive creation guard refuses existing files or symlinks; restrictive permissions and a subshell exit trap remove the placeholder file after validation, including on validation failure, before image builds. No production secrets are needed, read from local configuration, printed or uploaded. `.dockerignore` also excludes production environment files. The production Compose contract remains unchanged: a real, privately configured environment file and managed PostgreSQL are required on an approved host. See [Docker's service environment-file reference](https://docs.docker.com/reference/compose-file/services/#env_file).

The subsequent CI runtime checks use only the disposable CI PostgreSQL service, API readiness and a loopback-bound static web port with `PUBLIC_DOMAIN=:8080`. They do not start the production Compose stack, apply migrations to a managed database, obtain certificates or contact the sample production hostname. These checks cover image startup and static delivery; actual HTTPS, authenticated proxy requests and approved managed-database connectivity remain deployment acceptance checks.

## Managed PostgreSQL and release jobs

Provision an approved PostgreSQL 17 database with backups/PITR as available. Require provider-appropriate verified TLS (`sslmode=verify-full` in the example), validate CA/hostname from the deployed runtime, and never use `rejectUnauthorized:false` or disable TLS checks. Provider URLs/poolers differ; test the exact configuration. Node-postgres documents that SSL options in connection strings can override programmatic SSL configuration; do not combine them blindly. See [node-postgres TLS guidance](https://node-postgres.com/features/ssl).

Use a migration role authorized for schema changes and a separate least-privilege runtime role. Give the release job the migration URL through the secret manager; give the API only its runtime URL. The single environment file template is convenient for one-host preparation but does not create/grant roles. Verify required table/sequence/schema privileges after each release. Avoid a superuser runtime. Keep replicas × ten-connection pools below the database connection budget; use a supported pooler only after migration/transaction testing.

Take a backup first and test restoration into a separate approved empty environment. Verify the target database/server identity privately. Apply only committed migrations, then seed reference metadata via a **manually invoked** release job:

```sh
docker compose --env-file deploy/.env.production -f deploy/compose.production.yml --profile release run --rm migrate
docker compose --env-file deploy/.env.production -f deploy/compose.production.yml --profile release run --rm migrate npm run db:seed -w @privacylens/api
docker compose --env-file deploy/.env.production -f deploy/compose.production.yml up -d api web
```

These production commands use workspace Prisma scripts and the job's explicit URL, not the local two-database wrappers. The template does not run migrations at API startup. Phase 7 adds no schema change; existing Phase 6 migrations are additive. Never use reset, truncate, `db push --accept-data-loss`, or restore over an existing account database. A failed migration must be inspected and repaired with a reviewed forward fix; do not delete migration history. Rolling application images back does not undo schema changes.

## HTTPS, proxy, cookies and origin checks

Caddy's domain site block prepares automatic HTTPS once real DNS/ports/ACME are authorized and reachable. Persist `/data` and `/config`, protect these volumes and verify renewal. Only web publishes 80/443. API container port 4000 is private. The web proxy has one fixed network IP; API trusts only that `/32` and overwrites X-Forwarded-For/Host/Proto upstream so incoming forged headers cannot select an identity. Do not broadly trust an entire hosting network or use a hop count when alternate direct paths exist. See [Express proxy guidance](https://expressjs.com/en/guide/behind-proxies/) and [Caddy reverse proxy](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy).

API Origin checks remain independent of proxy headers and authentication. Dashboard writes require JSON, exact allowed Origin and safe Fetch Metadata. Production cookies are HttpOnly, SameSite Strict, Secure, Path `/`, `__Host-` prefixed and have no Domain. Device endpoints omit cookies and require their own secret, even if the Origin is a valid extension origin. CORS is not authentication. Test login, session restoration, logout, expired cookies, CSRF rejection, owner isolation and device revocation through the real HTTPS route before use.

The production API emits one-year HSTS for its exact host, without `includeSubDomains`; development emits none. The web proxy template does not add a broader HSTS policy. Review any desired site-wide policy after verifying real HTTPS and renewal.

The static server CSP permits only self scripts/connections, bounded data images, and inline styles needed by React/Recharts/Tailwind rendering. It forbids objects/frames/form navigation to other sites. Validate actual UI/chart behavior before rollout. Add an appropriate HSTS policy only after HTTPS and renewal are proven; do not preload an unverified domain or unintentionally cover unrelated subdomains.

## Build a release extension

```powershell
$env:EXTENSION_API_ORIGIN = 'https://privacy.example.com'
try { npm run build:extension:production }
finally { Remove-Item Env:EXTENSION_API_ORIGIN -ErrorAction SilentlyContinue }
```

The example hostname is illustrative and not hosted. Replace it with the approved deployed origin. The build fails if missing/insecure/local and outputs `apps/extension/dist-production` without replacing local `dist`. Worker endpoint, narrow host permission and CSP derive from the same validated configuration; `release-config.json` records the nonsecret target. `node scripts/verify-extension.mjs --production` checks the artifact. No runtime URL selector/proxy or localhost fallback exists. Saved credentials are origin-bound, so switching endpoints requires local removal and revocation at the old dashboard before pairing again. [Chrome network permissions](https://developer.chrome.com/docs/extensions/develop/concepts/network-requests) and [MV3 CSP](https://developer.chrome.com/docs/extensions/reference/manifest/content-security-policy) describe both policy boundaries.

Load the production directory as a separate unpacked extension for acceptance. Real HTTPS pairing/scan preview/consent/upload/history/revocation is still a required manual check; compiling against an illustrative domain does not verify connectivity. Browser-store publishing requires separate permission/privacy disclosures, signing/review and explicit approval.

## Logging, backups and acceptance

API startup/error logs emit structured event/request IDs without bodies, URLs, cookies, credentials or raw DB errors. The proxy template does not enable access logs. Configure safe operational error collection, redaction, retention and restricted access; do not log full request headers or query paths. Monitor readiness, latency/error/rate-limit trends, pool pressure, failed migrations and backup age without collecting personal browsing telemetry. `/health` is process liveness; `/ready` actively checks PostgreSQL and returns 503 on failure. Set host request/idle timeouts appropriately; API shutdown drains connections with a 15-second bounded exit.

Configure encrypted backups, restore verification and documented RPO/RTO based on actual provider capabilities; none were measured here. Run a restoration drill in a separate database, verify migrations/owner counts and record evidence privately. Protect/rotate session/device/database secrets after compromise; logout does not revoke devices. Scheduled expired sessions/codes and inactive-user retention cleanup, recovery/MFA, central rate limiting for replicas, dependency/image updates and incident response remain operational work.

Before public traffic: pass remote CI; execute container/proxy validation; test TLS, secure cookies and proxy spoof rejection; migrate/seed the correct database with backup; exercise real HTTPS dashboard/extension flow; confirm local/offline scanning; review logs/secret exposure; test restore; complete accessibility/device checks. [RELEASE_READINESS.md](RELEASE_READINESS.md) records pending approvals and limitations.
