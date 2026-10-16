import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, writeFile, cp, rm } from 'node:fs/promises';
import { resolve, dirname, basename } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createServer } from 'vite';
import dotenv from 'dotenv';
import { getTestDatabaseUrl } from '../apps/api/src/config/test-database.ts';
import { createFixtureServer } from './fixture-server.mjs';
import { connectProtocol } from './chrome-protocol.mjs';
const extensionMode = process.argv.includes('--extension-sync');

const root = fileURLToPath(new URL('../', import.meta.url));
dotenv.config({ path: `${root}/.env`, quiet: true });
const testUrl = getTestDatabaseUrl();
const artifacts = `${root}/.browser-smoke`;
await mkdir(artifacts, { recursive: true });
await build({
  stdin: {
    contents:
      "export {createApp} from './apps/api/src/app.ts'; export {createDatabase} from './apps/api/src/repositories/database.ts';",
    resolveDir: root,
  },
  outfile: `${artifacts}/dashboard-api.mjs`,
  bundle: true,
  platform: 'node',
  format: 'esm',
  packages: 'external',
  plugins: [
    {
      name: 'shared-source',
      setup(builder) {
        builder.onResolve(
          {
            filter:
              /^@privacylens\/shared(?:\/(?:sync|trackers|methodology))?$/,
          },
          (args) => ({
            path: `${root}/packages/shared/src/${args.path.includes('/shared/') ? args.path.split('/').at(-1) : 'index'}.ts`,
          }),
        );
      },
    },
  ],
});
const { createApp, createDatabase } = await import(
  pathToFileURL(`${artifacts}/dashboard-api.mjs`).href
);
const db = createDatabase(testUrl);
const application = createDatabase(process.env.DATABASE_URL);
const email = `browser-${randomUUID()}@example.test`;
const password = 'browser-fixture-password-123!';
let server, vite, chrome, socket;
let fixture, browserProtocol, extensionProtocol;
let extensionPath;
let profile;
let appBaseline;
let preflightPassed = false;
let sequence = 0;
const pending = new Map();
const exceptions = [];
const checks = [];
const browserPerformance = {};
let report;
async function counts() {
  return Promise.all([
    application.user.count(),
    application.scan.count(),
    application.session.count(),
    application.finding.count(),
    application.device.count(),
    application.pairingCode.count(),
  ]);
}
try {
  // Resolve real identities before any test writes. Application connection is read-only.
  const identities = await Promise.all(
    [application, db].map(
      (client) =>
        client.$queryRaw`SELECT current_database() AS name, inet_server_addr()::text AS address, inet_server_port() AS port`,
    ),
  );
  const [appIdentity, testIdentity] = identities.map((rows) => rows[0]);
  assert.equal(
    testIdentity.name,
    decodeURIComponent(new URL(testUrl).pathname.slice(1)),
  );
  assert.equal(
    appIdentity.name,
    decodeURIComponent(new URL(process.env.DATABASE_URL).pathname.slice(1)),
  );
  assert.notEqual(appIdentity.name, testIdentity.name);
  preflightPassed = true;
  appBaseline = await counts();
  const origins = [];
  server = createApp({
    db,
    origins,
    databaseReady: async () => {
      await db.$queryRaw`SELECT 1`;
    },
  }).listen(0, '127.0.0.1');
  await new Promise((resolve) => server.on('listening', resolve));
  const api = `http://127.0.0.1:${server.address().port}`;
  if (extensionMode) {
    extensionPath = await mkdtemp(`${artifacts}/sync-extension-`);
    await cp(`${root}/apps/extension/dist`, extensionPath, { recursive: true });
    await build({
      entryPoints: [`${root}/apps/extension/src/background/index.ts`],
      outfile: `${extensionPath}/background.js`,
      bundle: true,
      format: 'esm',
      target: 'chrome120',
      define: {
        __PRIVACYLENS_SYNC_TARGET__: JSON.stringify({
          mode: 'development',
          origin: api,
          apiBase: `${api}/api/v1/extension`,
        }),
      },
    });
    fixture = createFixtureServer();
    await new Promise((resolve) => fixture.listen(0, '127.0.0.1', resolve));
  }
  vite = await createServer({
    configFile: `${root}/apps/web/vite.config.ts`,
    root: `${root}/apps/web`,
    logLevel: 'error',
    server: {
      host: '127.0.0.1',
      port: 0,
      strictPort: false,
      proxy: { '/api': api },
    },
  });
  await vite.listen();
  const origin = `http://127.0.0.1:${vite.httpServer.address().port}`;
  origins.push(origin);
  profile = await mkdtemp(`${artifacts}/dashboard-profile-`);
  chrome = spawn(
    process.env.CHROME_PATH ??
      'C:/Program Files/Google/Chrome/Application/chrome.exe',
    [
      '--headless=new',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-background-networking',
      '--disable-component-update',
      '--disable-sync',
      '--remote-debugging-port=0',
      ...(extensionMode
        ? [
            '--enable-unsafe-extension-debugging',
            '--host-resolver-rules=MAP scanner.example.test 127.0.0.1',
            '--no-proxy-server',
          ]
        : []),
      `--user-data-dir=${profile}`,
      'about:blank',
    ],
    { stdio: 'ignore', windowsHide: true },
  );
  chrome.on('error', () => {});
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
  assert.ok(
    debuggerPort,
    'Installed Chrome could not start. Set CHROME_PATH if needed.',
  );
  if (extensionMode) {
    const version = await (
      await fetch(`http://127.0.0.1:${debuggerPort}/json/version`)
    ).json();
    browserProtocol = await connectProtocol(version.webSocketDebuggerUrl);
    const protocol = await (
      await fetch(`http://127.0.0.1:${debuggerPort}/json/protocol`)
    ).json();
    const commands = protocol.domains.find(
      (domain) => domain.domain === 'Extensions',
    )?.commands;
    assert.ok(
      commands,
      'Installed Chrome lacks the Extensions automation domain.',
    );
    console.log(
      'Installed Chrome extension automation:',
      JSON.stringify(
        commands
          .filter((command) =>
            ['loadUnpacked', 'triggerAction'].includes(command.name),
          )
          .map(({ name, parameters }) => ({ name, parameters })),
      ),
    );
  }
  const target = (
    await (await fetch(`http://127.0.0.1:${debuggerPort}/json/list`)).json()
  ).find((item) => item.type === 'page');
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    if (message.method === 'Runtime.exceptionThrown')
      exceptions.push(message.params.exceptionDetails.text);
    const task = pending.get(message.id);
    if (task) {
      clearTimeout(task.timer);
      pending.delete(message.id);
      if (message.error) task.reject(new Error(message.error.message));
      else task.resolve(message.result);
    }
  });
  function cdp(method, params = {}) {
    const id = ++sequence;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`CDP timeout: ${method}`));
      }, 15000);
      pending.set(id, { resolve, reject, timer });
      socket.send(JSON.stringify({ id, method, params }));
    });
  }
  async function evaluate(expression) {
    const result = await cdp('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    assert.ok(
      !result.exceptionDetails,
      `Browser evaluation failed: ${result.exceptionDetails?.text}`,
    );
    return result.result.value;
  }
  async function wait(expression, label) {
    for (let attempt = 0; attempt < 100; attempt++) {
      if (await evaluate(expression)) return;
      await delay(100);
    }
    throw new Error(`Browser check timed out: ${label}`);
  }
  const hasText = (text) =>
    `document.body?.innerText.includes(${JSON.stringify(text)}) ?? false`;
  async function screenshot(name) {
    const captured = await cdp('Page.captureScreenshot', { format: 'png' });
    await writeFile(
      `${artifacts}/${name}.png`,
      Buffer.from(captured.data, 'base64'),
    );
  }
  async function click(text) {
    await wait(
      `!![...document.querySelectorAll('button')].find(el => el.textContent.trim() === ${JSON.stringify(text)} || el.getAttribute('aria-label') === ${JSON.stringify(text)})`,
      `button: ${text}`,
    );
    await evaluate(
      `(() => { const button = [...document.querySelectorAll('button')].find(el => el.textContent.trim() === ${JSON.stringify(text)} || el.getAttribute('aria-label') === ${JSON.stringify(text)}); button.click(); })()`,
    );
  }
  async function fill(name, value) {
    await evaluate(
      `(() => { const input = document.querySelector('[name="${name}"]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, ${JSON.stringify(value)}); input.dispatchEvent(new Event('input', {bubbles:true})); input.dispatchEvent(new Event('change', {bubbles:true})); })()`,
    );
  }
  async function go(page) {
    await evaluate(`location.hash = ${JSON.stringify(`/${page}`)}`);
  }
  async function apiRequest(path, method = 'GET', body) {
    return evaluate(
      `(async () => { const response = await fetch('/api/v1${path}', {method:${JSON.stringify(method)}, credentials:'include', ${body === undefined ? '' : `headers:{'Content-Type':'application/json'},body:JSON.stringify(${JSON.stringify(body)}),`} }); return {status:response.status, body:response.status===204?null:await response.json()}; })()`,
    );
  }
  await cdp('Page.enable');
  await cdp('Runtime.enable');
  await cdp('Emulation.setDeviceMetricsOverride', {
    width: 1440,
    height: 1000,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await cdp('Page.navigate', { url: `${origin}/#/history` });
  await wait(hasText('Welcome back'), 'protected route shows login');
  checks.push('protected route');
  await screenshot('dashboard-login');
  await click('New here? Create an account');
  await fill('email', email);
  await fill('password', password);
  await click('Show password');
  assert.equal(
    await evaluate(`document.querySelector('[name=password]').type`),
    'text',
  );
  await click('Hide password');
  await click('Create account');
  await wait(hasText('No matching scans'), 'registration and empty history');
  assert.equal((await db.user.findUnique({ where: { email } })).email, email);
  checks.push('registration persisted in test PostgreSQL');
  assert.equal(
    await evaluate('document.cookie.includes("privacylens_session")'),
    false,
  );
  assert.equal(await evaluate('localStorage.length'), 0);
  checks.push('HttpOnly cookie and no localStorage secrets');
  await go('overview');
  await wait(
    hasText('Your privacy story starts with a scan'),
    'honest empty overview',
  );
  checks.push('empty analytics');
  await cdp('Page.reload');
  await wait(hasText('Privacy overview'), 'refresh restores session');
  checks.push('session restoration');
  await go('settings');
  await wait(
    `!!document.querySelector('[name=retentionDays]')`,
    'preferences load',
  );
  await evaluate(`document.querySelector('[name=syncEnabled]').click()`);
  await fill('retentionDays', '45');
  await click('Save preferences');
  await wait(hasText('Preferences saved.'), 'preferences saved');
  assert.deepEqual((await apiRequest('/preferences')).body.preferences, {
    syncEnabled: true,
    retentionDays: 45,
  });
  await cdp('Page.reload');
  await wait(
    `document.querySelector('[name=retentionDays]')?.value === '45' && document.querySelector('[name=syncEnabled]')?.checked`,
    'persisted preferences after reload',
  );
  checks.push('settings persistence and explicit consent');
  // Explicit test fixtures submitted via real HTTP, never production seed/dashboard defaults.
  for (let index = 0; index < 12; index++) {
    const result = await apiRequest('/scans', 'POST', {
      hostname: index === 11 ? 'other.example.net' : 'example.com',
      privacyScore: 90 - index,
      concernLevel: 'low',
      httpsStatus: index === 11 ? 'http' : 'https',
      thirdPartyDomainCount: index + 1,
      trackerMatchCount: 1,
      scannedAt: new Date(Date.now() - index * 3600000).toISOString(),
      findings: [
        {
          category: 'analytics',
          severity: 'low',
          description: 'Browser integration fixture',
          evidenceHostname: 'google-analytics.com',
        },
      ],
    });
    assert.equal(result.status, 201);
  }
  await go('overview');
  await wait(hasText('Frequently observed providers'), 'nonempty analytics');
  assert.equal(
    (await apiRequest('/analytics/overview')).body.metrics.totalScans,
    12,
  );
  assert.equal(await db.scan.count({ where: { user: { email } } }), 12);
  await wait(hasText('Google Analytics'), 'provider aggregates');
  await screenshot('dashboard-overview-test-fixtures');
  checks.push('real scan CRUD and overview analytics');
  await go('history');
  await wait(hasText('Page 1 of 2'), 'history first page');
  await click('Next');
  await wait(hasText('Page 2 of 2'), 'pagination');
  await fill('hostname', 'other.example.net');
  await click('Apply filters');
  await wait(hasText('1 records'), 'exact hostname search');
  assert.equal(
    await evaluate('document.querySelectorAll("tbody tr").length'),
    1,
  );
  checks.push('history search and pagination');
  await evaluate(`document.querySelector('tbody button').click()`);
  await wait(hasText('Saved evidence (1)'), 'report findings');
  checks.push('detail evidence and score limitations');
  await go('comparison');
  await wait(
    `document.querySelectorAll('fieldset input').length === 2`,
    'saved comparison choices',
  );
  await evaluate(
    `document.querySelectorAll('fieldset input').forEach(input => input.click())`,
  );
  await click('Compare websites');
  await wait(hasText('Recorded score history'), 'comparison results');
  assert.ok(
    await evaluate(
      `document.querySelectorAll('.comparison-grid .panel').length === 2 && !!document.querySelector('.recharts-surface')`,
    ),
  );
  checks.push('actual website comparison and charts');
  await screenshot('dashboard-comparison-test-fixtures');
  await go('intelligence');
  await wait(hasText('Google Analytics'), 'database reference providers');
  await fill('q', 'hotjar.io');
  await click('Search reference');
  await wait(hasText('Hotjar'), 'domain search');
  await wait(
    `!document.body.innerText.includes('Google Analytics')`,
    'filtered reference',
  );
  checks.push('PostgreSQL tracker intelligence search');
  const desktop = await cdp('Page.captureScreenshot', { format: 'png' });
  await writeFile(
    `${artifacts}/dashboard-desktop.png`,
    Buffer.from(desktop.data, 'base64'),
  );
  await cdp('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
  });
  assert.ok(
    await evaluate('document.documentElement.scrollWidth <= window.innerWidth'),
    'Mobile page overflows viewport',
  );
  const mobile = await cdp('Page.captureScreenshot', { format: 'png' });
  await writeFile(
    `${artifacts}/dashboard-mobile.png`,
    Buffer.from(mobile.data, 'base64'),
  );
  checks.push('desktop/mobile render screenshots and overflow check');
  const researchStarted = await evaluate('performance.now()');
  await go('evaluation');
  await wait(hasText('Labeled case evidence'), 'real measured Evaluation page');
  browserPerformance.evaluationRouteObservedMs =
    (await evaluate('performance.now()')) - researchStarted;
  assert.equal(
    await evaluate('document.querySelectorAll("tbody tr").length'),
    29,
  );
  await evaluate(
    `(() => {const select=document.querySelectorAll('select')[1];select.value='FN';select.dispatchEvent(new Event('change',{bubbles:true}));})()`,
  );
  await wait(
    `document.querySelectorAll('tbody tr').length === 4`,
    'evaluation outcome filter',
  );
  await screenshot('evaluation-lab-fixture');
  checks.push(
    'versioned measured Evaluation page, charts, case table and false-negative filter',
  );
  await go('history');
  await wait(hasText('Page 1 of 2'), 'history reset');
  await evaluate(`document.querySelector('tbody button').click()`);
  await wait(hasText('Delete this scan'), 'detail deletion');
  await click('Delete scan');
  await click('Confirm delete scan');
  await wait(hasText('11 records'), 'single deletion');
  await go('settings');
  await wait(hasText('Delete all saved scans'), 'settings deletion');
  await click('Delete all scans');
  await click('Confirm delete all scans');
  await wait(
    hasText('11 scans and their findings permanently deleted.'),
    'bulk deletion',
  );
  assert.equal(await db.scan.count({ where: { user: { email } } }), 0);
  checks.push('confirmed single and bulk deletion');
  if (extensionMode) {
    await wait(
      `!!document.querySelector('input[name=retentionDays]')`,
      'preferences before pairing',
    );
    await evaluate(
      `document.querySelector('input[name=retentionDays]').scrollIntoView()`,
    );
    await click('Generate pairing code');
    await wait(
      `!!document.querySelector('input[aria-label="One-time pairing code"]')`,
      'dashboard pairing code',
    );
    const pairingCode = await evaluate(
      `document.querySelector('input[aria-label="One-time pairing code"]').value`,
    );
    const loaded = await browserProtocol.send('Extensions.loadUnpacked', {
      path: extensionPath,
      enableInIncognito: false,
    });
    const extensionId = loaded.id;
    assert.ok(
      extensionId,
      'Chrome did not load the actual unpacked extension.',
    );
    const fixtureUrl = `http://scanner.example.test:${fixture.address().port}/`;
    const fixtureTarget = await browserProtocol.send('Target.createTarget', {
      url: fixtureUrl,
    });
    await browserProtocol.send('Target.activateTarget', {
      targetId: fixtureTarget.targetId,
    });
    let fixtureTabId;
    for (let attempt = 0; attempt < 100; attempt++) {
      const tabs = await browserProtocol.send('Target.getTargets', {
        filter: [{ type: 'tab', exclude: false }],
      });
      fixtureTabId = tabs.targetInfos.find(
        (item) => item.url === fixtureUrl,
      )?.targetId;
      if (fixtureTabId) break;
      await delay(100);
    }
    assert.ok(fixtureTabId, 'Chrome did not expose the fixture tab target.');
    const fixturePage = (
      await (await fetch(`http://127.0.0.1:${debuggerPort}/json/list`)).json()
    ).find((item) => item.id === fixtureTarget.targetId);
    const fixtureProtocol = await connectProtocol(
      fixturePage.webSocketDebuggerUrl,
    );
    try {
      let ready = false;
      for (let attempt = 0; attempt < 100; attempt++) {
        const state = await fixtureProtocol.send('Runtime.evaluate', {
          expression:
            'document.readyState === "complete" && document.querySelectorAll("#references [src]").length === 7',
          returnByValue: true,
        });
        if (state.result.value) {
          ready = true;
          break;
        }
        await delay(100);
      }
      assert.ok(ready, 'Real scanner fixture did not finish loading.');
    } finally {
      fixtureProtocol.close();
    }
    await browserProtocol.send('Extensions.triggerAction', {
      id: extensionId,
      targetId: fixtureTabId,
    });
    let popupTarget;
    for (let attempt = 0; attempt < 100; attempt++) {
      popupTarget = (
        await (await fetch(`http://127.0.0.1:${debuggerPort}/json/list`)).json()
      ).find(
        (item) => item.url === `chrome-extension://${extensionId}/index.html`,
      );
      if (popupTarget) break;
      await delay(100);
    }
    assert.ok(popupTarget, 'Chrome did not expose the actual extension popup.');
    extensionProtocol = await connectProtocol(popupTarget.webSocketDebuggerUrl);
    async function extEval(expression) {
      const result = await extensionProtocol.send('Runtime.evaluate', {
        expression,
        awaitPromise: true,
        returnByValue: true,
        userGesture: true,
      });
      assert.ok(
        !result.exceptionDetails,
        'Native extension evaluation failed.',
      );
      return result.result.value;
    }
    async function extWait(expression, label) {
      for (let attempt = 0; attempt < 140; attempt++) {
        if (await extEval(expression)) return;
        await delay(100);
      }
      const diagnostics = await extEval(
        `(async () => ({text: document.body?.innerText.slice(0,1600), activeTabs: await chrome.tabs.query({active:true,currentWindow:true})}))()`,
      );
      console.log(
        'Isolated extension test diagnostics:',
        JSON.stringify(diagnostics),
      );
      throw new Error(`Native extension check timed out: ${label}`);
    }
    async function extClick(label) {
      await extWait(
        `!![...document.querySelectorAll('button')].find(el => el.textContent.trim() === ${JSON.stringify(label)} && !el.disabled)`,
        `button ${label}`,
      );
      await extEval(
        `[...document.querySelectorAll('button')].find(el => el.textContent.trim() === ${JSON.stringify(label)}).click()`,
      );
    }
    await extWait(
      `!!document.querySelector('input[name=code]')`,
      'pairing form',
    );
    await extEval(
      `(() => { const el = document.querySelector('input[name=code]'); el.value = ${JSON.stringify(pairingCode)}; el.dispatchEvent(new Event('input', {bubbles:true})); })()`,
    );
    await extClick('Pair extension');
    await extWait(
      `document.body.innerText.includes('Paired. Each scan')`,
      'real worker pairing',
    );
    assert.equal(
      await db.device.count({ where: { user: { email }, revokedAt: null } }),
      1,
    );
    // Exercise the real worker's credential-origin boundary without returning a secret over CDP.
    const originCheck = await extEval(`(async () => {
      const {connection} = await chrome.storage.local.get('connection');
      const correctOrigin = connection.apiOrigin === ${JSON.stringify(api)};
      try {
        await chrome.storage.local.set({connection: {...connection, apiOrigin: 'https://different.example.com'}});
        const response = await chrome.runtime.sendMessage({action:'status'});
        return {correctOrigin, blocked: response.ok === false && response.error.includes('different API')};
      } finally { await chrome.storage.local.set({connection}); }
    })()`);
    assert.deepEqual(originCheck, { correctOrigin: true, blocked: true });
    checks.push(
      'native worker rejects credentials bound to a different API origin',
    );
    await extClick('Check status');
    await extWait(
      `document.body.innerText.includes('Connection verified with the API.')`,
      'device authorization status',
    );
    console.log(
      'Native popup tab context:',
      await extEval(
        `(async () => ({ active: (await chrome.tabs.query({active:true,currentWindow:true})).map(tab => ({id:tab.id,url:tab.url})), text:document.body.innerText.slice(0,650) }))()`,
      ),
    );
    await extEval(`performance.mark('native-scan-start')`);
    await extClick('Scan Website');
    await extWait(
      `document.body.innerText.includes('Scan complete. 4 reference-provider matches; 6 third-party site domains.')`,
      'actual activeTab scanner',
    );
    browserPerformance.nativeScanObservedMs = await extEval(
      `performance.now()-performance.getEntriesByName('native-scan-start')[0].startTime`,
    );
    assert.equal(
      await db.scan.count({ where: { user: { email } } }),
      0,
      'Scanning must not upload',
    );
    await extClick('Sync This Scan');
    assert.equal(
      await extEval(
        `[...document.querySelectorAll('button')].find(el => el.textContent.trim() === 'Confirm upload').disabled`,
      ),
      true,
    );
    await extClick('Cancel');
    assert.equal(
      await db.scan.count({ where: { user: { email } } }),
      0,
      'Cancel must not upload',
    );
    await extClick('Sync This Scan');
    await extEval(`document.querySelector('.sync-consent input').click()`);
    await extClick('Confirm upload');
    await extWait(
      `document.body.innerText.includes('Scan synchronized.')`,
      'real worker upload',
    );
    const synced = await db.scan.findFirstOrThrow({
      where: { user: { email } },
      include: { findings: true },
    });
    assert.equal(synced.hostname, 'scanner.example.test');
    assert.equal(synced.privacyScore, 24);
    assert.equal(synced.trackerMatchCount, 4);
    assert.equal(synced.thirdPartyDomainCount, 6);
    assert.ok(synced.deviceId);
    assert.ok(synced.findings.length >= 4);
    assert.equal(synced.analysis.scoringVersion, 'exposure-v2');
    assert.equal(
      synced.analysis.datasetVersion,
      'privacylens-reference-2026.10.16',
    );
    await extEval(
      `document.querySelector('.sync-panel').scrollIntoView({block:'start'})`,
    );
    const syncScreenshot = await extensionProtocol.send(
      'Page.captureScreenshot',
      { format: 'png' },
    );
    await writeFile(
      `${artifacts}/extension-synchronized-fixture.png`,
      Buffer.from(syncScreenshot.data, 'base64'),
    );
    await extensionProtocol.send('Page.close').catch(() => {});
    extensionProtocol.close();
    await cdp('Target.activateTarget', { targetId: target.id });
    await go('overview');
    await wait(
      hasText('scanner.example.test'),
      'React overview displays actual extension upload',
    );
    assert.equal(
      (await apiRequest('/analytics/overview')).body.metrics.totalScans,
      1,
    );
    await go('history');
    await wait(
      hasText('scanner.example.test'),
      'React history displays actual extension upload',
    );
    assert.equal(
      await evaluate(`document.querySelector('tbody tr td').textContent`),
      'scanner.example.test',
    );
    // A separate explicit HTTP fixture provides a second saved site for comparison.
    assert.equal(
      (
        await apiRequest('/scans', 'POST', {
          hostname: 'comparison.example.net',
          privacyScore: 90,
          concernLevel: 'low',
          httpsStatus: 'https',
          thirdPartyDomainCount: 1,
          trackerMatchCount: 0,
          scannedAt: new Date().toISOString(),
          findings: [],
        })
      ).status,
      201,
    );
    await go('comparison');
    await wait(
      `document.querySelectorAll('fieldset input').length === 2`,
      'uploaded site in comparison choices',
    );
    await evaluate(
      `document.querySelectorAll('fieldset input').forEach(input => input.click())`,
    );
    await click('Compare websites');
    await wait(
      hasText('Recorded score history'),
      'comparison with actual extension upload',
    );
    assert.ok(
      await evaluate(
        `document.querySelector('.comparison-grid').innerText.includes('scanner.example.test') && document.querySelector('.comparison-grid').innerText.includes('24')`,
      ),
    );
    await go('settings');
    await wait(hasText('My Chrome extension'), 'dashboard connected extension');
    await click('Revoke extension');
    await click('Confirm revoke extension');
    await wait(
      hasText('Extension credential revoked.'),
      'dashboard revocation',
    );
    // UI activation may close Chrome's action popup. Reopen it to verify persisted credential revocation.
    await browserProtocol.send('Target.activateTarget', {
      targetId: fixtureTarget.targetId,
    });
    await browserProtocol.send('Extensions.triggerAction', {
      id: extensionId,
      targetId: fixtureTabId,
    });
    extensionProtocol.close();
    let reopened;
    for (let attempt = 0; attempt < 100; attempt++) {
      reopened = (
        await (await fetch(`http://127.0.0.1:${debuggerPort}/json/list`)).json()
      ).find(
        (item) => item.url === `chrome-extension://${extensionId}/index.html`,
      );
      if (reopened) break;
      await delay(100);
    }
    assert.ok(reopened, 'Extension popup could not be reopened.');
    extensionProtocol = await connectProtocol(reopened.webSocketDebuggerUrl);
    await extClick('Check status');
    await extWait(
      `document.body.innerText.includes('revoked') && !!document.querySelector('input[name=code]')`,
      'native extension rejects revoked credential',
    );
    checks.push(
      'native extension action, activeTab scan, code pairing, explicit upload/cancel, PostgreSQL save, React overview/history/comparison and revocation',
    );
    await cdp('Target.activateTarget', { targetId: target.id });
  }
  const actor = await db.user.findUniqueOrThrow({ where: { email } });
  await db.session.deleteMany({ where: { userId: actor.id } });
  await go('overview');
  await wait(
    hasText('Your session expired.'),
    'expired session clears protected UI',
  );
  checks.push('session expiration');
  await fill('email', email);
  await fill('password', 'wrong-fixture-password-123!');
  await click('Sign in');
  await wait(
    hasText('Email or password is incorrect.'),
    'friendly invalid login',
  );
  await fill('password', password);
  await click('Sign in');
  await wait(hasText('Privacy overview'), 'real login');
  await click('Log out');
  await wait(hasText('You have been signed out.'), 'logout');
  assert.equal(await db.session.count({ where: { userId: actor.id } }), 0);
  checks.push('invalid login, valid login, logout and DB session revocation');
  await new Promise((resolve) => server.close(resolve));
  server = undefined;
  await cdp('Page.reload');
  await wait(hasText('Connection unavailable'), 'backend unavailable state');
  checks.push('backend unavailable retry state');
  assert.deepEqual(exceptions, [], 'Uncaught browser exceptions');
  report = {
    status: 'passed',
    performance: {
      ...browserPerformance,
      note: 'Single observed browser samples, including CDP/polling overhead; not pure rendering or collector timings and not a before/after claim.',
    },
    flow: extensionMode ? 'extension-sync' : 'dashboard',
    database: testIdentity.name,
    checks,
    uncaughtBrowserExceptions: exceptions.length,
    screenshots: [
      '.browser-smoke/dashboard-desktop.png',
      '.browser-smoke/dashboard-mobile.png',
      ...(extensionMode
        ? ['.browser-smoke/extension-synchronized-fixture.png']
        : []),
    ],
  };
  await cdp('Browser.close').catch(() => {});
} finally {
  socket?.close();
  extensionProtocol?.close();
  browserProtocol?.close();
  chrome?.kill();
  for (const task of pending.values()) {
    clearTimeout(task.timer);
    task.reject(new Error('Browser closed'));
  }
  if (vite) await vite.close();
  if (server) await new Promise((resolve) => server.close(resolve));
  if (fixture) await new Promise((resolve) => fixture.close(resolve));
  try {
    if (preflightPassed) await db.user.deleteMany({ where: { email } });
    if (appBaseline)
      assert.deepEqual(
        await counts(),
        appBaseline,
        'Application database counts changed',
      );
  } finally {
    await Promise.all([db.$disconnect(), application.$disconnect()]);
    // Delete only directories created by this run, after verifying exact artifact containment.
    if (chrome && chrome.exitCode === null)
      await new Promise((done) => {
        const timer = setTimeout(done, 2000);
        chrome.once('exit', () => {
          clearTimeout(timer);
          done();
        });
      });
    for (const directory of [profile, extensionPath]) {
      if (!directory) continue;
      const targetPath = resolve(directory);
      if (
        dirname(targetPath) !== resolve(artifacts) ||
        !/^(dashboard-profile|sync-extension)-/.test(basename(targetPath))
      ) {
        console.error(
          'Unsafe generated-artifact cleanup target; deletion skipped.',
        );
        process.exitCode = 1;
      } else
        await rm(targetPath, {
          recursive: true,
          force: true,
          maxRetries: 5,
          retryDelay: 200,
        }).catch(() =>
          console.warn(
            'A generated Chrome test directory is locked; remove it from .browser-smoke after Chrome exits.',
          ),
        );
    }
  }
}
if (report) {
  report.applicationDatabaseCountsUnchanged = true;
  await writeFile(
    `${artifacts}/${extensionMode ? 'sync-report' : 'dashboard-report'}.json`,
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
  if (extensionMode)
    await writeFile(
      `${root}/docs/research/browser-performance.json`,
      JSON.stringify(
        { measuredAt: new Date().toISOString(), ...report.performance },
        null,
        2,
      ) + '\n',
    );
}
