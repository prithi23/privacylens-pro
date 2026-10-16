# Phase 3 PostgreSQL setup and verification

## Current verified state

PostgreSQL 17.11 connectivity is now verified for `privacylens_db` and `privacylens_test_db`, with distinct actual identities. Both received foundation and additive auth-integrity migrations without resets or drops. Each has User, Device, Scan, Finding, TrackerProvider, TrackerDomain, UserPreference, Session, PairingCode and `_prisma_migrations`; 26 indexes, seven foreign keys and ten CHECK constraints. Seeds contain four providers/five domains, no accounts or scan history.

```powershell
npm run db:check
npm run db:generate
npm run db:validate
npm run db:migrate
npm run db:seed
npm run db:migrate:test
npm run db:seed:test
npm run db:inspect
npm run test:integration
```

Target-specific wrappers check real identities before writes and pass only the selected URL through the Prisma child process environment. They never overwrite `.env` or expose passwords. Only migrate deploy, seed, status and inspection are supported; no reset/drop exists. In the coding sandbox, tsx seeding encountered a Windows `uv_os_get_passwd` error and succeeded outside the sandbox. Normal Windows terminal execution is the intended workflow. The runner resolves Prisma's actual CLI file rather than a nonexistent package main entry.

Real HTTP + PostgreSQL tests exercise auth, private scan CRUD/filtering, consent, retention and analytics. Preflight checks run before integration files can write. Cleanup targets uniquely identified test users/cascades; application access is read-only, with row counts verified unchanged. See API.md and VALIDATION.md. Earlier setup history follows; its credential failures are resolved.

## Earlier retry — credential placeholders (resolved)

PostgreSQL's `postgresql-x64-17` Windows service is now running. Both connection URLs load from the root `.env`, naming `privacylens_db` and `privacylens_test_db`. Real connection attempts to **both** targets returned SQLSTATE `28P01` (password authentication failed). Safe checks found exact password placeholder values still configured; no password or full URL was printed. Configured database names differ, but server-side database identities and tables cannot be verified until authentication succeeds. No migrations, seed or integration-test writes were attempted.

Edit both URLs locally and replace the password placeholders with the actual PostgreSQL role password, URI-encoded if needed. A pgAdmin master password is not the PostgreSQL role password. Keep the configured application/test database names separate. Do not paste credentials into chat. Run `npm run db:check` to retry safe read-only connectivity and table checks; it prints target labels, database names, server version and table names on success, or a redacted error code on failure. Then ask the agent to continue.

The test safety guard now loads the local `.env`, accepts your `privacylens_test_db` naming, requires both URLs, and rejects equal application/test database names even when host aliases or credentials differ. Local `.env` copies are also Git-ignored. The CI workflow now declares separate application/test databases; the remote workflow has not been executed here.

## Initial inspection — 2026-10-16

Node v24.12.0, npm 11.7.0 and Git are available. `psql`, `postgres`, `pg_ctl` and `docker` are not on PATH. The standard `C:\Program Files\PostgreSQL` installation directory and Docker Desktop CLI executable were not found. No PostgreSQL/Docker service or listener on port 5432 was reported by the inspection. No `DATABASE_URL`, `TEST_DATABASE_URL`, root `.env`, or API `.env` is configured.

These checks found no usable local PostgreSQL setup; they do not rule out a custom installation or remote server. No connection, migration, seed, database CRUD or authentication verification has been performed for Phase 3. The Phase 1/2 code and local extension scanner are preserved. Per the requested setup gate, backend implementation and database operations are waiting for PostgreSQL setup or existing connection configuration.

## Recommended: native PostgreSQL 17

1. Open the [official PostgreSQL Windows downloads page](https://www.postgresql.org/download/windows/), follow its EDB installer link, and choose a supported PostgreSQL **17.x** Windows x64 installer. This matches the repository's PostgreSQL 17 Docker configuration.
2. Run the installer yourself. Keep **PostgreSQL Server**, **Command Line Tools**, and **pgAdmin 4** selected. Keep port **5432**, unless another application uses it. Set and remember the administrator `postgres` password. Stack Builder's extra packages are unnecessary for this project.
3. Complete installation and open a new PowerShell terminal. If the tools are not on PATH, the full executable paths below work. Adjust `17` if you chose a different major version.
4. Verify the real server:

```powershell
& 'C:\Program Files\PostgreSQL\17\bin\psql.exe' --version
& 'C:\Program Files\PostgreSQL\17\bin\psql.exe' -h 127.0.0.1 -p 5432 -U postgres -d postgres -c 'SELECT version(), current_database();'
```

The second command prompts for the administrator password. A version command alone does not establish database connectivity.

## Create separate application and test databases

Use dedicated non-superuser roles, with different passwords for application and test access. These commands prompt for passwords rather than placing them in shell history. Administrator password prompts may also appear. If a role/database already exists, stop and inspect it; do not delete or overwrite an existing database to follow this guide.

```powershell
& 'C:\Program Files\PostgreSQL\17\bin\createuser.exe' -h 127.0.0.1 -p 5432 -U postgres --pwprompt --no-superuser --no-createdb --no-createrole privacylens_app
& 'C:\Program Files\PostgreSQL\17\bin\createdb.exe' -h 127.0.0.1 -p 5432 -U postgres --owner=privacylens_app privacylens

& 'C:\Program Files\PostgreSQL\17\bin\createuser.exe' -h 127.0.0.1 -p 5432 -U postgres --pwprompt --no-superuser --no-createdb --no-createrole privacylens_test_app
& 'C:\Program Files\PostgreSQL\17\bin\createdb.exe' -h 127.0.0.1 -p 5432 -U postgres --owner=privacylens_test_app privacylens_test
```

The test database must be disposable and separate from the application database. Never use a production or personal database for integration tests. The runner accepts a distinct `test` segment, such as `privacylens_test` or `privacylens_test_db`, and rejects matching application/test names.

## Configure local environment variables

In the `privacylens` directory, copy `.env.example` to `.env` **only if `.env` does not already exist**. Edit it locally in VS Code. Do not paste passwords or connection URLs into chat, commit them, or put them on a command line.

```dotenv
DATABASE_URL=postgresql://privacylens_app:YOUR_URL_ENCODED_APP_PASSWORD@127.0.0.1:5432/privacylens?schema=public
TEST_DATABASE_URL=postgresql://privacylens_test_app:YOUR_URL_ENCODED_TEST_PASSWORD@127.0.0.1:5432/privacylens_test?schema=public
PORT=4000
NODE_ENV=development
WEB_ORIGINS=http://localhost:5173
```

Replace the password placeholders with the actual passwords. URI-encode special password characters inside connection URLs (for example `@` → `%40`, `#` → `%23`, `%` → `%25`). The `.env` file is ignored by Git. `POSTGRES_*` entries in the example are only used by Docker Compose; native PostgreSQL uses the roles you created above.

After setup, say **“PostgreSQL is ready; both URLs are configured locally.”** If using a custom installation or existing remote PostgreSQL instead, provide only its version/install path and configure both connection URLs in `.env`; no plaintext credentials are needed in chat.

## Backend implementation sequence

1. Check both connections without printing credentials, and confirm the application and test databases are distinct.
2. Run actual Prisma generation, migrations and idempotent provider seeds against PostgreSQL; inspect real database state.
3. Implement modular registration/login/logout/session handling, owner-scoped scan CRUD/filtering and analytics, Zod validation, consent gating and security controls.
4. Apply migrations to the separate test database, execute real-database HTTP integration/isolation tests, and exercise authentication/CRUD over actual HTTP.
5. Run the existing scanner regression suite, lint, TypeScript checks and production builds; record actual results and limitations.

Do not treat these future steps as completed checks. No mock database will replace PostgreSQL verification. Local scanning remains independent, and synchronization remains off unless explicitly enabled by the user.

Official command references: [createuser](https://www.postgresql.org/docs/17/app-createuser.html), [createdb](https://www.postgresql.org/docs/17/app-createdb.html).
