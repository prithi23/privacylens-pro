import { useEffect, useState, type FormEvent } from 'react';
import type { ScanResult } from '../analysis/engine';
import { syncMessage, type ConnectionState } from '../services/sync-client';
import { toSyncScan } from '../services/sync-data';
export function SyncPanel({
  result,
  scanning,
}: {
  result: ScanResult | null;
  scanning: boolean;
}) {
  const [connection, setConnection] = useState<ConnectionState>({
    paired: false,
  });
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [review, setReview] = useState(false);
  const [consent, setConsent] = useState(false);
  const [saved, setSaved] = useState(false);
  const [uploadId] = useState(() => crypto.randomUUID());
  const [forget, setForget] = useState(false);
  useEffect(() => {
    let active = true;
    void syncMessage({ action: 'local-status' })
      .then((value) => {
        if (active) setConnection(value);
      })
      .catch((error: Error) => {
        if (active) setError(error.message);
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
    };
  }, []);
  async function action(input: unknown, success: string) {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const response = await syncMessage(input);
      setConnection(response);
      setMessage(success);
      if (response.scanId) {
        setSaved(true);
        setReview(false);
        setConsent(false);
      }
    } catch (error) {
      setError((error as Error).message);
      const state = await syncMessage({ action: 'local-status' }).catch(
        () => null,
      );
      if (state) setConnection(state);
    } finally {
      setBusy(false);
    }
  }
  function pair(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void action(
      {
        action: 'pair',
        data: {
          code: String(form.get('code')).trim(),
          displayName: String(form.get('displayName')).trim(),
        },
      },
      'Paired. Each scan still requires your approval before upload.',
    );
  }
  let payload: ReturnType<typeof toSyncScan> | undefined;
  let unavailable = '';
  if (result) {
    try {
      payload = toSyncScan(result);
    } catch (error) {
      unavailable = (error as Error).message;
    }
  }
  return (
    <section className="sync-panel">
      <h2>Account connection</h2>
      <p>
        Optional · API: {__PRIVACYLENS_SYNC_TARGET__.origin}. Scanning never
        uploads automatically.
      </p>
      {connection.message && (
        <p role="status" className="sync-warning">
          {connection.message}
        </p>
      )}
      {connection.paired ? (
        <>
          <p>
            <strong>{connection.displayName}</strong> · Saved connection (use
            Check status to verify).
          </p>
          <p>
            Credential expires{' '}
            {connection.expiresAt
              ? new Date(connection.expiresAt).toLocaleDateString()
              : 'unknown'}
            .
          </p>
          {connection.storageEnabled !== undefined && (
            <p>
              Account storage:{' '}
              {connection.storageEnabled
                ? 'enabled'
                : 'disabled — enable it in dashboard Settings to upload'}
              .
            </p>
          )}
          <div className="sync-actions">
            <button
              disabled={busy}
              onClick={() =>
                void action(
                  { action: 'status' },
                  'Connection verified with the API.',
                )
              }
            >
              Check status
            </button>
            <button
              disabled={busy}
              onClick={() =>
                void action(
                  { action: 'unpair' },
                  'Credential revoked and local connection removed.',
                )
              }
            >
              Unpair extension
            </button>
          </div>
          <button
            className="sync-text"
            disabled={busy}
            onClick={() => setForget(!forget)}
          >
            Cannot reach the API? Remove local connection
          </button>
          {forget && (
            <div className="sync-warning">
              <p>
                Removing locally does not revoke the server credential. Revoke
                this extension in dashboard Settings when the API is available.
              </p>
              <button
                disabled={busy}
                onClick={() => {
                  setForget(false);
                  void action(
                    { action: 'forget-local' },
                    'Local connection removed. Server revocation is still required in dashboard Settings.',
                  );
                }}
              >
                Confirm local removal
              </button>
            </div>
          )}
        </>
      ) : (
        <form onSubmit={pair}>
          <label>
            Extension name
            <input
              name="displayName"
              defaultValue="My Chrome extension"
              required
              minLength={1}
              maxLength={100}
            />
          </label>
          <label>
            One-time code from dashboard Settings
            <input
              name="code"
              required
              pattern="(?:[A-Za-z0-9_]|-){22}"
              minLength={22}
              maxLength={22}
              autoComplete="off"
              spellCheck={false}
            />
          </label>
          <button disabled={busy}>
            {busy ? 'Working…' : 'Pair extension'}
          </button>
        </form>
      )}
      {result && (
        <div className="sync-scan">
          <h3>Save this scan</h3>
          <p>
            {result.hostname} · {new Date(result.scannedAt).toLocaleString()}
          </p>
          {unavailable ? (
            <p>{unavailable}</p>
          ) : saved ? (
            <p role="status">
              Scan synchronized. Refresh dashboard Overview, History, or
              Comparison to view it.
            </p>
          ) : review && payload ? (
            <>
              <p>
                Uploads only this hostname, score, transport, timestamp, counts
                and normalized tracker-domain findings. No URL paths, page
                content, cookies, credentials, or browsing history.
              </p>
              <details>
                <summary>View exact scan metadata</summary>
                <pre>{JSON.stringify(payload, null, 2)}</pre>
              </details>
              <label className="sync-consent">
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(event) => setConsent(event.target.checked)}
                />
                I approve uploading this specific scan to my paired account.
              </label>
              <div className="sync-actions">
                <button
                  disabled={busy || scanning || !consent || !connection.paired}
                  onClick={() =>
                    void action(
                      {
                        action: 'sync',
                        data: { consent: true, uploadId, scan: payload },
                      },
                      'Scan saved to PostgreSQL.',
                    )
                  }
                >
                  {busy ? 'Uploading…' : 'Confirm upload'}
                </button>
                <button
                  disabled={busy}
                  onClick={() => {
                    setReview(false);
                    setConsent(false);
                  }}
                >
                  Cancel
                </button>
              </div>
            </>
          ) : (
            <button
              disabled={busy || scanning || !connection.paired}
              onClick={() => {
                setReview(true);
                setConsent(false);
              }}
            >
              Sync This Scan
            </button>
          )}
        </div>
      )}
      {message && (
        <p role="status" className="sync-success">
          {message}
        </p>
      )}
      {error && (
        <p role="alert" className="sync-error">
          {error}
        </p>
      )}
    </section>
  );
}
