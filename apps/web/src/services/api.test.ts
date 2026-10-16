import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { ApiError, query, request } from './api';
afterEach(() => vi.unstubAllGlobals());
describe('dashboard HTTP boundary', () => {
  it('encodes filters and omits unset values', () => {
    expect(
      query({ hostname: 'example.com', page: 2, from: '', to: undefined }),
    ).toBe('?hostname=example.com&page=2');
    expect(query({ q: 'a&b' })).toBe('?q=a%26b');
  });
  it('uses credentialed no-store requests and JSON writes without reading cookies', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ saved: true })));
    vi.stubGlobal('fetch', fetcher);
    await expect(
      request('/preferences', z.object({ saved: z.boolean() }), {
        method: 'PATCH',
        body: { syncEnabled: false },
      }),
    ).resolves.toEqual({ saved: true });
    expect(fetcher).toHaveBeenCalledWith(
      '/api/v1/preferences',
      expect.objectContaining({
        credentials: 'include',
        cache: 'no-store',
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
      }),
    );
  });
  it('distinguishes unavailable backend from invalid credentials', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('network')));
    await expect(request('/auth/me', z.unknown())).rejects.toMatchObject({
      status: 0,
      code: 'UNAVAILABLE',
    });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: {
              code: 'INVALID_CREDENTIALS',
              message: 'Invalid email or password.',
            },
          }),
          { status: 401 },
        ),
      ),
    );
    await expect(request('/auth/login', z.unknown())).rejects.toMatchObject({
      status: 401,
      code: 'INVALID_CREDENTIALS',
    });
  });
  it('expires protected sessions but does not treat a failed login as session expiry', async () => {
    const dispatchEvent = vi.fn();
    vi.stubGlobal('window', { dispatchEvent });
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockImplementation(() =>
          Promise.resolve(new Response('{}', { status: 401 })),
        ),
    );
    await expect(request('/scans', z.unknown())).rejects.toBeInstanceOf(
      ApiError,
    );
    expect(dispatchEvent).toHaveBeenCalledTimes(1);
    await expect(request('/auth/login', z.unknown())).rejects.toBeInstanceOf(
      ApiError,
    );
    expect(dispatchEvent).toHaveBeenCalledTimes(1);
  });
  it('rejects malformed successful responses instead of displaying invented values', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('{"total":"fake"}')),
    );
    await expect(
      request('/scans', z.object({ total: z.number() })),
    ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });
  it('supports empty successful deletion responses', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(null, { status: 204 })),
    );
    await expect(
      request('/scans/id', z.undefined(), { method: 'DELETE', body: {} }),
    ).resolves.toBeUndefined();
  });
});
