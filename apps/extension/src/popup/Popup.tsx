import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import {
  Shield,
  Globe,
  ScanLine,
  LoaderCircle,
  LockKeyhole,
  AlertCircle,
  Fingerprint,
} from 'lucide-react';
import { getActiveTabContext, type TabContext } from '../services/tab';
import { ScanError } from '../services/errors';
import type { ScanResult } from '../analysis/engine';
import { ScanReport } from '../components/ScanReport';
const SyncPanel = lazy(() =>
  import('../components/SyncPanel').then((module) => ({
    default: module.SyncPanel,
  })),
);

export function Popup() {
  const [context, setContext] = useState<TabContext | null>(null);
  const [loadingContext, setLoadingContext] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [error, setError] = useState('');
  const inFlight = useRef(false);
  useEffect(() => {
    let active = true;
    void getActiveTabContext().then((value) => {
      if (active) {
        setContext(value);
        setLoadingContext(false);
      }
    });
    return () => {
      active = false;
    };
  }, []);
  async function scan() {
    if (inFlight.current) return;
    inFlight.current = true;
    setScanning(true);
    setError('');
    try {
      const { scanWithTimeout } = await import('../services/scan');
      setResult(await scanWithTimeout());
    } catch (failure) {
      setError(
        failure instanceof ScanError
          ? failure.message
          : 'The scan could not finish. Reopen the popup and try again.',
      );
    } finally {
      inFlight.current = false;
      setScanning(false);
    }
  }
  const hostname =
    result?.hostname ?? (context?.supported ? context.hostname : null);
  const protocol =
    result?.protocol ??
    (context?.supported ? (context.https ? 'https:' : 'http:') : 'unknown');
  return (
    <main>
      <header>
        <div className="logo">
          <Shield size={25} />
        </div>
        <div>
          <strong>
            PrivacyLens <span>PRO</span>
          </strong>
          <small>BROWSER PRIVACY INTELLIGENCE</small>
        </div>
        <span className="phase">v0.6</span>
      </header>
      <div className="local">
        <span /> LOCAL SCANNING · UPLOAD ONLY WITH APPROVAL
      </div>
      <section className="site" aria-live="polite">
        <Globe size={20} />
        <div>
          <small>{result ? 'LAST COMPLETED SCAN' : 'ACTIVE WEBSITE'}</small>
          <h1>
            {loadingContext && !result
              ? 'Reading website…'
              : (hostname ?? 'Restricted page')}
          </h1>
        </div>
        {hostname && (
          <span
            className={`connection ${protocol === 'https:' ? 'https' : 'http'}`}
          >
            <LockKeyhole size={12} />
            {protocol === 'https:'
              ? 'HTTPS'
              : protocol === 'http:'
                ? 'HTTP'
                : '?'}
          </span>
        )}
      </section>
      {!loadingContext && !context?.supported && !result && (
        <div className="alert warning" role="status">
          <AlertCircle size={17} />
          <p>
            {context && !context.supported
              ? context.reason
              : 'No accessible website is active.'}
          </p>
        </div>
      )}
      <button
        className="scan-button"
        onClick={() => {
          void scan();
        }}
        disabled={
          loadingContext || scanning || (!context?.supported && !result)
        }
        aria-busy={scanning}
      >
        {scanning ? (
          <LoaderCircle className="spin" size={18} />
        ) : (
          <ScanLine size={18} />
        )}{' '}
        {scanning
          ? 'Collecting observable resources…'
          : result
            ? 'Scan Website Again'
            : 'Scan Website'}
      </button>
      <p className="scan-consent">
        Runs locally on this tab. Pairing and scan uploads are optional and
        require separate approval.
      </p>
      {error && (
        <div className="alert error" role="alert">
          <AlertCircle size={18} />
          <p>
            {error}
            {result ? ' The last completed snapshot is retained below.' : ''}
          </p>
        </div>
      )}
      <div className="scan-status" role="status" aria-live="polite">
        {scanning
          ? 'Reading top-level DOM resources and available Resource Timing entries. Previous results, if any, remain a snapshot.'
          : result && !error
            ? `Scan complete. ${result.trackers.length} reference-provider matches; ${result.thirdPartyDomains.length} third-party site domains.`
            : ''}
      </div>
      {result ? (
        <ScanReport key={result.scannedAt} result={result} />
      ) : (
        <section className="ready-state">
          <div className="ready-icon">
            <Fingerprint size={38} />
          </div>
          <span className="eyebrow">OBSERVE. UNDERSTAND. DECIDE.</span>
          <h2>See the signals behind the page.</h2>
          <p>
            Inspect third-party resources, recognized provider domains, and
            observable transport signals with an explainable privacy indicator.
          </p>
          <div className="ready-facts">
            <span>
              01 <b>Real browser observations</b>
            </span>
            <span>
              02 <b>Transparent local matching</b>
            </span>
            <span>
              03 <b>Every score deduction explained</b>
            </span>
          </div>
          <p className="ready-disclaimer">
            A snapshot cannot prove a website is safe or tracker-free. HTTPS
            alone is not a privacy guarantee.
          </p>
        </section>
      )}
      <Suspense
        fallback={<p role="status">Loading optional account controls…</p>}
      >
        <SyncPanel
          key={result?.scannedAt ?? 'no-scan'}
          result={result}
          scanning={scanning}
        />
      </Suspense>
      <footer>
        <Shield size={12} /> Local results live only while this popup stays
        open.
      </footer>
    </main>
  );
}
