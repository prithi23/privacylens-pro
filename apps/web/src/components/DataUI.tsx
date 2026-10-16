import type { ReactNode } from 'react';
import { Database, RefreshCw } from 'lucide-react';
import type { Scan } from '../services/api';
export function ResourceState({
  loading,
  error,
  retry,
  children,
}: {
  loading: boolean;
  error?: string;
  retry: () => void;
  children: ReactNode;
}) {
  if (loading)
    return (
      <div className="skeleton-grid" role="status" aria-label="Loading data">
        <div />
        <div />
        <div />
      </div>
    );
  if (error)
    return (
      <div className="panel error-panel" role="alert">
        <h2>Could not load data</h2>
        <p>{error}</p>
        <button onClick={retry}>
          <RefreshCw size={16} />
          Retry
        </button>
      </div>
    );
  return <>{children}</>;
}
export function Empty({
  title = 'Your privacy story starts with a scan',
  children,
}: {
  title?: string;
  children?: ReactNode;
}) {
  return (
    <section className="panel empty">
      <Database size={38} />
      <h2>{title}</h2>
      {children ?? (
        <p>
          No saved scans yet. The Chrome extension scans locally; pairing and
          uploads are not available in this phase. Authorized API clients can
          save scan metadata after you enable storage in Settings.
        </p>
      )}
    </section>
  );
}
export function Score({ value }: { value: number | null }) {
  return (
    <span
      className={`score ${value === null ? '' : value >= 75 ? 'good' : value >= 45 ? 'medium' : 'poor'}`}
    >
      {value === null ? '—' : Math.round(value)}
      <small>/100</small>
    </span>
  );
}
export function date(value: string) {
  return new Date(value).toLocaleString();
}
export function ScanTable({
  items,
  open,
}: {
  items: Scan[];
  open: (id: string) => void;
}) {
  return (
    <div className="table-scroll">
      <table>
        <caption className="sr-only">Saved privacy scans</caption>
        <thead>
          <tr>
            <th>Website</th>
            <th>Privacy score</th>
            <th>Trackers</th>
            <th>Third parties</th>
            <th>Transport</th>
            <th>Scanned</th>
            <th>Report</th>
          </tr>
        </thead>
        <tbody>
          {items.map((scan) => (
            <tr key={scan.id}>
              <td>{scan.hostname}</td>
              <td>
                <Score value={scan.privacyScore} />
              </td>
              <td>{scan.trackerMatchCount}</td>
              <td>{scan.thirdPartyDomainCount}</td>
              <td>
                <span className="tag">{scan.httpsStatus.toUpperCase()}</span>
              </td>
              <td>{date(scan.scannedAt)}</td>
              <td>
                <button
                  onClick={() => open(scan.id)}
                  aria-label={`View scan for ${scan.hostname}`}
                >
                  View
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
