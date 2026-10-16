import { useState, type FormEvent } from 'react';
import { z } from 'zod';
import { detailSchema, listSchema, query, request } from '../services/api';
import { useResource } from '../hooks/useResource';
import {
  date,
  Empty,
  ResourceState,
  ScanTable,
  Score,
} from '../components/DataUI';
export default function History({
  scanId,
  open,
}: {
  scanId?: string;
  open: (id?: string) => void;
}) {
  const [filters, setFilters] = useState({
    hostname: '',
    from: '',
    to: '',
    sort: 'scannedAt',
    order: 'desc',
  });
  const [page, setPage] = useState(1);
  const [filterError, setFilterError] = useState('');
  const state = useResource(
    scanId ? null : `/scans${query({ ...filters, page, limit: 10 })}`,
    listSchema,
  );
  function filter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const from = String(form.get('from') ?? '');
    const to = String(form.get('to') ?? '');
    if (from && to && from > to) {
      setFilterError('The start date must precede the end date.');
      return;
    }
    setFilterError('');
    setPage(1);
    setFilters({
      hostname: String(form.get('hostname')).trim().toLowerCase(),
      from: from ? new Date(`${from}T00:00:00.000Z`).toISOString() : '',
      to: to ? new Date(`${to}T23:59:59.999Z`).toISOString() : '',
      sort: String(form.get('sort')),
      order: String(form.get('order')),
    });
  }
  if (scanId) return <ScanDetail id={scanId} back={() => open()} />;
  return (
    <>
      <div className="page-heading">
        <span className="eyebrow">EVIDENCE OVER ASSUMPTIONS</span>
        <h1>Scan history</h1>
        <p>
          Your retained records. Search uses an exact hostname; dates use UTC.
        </p>
      </div>
      <form className="panel filters" onSubmit={filter}>
        <label>
          Website hostname
          <input
            name="hostname"
            placeholder="example.com"
            maxLength={253}
            defaultValue={filters.hostname}
          />
        </label>
        <label>
          From
          <input name="from" type="date" />
        </label>
        <label>
          Through
          <input name="to" type="date" />
        </label>
        <label>
          Sort
          <select name="sort" defaultValue={filters.sort}>
            <option value="scannedAt">Scan date</option>
            <option value="privacyScore">Privacy score</option>
            <option value="hostname">Hostname</option>
          </select>
        </label>
        <label>
          Order
          <select name="order" defaultValue={filters.order}>
            <option value="desc">Descending</option>
            <option value="asc">Ascending</option>
          </select>
        </label>
        <button className="primary">Apply filters</button>
        {filterError && <p role="alert">{filterError}</p>}
      </form>
      <ResourceState {...state}>
        {state.data &&
          (state.data.items.length ? (
            <section className="panel">
              <ScanTable items={state.data.items} open={open} />
              <div className="pagination">
                <span>
                  {state.data.total} records · Page {page} of{' '}
                  {state.data.totalPages}
                </span>
                <button disabled={page <= 1} onClick={() => setPage(page - 1)}>
                  Previous
                </button>
                <button
                  disabled={page >= state.data.totalPages}
                  onClick={() => setPage(page + 1)}
                >
                  Next
                </button>
              </div>
            </section>
          ) : (
            <Empty title="No matching scans">
              <p>
                Try another hostname or date range. Only your saved, retained
                records appear here.
              </p>
            </Empty>
          ))}
      </ResourceState>
    </>
  );
}
function ScanDetail({ id, back }: { id: string; back: () => void }) {
  const state = useResource(`/scans/${encodeURIComponent(id)}`, detailSchema);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function remove() {
    setBusy(true);
    setError('');
    try {
      await request(`/scans/${encodeURIComponent(id)}`, z.undefined(), {
        method: 'DELETE',
        body: {},
      });
      back();
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const scan = state.data?.scan;
  return (
    <>
      <button onClick={back}>← Back to history</button>
      <ResourceState {...state}>
        {scan && (
          <>
            <section className="panel report-heading">
              <div>
                <span className="eyebrow">SAVED SCAN REPORT</span>
                <h1>{scan.hostname}</h1>
                <p>
                  {date(scan.scannedAt)} · {scan.httpsStatus.toUpperCase()}
                </p>
              </div>
              <Score value={scan.privacyScore} />
            </section>
            <div className="two-columns">
              <section className="panel">
                <h2>Exposure summary</h2>
                <p>
                  {scan.trackerMatchCount} tracker matches ·{' '}
                  {scan.thirdPartyDomainCount} third-party domains ·{' '}
                  {scan.concernLevel} concern
                </p>
                <h3>How to interpret this score</h3>
                <p>
                  <strong>
                    {scan.analysis
                      ? `${scan.analysis.scoringVersion} · ${scan.analysis.datasetVersion} · ${scan.analysis.coverage} coverage`
                      : 'Legacy / unversioned score — original methodology, dataset and coverage are unknown.'}
                  </strong>
                </p>
                {scan.analysis && (
                  <details>
                    <summary>Reported score deductions</summary>
                    {scan.analysis.components.map((component) => (
                      <p key={component.id}>
                        <strong>
                          {component.label}: −{component.deduction}
                        </strong>{' '}
                        · {component.explanation}
                      </p>
                    ))}
                    <p>
                      Client-reported metadata, not independently verified by
                      the server.{' '}
                      {scan.analysis.assessment.domAvailable
                        ? 'DOM available'
                        : 'DOM missing'}{' '}
                      ·{' '}
                      {scan.analysis.assessment.timingAvailable
                        ? 'Timing available'
                        : 'Timing missing'}{' '}
                      ·{' '}
                      {scan.analysis.assessment.truncated
                        ? 'Collection capped'
                        : 'Not capped'}
                    </p>
                  </details>
                )}
                <p>
                  Higher scores mean fewer observed exposure signals. The local
                  scanner deducts for HTTP, known tracker providers,
                  unclassified third parties, and insecure resource references.
                  This stored record contains the reported result, not the
                  originally reported result. Historical scores are never
                  recalculated using today's reference. Only versioned records
                  carry their reported weighted deductions.
                </p>
                <p>
                  Resource timing and page elements provide partial evidence.
                  Blocked requests, consent state, caching, and cross-frame
                  activity can change observations.
                </p>
              </section>
              <section className="panel">
                <h2>Recommendations</h2>
                <p>
                  {scan.httpsStatus === 'http'
                    ? 'Prefer an HTTPS version before entering sensitive information.'
                    : scan.httpsStatus === 'https'
                      ? 'HTTPS protects transport, but does not establish trustworthy data practices.'
                      : 'Transport information is unknown; verify the page protocol before submitting sensitive data.'}
                </p>
                <p>
                  {scan.trackerMatchCount > 0
                    ? 'Review consent choices and restrict optional tracking. Investigate matched domains in Tracker Intelligence.'
                    : 'No tracker matches were reported. This does not prove that tracking is absent.'}
                </p>
                <p>
                  Compare repeated scans under similar conditions before
                  interpreting score changes.
                </p>
              </section>
            </div>
            <section className="panel">
              <h2>Saved evidence ({scan.findings.length})</h2>
              {scan.findings.length ? (
                scan.findings.map((finding) => (
                  <article className="finding" key={finding.id}>
                    <div>
                      <strong>{finding.evidenceHostname}</strong>
                      <span className="tag">
                        {finding.category} · {finding.severity}
                      </span>
                    </div>
                    <p>{finding.description}</p>
                  </article>
                ))
              ) : (
                <p>No normalized findings were saved with this record.</p>
              )}
            </section>
            <section className="panel danger">
              <h2>Delete this scan</h2>
              {confirm ? (
                <div role="group" aria-label="Confirm scan deletion">
                  <p>This permanently deletes the record and its findings.</p>
                  <button disabled={busy} onClick={() => void remove()}>
                    {busy ? 'Deleting…' : 'Confirm delete scan'}
                  </button>
                  <button disabled={busy} onClick={() => setConfirm(false)}>
                    Cancel
                  </button>
                </div>
              ) : (
                <button onClick={() => setConfirm(true)}>Delete scan</button>
              )}
              {error && <p role="alert">{error}</p>}
            </section>
          </>
        )}
      </ResourceState>
    </>
  );
}
