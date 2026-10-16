import { useState } from 'react';
import { z } from 'zod';
import { deviceSchema } from '@privacylens/shared/devices';
import { request } from '../services/api';
import { useResource } from '../hooks/useResource';
import { ResourceState, date } from './DataUI';
const devicesSchema = z.object({ items: z.array(deviceSchema) });
const codeSchema = z.object({ code: z.string(), expiresAt: z.string() });
export function ConnectedExtensions() {
  const state = useResource('/devices', devicesSchema);
  const [code, setCode] = useState<z.infer<typeof codeSchema> | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [confirm, setConfirm] = useState<string | null>(null);
  async function generate() {
    setBusy(true);
    setError('');
    setMessage('');
    setCode(null);
    try {
      setCode(
        await request('/devices/pairing-code', codeSchema, {
          method: 'POST',
          body: {},
        }),
      );
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function revoke(id: string) {
    setBusy(true);
    setError('');
    try {
      await request(`/devices/${encodeURIComponent(id)}`, z.undefined(), {
        method: 'DELETE',
        body: {},
      });
      setConfirm(null);
      setMessage('Extension credential revoked. Its saved scans are retained.');
      state.retry();
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel">
      <h2>Connected Extensions</h2>
      <p>
        Generate a one-time code and paste it into PrivacyLens Pro's extension
        popup. Codes expire after five minutes; a new code invalidates older
        unused codes. Pairing never enables automatic uploads.
      </p>
      <div className="sync-actions">
        <button
          className="primary"
          disabled={busy}
          onClick={() => void generate()}
        >
          Generate pairing code
        </button>
        <button disabled={busy || state.loading} onClick={state.retry}>
          Refresh extensions
        </button>
      </div>
      {code && (
        <div className="notice">
          <label>
            One-time pairing code
            <input
              aria-label="One-time pairing code"
              readOnly
              value={code.code}
              onFocus={(event) => event.currentTarget.select()}
            />
          </label>
          <p>
            Expires {date(code.expiresAt)}. Treat this as a secret; paste it
            only into the extension popup. It is shown only in this page's
            memory.
          </p>
          <button onClick={() => setCode(null)}>Hide code</button>
        </div>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {message && <p role="status">{message}</p>}
      <ResourceState {...state}>
        {state.data &&
          (state.data.items.length ? (
            state.data.items.map((device) => (
              <article className="finding" key={device.id}>
                <h3>{device.displayName}</h3>
                <p>
                  {device.revokedAt
                    ? `Revoked ${date(device.revokedAt)}`
                    : new Date(device.expiresAt) <= new Date()
                      ? 'Expired — pair again'
                      : 'Authorized'}{' '}
                  · Created {date(device.createdAt)}
                </p>
                <p>
                  Last successful upload:{' '}
                  {device.lastUsedAt ? date(device.lastUsedAt) : 'None'} ·
                  Credential expires {date(device.expiresAt)}
                </p>
                {!device.revokedAt &&
                  (confirm === device.id ? (
                    <div>
                      <p>
                        Revoke this extension's access? Existing saved scans
                        remain.
                      </p>
                      <button
                        disabled={busy}
                        onClick={() => void revoke(device.id)}
                      >
                        Confirm revoke extension
                      </button>
                      <button disabled={busy} onClick={() => setConfirm(null)}>
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      disabled={busy}
                      onClick={() => setConfirm(device.id)}
                    >
                      Revoke extension
                    </button>
                  ))}
              </article>
            ))
          ) : (
            <p>No extensions paired. Local scanning works without pairing.</p>
          ))}
      </ResourceState>
    </section>
  );
}
