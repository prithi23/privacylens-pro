import { pageObservationSchema } from '@privacylens/shared/observations';
import { analyzePage, type ScanResult } from '../analysis/engine';
import { collectPageResources } from '../content/collect';

import { ScanError } from './errors';
export { ScanError } from './errors';

export async function scanActiveWebsite(): Promise<ScanResult> {
  try {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    if (tab?.id === undefined || !tab.url)
      throw new ScanError(
        'UNSUPPORTED',
        'No accessible website is active. Open an HTTP or HTTPS page and try again.',
      );
    const url = new URL(tab.url);
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.hostname === 'chromewebstore.google.com' ||
      (url.hostname === 'chrome.google.com' &&
        url.pathname.startsWith('/webstore'))
    )
      throw new ScanError(
        'UNSUPPORTED',
        'Chrome restricts scanning on this page. Open a normal HTTP or HTTPS website.',
      );
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id, frameIds: [0] },
      world: 'ISOLATED',
      func: collectPageResources,
    });
    const snapshot = results.find((result) => result.frameId === 0);
    const parsed = pageObservationSchema.safeParse(snapshot?.result);
    if (!parsed.success)
      throw new ScanError(
        'INVALID_RESULT',
        'Chrome returned no usable scan snapshot. Reload the website, reopen the popup, and retry.',
      );
    const after = await chrome.tabs.get(tab.id);
    // A second, tiny injection checks document identity, including same-URL reloads.
    const confirmations = await chrome.scripting.executeScript({
      target: { tabId: tab.id, frameIds: [0] },
      world: 'ISOLATED',
      func: () => location.hostname,
    });
    const confirmation = confirmations.find((result) => result.frameId === 0);
    if (
      !confirmation ||
      (snapshot?.documentId &&
        snapshot.documentId !== confirmation.documentId) ||
      after.url !== tab.url ||
      parsed.data.hostname !== url.hostname.toLowerCase().replace(/\.$/, '') ||
      parsed.data.protocol !== url.protocol ||
      confirmation.result?.toLowerCase().replace(/\.$/, '') !==
        parsed.data.hostname
    )
      throw new ScanError(
        'NAVIGATION',
        'The website changed during scanning. Reopen the popup on the destination page and retry.',
      );
    return analyzePage(parsed.data);
  } catch (error) {
    if (error instanceof ScanError) throw error;
    // Never echo Chrome error strings that may contain a visited URL.
    throw new ScanError(
      'PERMISSION',
      'Chrome could not grant access. The tab may have closed or this site may restrict extensions. Reload the page, click the extension icon again, and retry.',
    );
  }
}

export async function scanWithTimeout(timeoutMs = 12000): Promise<ScanResult> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      scanActiveWebsite(),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(
          () =>
            reject(
              new ScanError(
                'TIMEOUT',
                'The scan timed out. Wait for the website to finish loading, then retry.',
              ),
            ),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
