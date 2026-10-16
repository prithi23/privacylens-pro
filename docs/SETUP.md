# Reproducible developer setup

Run commands from the `privacylens` monorepo root. Verified development platform: Windows, Node 24.12.0, npm 11.7.0, PostgreSQL 17.11 and installed Google Chrome. CI targets Ubuntu with Node 24/PostgreSQL 17. Docker is optional for local PostgreSQL and required only to execute the prepared container deployment checks. The local machine does not have Docker/Caddy installed; remote CI has not yet run.

## 1. Install dependencies

Obtain this source repository, open its folder in VS Code, and run:

```powershell
node --version
npm --version
npm ci
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
```

Use the supplied lockfile. Do not replace an existing `.env`. No global Prisma, tsx or Vite install is necessary. Node 24 is required for native TypeScript loading used by administrative scripts; npm scripts resolve installed tools.

## 2. Configure separate PostgreSQL databases

Create two new databases using pgAdmin or the PostgreSQL tools, with distinct names such as `privacylens_db` and `privacylens_test_db`. Use dedicated non-superuser credentials; the disposable test role must not be able to write to the application database. Existing databases/accounts should be inspected and reused without reset. [Windows role/database instructions](PHASE3_SETUP.md) include password prompts.

Edit root `.env` locally: set `DATABASE_URL` for the application and `TEST_DATABASE_URL` for the separate test database. URI-encode special password characters; never paste credentials into chat, Git, screenshots or command-line arguments. Add `PORT=4000`, `NODE_ENV=development`, `WEB_ORIGINS=http://localhost:5173` and `SESSION_TTL_HOURS=24`. Defaults bind Express to loopback with no trusted proxies.

Optional Docker users may run `docker compose up -d` after configuring `POSTGRES_*`. This starts one development database only; create the separate test database yourself. Do not run it on port 5432 alongside an existing native PostgreSQL server. Never run `down -v` against an existing database volume to follow this guide.

```powershell
npm run db:check
npm run db:generate
npm run db:validate
npm run db:migrate
npm run db:migrate:test
npm run db:seed
npm run db:seed:test
npm run db:inspect
```

Expected: distinct actual database identities, four applied migrations, nine model tables plus `_prisma_migrations`, 13 provider references/19 domains in each. Migrations deploy committed additive SQL; seeds create no users/scans. Existing accounts, sessions and saved scores remain untouched. Local admin wrappers require both URLs and validate their identities before writes. If connection fails, fix local credentials/service first; do not reset a database.

## 3. Build and start

```powershell
npm run evaluate:check
npm run build
npm run verify:extension
npm run dev
```

Open **http://localhost:5173** (use this exact origin). The API listens on 127.0.0.1:4000; Vite proxies `/api` so session cookies work without cross-site configuration. Liveness is `http://127.0.0.1:4000/api/v1/health`; database readiness is `/api/v1/ready`. Register a new local account or use the existing account; seeded references do not fabricate a login. New accounts have empty history and storage disabled. Stop servers with Ctrl+C.

Load `apps/extension/dist` through `chrome://extensions` → Developer mode → Load unpacked. Reload it after rebuilding. Scan a normal HTTP(S) page; restricted browser pages should explain the limitation. Scanning does not require the API/database. For pairing, enable account storage intentionally in dashboard Settings, generate a one-time code, and enter it under the popup's account connection. Approve each **Sync This Scan** separately; inspect its exact metadata first. See [Phase 5 instructions](PHASE5.md).

## 4. Verify the complete project

Keep heavy checks sequential on a Windows laptop:

```powershell
npm run security:repo
npm run release:check
npm audit
npm run typecheck
npm run lint
npm run format:check
npm test
npm run test:integration
npm run evaluate:check
npm run build
npm run test:smoke
npm run verify:extension
npm run test:browser-scanner
npm run test:browser-sync
npm run db:inspect
```

Browser scripts use installed Chrome (Windows default path). On other platforms set `CHROME_PATH` to the executable, e.g. `/usr/bin/google-chrome`. They create isolated profiles in ignored `.browser-smoke/`, close their own processes, and remove only their own temporary directories. Native extension automation requires Chrome's Extensions CDP support; report an unsupported version rather than treating it as a passed test. Test data lives only in the identity-verified test database and is cleaned up. Existing application table counts are checked unchanged.

The API smoke intentionally probes an unavailable database and expects readiness 503. Browser offline checks intentionally stop their owned API; connection-refused messages are expected there. Production builds may need normal local filesystem/process permissions in restricted coding sandboxes. Do not disable protections or hide failures.

## 5. Research and releases

`npm run evaluate` runs the actual engine against independently labeled fixtures. Review the changed artifact, rebuild/restart the API, and open Evaluation lab. Do not regenerate timings merely to chase a target. [Evaluation](RESEARCH_EVALUATION.md) and [performance](PERFORMANCE.md) describe reproducibility and limitations; the historical backend comparison requires local checkpoint `a97e5e0` to exist.

An optional local Git hook is provided: `git config --local core.hooksPath .githooks`. This is not installed automatically. CI repeats the heuristic secret guard; hooks and ignore files can be bypassed and are not a substitute for review. Use `git diff --cached --stat`, review staged files privately, and enable hosting-side secret protection before publishing.

On macOS/Linux, also make `.githooks/pre-commit` executable with `chmod +x .githooks/pre-commit` before enabling it; preserve the executable bit when you stage that file. Windows Git runs shell hooks through its bundled shell. The hook has not been installed into your existing Git configuration.

Production uses a separate environment and HTTPS extension build; see [DEPLOYMENT.md](DEPLOYMENT.md). No production URL, hosted database, certificate or external account has been provisioned. Do not reuse application/test credentials for a public deployment.
