import { describe, expect, it } from 'vitest';
import { resourceObservationSchema } from './observations';
const base = { protocol: 'https:', kind: 'script', source: 'dom' };
describe('injected observation privacy contract', () => {
  it.each(['localhost', '127.0.0.1', '[::1]', 'cdn.example.com'])(
    'accepts browser hostname %s',
    (hostname) => {
      expect(
        resourceObservationSchema.parse({ ...base, hostname }).hostname,
      ).toBe(hostname);
    },
  );
  it.each([
    'https://example.com/?token=x',
    'example.com:443',
    'user@example.com',
    '.example.com',
    'example..com',
    'example.com/path',
    '[not-ipv6]',
    'evil_name.example.com',
  ])('rejects unsafe observation %s', (hostname) => {
    expect(
      resourceObservationSchema.safeParse({ ...base, hostname }).success,
    ).toBe(false);
  });
  it('rejects raw URL extras even when the hostname is valid', () => {
    expect(
      resourceObservationSchema.safeParse({
        ...base,
        hostname: 'example.com',
        url: 'https://example.com/private',
      }).success,
    ).toBe(false);
  });
});
