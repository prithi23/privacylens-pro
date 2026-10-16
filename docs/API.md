# PrivacyLens REST API v1

All paths below start with `/api/v1`. JSON only; write requests require `Content-Type: application/json` and an exact configured `Origin` (development default `http://localhost:5173`). Browser clients must be same-site with the API; use the Vite `/api` proxy locally and a same-site HTTPS reverse proxy in production. Cross-site Fetch Metadata is rejected. CORS is an allowlist, not authentication.

## Public and authentication endpoints

| Method | Path                 | Behavior                                                                                                                                         |
| ------ | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| GET    | `/health`            | 200 liveness. `phase:3` when a database client is configured, `phase:1` for foundation-only mode; use readiness to establish actual connectivity |
| GET    | `/ready`             | 200 connected or 503 database unavailable; executes PostgreSQL `SELECT 1`                                                                        |
| GET    | `/trackers?q=google` | Public `bundled-reference` provider search with `datasetVersion`; q is optional, ≤100 characters; no live detections                             |
| POST   | `/auth/register`     | `{email,password}` → 201 `{user}`, new session cookie; sync defaults off                                                                         |
| POST   | `/auth/login`        | `{email,password}` → 200 `{user}`, fresh session cookie; replaces the same user's presented session                                              |
| POST   | `/auth/logout`       | Empty JSON object → 204, revokes the presented session and clears cookie; idempotent                                                             |
| GET    | `/auth/me`           | Requires session → 200 `{user}`; invalid/expired session → 401                                                                                   |

Email is trimmed/lowercased, validated and unique. Passwords are 12–128 characters and are not normalized. Hashes use Node's asynchronous scrypt, N=131072/r=8/p=1, random 16-byte salts and 64-byte keys. Hashes and plaintext passwords never appear in API responses. Unknown-account login performs the same expensive derivation as a wrong-password login. Registration conflicts return 409; login failures use the same generic 401 message.

Sessions are random 256-bit opaque tokens; only SHA-256 digests are stored. Cookies are HttpOnly, SameSite=Strict, Path=/, with configurable hard expiry (SESSION_TTL_HOURS, default 24, range 1–168). Production adds Secure and the `__Host-` cookie prefix, with no Domain attribute. Development HTTP cookies omit Secure intentionally. Tokens never appear in URLs. GET `/auth/me` and all private responses set Cache-Control: no-store. Login rotates the presented session; logout revokes it in PostgreSQL; expiry is checked on every authenticated request.

## Protected endpoints

| Method | Path                  | Behavior                                                                                                                         |
| ------ | --------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/preferences`        | `{preferences:{syncEnabled,retentionDays}}` for the authenticated owner                                                          |
| PATCH  | `/preferences`        | Strict `{syncEnabled:boolean,retentionDays:1..365}` → preferences and owner-only expired-record purge count                      |
| POST   | `/scans`              | Validated sanitized metadata → 201 `{scan}`; requires explicit `syncEnabled:true`, otherwise 403 `SYNC_DISABLED`                 |
| GET    | `/scans`              | Paginated retained owner history; returns `{items,total,page,limit,totalPages}`                                                  |
| GET    | `/scans/:id`          | Own retained scan with normalized findings, or 404                                                                               |
| DELETE | `/scans/:id`          | Delete one own scan, cascade findings → 204; missing/foreign IDs both return 404                                                 |
| DELETE | `/scans`              | Empty JSON object → `{deleted}` for **only the signed-in user's** saved scans                                                    |
| GET    | `/analytics/overview` | Owner-only actual PostgreSQL metrics, daily trends, finding-category distribution and 10 recent scans                            |
| GET    | `/analytics/compare`  | `hostnames=example.com,other.example.net` (2–5 distinct hostnames) → per-domain aggregates and latest-versus-first score changes |

Private routes infer ownership from the database-backed session. Payload user IDs are rejected. Private endpoints exist only when the server has a configured database client. Device-token routes are documented below; uploads always require explicit consent.

## Phase 6 research and analysis provenance

Public `/trackers` returns `source: "bundled-reference"` and `datasetVersion: "privacylens-reference-2026.10.16"`. It is reference information, never live detection results.

Session-authenticated `GET /research/reference` returns the bundled dataset metadata and scoring policy. `GET /research/evaluation` returns the actual checked-in measured report embedded in the production build. `GET /research/evidence` returns at most 20 recent retained findings scoped to the authenticated owner, with scan/date/hostname and saved analysis. All use the existing authentication, no-store, origin and rate-limit controls.

Scan creation and approved device upload accept optional strict `analysis` provenance: `scoringVersion`, `datasetVersion`, `coverage`, source assessment and four capped score components. Validation checks coverage and score arithmetic. Responses retain that metadata; old scans return null analysis and remain unversioned. Overview analytics include `scoreVersions` counts without recalculating history. See [SCORING_METHODOLOGY.md](SCORING_METHODOLOGY.md) for the exact contract and limitations.

Repeating an upload ID with the same normalized payload returns the saved record. Reusing it with changed metadata/findings returns HTTP 409 `UPLOAD_ID_CONFLICT`; clients must not treat a changed scan as a successful retry.

### Scan input

```json
{
  "hostname": "example.com",
  "privacyScore": 92,
  "concernLevel": "low",
  "httpsStatus": "https",
  "thirdPartyDomainCount": 1,
  "trackerMatchCount": 1,
  "scannedAt": "2026-10-16T10:00:00.000Z",
  "findings": [
    {
      "category": "analytics",
      "severity": "low",
      "description": "Client explanatory text is not persisted verbatim.",
      "evidenceHostname": "google-analytics.com"
    }
  ]
}
```

This is a request-shape example, not a real scan/detection claim. Use a current scan timestamp when trying it. Scores are integers 0–100; concern must match score (≥75 low, ≥45 moderate, otherwise high). Protocol is https/http/unknown; counts are integers 0–10000. Timestamps more than five minutes in the future or older than the owner's retention window are rejected. Hostnames cannot contain paths, query strings, credentials, ports or IP literals. Findings are bounded (≤1000), with category/severity enums. Extra fields (cookies, headers, URLs, owner IDs, etc.) are rejected. JSON bodies are limited to 64 KB.

Finding descriptions are regenerated from controlled category/hostname templates, not copied from caller text or website content. Identical category/severity/hostname findings are deduplicated. The API stores authenticated-client-reported score/count metadata; it does not independently rescan or certify a website. Local-only scans can still cover IP/localhost, but this storage contract intentionally accepts public-style hostnames only.

### Filters and aggregation semantics

GET `/scans`: optional normalized `hostname`, UTC ISO `from`/`to` (inclusive), page 1–10000, limit 1–100 (default 20), sort scannedAt/privacyScore/hostname, order asc/desc (default scannedAt descending). A stable ID tie-breaker is used. Unknown query fields and reversed dates return 400. Pagination count/items are read with repeatable-read consistency.

GET `/analytics/overview` accepts hostname/from/to; comparison accepts hostnames/from/to. All results exclude data older than the owner's current retention setting. Trends use UTC calendar days that actually have records; no fabricated gap points. Empty metrics are `{totalScans:0,uniqueDomains:0,trackerMatches:0,averageScore:null}` with empty trend/distribution arrays. Tracker matches sum saved metadata; category `findingCount` counts normalized finding rows and `scanCount` counts scans containing the category, not independent tracker-provider executions. Comparison reports null scores for an unseen domain. Queries are parameterized and owner-scoped.

Consent is checked while holding the user's preference row lock during scan creation, serializing uploads against consent changes. Expired records are purged on scan writes and preference updates; reads hide expired data immediately. A scheduled purge for inactive users remains production work. Disabling storage prevents further saves but preserves retained history until user deletion or retention cleanup.

## Error and abuse controls

Errors normally use `{error:{code,message,requestId}}`; input errors never echo passwords or original request values. Expected statuses: 400 VALIDATION_ERROR/OUTSIDE_RETENTION/INVALID_JSON, 401 UNAUTHENTICATED/INVALID_CREDENTIALS, 403 CSRF_REJECTED/ORIGIN_DENIED/SYNC_DISABLED, 404 SCAN_NOT_FOUND/NOT_FOUND, 409 CONFLICT, 413 PAYLOAD_TOO_LARGE, 415 JSON_REQUIRED, 429 RATE_LIMITED/AUTH_RATE_LIMITED, 503 AUTH_BUSY/DATABASE_UNAVAILABLE, generic 500 INTERNAL_ERROR. Rate-limit bodies omit requestId but the response header remains.

Global limit: 120 requests/minute/IP. Register/login share a 20-attempt/15-minute/IP limit. Memory-hard hashing is bounded at two concurrent operations per process; excess requests get 503. These counters are in-process; multi-instance hosting needs a shared store. Reverse-proxy IP trust must be configured deliberately, never by blindly accepting client forwarding headers. Helmet and exact-origin CORS remain enabled. No request bodies, auth cookies or full URLs are logged.

## Verification

`npm run test:integration` opens a real loopback HTTP listener and PostgreSQL test connections. It exercises auth, cookie flags/rotation/expiry, consent, scan CRUD/filtering, analytics, retention, CSRF, rate limiting, input rejection and cross-user isolation. Setup checks **actual server database identities**, not just URL strings. Cleanup deletes only uniquely identified test users (cascades their records). Application database connections in the suite are read-only baseline checks, verified unchanged afterward. No mock database or mocked HTTP response replaces this verification.

Phase 4 adds protected `GET /analytics/domains` (retained owner hostnames/counts), `GET /analytics/providers?q=` (PostgreSQL provider/domain search), `frequentProviders` on overview (distinct scans with boundary-matched saved finding hostnames), and `latest`/`history` on comparison (up to 100 newest score records per site, newest first). Owner isolation, strict validation, retention and no-store apply. The public `/trackers` stays an offline reference; the dashboard uses the database endpoint. See [PHASE4.md](PHASE4.md).

Phase 5 implements pairing and approved synchronization. See [PHASE5.md](PHASE5.md) for complete contracts, exact rebuild/pair steps and security details. New session-protected routes are `GET /devices`, `POST /devices/pairing-code` (empty JSON) and `DELETE /devices/:id` (owner-only revocation). Code generation retains the existing Origin/JSON CSRF protections.

The separate device namespace uses no dashboard cookie authentication: `POST /extension/pair` accepts strict `{code,displayName}` and returns a one-time device credential plus metadata; `GET /extension/status`, `POST /extension/scans`, and `DELETE /extension/connection` require `Authorization: Bearer <device credential>`. Ordinary website origins are rejected; extension CORS is noncredentialed. Uploads require strict `{uploadId:<UUID>,consent:true,scan:<existing scan input>}`, plus enabled account storage. Metadata remains sanitized and owner-scoped. Reusing a device/upload UUID returns the original retained record. A unique index and device/preference row locks protect concurrent retry, revocation and consent changes.

Codes contain 128 random bits, expire after five minutes, are stored only as digests and are atomically single-use. Generating a new code invalidates older unused account codes. Device credentials contain 256 random bits, expire 90 days after creation and are independently revocable. Only digests persist server-side; list/status responses omit secrets. Dashboard logout does not revoke devices. Device errors include 400 PAIRING_INVALID, 401 DEVICE_UNAUTHORIZED, 404 DEVICE_NOT_FOUND and 429 DEVICE_RATE_LIMITED. Limits are 10 code-generation attempts/15 minutes/account, 10 redemption attempts/15 minutes/IP, and 30 authenticated device requests/minute/device, in addition to the global limit.

Remaining: password recovery/email verification/MFA, account editing/deletion, remote HTTPS extension deployment and production hardening. Scanning stays local-first; no automatic upload or offline queue exists.
