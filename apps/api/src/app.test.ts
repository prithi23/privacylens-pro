import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from './app.js';
import { loadEnv } from './config/env.js';
const app = createApp({
  origins: ['http://localhost:5173'],
  databaseReady: async () => {
    throw new Error('offline');
  },
});
describe('foundation API', () => {
  it('avoids development HSTS and unrelated production subdomain policy', async () => {
    expect(
      (await request(app).get('/api/v1/health')).headers[
        'strict-transport-security'
      ],
    ).toBeUndefined();
    const production = createApp({
      origins: ['https://privacy.example.com'],
      production: true,
      databaseReady: async () => {},
    });
    expect(
      (await request(production).get('/api/v1/health')).headers[
        'strict-transport-security'
      ],
    ).toBe('max-age=31536000');
  });
  it('serves liveness without a database', async () => {
    const res = await request(app).get('/api/v1/health');
    expect(res.status).toBe(200);
    expect(res.body.phase).toBe(1);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });
  it('reports database unavailability honestly', async () =>
    expect((await request(app).get('/api/v1/ready')).status).toBe(503));
  it('reports readiness when database probe succeeds', async () => {
    const ready = createApp({ origins: [], databaseReady: async () => {} });
    expect((await request(ready).get('/api/v1/ready')).status).toBe(200);
  });
  it('searches real reference intelligence', async () => {
    const res = await request(app).get('/api/v1/trackers?q=doubleclick.net');
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].id).toBe('doubleclick');
    expect(res.body.datasetVersion).toBe('privacylens-reference-2026.10.16');
  });
  it('blocks unknown origins', async () =>
    expect(
      (
        await request(app)
          .get('/api/v1/health')
          .set('Origin', 'https://untrusted.example')
      ).status,
    ).toBe(403));
  it('permits the exact configured origin', async () =>
    expect(
      (
        await request(app)
          .get('/api/v1/health')
          .set('Origin', 'http://localhost:5173')
      ).headers['access-control-allow-origin'],
    ).toBe('http://localhost:5173'));
  it('has no unprotected scan endpoint', async () =>
    expect((await request(app).get('/api/v1/scans')).status).toBe(404));
  it('rejects malformed JSON', async () =>
    expect(
      (
        await request(app)
          .post('/api/v1/unknown')
          .set('Content-Type', 'application/json')
          .send('{')
      ).status,
    ).toBe(400));
  it('enforces the request body limit', async () =>
    expect(
      (
        await request(app)
          .post('/api/v1/unknown')
          .send({ content: 'x'.repeat(70000) })
      ).status,
    ).toBe(413));
  it('rejects insecure production configuration', () =>
    expect(() =>
      loadEnv({ NODE_ENV: 'production', WEB_ORIGINS: 'http://example.com' }),
    ).toThrow('HTTPS'));
});
