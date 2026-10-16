import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import {
  waitForHttp,
  validateApi,
  validateFrontend,
  sanitizeDiagnostic,
  runContainerSmoke,
} from './container-smoke.mjs';

const frontend = {
  status: 200,
  contentType: 'text/html; charset=utf-8',
  body: '<!doctype html><title>PrivacyLens Pro</title><div id="root"></div><script type="module" crossorigin src="/assets/index-fixture.js"></script>',
};
const ready = {
  status: 200,
  body: JSON.stringify({ status: 'ready', database: 'connected' }),
};
const networkError = (code) =>
  Object.assign(new TypeError('fetch failed'), { cause: { code } });
const options = (overrides) => ({
  label: 'Frontend',
  url: 'http://127.0.0.1:14083/',
  validate: validateFrontend,
  isRunning: () => true,
  sleep: async () => {},
  report: () => {},
  maxAttempts: 3,
  ...overrides,
});

test('retries refusals, resets, closed sockets and HTTP 503, then verifies content', async () => {
  const failures = ['ECONNREFUSED', 'ECONNRESET', 'UND_ERR_SOCKET'];
  let calls = 0,
    sleeps = 0;
  await waitForHttp(
    options({
      maxAttempts: 5,
      request: async () => {
        calls++;
        if (failures.length) throw networkError(failures.shift());
        return calls === 4 ? { status: 503 } : frontend;
      },
      sleep: async () => {
        sleeps++;
      },
    }),
  );
  assert.equal(calls, 5);
  assert.equal(sleeps, 4);
});

test('persistent connection resets exhaust the bounded attempt limit and fail', async () => {
  let calls = 0;
  await assert.rejects(
    waitForHttp(
      options({
        request: async () => {
          calls++;
          throw networkError('ECONNRESET');
        },
      }),
    ),
    /readiness limit reached \(ECONNRESET\)/,
  );
  assert.equal(calls, 3);
});

test('deadline limits attempts and caps each request timeout to the remaining budget', async () => {
  let clock = 0;
  const timeouts = [];
  await assert.rejects(
    waitForHttp(
      options({
        deadlineMs: 15,
        delayMs: 10,
        now: () => clock,
        request: async (_url, timeout) => {
          timeouts.push(timeout);
          throw networkError('ECONNREFUSED');
        },
        sleep: async (ms) => {
          clock += ms;
        },
      }),
    ),
    /readiness limit reached/,
  );
  assert.deepEqual(timeouts, [15, 5]);
  assert.equal(clock, 15);
});

test('exited containers fail immediately instead of hiding an exit behind retries', async () => {
  let requests = 0;
  await assert.rejects(
    waitForHttp(
      options({
        isRunning: () => false,
        request: async () => {
          requests++;
          return frontend;
        },
      }),
    ),
    /container is not running/,
  );
  assert.equal(requests, 0);
});

test('a container exit immediately after HTTP 200 still fails', async () => {
  let checks = 0;
  await assert.rejects(
    waitForHttp(
      options({
        isRunning: () => ++checks === 1,
        request: async () => frontend,
      }),
    ),
    /container exited after response/,
  );
});

test('redirects and permanent HTTP failures are rejected without retries', async () => {
  for (const status of [301, 404, 500]) {
    let calls = 0;
    await assert.rejects(
      waitForHttp(
        options({
          request: async () => {
            calls++;
            return { status };
          },
        }),
      ),
      /unexpected HTTP status/,
    );
    assert.equal(calls, 1);
  }
});

test('HTTP 200 alone cannot pass a wrong frontend, source HTML or non-HTML response', async () => {
  for (const response of [
    { ...frontend, body: '<title>Other app</title>' },
    {
      ...frontend,
      body: frontend.body.replace('/assets/index-fixture.js', '/src/main.tsx'),
    },
    { ...frontend, contentType: 'application/json' },
  ]) {
    let calls = 0;
    await assert.rejects(
      waitForHttp(
        options({
          request: async () => {
            calls++;
            return response;
          },
        }),
      ),
      /not the built PrivacyLens dashboard/,
    );
    assert.equal(calls, 1);
  }
});

test('API readiness must explicitly report a connected database', () => {
  assert.doesNotThrow(() => validateApi(ready));
  assert.throws(
    () =>
      validateApi({
        body: JSON.stringify({ status: 'ready', database: 'disconnected' }),
      }),
    /database readiness/,
  );
  assert.throws(
    () => validateApi({ body: '<html>Invalid JSON</html>' }),
    /database readiness/,
  );
});

test('non-loopback requests and unexpected network errors fail without retries', async () => {
  await assert.rejects(
    waitForHttp(options({ url: 'https://example.com/' })),
    /loopback HTTP/,
  );
  await assert.rejects(
    waitForHttp(options({ url: 'http://fixture@127.0.0.1/' })),
    /loopback HTTP/,
  );
  let calls = 0;
  await assert.rejects(
    waitForHttp(
      options({
        request: async () => {
          calls++;
          throw networkError('ENOTFOUND');
        },
      }),
    ),
    /nonretryable HTTP request failure/,
  );
  assert.equal(calls, 1);
});

test('real loopback HTTP socket resets recover and require actual frontend content', async (t) => {
  let attempts = 0;
  const server = createServer((req, res) => {
    if (++attempts <= 2) {
      req.socket.destroy();
      return;
    }
    res.writeHead(200, { 'Content-Type': frontend.contentType });
    res.end(frontend.body);
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => {
    server.closeAllConnections();
    server.close();
  });
  await waitForHttp(
    options({ url: `http://127.0.0.1:${server.address().port}/`, delayMs: 1 }),
  );
  assert.equal(attempts, 3);
});

test('real stalled HTTP requests time out and fail within the attempt limit', async (t) => {
  const server = createServer(() => {});
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => {
    server.closeAllConnections();
    server.close();
  });
  await assert.rejects(
    waitForHttp(
      options({
        url: `http://127.0.0.1:${server.address().port}/`,
        requestTimeoutMs: 30,
        maxAttempts: 2,
        delayMs: 1,
      }),
    ),
    /readiness limit reached \(request timeout\)/,
  );
});

test('diagnostics redact configured secrets, credential URLs, auth headers and private content', () => {
  const value = ['fixture', 'sensitive', 'value!'].join('-');
  const connection = [
    'postgresql:/',
    '/fixture:',
    encodeURIComponent(value),
    '@db.example/db',
  ].join('');
  const env = { DATABASE_URL: connection, ACCESS_TOKEN: value };
  for (const text of [
    connection,
    value,
    encodeURIComponent(value),
    `Authorization: Bearer ${value}`,
    ['pl', 'd_', 'x'.repeat(43)].join(''),
  ]) {
    const result = sanitizeDiagnostic(text, env);
    assert.notEqual(result, text);
    assert.ok(
      !result.includes(value) && !result.includes(encodeURIComponent(value)),
    );
    assert.ok(!result.includes(connection));
  }
  assert.match(
    sanitizeDiagnostic(
      ['C:', 'Users', 'private-person', 'file'].join('\\'),
      {},
    ),
    /withheld/,
  );
  assert.match(
    sanitizeDiagnostic(['private-person', 'mail.example'].join('@'), {}),
    /withheld/,
  );
  assert.ok(
    !sanitizeDiagnostic('::error::untrusted\u001b[31m', {}).startsWith('::'),
  );
  assert.equal(
    sanitizeDiagnostic('listen tcp :8080: bind: address already in use', {}),
    'listen tcp :8080: bind: address already in use',
  );
});

function fakeDocker({ exited = false, cleanupFailure = false } = {}) {
  const calls = [];
  const docker = (args) => {
    calls.push(args);
    if (args[0] === 'inspect')
      return {
        ok: true,
        stdout: JSON.stringify({
          Status: exited ? 'exited' : 'running',
          Running: !exited,
          ExitCode: exited ? 1 : 0,
          OOMKilled: false,
        }),
      };
    if (args[0] === 'logs')
      return {
        ok: true,
        stdout: JSON.stringify({
          level: 'error',
          msg: 'listen tcp :8080: bind: address already in use',
          config: 'private-config-must-not-appear',
        }),
        stderr: '',
      };
    return {
      ok: !(cleanupFailure && args[0] === 'rm'),
      stdout: '',
      stderr: '',
    };
  };
  return { docker, calls };
}

test('runtime orchestration verifies both services, preserves loopback and cleans up', async () => {
  const { docker, calls } = fakeDocker();
  const labels = [];
  await runContainerSmoke({
    docker,
    report: () => {},
    wait: async (options) => {
      labels.push(options.label);
      assert.equal(await options.isRunning(), true);
      options.validate(options.label === 'API' ? ready : frontend);
    },
  });
  assert.deepEqual(labels, ['API', 'Frontend']);
  assert.ok(calls.some((args) => args.includes('127.0.0.1:14083:8080')));
  assert.ok(calls.some((args) => args.includes('PUBLIC_DOMAIN=:8080')));
  assert.deepEqual(calls.at(-1), [
    'rm',
    '-f',
    'privacylens-api-ci',
    'privacylens-web-ci',
  ]);
  assert.ok(!calls.some((args) => args[0] === 'logs'));
});

test('web failure emits allowlisted status and useful sanitized logs before cleanup', async () => {
  const { docker, calls } = fakeDocker({ exited: true });
  const output = [];
  await assert.rejects(
    runContainerSmoke({
      docker,
      report: (line) => output.push(line),
      wait: async (options) => {
        if (options.label === 'Frontend')
          throw new Error('Frontend failed fixture');
      },
    }),
    /Frontend failed fixture/,
  );
  assert.ok(output.some((line) => line.includes('"exitCode":1')));
  assert.ok(output.some((line) => line.includes('address already in use')));
  assert.ok(!output.join('\n').includes('private-config-must-not-appear'));
  assert.ok(
    calls
      .filter((args) => args[0] === 'inspect')
      .every((args) => args[2] === '{{json .State}}'),
  );
  assert.equal(calls.at(-1)[0], 'rm');
});

test('cleanup failures do not turn a successful smoke test into a pass', async () => {
  const { docker } = fakeDocker({ cleanupFailure: true });
  await assert.rejects(
    runContainerSmoke({ docker, report: () => {}, wait: async () => {} }),
    /cleanup failed/,
  );
});
