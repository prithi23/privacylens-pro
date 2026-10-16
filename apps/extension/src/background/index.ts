import { z } from 'zod';
import {
  pairRequestSchema,
  pairResponseSchema,
  deviceStatusSchema,
  uploadSchema,
} from '@privacylens/shared/sync';
const target = __PRIVACYLENS_SYNC_TARGET__;
const api = target.apiBase;
const storedSchema = z
  .object({
    credential: z.string().regex(/^pld_[A-Za-z0-9_-]{43}$/),
    displayName: z.string(),
    expiresAt: z.string(),
    apiOrigin: z.string().optional(),
  })
  .strict();
const messageSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('local-status') }).strict(),
  z.object({ action: z.literal('status') }).strict(),
  z.object({ action: z.literal('pair'), data: pairRequestSchema }).strict(),
  z.object({ action: z.literal('unpair') }).strict(),
  z.object({ action: z.literal('forget-local') }).strict(),
  z.object({ action: z.literal('sync'), data: uploadSchema }).strict(),
]);
const storageReady = chrome.storage.local.setAccessLevel({
  accessLevel: 'TRUSTED_CONTEXTS',
});
async function network(
  path: string,
  method: string,
  body?: unknown,
  credential?: string,
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(`${api}${path}`, {
      method,
      credentials: 'omit',
      redirect: 'error',
      cache: 'no-store',
      signal: AbortSignal.timeout(12000),
      headers: {
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(credential ? { Authorization: `Bearer ${credential}` } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  } catch {
    throw new Error(
      `Cannot reach the configured API at ${target.origin}. Scanning still works locally. If an upload timed out, retrying this same scan is safe.`,
    );
  }
  if (!response.ok) {
    const error = (await response.json().catch(() => null)) as {
      error?: { message?: string };
    } | null;
    if (response.status === 401)
      await chrome.storage.local.remove('connection');
    throw new Error(
      error?.error?.message ??
        (response.status === 429
          ? 'Too many requests. Wait before trying again.'
          : 'The API request failed. Local scanning is unaffected.'),
    );
  }
  return response.status === 204 ? undefined : response.json();
}
async function handle(input: unknown) {
  await storageReady;
  const message = messageSchema.parse(input);
  const parsed = storedSchema.safeParse(
    (await chrome.storage.local.get('connection')).connection,
  );
  const stored = parsed.success ? parsed.data : null;
  const local = () => ({
    paired: Boolean(stored),
    ...(stored
      ? { displayName: stored.displayName, expiresAt: stored.expiresAt }
      : {}),
  });
  if (message.action === 'forget-local') {
    await chrome.storage.local.remove('connection');
    return { paired: false };
  }
  const differentApi =
    stored && (stored.apiOrigin ?? 'http://127.0.0.1:4000') !== target.origin;
  const mismatchMessage =
    'Saved connection belongs to a different API. Remove it locally and revoke it in the original dashboard before pairing here.';
  if (message.action === 'local-status')
    return {
      ...local(),
      ...(differentApi ? { message: mismatchMessage } : {}),
    };
  if (differentApi) throw new Error(mismatchMessage);
  if (message.action === 'pair') {
    if (stored)
      throw new Error(
        'Unpair the current connection before pairing another account.',
      );
    const response = pairResponseSchema.parse(
      await network('/pair', 'POST', message.data),
    );
    try {
      await chrome.storage.local.set({
        connection: {
          credential: response.credential,
          displayName: response.device.displayName,
          expiresAt: response.device.expiresAt,
          apiOrigin: target.origin,
        },
      });
    } catch {
      await network('/connection', 'DELETE', {}, response.credential).catch(
        () => {},
      );
      throw new Error(
        'Could not store the connection. Revoke any newly listed extension in dashboard Settings before retrying.',
      );
    }
    return {
      paired: true,
      displayName: response.device.displayName,
      expiresAt: response.device.expiresAt,
      storageEnabled: response.storageEnabled,
    };
  }
  if (!stored)
    throw new Error('Pair this extension in dashboard Settings first.');
  if (message.action === 'status') {
    const status = deviceStatusSchema.parse(
      await network('/status', 'GET', undefined, stored.credential),
    );
    return { ...local(), storageEnabled: status.storageEnabled };
  }
  if (message.action === 'unpair') {
    await network('/connection', 'DELETE', {}, stored.credential);
    await chrome.storage.local.remove('connection');
    return { paired: false };
  }
  const result = z
    .object({ scan: z.object({ id: z.string() }) })
    .parse(await network('/scans', 'POST', message.data, stored.credential));
  return { ...local(), scanId: result.scan.id };
}
// Only the packaged popup can invoke requests. No content-script or arbitrary-URL proxy.
let queue = Promise.resolve();
chrome.runtime.onMessage.addListener((message: unknown, sender, respond) => {
  if (
    sender.id !== chrome.runtime.id ||
    sender.url !== chrome.runtime.getURL('index.html')
  )
    return false;
  queue = queue.then(async () => {
    try {
      respond({ ok: true, data: await handle(message) });
    } catch (error) {
      respond({
        ok: false,
        error:
          error instanceof z.ZodError
            ? 'Invalid connection request. Reopen the popup and retry.'
            : error instanceof Error
              ? error.message
              : 'Connection request failed.',
      });
    }
  });
  return true;
});
chrome.runtime.onInstalled.addListener(() => {
  void chrome.action.setBadgeText({ text: '' });
});
