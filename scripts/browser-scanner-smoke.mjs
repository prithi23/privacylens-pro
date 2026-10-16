import { spawn } from 'node:child_process';
import { mkdtemp, readFile, mkdir, writeFile, rm } from 'node:fs/promises';
import { resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createFixtureServer } from './fixture-server.mjs';

// Real Chromium DOM + Resource Timing + isolated world. No injected Chrome API mocks.
// This does not automate the extension toolbar/activeTab grant; test those manually.
const chromePath =
  process.env.CHROME_PATH ??
  'C:/Program Files/Google/Chrome/Application/chrome.exe';
if (!existsSync(chromePath))
  throw new Error(
    'Set CHROME_PATH to an installed Chrome/Chromium executable.',
  );
const artifactRoot = fileURLToPath(
  new URL('../.browser-smoke/', import.meta.url),
);
await mkdir(artifactRoot, { recursive: true });
const profile = await mkdtemp(`${artifactRoot}/profile-`);
const server = createFixtureServer();
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port;
const fixtureUrl = `http://127.0.0.1:${port}/`;
const chrome = spawn(
  chromePath,
  [
    '--headless=new',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-networking',
    '--disable-component-update',
    '--disable-sync',
    '--remote-debugging-port=0',
    `--user-data-dir=${profile}`,
    'about:blank',
  ],
  { stdio: 'ignore', windowsHide: true },
);
let socket;
const pending = new Map();
let sequence = 0;
try {
  let debuggerPort;
  for (let attempt = 0; attempt < 80; attempt++) {
    try {
      debuggerPort = Number(
        (await readFile(`${profile}/DevToolsActivePort`, 'utf8')).split(
          '\n',
        )[0],
      );
      break;
    } catch {
      await delay(100);
    }
  }
  assert.ok(debuggerPort, 'Chrome did not expose its debugging endpoint.');
  const targets = await (
    await fetch(`http://127.0.0.1:${debuggerPort}/json/list`)
  ).json();
  const target = targets.find((item) => item.type === 'page');
  assert.ok(target, 'Chrome did not create a test page.');
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    const request = pending.get(message.id);
    if (request) {
      clearTimeout(request.timer);
      pending.delete(message.id);
      if (message.error) request.reject(new Error(message.error.message));
      else request.resolve(message.result);
    }
  });
  function cdp(method, params = {}) {
    const id = ++sequence;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`CDP timeout: ${method}`));
      }, 10000);
      pending.set(id, { resolve, reject, timer });
      socket.send(JSON.stringify({ id, method, params }));
    });
  }
  await cdp('Page.enable');
  await cdp('Page.navigate', { url: fixtureUrl });
  let loaded = false;
  for (let attempt = 0; attempt < 50; attempt++) {
    const state = await cdp('Runtime.evaluate', {
      expression:
        'document.readyState === "complete" && document.querySelectorAll("#references [src]").length === 7',
      returnByValue: true,
    });
    if (state.result.value) {
      loaded = true;
      break;
    }
    await delay(100);
  }
  assert.ok(loaded, 'Fixture did not finish loading.');
  const { frameTree } = await cdp('Page.getFrameTree');
  const { executionContextId } = await cdp('Page.createIsolatedWorld', {
    frameId: frameTree.frame.id,
    worldName: 'privacylens-smoke',
  });
  const collectorBundle = await build({
    entryPoints: [
      fileURLToPath(
        new URL('../apps/extension/src/content/collect.ts', import.meta.url),
      ),
    ],
    bundle: true,
    write: false,
    format: 'iife',
    globalName: 'PrivacyLensCollector',
    target: 'chrome120',
  });
  const collected = await cdp('Runtime.evaluate', {
    contextId: executionContextId,
    expression: `${collectorBundle.outputFiles[0].text}\nPrivacyLensCollector.collectPageResources()`,
    returnByValue: true,
  });
  assert.ok(
    !collected.exceptionDetails,
    'Collector threw inside the real isolated world.',
  );
  const observation = collected.result.value;
  assert.equal(observation.hostname, '127.0.0.1');
  assert.equal(observation.protocol, 'http:');
  assert.equal(observation.domStatus, 'available');
  assert.equal(observation.timingStatus, 'available');
  assert.ok(
    observation.resources.some(
      (item) => item.source === 'timing' && item.hostname === '127.0.0.1',
    ),
    'Real first-party timing entries missing',
  );
  assert.ok(
    !JSON.stringify(observation).includes('fixture_marker'),
    'A URL query escaped sanitization',
  );
  const engineBundle = await build({
    entryPoints: [
      fileURLToPath(
        new URL('../apps/extension/src/analysis/engine.ts', import.meta.url),
      ),
    ],
    bundle: true,
    write: false,
    format: 'iife',
    globalName: 'PrivacyLensEngine',
    target: 'chrome120',
  });
  const analyzed = await cdp('Runtime.evaluate', {
    contextId: executionContextId,
    expression: `${engineBundle.outputFiles[0].text}\nPrivacyLensEngine.analyzePage(${JSON.stringify(observation)})`,
    returnByValue: true,
  });
  assert.ok(!analyzed.exceptionDetails, 'Engine threw inside the browser.');
  const result = analyzed.result.value;
  assert.deepEqual(result.trackers.map((item) => item.id).sort(), [
    'doubleclick',
    'google-analytics',
    'hotjar',
    'meta',
  ]);
  assert.equal(result.thirdPartyDomains.length, 6);
  assert.equal(result.score, 24);
  assert.equal(result.coverage, 'snapshot');
  const expectedProviders = new Set([
    'doubleclick',
    'google-analytics',
    'hotjar',
    'meta',
  ]);
  const predicted = new Set(result.trackers.map((item) => item.id));
  const tp = [...predicted].filter((id) => expectedProviders.has(id)).length;
  const fp = [...predicted].filter((id) => !expectedProviders.has(id)).length;
  const fn = [...expectedProviders].filter((id) => !predicted.has(id)).length;
  const evaluation = {
    tp,
    fp,
    fn,
    precision: tp / (tp + fp),
    recall: tp / (tp + fn),
    scope:
      'single controlled fixture; provider-reference matching only, not field tracking accuracy',
  };
  await writeFile(
    `${artifactRoot}/result.json`,
    JSON.stringify(
      {
        test: 'real-chrome-isolated-world-fixture',
        score: result.score,
        providers: result.trackers.map((item) => item.id),
        thirdPartyDomains: result.thirdPartyDomains,
        domCount: result.domCount,
        timingCount: result.timingCount,
        evaluation,
        timestamp: new Date().toISOString(),
      },
      null,
      2,
    ),
  );
  console.info(
    `Real Chrome isolated-world scan passed: ${result.trackers.length} providers, ${result.thirdPartyDomains.length} third-party domains, score ${result.score}; ${result.domCount} DOM and ${result.timingCount} timing observations. Toolbar permissions and popup interactions still require manual testing.`,
  );
  await cdp('Browser.close');
} finally {
  for (const request of pending.values()) {
    clearTimeout(request.timer);
    request.reject(new Error('Browser test closed'));
  }
  socket?.close();
  chrome.kill();
  await new Promise((resolve) => server.close(resolve));
  if (chrome.exitCode === null)
    await new Promise((done) => {
      const timer = setTimeout(done, 2000);
      chrome.once('exit', () => {
        clearTimeout(timer);
        done();
      });
    });
  const cleanupTarget = resolve(profile);
  if (
    dirname(cleanupTarget) !== resolve(artifactRoot) ||
    !basename(cleanupTarget).startsWith('profile-')
  ) {
    console.error(
      'Unsafe generated scanner-profile cleanup target; deletion skipped.',
    );
    process.exitCode = 1;
  } else
    await rm(cleanupTarget, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 200,
    }).catch(() =>
      console.warn(
        'Generated scanner profile is locked; remove it from .browser-smoke after Chrome exits.',
      ),
    );
}
