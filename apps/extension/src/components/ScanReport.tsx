import {
  Activity,
  Fingerprint,
  Globe2,
  Info,
  Lightbulb,
  ListChecks,
  ShieldCheck,
  Network,
  TriangleAlert,
} from 'lucide-react';
import type { ScanResult } from '../analysis/engine';
import { ScoreRing } from './ScoreRing';
import { useState } from 'react';

export function ScanReport({ result }: { result: ScanResult }) {
  const [hostLimit, setHostLimit] = useState(40);
  const concern =
    result.concernLevel === 'low'
      ? 'Lower observed exposure'
      : result.concernLevel === 'moderate'
        ? 'Moderate observed exposure'
        : result.concernLevel === 'high'
          ? 'Higher observed exposure'
          : 'Insufficient coverage';
  return (
    <div className="report">
      <section className="score-card" aria-labelledby="indicator-heading">
        <ScoreRing score={result.score} />
        <div className="score-copy">
          <span className="eyebrow">EXPLAINABLE INDICATOR</span>
          <h2 id="indicator-heading">Privacy score</h2>
          <span className={`concern ${result.concernLevel}`}>{concern}</span>
          <p>
            Higher = fewer observed exposure signals.
            <br />
            An indicator, never a safety certification.
          </p>
        </div>
      </section>
      <div className="snapshot-meta">
        <span title="Methodology and reference version apply only to this snapshot, never to older saved scores.">
          {result.scoringVersion} · {result.datasetVersion}
        </span>
        <span className={`coverage ${result.coverage}`}>
          <span />
          {result.coverage === 'snapshot'
            ? 'Top-level snapshot'
            : result.coverage === 'partial'
              ? 'Partial coverage'
              : 'Coverage unavailable'}
        </span>
        <time dateTime={result.scannedAt}>
          {new Date(result.scannedAt).toLocaleString(undefined, {
            dateStyle: 'short',
            timeStyle: 'short',
          })}
        </time>
      </div>
      {result.coverage !== 'snapshot' && (
        <div className="alert warning">
          <TriangleAlert size={17} />
          <p>
            Some signals are missing.{' '}
            {result.score === null
              ? 'The score is withheld.'
              : 'This score uses partial observations.'}{' '}
            Missing information is not evidence of safety.
          </p>
        </div>
      )}
      <section className="stat-grid" aria-label="Scan summary">
        <div>
          <Fingerprint size={17} />
          <strong>{result.trackers.length}</strong>
          <span>Provider matches</span>
        </div>
        <div>
          <Globe2 size={17} />
          <strong>{result.thirdPartyDomains.length}</strong>
          <span>Third-party domains</span>
        </div>
        <div>
          <Activity size={17} />
          <strong>{result.observationCount}</strong>
          <span>Resource observations</span>
        </div>
      </section>
      <div className="category-row" aria-label="Matched provider categories">
        {result.categories.length ? (
          result.categories.map(({ category, count }) => (
            <span className={`category ${category}`} key={category}>
              {category.replace('-', ' ')} <b>{count}</b>
            </span>
          ))
        ) : (
          <span className="muted">
            No reference-provider categories observed.
          </span>
        )}
      </div>
      <details className="finding-panel" open>
        <summary>
          <Fingerprint size={17} />
          <span>Recognized third-party providers</span>
          <b>{result.trackers.length}</b>
        </summary>
        <div className="panel-body">
          {result.trackers.length ? (
            result.trackers.map((tracker) => (
              <article className="tracker" key={tracker.id}>
                <div className="tracker-heading">
                  <h3>{tracker.name}</h3>
                  <span className="category">
                    {tracker.category.replace('-', ' ')}
                  </span>
                </div>
                <p>{tracker.description}</p>
                <span className="evidence-label">OBSERVED HOSTNAMES</span>
                {tracker.hostnames.map((hostname) => (
                  <code key={hostname}>{hostname}</code>
                ))}
                <p className="reference">
                  <span title="Confidence applies to hostname association only. No inference that tracking executed, personal data was transmitted, or malware is present.">
                    {tracker.rule} · reference association only
                  </span>
                  <br />
                  Reference rule: {tracker.referenceDomains.join(', ')} ·
                  once-per-provider weight: {tracker.weight}
                </p>
              </article>
            ))
          ) : (
            <div className="honest-empty">
              <ShieldCheck size={24} />
              <h3>No known provider matches in this snapshot.</h3>
              <p>
                This does not establish that the site is tracker-free. The local
                reference is curated and incomplete. Unclassified resources are
                not automatically trackers.
              </p>
            </div>
          )}
          <p className="panel-note">
            Observed hostname + local domain rule → heuristic provider
            classification. This is not proof that tracking ran or that a
            service is harmful.
          </p>
        </div>
      </details>
      <details className="finding-panel">
        <summary>
          <Network size={17} />
          <span>Resource evidence</span>
          <b>{result.hosts.length} hosts</b>
        </summary>
        <div className="panel-body">
          <p className="panel-note">
            {result.domCount} DOM observations · {result.timingCount} timing
            observations. Sources can overlap; these are not unique network
            request counts. Third parties are grouped by public-suffix-aware
            site domain, including private suffixes.
          </p>
          {result.hosts.length ? (
            result.hosts.slice(0, hostLimit).map((host) => (
              <article className="host" key={host.hostname}>
                <div>
                  <code>{host.hostname}</code>
                  <span
                    className={host.thirdParty ? 'third-party' : 'first-party'}
                  >
                    {host.thirdParty ? 'third party' : 'same site'}
                  </span>
                </div>
                <p>
                  {host.kinds.join(', ')} · {host.sources.join(' + ')} ·{' '}
                  {host.protocols
                    .map((protocol) => protocol.replace(':', '').toUpperCase())
                    .join(' / ')}
                </p>
                <small>Site domain: {host.siteDomain}</small>
              </article>
            ))
          ) : (
            <p>
              No HTTP(S) resource hostnames were observed in the available
              sources.
            </p>
          )}
          {hostLimit < result.hosts.length && (
            <button
              className="more-evidence"
              onClick={() => setHostLimit((limit) => limit + 40)}
            >
              Show more hosts ({Math.min(hostLimit, result.hosts.length)} of{' '}
              {result.hosts.length} shown)
            </button>
          )}
        </div>
      </details>
      <details className="finding-panel">
        <summary>
          <ShieldCheck size={17} />
          <span>Security observations</span>
          <b>{result.insecureHostnames.length ? 'Review' : 'Facts'}</b>
        </summary>
        <div className="panel-body">
          <div className="security-fact">
            <span className="fact-label">OBSERVED</span>
            <p>
              Page protocol:{' '}
              <strong>
                {result.protocol === 'unknown'
                  ? 'unknown'
                  : result.protocol.replace(':', '').toUpperCase()}
              </strong>
              .{' '}
              {result.protocol === 'https:'
                ? 'HTTPS does not establish privacy or certificate validity.'
                : result.protocol === 'http:'
                  ? 'The page connection is unencrypted HTTP.'
                  : 'No transport conclusion is available.'}
            </p>
          </div>
          <div className="security-fact">
            <span className="fact-label">OBSERVED REFERENCES</span>
            <p>
              {result.protocol === 'https:'
                ? `${result.insecureHostnames.length} unique hostname(s) referenced over HTTP on this HTTPS page.`
                : 'Mixed-reference scoring applies only to HTTPS pages; HTTP pages already receive the page-transport deduction.'}
            </p>
            {result.insecureHostnames.map((hostname) => (
              <code key={hostname}>{hostname}</code>
            ))}
            <p className="panel-note">
              References may be blocked or upgraded. This scan cannot establish
              an insecure request completed.
            </p>
          </div>
          <div className="security-fact">
            <span className="unknown-label">UNSUPPORTED CHECKS</span>
            <p>
              Cookies, TLS certificate validation, security headers,
              fingerprinting and server-side tracking are not inspected.
            </p>
          </div>
        </div>
      </details>
      <details className="finding-panel">
        <summary>
          <ListChecks size={17} />
          <span>How the score is calculated</span>
          <b>
            −
            {result.components.reduce(
              (sum, component) => sum + component.deduction,
              0,
            )}
          </b>
        </summary>
        <div className="panel-body">
          <p className="formula">
            {result.score === null
              ? 'Score withheld: insufficient known signals.'
              : `100 − ${result.components.map((component) => component.deduction).join(' − ')} = ${result.score} (clamped to 0–100)`}
          </p>
          {result.components.map((component) => (
            <article className="score-rule" key={component.id}>
              <div>
                <h3>{component.label}</h3>
                <b>−{component.deduction}</b>
              </div>
              <p>{component.explanation}</p>
            </article>
          ))}
          <p className="panel-note">
            Provider categories determine each provider’s weight; no separate
            category penalty is added. Repeated sightings and provider
            subdomains do not add tracker penalties. Other-domain counts exclude
            recognized provider site domains.
          </p>
        </div>
      </details>
      <details className="finding-panel" open>
        <summary>
          <Lightbulb size={17} />
          <span>Recommended next steps</span>
        </summary>
        <div className="panel-body">
          <ol className="recommendations">
            {result.recommendations.map((text) => (
              <li key={text}>{text}</li>
            ))}
          </ol>
        </div>
      </details>
      <details className="finding-panel limitations">
        <summary>
          <Info size={17} />
          <span>Coverage, unknowns & limitations</span>
        </summary>
        <div className="panel-body">
          <ul>
            {result.limitations.map((text) => (
              <li key={text}>{text}</li>
            ))}
          </ul>
          <p className="panel-note">
            Rules: score-v1 · Dataset: {result.datasetVersion} · No cloud
            synchronization
          </p>
        </div>
      </details>
    </div>
  );
}
