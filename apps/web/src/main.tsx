import { StrictMode, Suspense, lazy, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Activity,
  ArrowLeftRight,
  Fingerprint,
  History as HistoryIcon,
  LogOut,
  Menu,
  Settings as SettingsIcon,
  ShieldCheck,
} from 'lucide-react';
import { ErrorBoundary } from './components/ErrorBoundary';
import { SessionProvider, useSession } from './components/Session';
import { Auth } from './pages/Auth';
import './styles.css';
const Overview = lazy(() => import('./pages/Overview'));
const History = lazy(() => import('./pages/History'));
const Comparison = lazy(() => import('./pages/Comparison'));
const Intelligence = lazy(() => import('./pages/Intelligence'));
const Settings = lazy(() => import('./pages/Settings'));
const Evaluation = lazy(() => import('./pages/Evaluation'));
const navigation = [
  ['overview', 'Overview', Activity],
  ['history', 'Scan history', HistoryIcon],
  ['comparison', 'Website comparison', ArrowLeftRight],
  ['intelligence', 'Tracker intelligence', Fingerprint],
  ['settings', 'Settings', SettingsIcon],
  ['evaluation', 'Evaluation lab', Activity],
] as const;
function App() {
  const { user, logout } = useSession();
  const [hash, setHash] = useState(location.hash);
  const [collapsed, setCollapsed] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const update = () => setHash(location.hash);
    window.addEventListener('hashchange', update);
    return () => window.removeEventListener('hashchange', update);
  }, []);
  if (!user) return <Auth />;
  const [route, id] = hash.replace(/^#\/?/, '').split('/');
  const page = navigation.find(([key]) => key === route)?.[0] ?? 'overview';
  const open = (scanId?: string) => {
    location.hash = scanId
      ? `/history/${encodeURIComponent(scanId)}`
      : '/history';
  };
  return (
    <div className={`app ${collapsed ? 'collapsed' : ''}`}>
      <a
        className="skip-link"
        href="#main-content"
        onClick={(event) => {
          event.preventDefault();
          document.getElementById('main-content')?.focus();
        }}
      >
        Skip to content
      </a>
      <aside>
        <a
          className="brand"
          href="#/overview"
          aria-label="PrivacyLens overview"
        >
          <ShieldCheck size={30} />
          <span>
            PrivacyLens<small>PRO · PRIVACY INTELLIGENCE</small>
          </span>
        </a>
        <button
          className="collapse-button"
          aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
          aria-expanded={!collapsed}
          onClick={() => setCollapsed(!collapsed)}
        >
          <Menu size={18} />
          <span>Navigation</span>
        </button>
        <nav aria-label="Main navigation">
          {navigation.map(([key, label, Icon]) => (
            <a
              key={key}
              href={`#/${key}`}
              aria-current={page === key ? 'page' : undefined}
              title={label}
              aria-label={label}
            >
              <Icon size={20} />
              <span>{label}</span>
            </a>
          ))}
        </nav>
        <div className="sidebar-note">
          <ShieldCheck size={22} />
          <p>
            Local by default.
            <br />
            Private by design.
          </p>
        </div>
      </aside>
      <div className="workspace">
        <header>
          <div>
            <span className="eyebrow">PRIVACY WORKSPACE</span>
            <strong>{navigation.find(([key]) => key === page)?.[1]}</strong>
          </div>
          <div className="user-actions">
            <span title={user.email}>{user.email}</span>
            <button
              disabled={busy}
              aria-label="Log out"
              onClick={() => {
                setBusy(true);
                setError('');
                void logout()
                  .catch((error: Error) => setError(error.message))
                  .finally(() => setBusy(false));
              }}
            >
              <LogOut size={17} />
              <span>Log out</span>
            </button>
          </div>
        </header>
        <main id="main-content" tabIndex={-1}>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <Suspense
            fallback={
              <div className="panel" role="status">
                Loading workspace…
              </div>
            }
          >
            {page === 'overview' && <Overview open={open} />}
            {page === 'history' && <History scanId={id} open={open} />}
            {page === 'comparison' && <Comparison />}
            {page === 'intelligence' && <Intelligence />}
            {page === 'settings' && <Settings />}
            {page === 'evaluation' && <Evaluation />}
          </Suspense>
        </main>
        <footer>
          PrivacyLens Pro · Observable signals, explainable evidence · Local
          scanning remains independent
        </footer>
      </div>
    </div>
  );
}
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <SessionProvider>
        <App />
      </SessionProvider>
    </ErrorBoundary>
  </StrictMode>,
);
