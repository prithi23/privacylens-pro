import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { z } from 'zod';
import { ApiError, authSchema, request, type User } from '../services/api';
type Session = {
  user: User | null;
  message: string;
  setUser: (user: User) => void;
  logout: () => Promise<void>;
};
const Context = createContext<Session | null>(null);
export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    void request('/auth/me', authSchema, { signal: controller.signal })
      .then((data) => setUser(data.user))
      .catch((error: Error) => {
        if (
          !controller.signal.aborted &&
          !(error instanceof ApiError && error.status === 401)
        )
          setError(error.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [attempt]);
  useEffect(() => {
    const expire = () => {
      setUser(null);
      setMessage('Your session expired. Please sign in again.');
    };
    window.addEventListener('session-expired', expire);
    return () => window.removeEventListener('session-expired', expire);
  }, []);
  async function logout() {
    await request('/auth/logout', z.undefined(), { method: 'POST', body: {} });
    setUser(null);
    setMessage('You have been signed out.');
  }
  if (loading)
    return (
      <div className="center-screen" role="status">
        Restoring your secure session…
      </div>
    );
  if (error)
    return (
      <div className="center-screen">
        <h1>Connection unavailable</h1>
        <p role="alert">{error}</p>
        <button onClick={() => setAttempt((value) => value + 1)}>
          Retry connection
        </button>
      </div>
    );
  return (
    <Context.Provider
      value={{
        user,
        message,
        setUser: (value) => {
          setUser(value);
          setMessage('');
        },
        logout,
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function useSession() {
  const context = useContext(Context);
  if (!context) throw new Error('Session provider missing');
  return context;
}
