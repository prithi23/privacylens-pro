import { describe, expect, it } from 'vitest';
import { extensionTarget } from './target';
describe('release extension target boundary', () => {
  it('keeps ordinary builds local and production artifacts separate', () => {
    expect(extensionTarget({})).toMatchObject({
      origin: 'http://127.0.0.1:4000',
      outDir: 'dist',
    });
    expect(
      extensionTarget({
        EXTENSION_TARGET: 'production',
        EXTENSION_API_ORIGIN: 'https://privacy.example.com/',
      }),
    ).toMatchObject({
      origin: 'https://privacy.example.com',
      apiBase: 'https://privacy.example.com/api/v1/extension',
      hostPermission: 'https://privacy.example.com/*',
      connectSource: 'https://privacy.example.com',
      outDir: 'dist-production',
    });
  });
  it.each([
    undefined,
    'http://privacy.example.com',
    'https://localhost',
    'https://127.0.0.1',
    'https://[::1]',
    'https://10.0.0.1',
    'https://service.local',
    'https://privacy.example.com:8443',
    'https://user:secret@privacy.example.com',
    'https://privacy.example.com/api',
    'https://privacy.example.com/?token=secret',
    'https://privacy.example.com/#fragment',
  ])('rejects unsafe or absent production origin (%s)', (origin) => {
    expect(() =>
      extensionTarget({
        EXTENSION_TARGET: 'production',
        EXTENSION_API_ORIGIN: origin,
      }),
    ).toThrow();
  });
  it('refuses accidental remote configuration in a local build and invalid ports', () => {
    expect(() =>
      extensionTarget({ EXTENSION_API_ORIGIN: 'https://privacy.example.com' }),
    ).toThrow();
    expect(() => extensionTarget({ VITE_SYNC_API_PORT: '0' })).toThrow();
    expect(extensionTarget({ VITE_SYNC_API_PORT: '41234' }).origin).toBe(
      'http://127.0.0.1:41234',
    );
  });
});
