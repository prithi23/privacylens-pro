import { describe, expect, it } from 'vitest';
import { getTestDatabaseUrl } from './test-database';
const application = 'postgresql://app:unit-only@localhost:5432/privacylens_db';
describe('integration database write guard', () => {
  it.each(['privacylens_test_db', 'privacylens_test', 'test'])(
    'accepts explicitly separate test database %s',
    (name) => {
      const url = `postgresql://test:unit-only@localhost:5432/${name}`;
      expect(
        getTestDatabaseUrl({
          DATABASE_URL: application,
          TEST_DATABASE_URL: url,
        }),
      ).toBe(url);
    },
  );
  it('rejects the application target, including another host alias', () => {
    expect(() =>
      getTestDatabaseUrl({
        DATABASE_URL: application,
        TEST_DATABASE_URL:
          'postgresql://other:unit-only@127.0.0.1:5432/privacylens_db',
      }),
    ).toThrow('separate');
  });
  it('rejects ambiguous non-test names', () => {
    expect(() =>
      getTestDatabaseUrl({
        DATABASE_URL: application,
        TEST_DATABASE_URL:
          'postgresql://test:unit-only@localhost:5432/latest_db',
      }),
    ).toThrow('test name');
  });
  it('requires both URLs', () =>
    expect(() =>
      getTestDatabaseUrl({ TEST_DATABASE_URL: application }),
    ).toThrow('separate'));
  it('does not include an invalid secret-bearing URL in errors', () => {
    try {
      getTestDatabaseUrl({
        DATABASE_URL: application,
        TEST_DATABASE_URL: 'invalid-secret-marker',
      });
    } catch (error) {
      expect((error as Error).message).not.toContain('invalid-secret-marker');
      return;
    }
    throw new Error('Expected the target guard to reject the URL');
  });
});
