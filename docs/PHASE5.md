# Phase 5: extension pairing and approved synchronization

The real extension action popup can now pair to an account, scan locally, and upload one explicitly approved sanitized report through Express/Prisma into PostgreSQL. Dashboard Overview, History and Comparison read the same owner-scoped records. Nothing uploads merely because the extension is paired, the popup is opened, or a scan is performed.

## Rebuild and run on Windows

From the existing `privacylens` directory with PostgreSQL running and the private `.env` already configured:

```powershell
npm run db:check
npm run db:generate
npm run db:migrate
npm run db:migrate:test
npm run build
npm run verify:extension
npm run dev
```

The migration commands are safe to repeat and never reset either database. Phase 5 adds nullable `Scan.deviceId`/`clientUploadId`, an upload-deduplication unique index and a Device foreign key. Existing users, scans and relationships are retained. Existing provider seeds remain valid; no new seed data is required.

Open **http://localhost:5173** and sign in. The default API listens only on **127.0.0.1:4000**. The extension uses that explicit loopback endpoint, independently of the dashboard session cookie. Keep the API on its default port for the standard build.

At **chrome://extensions**, enable Developer mode. Load unpacked **apps/extension/dist** on first install, or click PrivacyLens Pro's **Reload** icon. Version 0.5 adds `storage` and a host grant for **http://127.0.0.1/**; Chrome may require accepting updated permissions. There is no `<all_urls>` grant or automatic content script. The host grant covers loopback ports as Chrome host patterns do; application code fixes requests to the configured API port and fixed endpoint paths.

## Pair your account

1. In dashboard **Settings**, enable **Allow authenticated API clients to save my scan metadata**, then **Save preferences**. Pairing can work with storage disabled, but uploads will correctly fail until storage is enabled.
2. Under **Connected Extensions**, click **Generate pairing code**. Codes expire after five minutes. A new code invalidates the account's older unused codes. Do not paste the code into a website or share it.
3. Open the actual PrivacyLens extension popup on a normal HTTP(S) website. In **Account connection**, enter a recognizable extension name, paste the code and click **Pair extension**.
4. Click **Check status** to verify authorization and account-storage consent. In dashboard Settings, **Refresh extensions** shows the linked device. No account password or dashboard cookie is copied into the extension.

## Approve and synchronize one scan

1. Click **Scan Website**. This still runs locally and performs no upload.
2. Click **Sync This Scan**. Review the hostname/timestamp and expand **View exact scan metadata** if desired.
3. Check **I approve uploading this specific scan to my paired account**, then **Confirm upload**. Cancel sends nothing. Every new scan starts with consent unchecked.
4. After success, refresh or navigate to dashboard **Overview**, **Scan History**, or **Website Comparison**. Comparison requires saved scans for at least two distinct websites.

Only hostname, score/concern, HTTP(S) indicator, timestamp, third-party/provider counts and normalized tracker-hostname findings are uploaded. No URL path/query/fragment, cookies, page content, full resource URLs, credentials or browsing history is serialized. The server validates again and replaces untrusted finding descriptions with controlled text. Unknown owner IDs/extra fields are rejected. Counts and scores remain client-reported observations, not server-certified website safety.

Localhost/IP-only scans and unavailable scores remain local because the existing storage contract requires a public-style hostname and an actual score. Oversized findings/payloads are refused rather than silently truncated. The current database does not retain the original weighted score contributions or coverage record.

## Disconnect and recover

- **Unpair extension** revokes its credential on the server, then removes the local connection. Existing scans remain.
- Dashboard **Revoke extension → Confirm revoke extension** immediately blocks later device requests. A popup status check/upload then rejects the credential and clears it locally. Revocation affects only that account's device.
- **Remove local connection** is an explicit offline recovery control. It cannot revoke a credential on an unavailable server: follow up with dashboard revocation. Forgotten/orphaned device entries remain visible for revocation.
- Credentials expire after 90 days; pair again when expired. Logging out of the dashboard ends its session, not independently paired devices.
- If the API is unavailable, local scanning/report viewing still works. Upload errors keep the report available. Retrying the same approved scan uses the same UUID and does not duplicate an existing retained record. Closing the popup discards its report; there is no background upload queue or automatic retry. Revocation/consent changes are checked again for retries.

## Security and API contracts

| Endpoint under `/api/v1`       | Authentication and behavior                                                                                           |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| `GET /devices`                 | Dashboard session; own device metadata, never credential digests                                                      |
| `POST /devices/pairing-code`   | Dashboard session + existing Origin/JSON CSRF protections; empty JSON; returns one code and expiry                    |
| `DELETE /devices/:id`          | Dashboard session + CSRF; own credential revocation; 204 or owner-safe 404                                            |
| `POST /extension/pair`         | One-time code + displayName; atomically consumes the code, creates device and returns one credential                  |
| `GET /extension/status`        | Device Bearer credential; device metadata, storage consent and retention                                              |
| `POST /extension/scans`        | Device Bearer; strict `{uploadId,consent:true,scan}`; account consent and owner/retention checks; returns stored scan |
| `DELETE /extension/connection` | Device Bearer; empty JSON; self-revocation                                                                            |

Pairing codes use 128 random bits; device credentials use 256 random bits. Only SHA-256 digests are stored in PostgreSQL. Atomic code claims prevent concurrent reuse. Credential checks enforce revocation and 90-day lifetime. Upload transactions lock the device and account preference rows so uploads cannot bypass revocation/consent changes; `(deviceId,clientUploadId)` deduplicates concurrent retries while a record exists. Deleted/expired records are not permanent deduplication tombstones.

Cookie-authenticated routes keep exact-origin CORS and CSRF protections. The separate `/extension/` namespace accepts extension origins without credentialed CORS, ignores session cookies for authorization, and requires the device secret after pairing. Ordinary website origins are rejected there. Origin is not treated as authentication; nonbrowser clients still need the actual secret/code. The extension worker sends `credentials:omit`, refuses redirects, uses timeouts, accepts messages only from its packaged popup, and exposes no arbitrary-URL network proxy or external message bridge.

Codes are shown only in dashboard memory; device secrets are held in `chrome.storage.local` with `TRUSTED_CONTEXTS`, never Chrome sync storage or dashboard localStorage. Chrome profile storage is not an encrypted secrets vault; protect the OS/browser profile and revoke lost devices. Worker responses to the popup omit credentials. No secrets appear in URLs, logs or Git.

Limits: existing global 120/minute/IP and auth limits; code generation 10 attempts/15 minutes/account; redemption 10 attempts/15 minutes/IP; authenticated device API 30/minute/device. Errors use safe JSON, including rate-limit errors. Existing 64 KiB body limit, Zod validation, owner isolation and retention apply.

## Actual verification

```powershell
npm run typecheck
npm run lint
npm test
npm run test:integration
npm run build
npm run test:smoke
npm run verify:extension
npm run test:browser-sync
npm run test:browser-scanner
npm run format:check
```

`test:browser-sync` runs the dashboard checks plus an actual unpacked MV3 extension in installed Chrome. Chrome's native Extensions automation triggers the action and grants activeTab on a fully loaded controlled fixture. The real collector/engine measures four providers, six third-party domains and score 24; a real worker pairs/uploads through HTTP; PostgreSQL records and React pages are checked; native status rejects dashboard revocation after reopening the popup. A separate explicit HTTP fixture supplies the second saved hostname for the comparison test. Neither fixture is a claim about an uncontrolled real website.

The harness verifies actual application/test database identities before writes. Only the separate test database receives unique temporary users/scans/devices/codes. Cleanup removes those users and cascades their test records; read-only application User/Scan/Session/Finding/Device/PairingCode counts are checked unchanged. No database reset/truncate is used. The extension copy in ignored `.browser-smoke/` is compiled to the test API's ephemeral loopback port; the regular `apps/extension/dist` remains configured for port 4000. `CHROME_PATH` can override the installed Chrome path. Newer Chrome with Extensions automation is required for this native test.

Local evidence: `.browser-smoke/sync-report.json` and `extension-synchronized-fixture.png`. Expected final Vite proxy errors occur when the harness deliberately stops Express to verify the unavailable-server UI. See VALIDATION.md for executed totals. Browser checks are local, not yet provisioned in remote CI.

Manual checks: your installed extension's updated permissions, normal websites with different consent states, offline sync retry/unpair recovery, keyboard/screen-reader behavior and physical devices. Remote HTTPS hosting is not configured: this is a loopback development integration, not a deployed cloud service. Production requires an explicit HTTPS endpoint/manifest grant, least-privilege database access, shared rate-limit storage and scheduled expired-code/session/retention cleanup. No background browsing collection, automatic synchronization or offline queue is implemented.

Chrome platform references: [cross-origin extension requests](https://developer.chrome.com/docs/extensions/develop/concepts/network-requests), [storage access controls](https://developer.chrome.com/docs/extensions/reference/api/storage), and [native Extensions automation](https://chromedevtools.github.io/devtools-protocol/tot/Extensions/).

Browser scripts remove only their own generated profile/extension directories after checking their resolved paths are direct children of .browser-smoke. Screenshots and JSON reports remain. A disk-full verification retry was resolved by removing generated workspace test directories; neither the personal Chrome profile nor project/database data was touched.
