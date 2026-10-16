import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  lstatSync,
  realpathSync,
} from 'node:fs';
import { resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import {
  forbiddenPublicationPath,
  contentFindings,
  inspectPublication,
  placeholders,
} from './publication-policy.mjs';

const source = fileURLToPath(new URL('../', import.meta.url));
const extras = [
  'scripts/publication-policy.mjs',
  'scripts/publication-policy.test.mjs',
  'scripts/prepare-publication.mjs',
  'docs/PUBLICATION_SNAPSHOT.md',
  'scripts/container-smoke.mjs',
  'scripts/container-smoke.test.mjs',
];
const manifestName = 'PUBLICATION_MANIFEST.json';
const sha = (data) => createHash('sha256').update(data).digest('hex');
const git = (args) =>
  execFileSync('git', args, {
    cwd: source,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
    env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' },
  });
const gitState = () => ({
  head: git(['rev-parse', 'HEAD']).trim(),
  index: sha(git(['ls-files', '--stage', '-z'])),
  refs: git(['show-ref']),
  branch: git(['branch', '--show-current']).trim(),
});
function localSecrets() {
  if (!existsSync(resolve(source, '.env'))) return [];
  const env = dotenv.parse(readFileSync(resolve(source, '.env'))),
    values = [];
  for (const [key, value] of Object.entries(env)) {
    if (/PASSWORD|TOKEN|SECRET|PRIVATE_KEY/.test(key) && value)
      values.push(value);
    if (/DATABASE_URL$/.test(key)) {
      try {
        const valueDecoded = decodeURIComponent(new URL(value).password);
        if (valueDecoded) values.push(valueDecoded);
      } catch {
        throw new Error('Unsafe local configuration');
      }
    }
  }
  return [...new Set(values)].filter((value) => !placeholders.has(value));
}
function checkKnownSecrets(data, secrets) {
  if (data.includes(0)) return;
  const text = data.toString('utf8');
  for (const secret of secrets) {
    if (secret.length >= 6)
      assert.ok(
        !text.includes(secret) && !text.includes(encodeURIComponent(secret)),
        'Configured secret detected; value withheld',
      );
    else
      for (const match of text.matchAll(
        /postgres(?:ql)?:\/\/[^\s'"`:@]+:([^\s'"`@]+)@/g,
      ))
        assert.notEqual(
          decodeURIComponent(match[1]),
          secret,
          'Configured secret detected; value withheld',
        );
  }
}
function verify(root) {
  const { files, findings } = inspectPublication(root);
  assert.equal(
    findings.length,
    0,
    'Snapshot content findings; values withheld',
  );
  const manifest = JSON.parse(
    readFileSync(resolve(root, manifestName), 'utf8'),
  );
  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.originalAllowlistFiles, 182);
  assert.deepEqual(manifest.addedFiles, extras);
  assert.equal(manifest.files.length, 182 + extras.length);
  assert.equal(manifest.totalFiles, manifest.files.length + 1);
  assert.equal(
    new Set(manifest.files.map((row) => row.path)).size,
    manifest.files.length,
  );
  assert.deepEqual(
    files,
    [...manifest.files.map((row) => row.path), manifestName].sort(),
  );
  const secrets = localSecrets();
  for (const row of manifest.files) {
    assert.ok(!forbiddenPublicationPath(row.path));
    const data = readFileSync(resolve(root, row.path));
    assert.equal(data.length, row.bytes);
    assert.equal(sha(data), row.sha256);
    checkKnownSecrets(data, secrets);
  }
  const required = [
    'README.md',
    'LICENSE',
    'THIRD_PARTY_NOTICES.md',
    'docs/ARCHITECTURE.md',
    'docs/DATABASE.md',
    'docs/SETUP.md',
    'docs/DEMO.md',
    '.github/workflows/ci.yml',
    'docs/screenshots/evaluation-lab-fixture.png',
    'docs/screenshots/extension-approved-sync-fixture.png',
    ...[
      '20261016000100_foundation',
      '20261016000200_auth_integrity',
      '20261016000300_device_sync',
      '20261016000400_analysis_provenance',
    ].map((name) => `apps/api/prisma/migrations/${name}/migration.sql`),
  ];
  for (const path of required)
    assert.ok(files.includes(path), 'Required publication resource missing');
  assert.ok(
    !existsSync(resolve(root, '.git')) && !existsSync(resolve(root, '.env')),
  );
  return {
    status: 'passed',
    files: files.length,
    payloadFiles: manifest.files.length,
    requiredResources: required.length,
    noGitMetadata: true,
    configuredSecretsCompared: secrets.length,
    integrity: 'all payload byte sizes and SHA-256 fingerprints match',
  };
}
try {
  const args = process.argv.slice(2);
  if (args.length === 2 && args[0] === '--verify')
    console.log(JSON.stringify(verify(resolve(args[1])), null, 2));
  else {
    assert.ok(
      args.length === 4 && args[0] === '--create' && args[2] === '--allowlist',
      'Use --create <new sibling> --allowlist <reviewed list> or --verify <snapshot>',
    );
    assert.ok(
      existsSync(resolve(source, '.git')),
      'Creation requires the existing source repository, without initializing any Git state',
    );
    const before = gitState(),
      destination = resolve(args[1]);
    assert.equal(
      realpathSync(dirname(destination)),
      realpathSync(resolve(source, '..')),
      'Snapshot must be a separate workspace sibling',
    );
    assert.match(
      basename(destination),
      /^privacylens-publication(?:-[A-Za-z0-9-]+)?$/,
    );
    assert.ok(
      !existsSync(destination),
      'Destination already exists; refusing to overwrite',
    );
    const original = readFileSync(resolve(args[3]), 'utf8')
      .split(/\r?\n/)
      .filter(Boolean);
    assert.equal(original.length, 182);
    assert.equal(new Set(original).size, 182);
    const approved = [...original, ...extras].sort();
    assert.equal(new Set(approved).size, approved.length);
    const current = [
      ...new Set(
        git(['ls-files', '--cached', '--others', '--exclude-standard', '-z'])
          .split('\0')
          .filter(Boolean),
      ),
    ].sort();
    assert.deepEqual(
      current,
      approved,
      'Unreviewed file inventory change; update the allowlist deliberately',
    );
    const secrets = localSecrets(),
      payload = [];
    for (const path of approved) {
      assert.ok(!forbiddenPublicationPath(path), 'Forbidden publication path');
      assert.ok(
        lstatSync(resolve(source, path)).isFile() &&
          !lstatSync(resolve(source, path)).isSymbolicLink(),
        'Only regular source files may be copied',
      );
      const data = readFileSync(resolve(source, path));
      assert.equal(
        contentFindings(data).length,
        0,
        'Source content findings; values withheld',
      );
      checkKnownSecrets(data, secrets);
      payload.push({ path, data });
    }
    // Exclusive creation: no existing folder is removed, overwritten or moved.
    mkdirSync(destination);
    for (const { path, data } of payload) {
      const target = resolve(destination, path);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, data, {
        flag: 'wx',
        mode: path === '.githooks/pre-commit' ? 0o755 : 0o644,
      });
    }
    writeFileSync(
      resolve(destination, manifestName),
      JSON.stringify(
        {
          schemaVersion: 1,
          createdAt: new Date().toISOString(),
          originalAllowlistFiles: 182,
          addedFiles: extras,
          totalFiles: payload.length + 1,
          files: payload.map(({ path, data }) => ({
            path,
            bytes: data.length,
            sha256: sha(data),
          })),
        },
        null,
        2,
      ) + '\n',
      { flag: 'wx' },
    );
    const result = verify(destination);
    assert.deepEqual(gitState(), before, 'Original Git state changed');
    console.log(
      JSON.stringify(
        {
          ...result,
          originalGitStateUnchanged: true,
          note: 'No Git history initialized or copied. No database access or remote action.',
        },
        null,
        2,
      ),
    );
  }
} catch {
  console.error(
    'Publication preparation/verification failed closed. No raw content or secret values emitted. Existing repositories and destinations were not deleted.',
  );
  process.exitCode = 1;
}
