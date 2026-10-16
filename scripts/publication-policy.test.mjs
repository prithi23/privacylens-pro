import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  forbiddenPublicationPath,
  contentFindings,
  isGithubNoreplyEmail,
} from './publication-policy.mjs';
test('keeps explicit public templates, SQL migrations and required assets', () => {
  for (const path of [
    '.env.example',
    'deploy/.env.production.example',
    'apps/api/prisma/migrations/20261016000400_analysis_provenance/migration.sql',
    'docs/research/evaluation.json',
    'docs/screenshots/evaluation-lab-fixture.png',
    'apps/extension/public/icons/icon128.png',
  ])
    assert.equal(forbiddenPublicationPath(path), false);
});
test('blocks sensitive formats, archives, state, environment copies and traversal', () => {
  for (const path of [
    '.env',
    'apps/api/.env.example',
    'copy.env/.env',
    'database.sql',
    'database.sql.gz',
    'database.dump.zip',
    'browser.har',
    'local.sqlite3-wal',
    'local.db',
    'exports/scans.json',
    '.git/config',
    'nested/.git',
    'secrets/token.txt',
    '.npmrc',
    'server.key',
    'id_ed25519',
    'auth-state.json',
    'backup.bak',
    'data.tar.gz',
    '../outside',
    'C:/outside',
    'nested\\file',
  ])
    assert.equal(forbiddenPublicationPath(path), true, path);
});
test('recognizes secrets copied to innocuous text files without exposing them', () => {
  const envName = ['POSTGRES', 'PASSWORD'].join('_');
  const value = ['not', 'a', 'placeholder'].join('-');
  assert.ok(
    contentFindings(Buffer.from(`${envName}=${value}`)).includes(
      'secret-assignment',
    ),
  );
  const uri = ['postgresql:/', '/unit:', value, '@localhost/db'].join('');
  assert.ok(contentFindings(Buffer.from(uri)).includes('database-credential'));
  const token = ['pl', 'd_', 'x'.repeat(43)].join('');
  assert.ok(contentFindings(Buffer.from(token)).includes('device-credential'));
});
test('does not blanket-exempt tests or fixture files from literal secret scanning', () => {
  const name = ['pairing', 'Code'].join('');
  assert.ok(
    contentFindings(Buffer.from(`${name}: '${'x'.repeat(22)}'`)).includes(
      'literal-auth-secret',
    ),
  );
});
test('detects profile paths and dump/private record content', () => {
  assert.ok(
    contentFindings(
      Buffer.from(['C:', 'Users', 'private-person', 'project'].join('\\')),
    ).includes('personal-profile-path'),
  );
  assert.ok(
    contentFindings(
      Buffer.from(['-- PostgreSQL', 'database dump'].join(' ')),
    ).includes('database-dump-content'),
  );
  const record = JSON.stringify({
    [['password', 'Hash'].join('')]: 'x'.repeat(64),
  });
  assert.ok(
    contentFindings(Buffer.from(record)).includes('private-record-export'),
  );
});
test('permits narrowly documented placeholders and dynamic runtime values', () => {
  const scan = JSON.stringify({
    hostname: 'example.com',
    privacyScore: 12,
    scannedAt: '2026-10-16T00:00:00.000Z',
  });
  assert.ok(contentFindings(Buffer.from(scan)).includes('scan-record-export'));
  assert.deepEqual(
    contentFindings(
      Buffer.from(
        'POSTGRES_PASSWORD=local_development_only\nSESSION_SECRET=${SESSION_SECRET}',
      ),
    ),
    [],
  );
  assert.deepEqual(
    contentFindings(Buffer.from('Run from the repository root.')),
    [],
  );
});

const githubAddress = (login) =>
  `${login}@${['users', 'noreply', 'github', 'com'].join('.')}`;
const personalAddress = ['private-person', 'mail.example'].join('@');
const gitCommit = (author, committer = author, message = 'Fixture commit') =>
  `tree ${'a'.repeat(40)}\nauthor Fixture Author <${author}> 0 +0000\ncommitter Fixture Committer <${committer}> 0 +0000\n\n${message}\n`;
const metadataRules = (text, type = 'commit') =>
  contentFindings(Buffer.from(text), { gitObjectType: type });

test('recognizes current, legacy and bot GitHub noreply formats', () => {
  for (const local of [
    '12345+octocat',
    'octocat',
    '12345+octo-cat',
    '41898282+github-actions[bot]',
    'github-actions[bot]',
  ])
    assert.equal(isGithubNoreplyEmail(githubAddress(local)), true);
});

test('rejects personal addresses, spoofed domains and malformed noreply logins', () => {
  for (const address of [
    personalAddress,
    ['octocat', 'github.com'].join('@'),
    `${githubAddress('123+octocat')}.evil.example`,
    ...[
      '+octocat',
      '0+octocat',
      '-octocat',
      'octocat-',
      'octo--cat',
      'a'.repeat(40),
      '123+',
    ].map(githubAddress),
  ])
    assert.equal(isGithubNoreplyEmail(address), false);
});

test('allows valid noreply author and committer headers on actual commit objects', () => {
  assert.deepEqual(
    metadataRules(
      gitCommit(githubAddress('12345+octocat'), githubAddress('octo-cat')),
    ),
    [],
  );
});

test('allows valid noreply tagger headers on annotated tag objects', () => {
  const tag = `object ${'a'.repeat(40)}\ntype commit\ntag fixture\ntagger Fixture Bot <${githubAddress('41898282+github-actions[bot]')}> 0 +0000\n\nFixture tag\n`;
  assert.deepEqual(metadataRules(tag, 'tag'), []);
  assert.ok(
    metadataRules(
      tag.replace(
        githubAddress('41898282+github-actions[bot]'),
        personalAddress,
      ),
      'tag',
    ).includes('nonfixture-email-review'),
  );
});

test('keeps ordinary author or committer email addresses blocked', () => {
  const safe = githubAddress('12345+octocat');
  for (const pair of [
    [personalAddress, safe],
    [safe, personalAddress],
    [personalAddress, personalAddress],
  ])
    assert.ok(
      metadataRules(gitCommit(...pair)).includes('nonfixture-email-review'),
    );
});

test('does not exempt file content, messages, other headers or identity display names', () => {
  const safe = githubAddress('12345+octocat');
  assert.ok(
    contentFindings(Buffer.from(gitCommit(safe))).includes(
      'nonfixture-email-review',
    ),
  );
  assert.ok(
    metadataRules(gitCommit(safe), 'blob').includes('nonfixture-email-review'),
  );
  assert.ok(
    metadataRules(gitCommit(safe, safe, personalAddress)).includes(
      'nonfixture-email-review',
    ),
  );
  assert.ok(
    metadataRules(gitCommit(safe, safe, safe)).includes(
      'nonfixture-email-review',
    ),
  );
  assert.ok(
    metadataRules(
      gitCommit(safe).replace('tree ', `extra ${personalAddress}\ntree `),
    ).includes('nonfixture-email-review'),
  );
  assert.ok(
    metadataRules(
      gitCommit(safe).replace('Fixture Author', personalAddress),
    ).includes('nonfixture-email-review'),
  );
});

test('still checks credentials and sensitive paths when commit identities are allowed', () => {
  const safe = githubAddress('12345+octocat');
  const secret = ['pl', 'd_', 'x'.repeat(43)].join('');
  assert.ok(
    metadataRules(gitCommit(safe, safe, secret)).includes('device-credential'),
  );
  const path = ['C:', 'Users', 'private-person', 'project'].join('\\');
  assert.ok(
    metadataRules(gitCommit(safe, safe, path)).includes(
      'personal-profile-path',
    ),
  );
});
