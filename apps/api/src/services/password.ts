import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { HttpError } from '../middleware/error.js';

const N = 131072;
let active = 0;
async function derive(password: string, salt: Buffer): Promise<Buffer> {
  if (active >= 2)
    throw new HttpError(
      503,
      'AUTH_BUSY',
      'Authentication is busy; retry shortly.',
    );
  active++;
  try {
    return await new Promise<Buffer>((resolve, reject) =>
      scrypt(
        password,
        salt,
        64,
        { N, r: 8, p: 1, maxmem: 256 * 1024 * 1024 },
        (error, key) => (error ? reject(error) : resolve(key)),
      ),
    );
  } finally {
    active--;
  }
}
export const dummyPasswordHash = `scrypt$${N}$8$1$${'00'.repeat(16)}$${'00'.repeat(64)}`;
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await derive(password, salt);
  return `scrypt$${N}$8$1$${salt.toString('hex')}$${hash.toString('hex')}`;
}
export async function verifyPassword(
  password: string,
  encoded: string,
): Promise<boolean> {
  const [algorithm, cost, r, p, salt, key, extra] = encoded.split('$');
  if (
    algorithm !== 'scrypt' ||
    cost !== `${N}` ||
    r !== '8' ||
    p !== '1' ||
    extra !== undefined ||
    !/^[a-f0-9]{32}$/.test(salt ?? '') ||
    !/^[a-f0-9]{128}$/.test(key ?? '')
  )
    return false;
  return timingSafeEqual(
    await derive(password, Buffer.from(salt, 'hex')),
    Buffer.from(key, 'hex'),
  );
}
