import { readdirSync, lstatSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export const publicTemplates = new Set([
  '.env.example',
  'deploy/.env.production.example',
]);
export const placeholders = new Set([
  'local_development_only',
  'ci_test_only',
  'unit-only',
  'unavailable',
  'unconfigured',
  'REPLACE_PASSWORD',
  'YOUR_URL_ENCODED_APP_PASSWORD',
  'YOUR_URL_ENCODED_TEST_PASSWORD',
]);
export const legitimateMigration = (path) =>
  /^apps\/api\/prisma\/migrations\/\d{14}_[a-z0-9_]+\/migration\.sql$/.test(
    path,
  );
export function forbiddenPublicationPath(path) {
  if (
    !path ||
    path.includes('\\') ||
    path.startsWith('/') ||
    /^[A-Za-z]:/.test(path) ||
    path.split('/').some((part) => ['.', '..', ''].includes(part))
  )
    return true;
  if (
    /(^|\/)(?:\.git|node_modules|\.browser-smoke|\.dependency-resolution|dist|dist-production|generated|backups|private-data|release-artifacts|exports|private-exports|scan-exports|secrets|credentials|\.auth|\.ssh|\.aws|\.azure|\.gnupg|\.kube|\.vscode|\.idea|\.history|logs|tmp|temp|coverage|test-results|playwright-report)(?:\/|$)/i.test(
      path,
    )
  )
    return true;
  if (/(^|\/)\.env[^/]*$/i.test(path) && !publicTemplates.has(path))
    return true;
  if (
    /(^|\/)(?:\.npmrc|\.netrc|\.git-credentials|id_rsa[^/]*|id_ed25519[^/]*|id_ecdsa[^/]*|id_dsa[^/]*|credentials\.[^/]+|secrets\.[^/]+|(?:storage|auth)-state[^/]*\.json)$/i.test(
      path,
    )
  )
    return true;
  if (/\.(?:sql|pgsql)(?:\..*)?$/i.test(path) && !legitimateMigration(path))
    return true;
  return /(?:\.(?:dump|dmp|pgdump|backup|bak|bkp|har|sqlite\w*|db)(?:[.-].*)?|\.(?:pem|key|p12|pfx|jks|keystore|log|old|orig|tmp|temp|swp|swo|code-workspace|zip|gz|tgz|tar|7z|rar)|~)$/i.test(
    path,
  );
}
const fixturePasswords = new Set([
  'browser-fixture-password-123!',
  'integration-fixture-password-123!',
  'unit-fixture-only-password-123!',
  'device-integration-password-123!',
  'incorrect-password-123!',
]);
const dynamicValue = (value) =>
  /^\$\{[^}]+\}$|^\$[A-Z_][A-Z0-9_]*$|^\$\$[A-Z_][A-Z0-9_]*$/.test(value);
// Format validation only, not verification of an account's ownership. Covers
// GitHub's numeric-ID format, legacy logins, and generated app/bot identities.
export function isGithubNoreplyEmail(email) {
  const match =
    /^(?:[1-9]\d*\+)?([a-z\d](?:[a-z\d-]{0,37}[a-z\d])?)(?:\[bot\])?@users\.noreply\.github\.com$/i.exec(
      email,
    );
  return Boolean(match && !match[1].includes('--'));
}
function emailReviewText(text, gitObjectType) {
  if (!['commit', 'tag'].includes(gitObjectType)) return text;
  const boundary = text.search(/\r?\n\r?\n/);
  if (boundary === -1) return text;
  const identity =
    gitObjectType === 'commit'
      ? /^(?:author|committer) [^<>\r\n]+ <([^<>\s]+)> \d+ [+-]\d{4}$/
      : /^tagger [^<>\r\n]+ <([^<>\s]+)> \d+ [+-]\d{4}$/;
  const headers = text
    .slice(0, boundary)
    .split(/\r?\n/)
    .map((line) => {
      const match = identity.exec(line);
      // Replace only the accepted address: another email in the display name,
      // other headers, or message must still be reviewed.
      return match && isGithubNoreplyEmail(match[1])
        ? line.replace(`<${match[1]}>`, '<github-noreply-identity>')
        : line;
    });
  return headers.join('\n') + text.slice(boundary);
}
export function contentFindings(buffer, { gitObjectType } = {}) {
  if (buffer.includes(0)) return [];
  const text = buffer.toString('utf8'),
    rules = new Set();
  if (
    new RegExp('-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE' + ' KEY-----').test(
      text,
    )
  )
    rules.add('private-key');
  if (/\b(?:ghp_|github_pat_|sk-proj-)[A-Za-z0-9_-]{20,}\b/.test(text))
    rules.add('service-token');
  if (/\bAKIA[0-9A-Z]{16}\b/.test(text)) rules.add('cloud-access-key');
  if (/\bpld_[A-Za-z0-9_-]{43}\b/.test(text)) rules.add('device-credential');
  if (
    /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{20,}\b/.test(
      text,
    )
  )
    rules.add('jwt');
  for (const match of text.matchAll(
    /postgres(?:ql)?:\/\/[^\s'"`:@]+:([^\s'"`@]+)@/g,
  )) {
    try {
      if (!placeholders.has(decodeURIComponent(match[1])))
        rules.add('database-credential');
    } catch {
      rules.add('database-credential');
    }
  }
  const secretNames =
    'POSTGRES_PASSWORD|DATABASE_PASSWORD|DB_PASSWORD|SESSION_SECRET|JWT_SECRET|ACCESS_TOKEN|REFRESH_TOKEN|SESSION_TOKEN|API_KEY|CLIENT_SECRET|PAIRING_CODE|DEVICE_CREDENTIAL';
  const assignments = new RegExp(
    `^\\s*(?:export\\s+)?(?:${secretNames})\\s*[:=]\\s*(.+?)\\s*$`,
    'gim',
  );
  for (const match of text.matchAll(assignments)) {
    const value = match[1].replace(/^["']|["'],?$/g, '').trim();
    if (value && !placeholders.has(value) && !dynamicValue(value))
      rules.add('secret-assignment');
  }
  const literals =
    /(?<![A-Za-z0-9_-])\b(password|access_token|refresh_token|sessionToken|credential|pairingCode|code)["']?\s*[:=]\s*["']([^"'\r\n]+)["']/gi;
  for (const [, key, value] of text.matchAll(literals)) {
    if (
      placeholders.has(value) ||
      fixturePasswords.has(value) ||
      dynamicValue(value)
    )
      continue;
    const threshold = /^(?:pairingCode|code)$/i.test(key)
      ? 22
      : key.toLowerCase() === 'password'
        ? 8
        : 32;
    if (
      value.length >= threshold &&
      /^[A-Za-z0-9_!@#$%^&*+./=:-]+$/.test(value)
    )
      rules.add('literal-auth-secret');
  }
  if (
    /"(?:passwordHash|tokenHash|credentialHash|codeHash)"\s*:\s*"[a-zA-Z0-9$+/_=-]{32,}"/.test(
      text,
    )
  )
    rules.add('private-record-export');
  if (
    /^\s*[[{]/.test(text) &&
    /"hostname"\s*:\s*"[^"\r\n]+"/.test(text) &&
    /"privacyScore"\s*:\s*\d+/.test(text) &&
    /"scannedAt"\s*:\s*"/.test(text)
  )
    rules.add('scan-record-export');
  if (
    /(?:^|\n)(?:-- PostgreSQL database dump|COPY (?:public\.)?"?(?:User|Scan|Session|Device)"?\s|INSERT INTO (?:public\.)?"(?:User|Scan|Session|Device)"\s)/.test(
      text,
    )
  )
    rules.add('database-dump-content');
  if (
    /(?:[A-Z]:[\\/]+Users[\\/]+(?!Public\b|<|YOUR|your)|\/home\/(?!<|YOUR|your)[A-Za-z0-9_-]+\/)/i.test(
      text,
    )
  )
    rules.add('personal-profile-path');
  for (const [, host] of emailReviewText(text, gitObjectType).matchAll(
    /\b[A-Z0-9._%+-]+@([A-Z0-9.-]+\.[A-Z]{2,})\b/gi,
  ))
    if (
      !/(^|\.)(example\.(?:com|net|org|test)|test|invalid|localhost)$/i.test(
        host,
      )
    )
      rules.add('nonfixture-email-review');
  return [...rules];
}
export function walkPublication(root) {
  const files = [];
  function walk(path = '') {
    for (const name of readdirSync(resolve(root, path)).sort()) {
      const relative = path ? `${path}/${name}` : name;
      const stat = lstatSync(resolve(root, relative));
      if (stat.isSymbolicLink())
        throw new Error('Publication symlinks are not allowed');
      if (forbiddenPublicationPath(relative))
        throw new Error('Forbidden publication path');
      if (stat.isDirectory()) walk(relative);
      else if (stat.isFile()) files.push(relative);
      else throw new Error('Unsupported publication file');
    }
  }
  walk();
  return files.sort();
}
export function inspectPublication(root) {
  const files = walkPublication(root),
    findings = [];
  for (const path of files)
    for (const rule of contentFindings(readFileSync(resolve(root, path))))
      findings.push({ path, rule });
  return { files, findings };
}
