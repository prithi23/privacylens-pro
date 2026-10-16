import { afterEach, describe, expect, it, vi } from 'vitest';
import { scanActiveWebsite, scanWithTimeout } from './scan';
import { collectPageResources } from '../content/collect';
const snapshot = {
  hostname: 'example.com',
  protocol: 'https:',
  scannedAt: '2026-10-16T10:00:00.000Z',
  domStatus: 'available',
  timingStatus: 'available',
  truncated: false,
  ignoredResourceCount: 0,
  resources: [
    {
      hostname: 'google-analytics.com',
      protocol: 'https:',
      kind: 'script',
      source: 'dom',
    },
  ],
};
function chromeMock(url = 'https://example.com/private?secret=fixture') {
  const query = vi.fn().mockResolvedValue([{ id: 7, url }]);
  const get = vi.fn().mockResolvedValue({ id: 7, url });
  const executeScript = vi
    .fn()
    .mockResolvedValueOnce([
      { frameId: 0, documentId: 'document-1', result: snapshot },
    ])
    .mockResolvedValue([
      { frameId: 0, documentId: 'document-1', result: 'example.com' },
    ]);
  vi.stubGlobal('chrome', {
    tabs: { query, get },
    scripting: { executeScript },
  });
  return { query, get, executeScript };
}
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
describe('MV3 scan orchestration', () => {
  it('injects only the main frame in the isolated world and analyzes real returned observations', async () => {
    const mock = chromeMock();
    const result = await scanActiveWebsite();
    expect(mock.executeScript).toHaveBeenNthCalledWith(1, {
      target: { tabId: 7, frameIds: [0] },
      world: 'ISOLATED',
      func: collectPageResources,
    });
    expect(mock.executeScript).toHaveBeenCalledTimes(2);
    expect(result.trackers[0].name).toBe('Google Analytics');
    expect(result.score).toBe(92);
    expect(JSON.stringify(result)).not.toContain('secret');
  });
  it.each([
    'chrome://settings',
    'file:///private.txt',
    'https://chromewebstore.google.com/detail/test',
    'https://chrome.google.com/webstore/detail/test',
  ])('does not inject on unsupported page %s', async (url) => {
    const mock = chromeMock(url);
    await expect(scanActiveWebsite()).rejects.toMatchObject({
      code: 'UNSUPPORTED',
    });
    expect(mock.executeScript).not.toHaveBeenCalled();
  });
  it('handles a missing active tab', async () => {
    const mock = chromeMock();
    mock.query.mockResolvedValue([]);
    await expect(scanActiveWebsite()).rejects.toMatchObject({
      code: 'UNSUPPORTED',
    });
  });
  it('handles absent frame results', async () => {
    const mock = chromeMock();
    mock.executeScript.mockReset().mockResolvedValue([]);
    await expect(scanActiveWebsite()).rejects.toMatchObject({
      code: 'INVALID_RESULT',
    });
  });
  it('rejects unexpected sensitive fields in injected data', async () => {
    const mock = chromeMock();
    mock.executeScript
      .mockReset()
      .mockResolvedValue([
        { frameId: 0, result: { ...snapshot, cookies: 'do-not-expose' } },
      ]);
    await expect(scanActiveWebsite()).rejects.toMatchObject({
      code: 'INVALID_RESULT',
    });
  });
  it('does not echo sensitive visited URLs in Chrome permission errors', async () => {
    const mock = chromeMock();
    mock.executeScript
      .mockReset()
      .mockRejectedValue(
        new Error('Permission denied https://example.com/?secret=fixture'),
      );
    const error = await scanActiveWebsite().catch((failure: Error) => failure);
    expect(error).toMatchObject({ code: 'PERMISSION' });
    expect((error as Error).message).not.toMatch(/secret|fixture/);
  });
  it('rejects a different URL after collection', async () => {
    const mock = chromeMock();
    mock.get.mockResolvedValue({ url: 'https://other.example/' });
    await expect(scanActiveWebsite()).rejects.toMatchObject({
      code: 'NAVIGATION',
    });
  });
  it('rejects same-URL reloads with a changed document ID', async () => {
    const mock = chromeMock();
    mock.executeScript
      .mockReset()
      .mockResolvedValueOnce([
        { frameId: 0, documentId: 'old', result: snapshot },
      ])
      .mockResolvedValue([
        { frameId: 0, documentId: 'new', result: 'example.com' },
      ]);
    await expect(scanActiveWebsite()).rejects.toMatchObject({
      code: 'NAVIGATION',
    });
  });
  it('requires a matching observed hostname', async () => {
    const mock = chromeMock();
    mock.executeScript
      .mockReset()
      .mockResolvedValueOnce([
        { frameId: 0, result: { ...snapshot, hostname: 'other.example' } },
      ])
      .mockResolvedValue([{ frameId: 0, result: 'example.com' }]);
    await expect(scanActiveWebsite()).rejects.toMatchObject({
      code: 'NAVIGATION',
    });
  });
  it('times out without leaving an active timer', async () => {
    vi.useFakeTimers();
    const mock = chromeMock();
    mock.query.mockImplementation(() => new Promise(() => {}));
    const pending = expect(scanWithTimeout(25)).rejects.toMatchObject({
      code: 'TIMEOUT',
    });
    await vi.advanceTimersByTimeAsync(25);
    await pending;
    expect(vi.getTimerCount()).toBe(0);
  });
});
