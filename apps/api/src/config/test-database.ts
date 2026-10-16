/** Validate test targets before creating a client or performing any test writes. */
export function getTestDatabaseUrl(
  source: NodeJS.ProcessEnv = process.env,
): string {
  const message =
    'Configure separate DATABASE_URL and TEST_DATABASE_URL values. The test database must have a test name (for example privacylens_test_db) and a different name from the application database.';
  try {
    if (!source.DATABASE_URL || !source.TEST_DATABASE_URL)
      throw new Error(message);
    const application = new URL(source.DATABASE_URL);
    const test = new URL(source.TEST_DATABASE_URL);
    if (
      ![application, test].every((url) =>
        ['postgres:', 'postgresql:'].includes(url.protocol),
      )
    )
      throw new Error(message);
    const appName = decodeURIComponent(application.pathname.slice(1));
    const testName = decodeURIComponent(test.pathname.slice(1));
    // Reject matching names even across host aliases or different credentials.
    if (
      !appName ||
      !testName ||
      appName === testName ||
      !/(^|_)test(_|$)/.test(testName)
    )
      throw new Error(message);
    return source.TEST_DATABASE_URL;
  } catch {
    // URL parser errors can contain a connection string: never forward them.
    throw new Error(message);
  }
}
