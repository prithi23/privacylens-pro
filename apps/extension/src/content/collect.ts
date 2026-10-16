import type {
  PageObservation,
  ResourceObservation,
} from '@privacylens/shared/observations';

/**
 * Serialized by chrome.scripting.executeScript: NO external runtime references.
 * Full resource URLs exist only transiently inside the page's isolated world.
 */
export function collectPageResources(): PageObservation {
  const resources: ResourceObservation[] = [];
  let ignoredResourceCount = 0;
  let truncated = false;
  let domStatus: PageObservation['domStatus'] = 'available';
  let timingStatus: PageObservation['timingStatus'] = 'available';
  const limit = 5000;

  function record(
    raw: string,
    kind: ResourceObservation['kind'],
    source: ResourceObservation['source'],
  ) {
    if (!raw.trim()) return;
    if (resources.length >= 10000) {
      truncated = true;
      return;
    }
    try {
      const url = new URL(raw, document.baseURI);
      if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        ignoredResourceCount++;
        return;
      }
      const hostname = url.hostname.toLowerCase().replace(/\.$/, '');
      const validHost =
        hostname.length > 0 &&
        hostname.length <= 253 &&
        (hostname.startsWith('[')
          ? /^\[[0-9a-fA-F:]+\]$/.test(hostname)
          : /^[a-z0-9.-]+$/.test(hostname) &&
            hostname
              .split('.')
              .every(
                (label) =>
                  label.length > 0 &&
                  label.length <= 63 &&
                  !label.startsWith('-') &&
                  !label.endsWith('-'),
              ));
      if (!validHost) {
        ignoredResourceCount++;
        return;
      }
      resources.push({ hostname, protocol: url.protocol, kind, source });
    } catch {
      ignoredResourceCount++;
    }
  }

  try {
    const nodes = document.querySelectorAll('script[src], img, iframe[src]');
    if (nodes.length > limit) truncated = true;
    for (let index = 0; index < Math.min(nodes.length, limit); index++) {
      const node = nodes[index];
      if (node.tagName === 'IMG') {
        // currentSrc captures the browser-selected srcset/picture image, when loaded.
        const image = node as HTMLImageElement;
        const references = new Set([
          image.getAttribute('src') ?? '',
          image.currentSrc,
        ]);
        for (const reference of references) record(reference, 'image', 'dom');
      } else {
        record(
          node.getAttribute('src') ?? '',
          node.tagName === 'SCRIPT' ? 'script' : 'iframe',
          'dom',
        );
      }
    }
  } catch {
    domStatus = 'unavailable';
  }

  try {
    const entries = performance.getEntriesByType(
      'resource',
    ) as PerformanceResourceTiming[];
    if (entries.length > limit) truncated = true;
    for (const entry of entries.slice(0, limit)) {
      const kind =
        entry.initiatorType === 'script'
          ? 'script'
          : ['img', 'image'].includes(entry.initiatorType)
            ? 'image'
            : ['iframe', 'frame'].includes(entry.initiatorType)
              ? 'iframe'
              : 'other';
      record(entry.name, kind, 'timing');
    }
  } catch {
    timingStatus = 'unavailable';
  }

  return {
    hostname: location.hostname.toLowerCase().replace(/\.$/, ''),
    protocol:
      location.protocol === 'https:'
        ? 'https:'
        : location.protocol === 'http:'
          ? 'http:'
          : 'unknown',
    scannedAt: new Date().toISOString(),
    domStatus,
    timingStatus,
    truncated,
    ignoredResourceCount,
    resources,
  };
}
