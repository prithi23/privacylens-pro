import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
const files = {
  '/': ['index.html', 'text/html'],
  '/fixture.js': ['fixture.js', 'text/javascript'],
  '/logo.svg': ['logo.svg', 'image/svg+xml'],
};
export function createFixtureServer() {
  return createServer(async (req, res) => {
    const file = files[new URL(req.url, 'http://localhost').pathname];
    if (!file) {
      res.writeHead(404);
      res.end();
      return;
    }
    try {
      const data = await readFile(
        new URL(`../fixtures/scanner/${file[0]}`, import.meta.url),
      );
      res.writeHead(200, {
        'Content-Type': `${file[1]}; charset=utf-8`,
        'Cache-Control': 'no-store',
      });
      res.end(data);
    } catch {
      res.writeHead(500);
      res.end('Fixture unavailable');
    }
  });
}
if (process.argv.includes('--serve')) {
  const server = createFixtureServer();
  server.listen(4174, '127.0.0.1', () =>
    console.info('Controlled scanner fixture: http://127.0.0.1:4174'),
  );
  for (const signal of ['SIGINT', 'SIGTERM'])
    process.on(signal, () => server.close());
}
