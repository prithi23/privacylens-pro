import { afterEach, describe, expect, it, vi } from 'vitest';
import { getActiveTabContext } from './tab';
afterEach(() => vi.unstubAllGlobals());
function mockTab(url?: string) {
  vi.stubGlobal('chrome', {
    tabs: { query: vi.fn().mockResolvedValue([{ url }]) },
  });
}
describe('active tab privacy boundary', () => {
  it('returns only hostname and transport', async () => {
    mockTab('https://example.com/private?token=secret#sensitive');
    expect(await getActiveTabContext()).toEqual({
      supported: true,
      hostname: 'example.com',
      https: true,
    });
  });
  it('reports plain HTTP accurately', async () => {
    mockTab('http://example.com');
    expect(await getActiveTabContext()).toEqual({
      supported: true,
      hostname: 'example.com',
      https: false,
    });
  });
  it.each([
    'chrome://settings',
    'file:///private.txt',
    'https://chromewebstore.google.com/detail/test',
  ])('rejects restricted URL %s', async (url) => {
    mockTab(url);
    expect((await getActiveTabContext()).supported).toBe(false);
  });
  it('handles missing permissions', async () => {
    vi.stubGlobal('chrome', {
      tabs: { query: vi.fn().mockRejectedValue(new Error('denied')) },
    });
    expect((await getActiveTabContext()).supported).toBe(false);
  });
  it('handles absent tab URL', async () => {
    mockTab();
    expect((await getActiveTabContext()).supported).toBe(false);
  });
});
