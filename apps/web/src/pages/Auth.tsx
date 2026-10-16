import { useState, type FormEvent } from 'react';
import { Eye, EyeOff, ShieldCheck } from 'lucide-react';
import { z } from 'zod';
import { authSchema, request } from '../services/api';
import { useSession } from '../components/Session';
const credentials = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(12).max(128),
});
export function Auth() {
  const { setUser, message } = useSession();
  const [register, setRegister] = useState(false);
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    const form = new FormData(event.currentTarget);
    const result = credentials.safeParse({
      email: form.get('email'),
      password: form.get('password'),
    });
    if (!result.success) {
      setError('Enter a valid email and a password of 12–128 characters.');
      return;
    }
    setBusy(true);
    try {
      const data = await request(
        `/auth/${register ? 'register' : 'login'}`,
        authSchema,
        { method: 'POST', body: result.data },
      );
      setUser(data.user);
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="auth-shell">
      <section className="auth-story">
        <ShieldCheck size={52} />
        <span className="eyebrow">PRIVACYLENS PRO</span>
        <h1>
          Clarity for your
          <br />
          digital footprint.
        </h1>
        <p>
          Explore your saved privacy scans, understand observable tracking, and
          stay in control of your data.
        </p>
        <div className="notice">
          Local scanning stays local. Signing in never enables extension
          uploads.
        </div>
      </section>
      <section className="auth-card">
        <h2>{register ? 'Create your account' : 'Welcome back'}</h2>
        <p>
          {register
            ? 'Your private workspace starts here.'
            : 'Sign in to your privacy workspace.'}
        </p>
        {message && <p role="status">{message}</p>}
        <form onSubmit={(event) => void submit(event)}>
          <label>
            Email address
            <input
              name="email"
              type="email"
              autoComplete="email"
              required
              maxLength={254}
            />
          </label>
          <label>
            Password
            <div className="password-field">
              <input
                name="password"
                type={visible ? 'text' : 'password'}
                autoComplete={register ? 'new-password' : 'current-password'}
                required
                minLength={12}
                maxLength={128}
                aria-describedby="password-help"
              />
              <button
                type="button"
                aria-label={visible ? 'Hide password' : 'Show password'}
                aria-pressed={visible}
                onClick={() => setVisible(!visible)}
              >
                {visible ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </label>
          <small id="password-help">
            Use 12–128 characters. Passwords are case-sensitive.
          </small>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <button className="primary" disabled={busy}>
            {busy ? 'Please wait…' : register ? 'Create account' : 'Sign in'}
          </button>
        </form>
        <button
          className="text-button"
          disabled={busy}
          onClick={() => {
            setRegister(!register);
            setError('');
          }}
        >
          {register
            ? 'Already have an account? Sign in'
            : 'New here? Create an account'}
        </button>
        <p className="muted">
          Secure HttpOnly sessions · No browser-stored tokens
        </p>
      </section>
    </main>
  );
}
