import { describe, expect, it } from 'vitest';
import { loadEnv } from './env';
import { createApp } from '../app';
const production = {
  NODE_ENV: 'production',
  WEB_ORIGINS: 'https://privacy.example.com',
  DATABASE_URL: 'postgresql://unit:unit-only@localhost/release_unit',
};
describe('deployment configuration boundaries', () => {
  it('defaults to loopback and no proxy trust, independent of local secrets', () => {
    const env = loadEnv({});
    expect(env.HOST).toBe('127.0.0.1');
    expect(env.trustedProxies).toEqual([]);
  });
  it('accepts explicit container binding and trusted proxy networks', () => {
    const env = loadEnv({
      ...production,
      HOST: '0.0.0.0',
      TRUST_PROXY: 'loopback,172.30.0.2/32',
    });
    const app = createApp({
      origins: env.origins,
      trustedProxies: env.trustedProxies,
      databaseReady: async () => {},
    });
    const trust = app.get('trust proxy fn') as (
      address: string,
      hop: number,
    ) => boolean;
    expect(trust('172.30.0.2', 0)).toBe(true);
    expect(trust('198.51.100.9', 0)).toBe(false);
  });
  it.each([
    'true',
    '1',
    '*',
    '0.0.0.0/0',
    '::/0',
    '10.0.0.1/33',
    'proxy.example.com',
  ])('rejects ambiguous or all-address proxy trust %s', (value) => {
    expect(() => loadEnv({ ...production, TRUST_PROXY: value })).toThrow();
  });
  it('rejects production without a database or exact HTTPS origins', () => {
    expect(() => loadEnv({ ...production, DATABASE_URL: undefined })).toThrow();
    expect(() =>
      loadEnv({
        ...production,
        WEB_ORIGINS: 'https://privacy.example.com/path',
      }),
    ).toThrow();
    expect(() =>
      loadEnv({ ...production, WEB_ORIGINS: 'http://privacy.example.com' }),
    ).toThrow();
  });
});
