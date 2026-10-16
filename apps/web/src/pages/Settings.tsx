import { useState, type FormEvent } from 'react';
import { z } from 'zod';
import { preferencesSchema, request } from '../services/api';
import { useResource } from '../hooks/useResource';
import { useSession } from '../components/Session';
import { date, ResourceState } from '../components/DataUI';
import { ConnectedExtensions } from '../components/ConnectedExtensions';
const responseSchema = z.object({ preferences: preferencesSchema });
const saveSchema = responseSchema.extend({ purged: z.number() });
const deletionSchema = z.object({ deleted: z.number() });
export default function Settings() {
  const { user, logout } = useSession();
  const state = useResource('/preferences', responseSchema);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [confirm, setConfirm] = useState(false);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const data = preferencesSchema.safeParse({
      syncEnabled: form.get('syncEnabled') === 'on',
      retentionDays: Number(form.get('retentionDays')),
    });
    if (!data.success) {
      setError('Retention must be a whole number from 1 to 365 days.');
      return;
    }
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const saved = await request('/preferences', saveSchema, {
        method: 'PATCH',
        body: data.data,
      });
      setMessage(`Preferences saved. ${saved.purged} expired scans removed.`);
      state.retry();
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const result = await request('/scans', deletionSchema, {
        method: 'DELETE',
        body: {},
      });
      setMessage(
        `${result.deleted} scans and their findings permanently deleted.`,
      );
      setConfirm(false);
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="page-heading">
        <span className="eyebrow">CONTROL YOUR FOOTPRINT</span>
        <h1>Account & privacy</h1>
        <p>Manage storage consent, retention, and your saved data.</p>
      </div>
      <section className="panel">
        <h2>Your profile</h2>
        <dl>
          <dt>Email</dt>
          <dd>{user?.email}</dd>
          <dt>Account created</dt>
          <dd>{user ? date(user.createdAt) : '—'}</dd>
        </dl>
        <p className="muted">
          Email changes, password recovery, and account deletion are not
          available in this phase. Saved scan deletion is available below.
        </p>
      </section>
      {message && (
        <p role="status" className="notice">
          {message}
        </p>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <ResourceState {...state}>
        {state.data && (
          <form
            className="panel settings-form"
            onSubmit={(event) => void save(event)}
          >
            <h2>Storage preferences</h2>
            <label className="check-label">
              <input
                type="checkbox"
                name="syncEnabled"
                defaultChecked={state.data.preferences.syncEnabled}
              />
              Allow authenticated API clients to save my scan metadata
            </label>
            <p>
              This is explicit server-storage consent. It does not connect the
              extension, upload browsing activity, or enable automatic
              synchronization. Disabling it blocks new saves and preserves
              retained history.
            </p>
            <label>
              Keep scan history for (days)
              <input
                type="number"
                name="retentionDays"
                min={1}
                max={365}
                step={1}
                required
                defaultValue={state.data.preferences.retentionDays}
              />
            </label>
            <p>
              Reducing retention immediately deletes your older saved scans.
              Expired records are hidden on reads and purged on writes or
              preference changes.
            </p>
            <button className="primary" disabled={busy}>
              {busy ? 'Saving…' : 'Save preferences'}
            </button>
          </form>
        )}
      </ResourceState>
      <ConnectedExtensions />
      <section className="panel danger">
        <h2>Delete all saved scans</h2>
        <p>
          Permanently remove your scan history and findings. Your account and
          preferences remain.
        </p>
        {confirm ? (
          <div role="group" aria-label="Confirm history deletion">
            <p>This cannot be undone.</p>
            <button disabled={busy} onClick={() => void remove()}>
              Confirm delete all scans
            </button>
            <button disabled={busy} onClick={() => setConfirm(false)}>
              Cancel
            </button>
          </div>
        ) : (
          <button disabled={busy} onClick={() => setConfirm(true)}>
            Delete all scans
          </button>
        )}
      </section>
      <section className="panel">
        <h2>Session</h2>
        <p>
          Your session is held in a secure HttpOnly cookie, never localStorage.
        </p>
        <button
          disabled={busy}
          onClick={() => {
            setBusy(true);
            void logout().catch((error: Error) => {
              setError(error.message);
              setBusy(false);
            });
          }}
        >
          Sign out of this session
        </button>
      </section>
    </>
  );
}
