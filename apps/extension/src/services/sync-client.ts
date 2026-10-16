export type ConnectionState = {
  paired: boolean;
  displayName?: string;
  expiresAt?: string;
  storageEnabled?: boolean;
  message?: string;
};
export async function syncMessage(
  message: unknown,
): Promise<ConnectionState & { scanId?: string }> {
  const response = (await chrome.runtime.sendMessage(message)) as {
    ok: boolean;
    data?: ConnectionState & { scanId?: string };
    error?: string;
  };
  if (!response?.ok || !response.data)
    throw new Error(
      response?.error ??
        'The extension connection could not respond. Reopen the popup and retry.',
    );
  return response.data;
}
