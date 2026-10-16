import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword, dummyPasswordHash } from './password';
describe('password storage', () => {
  it('uses salted memory-hard hashes and verifies the exact password', async () => {
    const password = 'unit-fixture-only-password-123!';
    const first = await hashPassword(password);
    const second = await hashPassword(password);
    expect(first === second).toBe(false);
    expect(first.includes(password)).toBe(false);
    expect(first.startsWith('scrypt$131072$8$1$')).toBe(true);
    expect(await verifyPassword(password, first)).toBe(true);
    expect(await verifyPassword(`${password}wrong`, first)).toBe(false);
  }, 20000);
  it('rejects malformed or unsupported stored hash parameters', async () => {
    expect(await verifyPassword('fixture', 'plaintext')).toBe(false);
    expect(
      await verifyPassword('fixture', dummyPasswordHash.replace('131072', '1')),
    ).toBe(false);
  });
});
