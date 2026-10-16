import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { load } from 'js-yaml'; // Locked development dependency supplied by ESLint.
const args = process.argv.slice(2);
assert.ok(
  !args.length || (args.length === 2 && args[0] === '--root'),
  'Use --root <snapshot>',
);
const root = args.length
  ? resolve(args[1])
  : fileURLToPath(new URL('../', import.meta.url));
const read = (path) => readFileSync(`${root}/${path}`, 'utf8');
const workflow = load(read('.github/workflows/ci.yml'));
assert.deepEqual(workflow.permissions, { contents: 'read' });
assert.ok(
  Object.hasOwn(workflow.on, 'push') &&
    Object.hasOwn(workflow.on, 'pull_request'),
);
assert.ok(!workflow.on.pull_request_target);
const job = workflow.jobs.validate;
assert.ok(job.timeout_minutes || job['timeout-minutes']);
assert.notEqual(
  new URL(job.env.DATABASE_URL).pathname,
  new URL(job.env.TEST_DATABASE_URL).pathname,
);
const commands = job.steps
  .filter((step) => step.run)
  .map((step) => step.run)
  .join('\n');
for (const command of [
  'security:repo',
  'test:publication',
  'release:check',
  'typecheck',
  'lint',
  'format:check',
  'npm test',
  'test:integration',
  'evaluate:check',
  'npm run build',
  'test:smoke',
  'verify:extension',
  'test:browser-scanner',
  'test:browser-sync',
  'build:extension:production',
])
  assert.ok(commands.includes(command), `Missing CI gate: ${command}`);
assert.ok(!/migrate reset|pull_request_target/.test(commands));
const containerValidation = job.steps.find(
  (step) => step.name === 'Validate container and reverse-proxy preparation',
);
assert.equal(containerValidation?.shell, 'bash');
const containerCommands = containerValidation.run;
for (const guard of [
  'set -euo pipefail',
  'umask 077',
  '[[ -e deploy/.env.production || -L deploy/.env.production ]]',
  'set -o noclobber',
  ': > deploy/.env.production',
  "trap 'rm -f deploy/.env.production' EXIT",
  'cat deploy/.env.production.example >> deploy/.env.production',
  'docker compose --env-file deploy/.env.production -f deploy/compose.production.yml config --quiet',
  ')\n',
])
  assert.ok(
    containerCommands.includes(guard),
    `Missing temporary CI environment guard: ${guard}`,
  );
assert.ok(
  containerCommands.indexOf("trap 'rm -f deploy/.env.production' EXIT") <
    containerCommands.indexOf('cat deploy/.env.production.example'),
);
assert.ok(
  containerCommands.indexOf('config --quiet\n') <
    containerCommands.indexOf(')\n') &&
    containerCommands.indexOf(')\n') <
      containerCommands.indexOf('docker build'),
  'Clean up the temporary environment before any image build',
);
for (const target of ['api', 'migration', 'web'])
  assert.ok(
    containerCommands.includes(
      `docker build -f deploy/Dockerfile --target ${target} -t privacylens-${target}:ci .`,
    ),
    `Missing container build: ${target}`,
  );
assert.ok(
  containerCommands.includes(
    'docker run --rm -e PUBLIC_DOMAIN=privacy.example.com privacylens-web:ci caddy validate',
  ),
);
const runtimeCommands = job.steps.find(
  (step) => step.name === 'Exercise prepared runtime images privately in CI',
)?.run;
assert.ok(runtimeCommands?.includes('trap '));
assert.ok(runtimeCommands.includes('--network host -e DATABASE_URL'));
assert.ok(runtimeCommands.includes('-p 127.0.0.1:14083:8080'));
for (const url of [
  'http://127.0.0.1:14082/api/v1/ready',
  'http://127.0.0.1:14083/',
])
  assert.ok(
    runtimeCommands.includes(
      `curl --fail --retry 10 --retry-connrefused --retry-delay 1 ${url}`,
    ),
  );
const compose = load(read('deploy/compose.production.yml'));
for (const name of ['api', 'migrate'])
  assert.equal(compose.services[name].env_file, '.env.production');
assert.ok(!compose.services.api.ports && !compose.services.api.volumes);
assert.equal(compose.services.api.environment.NODE_ENV, 'production');
assert.equal(compose.services.api.environment.TRUST_PROXY, '172.30.0.2/32');
assert.equal(compose.services.web.networks.backend.ipv4_address, '172.30.0.2');
assert.deepEqual(compose.services.migrate.profiles, ['release']);
assert.ok(!compose.services.postgres);
assert.ok(read('.dockerignore').includes('**/.env*'));
for (const name of [
  'SETUP.md',
  'DEMO.md',
  'ARCHITECTURE.md',
  'DATABASE.md',
  'DEPLOYMENT.md',
  'RELEASE_READINESS.md',
  'PHASE7.md',
])
  assert.ok(existsSync(`${root}/docs/${name}`));
// Validate local Markdown links and Mermaid fences without fetching anything.
for (const name of [
  'README.md',
  ...[
    'SETUP',
    'DEMO',
    'ARCHITECTURE',
    'DATABASE',
    'DEPLOYMENT',
    'RELEASE_READINESS',
    'PHASE7',
  ].map((name) => `docs/${name}.md`),
]) {
  const content = read(name);
  for (const match of content.matchAll(/\]\(([^\s)]+)\)/g)) {
    const target = match[1];
    if (/^(?:https?:|#)/.test(target)) continue;
    assert.ok(
      existsSync(resolve(root, dirname(name), target.split('#')[0])),
      `Broken documentation link in ${name}`,
    );
  }
  const fences = content.match(/^```/gm) ?? [];
  assert.equal(fences.length % 2, 0, `Unclosed code fence in ${name}`);
}
console.log(
  'Release configuration, CI gate coverage, isolated deployment topology and local documentation links passed static checks. Containers, TLS and remote CI still require execution.',
);
