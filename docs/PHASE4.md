# Phase 4: authenticated React dashboard

Historical milestone: Phase 5 now implements optional pairing and approved uploads. Use [PHASE5.md](PHASE5.md) for current synchronization instructions; unavailable-pairing statements below describe Phase 4 only.

The complete flow is now browser → credentialed Express API → Prisma/PostgreSQL → validated response → React. No dashboard statistics, accounts or responses are simulated. The Chrome extension remains independent and local-only.

## Local run instructions

With Node 24/npm 11, PostgreSQL running, and the existing private `.env` configured, run from `privacylens`:

```powershell
npm run db:check
npm run dev
```

Open **http://localhost:5173**, the exact default allowed origin. Register with an email and a 12–128 character password. Refresh restores the real HttpOnly-cookie session. Vite proxies `/api` to Express port 4000. Leave `VITE_API_BASE_URL` unset locally. Never put database credentials into `VITE_` variables, which are public client configuration. No new migration is required: the nine existing model tables and relationships are preserved. Fresh checkouts should follow README.md migrations/seeds; never reset the application database.

## Implemented

- Registration/login, validation, password visibility, busy/error states, logout, expiry handling and protected hash routes. Valid sessions survive refresh. Tokens/passwords never enter localStorage.
- Responsive navy/cyan/purple layout, collapsible desktop sidebar, compact mobile navigation, keyboard focus, skip link, reduced motion, skeletons and retry controls. Chart-heavy pages load lazily.
- Overview with retained-owner scan counts, unique sites, average score, tracker-match totals, UTC trends, finding categories, recent reports and frequent reference-matched providers.
- History with exact hostname search, inclusive UTC dates, date/score/hostname sorting, ten-row pagination, details/evidence, score interpretation, recommendations and confirmed deletion.
- Comparison of two to five previously saved sites: average/latest scores, tracker totals, latest third-party exposure/transport, first-to-latest change and timestamped score charts. Charts use up to 100 newest records per site; aggregates use all retained matching records.
- Tracker Intelligence searches seeded PostgreSQL provider/domain records and explains domain associations, coverage and the distinction from malware detection.
- Settings reads real account details and persists explicit storage consent/retention. Reducing retention immediately purges older owner scans. Confirmed bulk deletion removes only the owner's scans/findings. Logout revokes the database session.

## Protected API additions

| Endpoint                                    | Behavior                                                                                                              |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `GET /api/v1/analytics/domains`             | Distinct retained owner hostnames and scan counts                                                                     |
| `GET /api/v1/analytics/providers?q=`        | Database provider search by name/category/domain, source `postgresql-reference`                                       |
| `GET /api/v1/analytics/overview`            | Adds `frequentProviders:[{name,scanCount}]` from distinct scans whose saved finding hostnames match reference domains |
| `GET /api/v1/analytics/compare?hostnames=…` | Adds `latest` scan metadata and `history:[{scannedAt,privacyScore}]`                                                  |

Owner isolation, retention, strict request validation and no-store responses apply. Provider associations use exact/domain-boundary matches, never substring matches. The existing public `/trackers` remains an offline checked-in reference for compatibility; the dashboard intelligence page uses the database endpoint.

## Verification commands

```powershell
npm run typecheck
npm run lint
npm test
npm run test:integration
npm run build
npm run test:smoke
npm run verify:extension
npm run test:browser-dashboard
npm run test:browser-scanner
npm run format:check
```

`test:browser-dashboard` starts actual Vite/Express and installed headless Chrome with a separate profile. It verifies actual database identities before writes, uses only TEST_DATABASE_URL for temporary users/scans, cleans up only its unique user, and checks read-only application table counts before/after. It never truncates/resets a database. Explicit scan fixtures are submitted through real HTTP after consent; they are not claims about extension-detected websites. Reference records come from the actual test database seed.

The browser flow covers protected routes, registration, password visibility, cookie isolation, no localStorage secrets, refresh restoration, empty/populated analytics, settings persistence, history/search/pagination, details, comparison/charts, database reference search, single/bulk deletion, session expiry, wrong/right login, logout revocation and unavailable-server UI. The final proxy connection-refused log is expected: Express is deliberately stopped. Uncaught browser exceptions must be zero.

Ignored `.browser-smoke/` contains a JSON report and actual desktop/mobile screenshots; screenshots with history are explicitly test-fixture captures. `CHROME_PATH` overrides the installed Windows Chrome location. CI does not currently provision Chrome or execute browser scripts. See VALIDATION.md for executed results.

## Limits and manual checks

Extension pairing/device credentials/uploads remain unavailable. Storage consent allows authorized API saves, never automatic extension synchronization. New accounts show honest empty history until a client explicitly saves metadata.

Scores/counts are authenticated client-reported metadata. The current schema does not retain original weighted deductions or collection coverage; reports explain the score approach without inventing exact deductions. Domain matches are partial evidence, not privacy/safety certification. The reference is small and curated.

Email/profile edits, account deletion, recovery, email verification and MFA are explicitly unavailable. Scan deletion works. Scheduled inactive-user cleanup, shared rate limits, production TLS and least-privilege database roles remain deployment work. Comparison choices currently load all distinct retained hostnames; very large histories may require selector pagination.

Manually check keyboard/screen-reader behavior, preferred physical devices, date/sort combinations, and the extension toolbar permission/popup interactions. Chrome viewport testing does not certify screen-reader or physical-device behavior.

To rebuild/reload the extension:

```powershell
npm run build -w @privacylens/extension
npm run verify:extension
```

Open `chrome://extensions`, enable Developer mode, load unpacked `apps/extension/dist` for first install or click PrivacyLens Pro's reload icon. Open a normal HTTP(S) website, reopen the popup, and click **Scan Website**. The API/database are unnecessary for local scans.
