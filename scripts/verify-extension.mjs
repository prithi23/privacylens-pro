import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { extensionTarget } from '../apps/extension/config/target.ts';
const production = process.argv.includes('--production');
const base = fileURLToPath(
  new URL(
    `../apps/extension/${production ? 'dist-production' : 'dist'}/`,
    import.meta.url,
  ),
);
const release = JSON.parse(readFileSync(`${base}/release-config.json`, 'utf8'));
assert.equal(release.mode, production ? 'production' : 'development');
const target = extensionTarget(
  production
    ? {
        EXTENSION_TARGET: 'production',
        EXTENSION_API_ORIGIN: release.apiOrigin,
      }
    : { VITE_SYNC_API_PORT: new URL(release.apiOrigin).port },
);
assert.equal(release.apiOrigin, target.origin);
const manifest = JSON.parse(readFileSync(`${base}/manifest.json`, 'utf8'));
assert.equal(manifest.manifest_version, 3);
assert.deepEqual(manifest.permissions, ['activeTab', 'scripting', 'storage']);
assert.deepEqual(manifest.host_permissions, [target.hostPermission]);
assert.ok(!manifest.content_scripts && !manifest.externally_connectable);
assert.equal(
  manifest.content_security_policy.extension_pages,
  `script-src 'self'; object-src 'none'; base-uri 'none'; connect-src ${target.connectSource}; frame-src 'none'; form-action 'none'`,
);
assert.ok(
  manifest.content_security_policy.extension_pages.includes(
    `connect-src ${target.connectSource};`,
  ),
);
assert.ok(
  manifest.content_security_policy.extension_pages.includes("frame-src 'none'"),
);
for (const path of [
  manifest.action.default_popup,
  manifest.background.service_worker,
  ...Object.values(manifest.icons),
])
  assert.ok(
    existsSync(`${base}/${path}`),
    `Missing extension artifact: ${path}`,
  );
assert.ok(
  !manifest.content_security_policy.extension_pages.includes('unsafe-eval'),
);
const html = readFileSync(`${base}/${manifest.action.default_popup}`, 'utf8');
const worker = readFileSync(
  `${base}/${manifest.background.service_worker}`,
  'utf8',
);
assert.ok(
  worker.includes(target.apiBase),
  'Worker must use the manifest-approved API without a development fallback',
);
for (const match of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
  assert.ok(!/^https?:/.test(match[1]), 'Remote executable resource');
  assert.ok(
    existsSync(`${base}/${match[1]}`),
    `Missing popup asset: ${match[1]}`,
  );
}
console.info(
  'Manifest V3 structure, permissions, CSP, icons, worker, and popup assets verified. Chrome loading still requires manual testing.',
);
