# Security decisions and remaining work

The current ten-area review, verified fixes and regression coverage are in [SECURITY_AUDIT.md](SECURITY_AUDIT.md). Phase 6 rejects changed payloads reusing a device upload ID with HTTP 409, while preserving exact retry deduplication. MV3 CSP additionally restricts connections to the loopback API and denies frames/form submissions. No new extension permissions were added.

## Implemented foundation controls

- Extension scanning uses activeTab/scripting for a bounded, user-initiated isolated main-frame scan. Phase 5 adds storage and only a loopback API host grant. No automatic resource collection/uploads or remote-site host grants exist. Explicit pairing/status/unpair/upload actions use a fixed-path worker API; content scripts cannot invoke it.
- Manifest V3 CSP disallows external scripts, eval and plugin objects.
- Only hostname-level resource evidence, protocol, kinds and coverage are returned from the page. Full URLs are transiently parsed and discarded. No page text, form fields, cookies, headers or request bodies are collected. Browser errors are replaced with safe messages, and a second injection checks document IDs against navigation/reload races.
- Strict Zod objects reject extra scan fields and hostname values containing paths, ports, credentials or queries. Storage APIs regenerate descriptions from controlled templates and bind ownership to authenticated sessions.
- Exact-origin CORS, Helmet, request-size limits, API rate limiting and generic server failures.
- `.env` and generated/build artifacts are ignored. Example PostgreSQL credentials are explicitly development-only.
- No telemetry, third-party fonts, external UI resources or fabricated detection labels.

## Threat boundaries

Website-controlled resources are untrusted observations. A matching provider domain does not prove malicious activity. Missing observations cannot establish safety. HTTPS does not establish absence of tracking. Private-suffix handling is necessary to distinguish unrelated tenants.

Future extension payloads are untrusted even when signed in: server-side validation must prevent arbitrary storage, account selection and unsupported score claims. User IDs must come from authenticated sessions/device records, never payloads. Device credentials must allow scan creation only, not user-data export or account administration.

## Implemented Phase 3 authentication and storage controls

Passwords use asynchronous scrypt at N=2^17/r=8/p=1, random salts and constant-time verification. Two in-flight derivations per process bound memory usage. Unknown-account login performs a dummy derivation. Credentials are never logged or returned. Email normalization is checked by PostgreSQL as well as at ingress.

Opaque 256-bit session tokens use HttpOnly/SameSite=Strict cookies. Production adds Secure, Path=/, no Domain and the __Host- prefix. Only SHA-256 digests are stored; a SQL CHECK enforces format. Expiry is enforced on every private request; login rotates the presented session; logout revokes it in PostgreSQL. No browser localStorage tokens or JWT signing secrets are used.

Every write requires an exact trusted Origin and application/json and rejects cross-site Fetch Metadata, complementing SameSite against CSRF including login CSRF. Browser API clients must be same-site. Private responses use no-store. CORS never substitutes for a session.

Scan and analytics queries are owner-scoped and parameterized, accept no payload user IDs and require explicit storage consent. A preference-row lock serializes saves against consent changes. Deletion cascades findings. Reads hide expired records; writes/settings purge expired owner records. Integration setup checks actual database identities before test writes, cleans only uniquely identified test users, and verifies application row counts unchanged.

Authentication is limited to 20 attempts/15 minutes/IP plus an overall 120 requests/minute/IP cap. Errors withhold input/internal details. PostgreSQL pools are bounded to 10 connections with a 10-second statement timeout. Only public provider reference data is seeded. The extension still has no upload code or backend credentials.

## Remaining production/integration work

The dashboard uses credentialed same-site requests, real HttpOnly sessions, protected routes and explicit storage consent. Phase 5 issues high-entropy, hashed, five-minute one-time pairing codes and hashed 90-day device credentials. Device endpoints use Bearer authorization, never dashboard cookies; uploads require account consent plus per-scan approval and are deduplicated. Device/preference row locks serialize revocation/consent against upload commits. The worker omits request cookies, rejects redirects and trusts only its packaged popup. Credentials persist in trusted local Chrome storage, which is not encrypted vault storage; lost profiles require revocation. See PHASE5.md for limits and recovery. Email verification/recovery and MFA remain unavailable. Schedule expired-code/session and inactive-user cleanup; use shared rate limits for multi-instance deployments. Registration conflicts disclose registered email addresses.

Production needs TLS, secure PostgreSQL certificate verification, least-privilege runtime database roles, secret management, backups/restore tests and deliberate reverse-proxy/IP configuration. Do not disable TLS verification. Local tests establish the implemented controls; they are not a penetration test or deployment certification.

References checked: [Node crypto](https://nodejs.org/api/crypto.html), [OWASP password storage](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html), [OWASP CSRF prevention](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html).
