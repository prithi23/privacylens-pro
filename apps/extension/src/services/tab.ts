export type TabContext =
  | { supported: true; hostname: string; https: boolean }
  | { supported: false; reason: string };
export async function getActiveTabContext(): Promise<TabContext> {
  try {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    if (!tab?.url)
      return {
        supported: false,
        reason:
          'Website information is unavailable. Reopen the popup on a normal website.',
      };
    const url = new URL(tab.url);
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.hostname === 'chromewebstore.google.com' ||
      (url.hostname === 'chrome.google.com' &&
        url.pathname.startsWith('/webstore'))
    )
      return {
        supported: false,
        reason:
          'Chrome restricts extensions on this page. Open a normal HTTP or HTTPS website.',
      };
    // Only expose the hostname. Discard paths, fragments, query strings and credentials.
    return {
      supported: true,
      hostname: url.hostname,
      https: url.protocol === 'https:',
    };
  } catch {
    return {
      supported: false,
      reason:
        'Permission was denied or the active tab changed. Reopen the popup to try again.',
    };
  }
}
