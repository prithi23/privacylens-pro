import { isIP } from 'node:net';

export function extensionTarget(env: Record<string, string | undefined>) {
  const mode = env.EXTENSION_TARGET ?? 'development';
  if (!['development', 'production'].includes(mode))
    throw new Error('EXTENSION_TARGET must be development or production');
  let origin: string;
  if (mode === 'production') {
    const input = env.EXTENSION_API_ORIGIN;
    if (!input)
      throw new Error('Production extension requires EXTENSION_API_ORIGIN');
    let url: URL;
    try {
      url = new URL(input);
    } catch {
      throw new Error('Invalid extension API origin');
    }
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.pathname !== '/' ||
      url.port ||
      isIP(url.hostname) ||
      !url.hostname.includes('.') ||
      /(^|\.)(localhost|local|internal|test|invalid)$/.test(url.hostname)
    )
      throw new Error(
        'Production extension requires a public HTTPS origin on port 443, without a path or credentials',
      );
    origin = url.origin;
  } else {
    if (env.EXTENSION_API_ORIGIN)
      throw new Error(
        'Set EXTENSION_TARGET=production to configure a remote API',
      );
    const port = Number(env.VITE_SYNC_API_PORT ?? 4000);
    if (!Number.isInteger(port) || port < 1 || port > 65535)
      throw new Error('Invalid sync API port');
    origin = `http://127.0.0.1:${port}`;
  }
  return {
    mode,
    origin,
    apiBase: `${origin}/api/v1/extension`,
    hostPermission:
      mode === 'production' ? `${origin}/*` : 'http://127.0.0.1/*',
    connectSource: mode === 'production' ? origin : 'http://127.0.0.1:*',
    outDir: mode === 'production' ? 'dist-production' : 'dist',
  };
}
