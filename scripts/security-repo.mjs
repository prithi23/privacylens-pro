import { execFileSync } from 'node:child_process';
import { readFileSync, lstatSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import {
  forbiddenPublicationPath,
  contentFindings,
  inspectPublication,
  publicTemplates,
} from './publication-policy.mjs';
const sourceRoot = fileURLToPath(new URL('../', import.meta.url));
const args = process.argv.slice(2);
const findings = [],
  historicalPrivacyWarnings = [];
try {
  if (args.length && (args.length !== 2 || args[0] !== '--snapshot'))
    throw new Error('Invalid arguments');
  if (args[0] === '--snapshot') {
    const { files, findings: content } = inspectPublication(
      resolve(sourceRoot, args[1]),
    );
    findings.push(...content);
    console.log(
      JSON.stringify(
        {
          status: findings.length ? 'failed' : 'passed',
          mode: 'history-free-snapshot',
          files: files.length,
          findings,
          note: 'Strict filesystem scan; no Git calls, initialization or database access.',
        },
        null,
        2,
      ),
    );
  } else {
    const git = (args, input) =>
      execFileSync('git', args, {
        cwd: sourceRoot,
        input,
        maxBuffer: 64 * 1024 * 1024,
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' },
      });
    const zero = (value) => value.toString().split('\0').filter(Boolean);
    const top = git(['rev-parse', '--show-toplevel']).toString().trim();
    if (resolve(top) !== resolve(sourceRoot))
      throw new Error('Expected project Git root');
    const paths = [
      ...new Set(
        zero(
          git(['ls-files', '--cached', '--others', '--exclude-standard', '-z']),
        ),
      ),
    ];
    function inspect(path, data, scope, gitObjectType) {
      if (forbiddenPublicationPath(path))
        findings.push({ path, rule: 'forbidden-path', scope });
      for (const rule of contentFindings(data, {
        gitObjectType: scope === 'history' ? gitObjectType : undefined,
      })) {
        if (scope !== 'working' && rule === 'personal-profile-path')
          historicalPrivacyWarnings.push({ path, scope, rule });
        else findings.push({ path, scope, rule });
      }
    }
    for (const path of paths) {
      if (lstatSync(resolve(sourceRoot, path)).isSymbolicLink())
        findings.push({ path, rule: 'symlink' });
      else inspect(path, readFileSync(resolve(sourceRoot, path)), 'working');
    }
    const canaries = [
      '.env',
      '.env copy.example',
      'apps/api/.env',
      'apps/api/.env.example',
      'deploy/.env.production',
      '.browser-smoke/result.json',
      'backups/private.dump',
      'private-data/scans.json',
      'apps/extension/dist-production/background.js',
      'server.key',
      'database.sql',
      'database.sql.gz',
      'database.dump.zip',
      'browser.har',
      'browser.har.gz',
      'local.sqlite',
      'local.sqlite3-wal',
      'local.db',
      'backup.bak',
      'backup.backup.gz',
      'exports/scans.json',
      'private-exports/users.json',
      'secrets/credentials.json',
      '.npmrc',
      'id_ed25519',
    ];
    const ignored = new Set(
      git(['check-ignore', '--no-index', '--stdin'], canaries.join('\n') + '\n')
        .toString()
        .trim()
        .split(/\r?\n/),
    );
    for (const path of canaries)
      if (!ignored.has(path))
        findings.push({ path, rule: 'missing-ignore-rule' });
    const required = [
      ...publicTemplates,
      ...paths.filter((path) =>
        /^apps\/api\/prisma\/migrations\/.+\/migration\.sql$/.test(path),
      ),
    ];
    const trackedIgnored = new Set(
      zero(
        git(['ls-files', '--cached', '--ignored', '--exclude-standard', '-z']),
      ),
    );
    for (const path of trackedIgnored)
      findings.push({ path, rule: 'tracked-ignored-file' });
    for (const path of required) {
      let ignoredRequired = false;
      try {
        git(['check-ignore', '--no-index', path]);
        ignoredRequired = true;
      } catch (error) {
        if (error.status !== 1) throw error;
      }
      if (ignoredRequired)
        findings.push({ path, rule: 'required-resource-ignored' });
    }
    const staged = zero(git(['ls-files', '--stage', '-z'])).map((entry) => {
      const [metadata, path] = entry.split('\t');
      return { id: metadata.split(' ')[1], path };
    });
    const objects = git(['rev-list', '--objects', '--all'])
      .toString()
      .trim()
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => {
        const pos = line.indexOf(' ');
        return {
          id: pos < 0 ? line : line.slice(0, pos),
          path: pos < 0 ? '(commit/tag metadata)' : line.slice(pos + 1),
        };
      });
    for (const [scope, entries] of [
      ['index', staged],
      ['history', objects],
    ]) {
      if (!entries.length) continue;
      const batch = git(
        ['cat-file', '--batch'],
        entries.map((item) => item.id).join('\n') + '\n',
      );
      let offset = 0;
      for (const item of entries) {
        const end = batch.indexOf(10, offset);
        const [, type, sizeText] = batch
          .subarray(offset, end)
          .toString()
          .split(' ');
        const size = Number(sizeText);
        const data = batch.subarray(end + 1, end + 1 + size);
        offset = end + 1 + size + 1;
        if (['blob', 'commit', 'tag'].includes(type))
          inspect(item.path, data, scope, type);
      }
    }
    console.log(
      JSON.stringify(
        {
          status: findings.length ? 'failed' : 'passed',
          mode: 'repository',
          candidateFiles: paths.length,
          indexEntries: staged.length,
          historyObjects: objects.length,
          ignoredCanaries: canaries.length,
          requiredResources: required.length,
          findings,
          historicalPrivacyWarnings,
          note: 'Original history is unchanged. Historical profile metadata remains a warning; publish only the separately strict-scanned clean snapshot. Heuristic checks cannot guarantee absence of every secret.',
        },
        null,
        2,
      ),
    );
  }
  if (findings.length) process.exitCode = 1;
} catch {
  console.error(
    'Security scan failed closed. Raw file/Git errors withheld; no sensitive values emitted.',
  );
  process.exitCode = 1;
}
