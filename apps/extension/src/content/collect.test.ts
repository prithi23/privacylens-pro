import { afterEach, describe, expect, it, vi } from 'vitest';
import { pageObservationSchema } from '@privacylens/shared/observations';
import { collectPageResources } from './collect';

afterEach(() => vi.unstubAllGlobals());
function element(tagName: string, src: string, currentSrc = '') {
  return { tagName, getAttribute: () => src, currentSrc };
}
function setup(
  nodes: ReturnType<typeof element>[] = [],
  timings: { name: string; initiatorType: string }[] = [],
) {
  vi.stubGlobal('document', {
    baseURI: 'https://example.com/private/index.html?secret=fixture',
    querySelectorAll: () => nodes,
  });
  vi.stubGlobal('location', { hostname: 'example.com', protocol: 'https:' });
  vi.stubGlobal('performance', { getEntriesByType: () => timings });
}
describe('injected collector', () => {
  it('collects scripts, responsive images, iframe references and timings without returning URLs', () => {
    setup(
      [
        element(
          'SCRIPT',
          'https://www.google-analytics.com/collect?token=fixture',
        ),
        element(
          'IMG',
          '/fallback.png?private=1',
          'https://cdn.example.net/picture.webp#private',
        ),
        element('IFRAME', '//hotjar.com/frame?session=fixture'),
      ],
      [
        {
          name: 'https://doubleclick.net/pixel?secret=fixture',
          initiatorType: 'fetch',
        },
      ],
    );
    const result = pageObservationSchema.parse(collectPageResources());
    expect(result.resources.map((item) => item.kind)).toEqual([
      'script',
      'image',
      'image',
      'iframe',
      'other',
    ]);
    expect(result.resources.map((item) => item.hostname)).toContain(
      'example.com',
    );
    const json = JSON.stringify(result);
    expect(json).not.toMatch(/token|private|session=|fixture|collect\?/);
    expect(result.resources).toContainEqual({
      hostname: 'doubleclick.net',
      protocol: 'https:',
      kind: 'other',
      source: 'timing',
    });
  });
  it('does not double-record identical image src and currentSrc', () => {
    setup([
      element(
        'IMG',
        'https://example.com/image.png',
        'https://example.com/image.png',
      ),
    ]);
    expect(collectPageResources().resources).toHaveLength(1);
  });
  it('ignores inline/unsupported schemes and malformed URLs', () => {
    setup([
      element('IMG', 'data:image/svg+xml,test'),
      element('IMG', 'blob:https://example.com/test'),
      element('SCRIPT', 'http://['),
      element('IMG', ''),
    ]);
    expect(collectPageResources().ignoredResourceCount).toBe(3);
    expect(collectPageResources().resources).toEqual([]);
  });
  it('skips malformed DNS hostnames without discarding the rest of the scan', () => {
    setup([
      element('SCRIPT', 'https://bad..example.com/a.js'),
      element('SCRIPT', 'https://good.example.com/a.js'),
    ]);
    const result = pageObservationSchema.parse(collectPageResources());
    expect(result.ignoredResourceCount).toBe(1);
    expect(result.resources[0].hostname).toBe('good.example.com');
  });
  it('marks unavailable signals explicitly', () => {
    setup();
    vi.stubGlobal('performance', {
      getEntriesByType: () => {
        throw new Error('unavailable');
      },
    });
    expect(collectPageResources().timingStatus).toBe('unavailable');
    expect(collectPageResources().domStatus).toBe('available');
  });
  it('recovers timings even when DOM collection fails', () => {
    setup(
      [],
      [{ name: 'https://cdn.example.net/script.js', initiatorType: 'script' }],
    );
    vi.stubGlobal('document', {
      baseURI: 'https://example.com',
      querySelectorAll: () => {
        throw new Error('unavailable');
      },
    });
    expect(collectPageResources().domStatus).toBe('unavailable');
    expect(collectPageResources().resources).toHaveLength(1);
  });
  it('caps large pages and flags truncation', () => {
    setup(
      Array.from({ length: 5001 }, () => element('SCRIPT', '/script.js')),
      Array.from({ length: 5001 }, () => ({
        name: 'https://example.com/script.js',
        initiatorType: 'script',
      })),
    );
    const result = collectPageResources();
    expect(result.resources).toHaveLength(10000);
    expect(result.truncated).toBe(true);
  });
  it('can execute after serialization without module closures', () => {
    setup([element('SCRIPT', '/script.js')]);
    // Same serialization constraint as scripting.executeScript({ func }).
    const serialized = new Function(
      `return (${collectPageResources.toString()})()`,
    );
    expect(
      pageObservationSchema.parse(serialized()).resources[0].hostname,
    ).toBe('example.com');
  });
});
