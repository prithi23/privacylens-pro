import { spawnSync } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { contentFindings } from './publication-policy.mjs';

const names = ['privacylens-api-ci', 'privacylens-web-ci'];
const retryableCodes = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'EPIPE',
  'ETIMEDOUT',
  'UND_ERR_SOCKET',
  'UND_ERR_CONNECT_TIMEOUT',
]);
const retryableStatuses = new Set([408, 429, 502, 503, 504]);

// Only diagnostics are logged, never full inspect output, request bodies or env.
export function sanitizeDiagnostic(value, env = process.env) {
  let text = String(value);
  const secrets = new Set();
  for (const [key, value] of Object.entries(env)) {
    if (!value) continue;
    if (/PASSWORD|TOKEN|SECRET|PRIVATE_KEY|DATABASE_URL/i.test(key))
      secrets.add(value);
    if (/DATABASE_URL/i.test(key)) {
      try {
        secrets.add(decodeURIComponent(new URL(value).password));
      } catch {
        // The complete value is still redacted if the URL is invalid.
      }
    }
  }
  for (const secret of [...secrets]
    .filter(Boolean)
    .sort((a, b) => b.length - a.length)) {
    text = text.split(secret).join('[redacted]');
    text = text.split(encodeURIComponent(secret)).join('[redacted]');
  }
  text = text
    .replace(/(?:https?|postgres(?:ql)?):\/\/[^\s"'<>]+/gi, '[redacted-url]')
    .replace(/\bBearer\s+[^\s"',;]+/gi, 'Bearer [redacted]')
    .replace(
      /\b(?:authorization|cookie|set-cookie|password|pairing[_-]?code|access[_-]?token|secret)\b["']?\s*[:=]\s*[^\r\n]+/gi,
      '[redacted-field]',
    )
    .replace(/\p{Cc}/gu, (character) =>
      ['\n', '\t'].includes(character) ? character : ' ',
    );
  // Fail closed for other recognizable sensitive content, including personal paths.
  if (contentFindings(Buffer.from(text)).length)
    return '[diagnostic withheld by publication privacy checks]';
  // Prevent untrusted logs creating GitHub workflow annotations or commands.
  return text.replace(/^::/gm, '[log] ').slice(0, 4000);
}

async function requestHttp(url, timeoutMs) {
  const response = await fetch(url, {
    redirect: 'manual',
    signal: AbortSignal.timeout(timeoutMs),
  });
  let body = '';
  let bytes = 0;
  const decoder = new TextDecoder();
  for await (const chunk of response.body ?? []) {
    bytes += chunk.byteLength;
    if (bytes > 128 * 1024)
      throw new Error('Smoke response exceeds size limit');
    body += decoder.decode(chunk, { stream: true });
  }
  body += decoder.decode();
  return {
    status: response.status,
    contentType: response.headers.get('content-type') ?? '',
    body,
  };
}

export function validateApi(response) {
  try {
    const body = JSON.parse(response.body);
    if (body.status === 'ready' && body.database === 'connected') return;
  } catch {
    // Never include a failed response body in diagnostics.
  }
  throw new Error('API did not confirm database readiness');
}

export function validateFrontend(response) {
  if (
    !/^text\/html(?:;|$)/i.test(response.contentType) ||
    !/<title>PrivacyLens Pro<\/title>/.test(response.body) ||
    !/<div\s+id=["']root["']\s*>\s*<\/div>/.test(response.body) ||
    !/<script\b[^>]*\btype=["']module["'][^>]*\bsrc=["']\/assets\/[^"']+\.js["'][^>]*>/.test(
      response.body,
    )
  )
    throw new Error('Frontend response is not the built PrivacyLens dashboard');
}

export async function waitForHttp({
  label,
  url,
  validate,
  isRunning,
  request = requestHttp,
  sleep = delay,
  now = () => performance.now(),
  report = console.log,
  maxAttempts = 20,
  deadlineMs = 45000,
  requestTimeoutMs = 2000,
  delayMs = 1000,
}) {
  const address = new URL(url);
  if (
    address.protocol !== 'http:' ||
    address.hostname !== '127.0.0.1' ||
    address.username ||
    address.password
  )
    throw new Error('Container smoke requests must use plain loopback HTTP');
  const deadline = now() + deadlineMs;
  let lastReason = 'no response';
  for (let attempt = 1; attempt <= maxAttempts && now() < deadline; attempt++) {
    if (!(await isRunning()))
      throw new Error(`${label}: container is not running`);
    const remaining = deadline - now();
    if (remaining <= 0) break;
    let response;
    try {
      response = await request(
        url,
        Math.max(1, Math.min(requestTimeoutMs, Math.floor(remaining))),
      );
    } catch (error) {
      const code = error.cause?.code ?? error.code;
      if (
        !retryableCodes.has(code) &&
        !['AbortError', 'TimeoutError'].includes(error.name)
      )
        throw new Error(`${label}: nonretryable HTTP request failure`);
      lastReason = retryableCodes.has(code) ? code : 'request timeout';
    }
    if (response) {
      if (response.status === 200) {
        // Content failures are permanent, not a reason to wait or pass a redirect.
        validate(response);
        if (!(await isRunning()))
          throw new Error(`${label}: container exited after response`);
        report(`${label}: HTTP 200 and expected content verified.`);
        return;
      }
      if (!retryableStatuses.has(response.status))
        throw new Error(`${label}: unexpected HTTP status ${response.status}`);
      lastReason = `HTTP ${response.status}`;
    }
    report(
      `${label}: readiness attempt ${attempt}/${maxAttempts}: ${lastReason}.`,
    );
    if (attempt < maxAttempts && now() < deadline)
      await sleep(Math.min(delayMs, Math.max(0, deadline - now())));
  }
  throw new Error(`${label}: readiness limit reached (${lastReason})`);
}

function dockerCommand(args) {
  const result = spawnSync('docker', args, {
    encoding: 'utf8',
    timeout: 15000,
    maxBuffer: 1024 * 1024,
    windowsHide: true,
  });
  return {
    ok: result.status === 0,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

function stateOf(docker, name) {
  const result = docker(['inspect', '--format', '{{json .State}}', name]);
  if (!result.ok) throw new Error('Container state unavailable');
  return JSON.parse(result.stdout);
}

function diagnostics(docker, report, env) {
  for (const name of names) {
    report(`${name}: failure diagnostics (sanitized).`);
    try {
      const state = stateOf(docker, name);
      report(
        sanitizeDiagnostic(
          JSON.stringify({
            status: state.Status,
            running: state.Running,
            exitCode: state.ExitCode,
            oomKilled: state.OOMKilled,
            restarting: state.Restarting,
            error: state.Error,
          }),
          env,
        ),
      );
    } catch {
      report('Container state unavailable.');
    }
    const logs = docker(['logs', '--tail', '60', name]);
    // Caddy's structured log configuration fields may contain arbitrary data.
    // Keep only operational message fields; redact plaintext startup errors too.
    for (const line of `${logs.stdout}\n${logs.stderr}`
      .split(/\r?\n/)
      .filter(Boolean)
      .slice(-60)) {
      let diagnostic = line;
      try {
        const entry = JSON.parse(line);
        diagnostic = JSON.stringify(
          Object.fromEntries(
            ['level', 'logger', 'msg', 'error', 'address']
              .filter((key) => Object.hasOwn(entry, key))
              .map((key) => [key, entry[key]]),
          ),
        );
      } catch {
        /* Plaintext Caddy startup/configuration errors. */
      }
      report(sanitizeDiagnostic(diagnostic, env));
    }
  }
}

export async function runContainerSmoke({
  docker = dockerCommand,
  wait = waitForHttp,
  report = console.log,
  env = process.env,
} = {}) {
  let failure;
  const run = (args) => {
    const result = docker(args);
    if (!result.ok)
      throw new Error(
        `Docker ${args[0]} failed: ${sanitizeDiagnostic(result.stderr, env)}`,
      );
  };
  try {
    run([
      'run',
      '-d',
      '--name',
      names[0],
      '--network',
      'host',
      '-e',
      'DATABASE_URL',
      '-e',
      'WEB_ORIGINS=https://privacy.example.com',
      '-e',
      'HOST=127.0.0.1',
      '-e',
      'PORT=14082',
      'privacylens-api:ci',
    ]);
    await wait({
      label: 'API',
      url: 'http://127.0.0.1:14082/api/v1/ready',
      validate: validateApi,
      isRunning: () => stateOf(docker, names[0]).Running === true,
      report,
    });
    run([
      'run',
      '-d',
      '--name',
      names[1],
      '-p',
      '127.0.0.1:14083:8080',
      '-e',
      'PUBLIC_DOMAIN=:8080',
      'privacylens-web:ci',
    ]);
    await wait({
      label: 'Frontend',
      url: 'http://127.0.0.1:14083/',
      validate: validateFrontend,
      isRunning: () => stateOf(docker, names[1]).Running === true,
      report,
    });
  } catch (error) {
    failure = error;
    diagnostics(docker, report, env);
  } finally {
    const cleanup = docker(['rm', '-f', ...names]);
    if (!cleanup.ok && !failure)
      failure = new Error('CI container cleanup failed');
  }
  if (failure) throw failure;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  await runContainerSmoke().catch((error) => {
    console.error(sanitizeDiagnostic(error.message));
    process.exitCode = 1;
  });
}
