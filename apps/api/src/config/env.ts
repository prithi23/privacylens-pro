import { config } from 'dotenv';
import { resolve } from 'node:path';
import { z } from 'zod';
import { isIP } from 'node:net';
config({
  path: [resolve(process.cwd(), '.env'), resolve(process.cwd(), '../../.env')],
  quiet: true,
});
export function loadEnv(source: NodeJS.ProcessEnv = process.env) {
  const parsed = z
    .object({
      NODE_ENV: z
        .enum(['development', 'test', 'production'])
        .default('development'),
      PORT: z.coerce.number().int().min(1).max(65535).default(4000),
      HOST: z.enum(['127.0.0.1', '0.0.0.0', '::1', '::']).default('127.0.0.1'),
      TRUST_PROXY: z.string().max(512).default(''),
      DATABASE_URL: z
        .string()
        .url()
        .regex(/^postgres(ql)?:\/\//)
        .optional(),
      WEB_ORIGINS: z.string().default('http://localhost:5173'),
      SESSION_TTL_HOURS: z.coerce.number().int().min(1).max(168).default(24),
    })
    .parse(source);
  const origins = parsed.WEB_ORIGINS.split(',').map((value) => value.trim());
  for (const origin of origins) {
    const url = new URL(origin);
    if (url.origin !== origin || !['http:', 'https:'].includes(url.protocol))
      throw new Error('WEB_ORIGINS must contain exact HTTP(S) origins');
    if (parsed.NODE_ENV === 'production' && url.protocol !== 'https:')
      throw new Error('Production web origins require HTTPS');
  }
  if (parsed.NODE_ENV === 'production' && !parsed.DATABASE_URL)
    throw new Error('Production requires DATABASE_URL');
  const trustedProxies = parsed.TRUST_PROXY.split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  for (const proxy of trustedProxies) {
    if (proxy === 'loopback') continue;
    const [address, prefix, extra] = proxy.split('/');
    const family = isIP(address);
    if (
      !family ||
      extra !== undefined ||
      (prefix !== undefined &&
        (!/^\d+$/.test(prefix) ||
          Number(prefix) < 1 ||
          Number(prefix) > (family === 4 ? 32 : 128)))
    )
      throw new Error(
        'TRUST_PROXY accepts explicit proxy IPs/CIDRs or loopback, never a boolean, hop count, or all-address range',
      );
  }
  return { ...parsed, origins, trustedProxies };
}
