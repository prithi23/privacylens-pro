import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';

// Exercise the actual production bundle in a separate Node process, not an in-memory app.
const cwd = fileURLToPath(new URL('../apps/api/', import.meta.url));
const env = {
  ...process.env,
  PORT: '14081',
  NODE_ENV: 'test',
  WEB_ORIGINS: 'http://localhost:5173',
  DATABASE_URL: 'postgresql://unavailable:unavailable@127.0.0.1:1/unavailable',
};
const child = spawn(process.execPath, ['dist/server.js'], {
  cwd,
  env,
  stdio: ['ignore', 'pipe', 'pipe'],
  windowsHide: true,
});
let output = '';
child.stdout.on('data', (chunk) => {
  output += chunk;
});
child.stderr.on('data', (chunk) => {
  output += chunk;
});
const base = 'http://127.0.0.1:14081/api/v1';
try {
  let ready = false;
  for (let attempt = 0; attempt < 40; attempt++) {
    if (child.exitCode !== null)
      throw new Error(`API exited before startup: ${output}`);
    try {
      const health = await fetch(`${base}/health`);
      if (health.ok) {
        ready = true;
        break;
      }
    } catch {
      /* wait for the owned server */
    }
    await delay(150);
  }
  assert.ok(ready, `API startup timed out: ${output}`);
  assert.equal((await (await fetch(`${base}/health`)).json()).phase, 3);
  const database = await fetch(`${base}/ready`);
  assert.equal(database.status, 503);
  const providers = await (
    await fetch(`${base}/trackers?q=doubleclick.net`)
  ).json();
  assert.equal(providers.items[0].id, 'doubleclick');
  assert.equal(
    (
      await fetch(`${base}/health`, {
        headers: { Origin: 'https://untrusted.example' },
      })
    ).status,
    403,
  );
  console.info(
    'Production API bundle started; real HTTP health, offline readiness, tracker search, and CORS checks passed.',
  );
} finally {
  child.kill();
}
