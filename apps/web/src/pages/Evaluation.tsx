import { useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useResource } from '../hooks/useResource';
import { evaluationSchema } from '../services/research';
import { ResourceState } from '../components/DataUI';
const percentage = (value: number | null) =>
  value === null ? '—' : `${(value * 100).toFixed(1)}%`;
export default function Evaluation() {
  const state = useResource('/research/evaluation', evaluationSchema);
  const [scope, setScope] = useState<'overall' | 'observable' | 'stress'>(
    'overall',
  );
  const [outcome, setOutcome] = useState('all');
  const [search, setSearch] = useState('');
  const data = state.data;
  const metrics = data?.[scope];
  const rows = data?.cases.filter(
    (row) =>
      (scope === 'overall' ||
        (scope === 'stress' ? row.stress : !row.stress)) &&
      (outcome === 'all' || row.outcome === outcome) &&
      `${row.id} ${row.family} ${row.rationale}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  return (
    <>
      <div className="page-heading">
        <span className="eyebrow">REPRODUCIBLE RESEARCH</span>
        <h1>Evaluation lab</h1>
        <p>
          Measured controlled-fixture results. No Internet-wide effectiveness
          claim.
        </p>
      </div>
      <ResourceState {...state}>
        {data && metrics && (
          <>
            <section className="panel">
              <h2>Experiment provenance</h2>
              <p>
                Measured {new Date(data.measuredAt).toLocaleString()} ·{' '}
                {data.dataset.version} · {data.scoringVersion}
              </p>
              <p>
                {data.dataset.providerCount} reference providers /{' '}
                {data.dataset.domainCount} domains · Source fingerprint{' '}
                <code title={data.sourceFingerprint}>
                  {data.sourceFingerprint.slice(0, 16)}
                </code>
              </p>
              <p>{data.methodology}</p>
              <label>
                Evaluation scope
                <select
                  value={scope}
                  onChange={(event) =>
                    setScope(event.target.value as typeof scope)
                  }
                >
                  <option value="overall">
                    All scenarios, including expected misses
                  </option>
                  <option value="observable">
                    Observable domain cases only
                  </option>
                  <option value="stress">
                    Coverage stress / restricted cases
                  </option>
                </select>
              </label>
            </section>
            <div className="metric-grid">
              {[
                ['Precision', percentage(metrics.precision)],
                ['Recall', percentage(metrics.recall)],
                ['F1 score', percentage(metrics.f1)],
                ['Labeled cases', String(metrics.total)],
              ].map(([label, value]) => (
                <section className="panel metric" key={label}>
                  <p>{label}</p>
                  <strong>{value}</strong>
                </section>
              ))}
            </div>
            <div className="two-columns">
              <section className="panel">
                <h2>Confusion counts</h2>
                <p>
                  One scenario per sample; provider-domain association is the
                  detection target.
                </p>
                <div className="chart">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={[
                        { outcome: 'TP', count: metrics.truePositives },
                        { outcome: 'FP', count: metrics.falsePositives },
                        { outcome: 'TN', count: metrics.trueNegatives },
                        { outcome: 'FN', count: metrics.falseNegatives },
                      ]}
                    >
                      <CartesianGrid stroke="#263249" />
                      <XAxis dataKey="outcome" stroke="#a8b6cb" />
                      <YAxis allowDecimals={false} stroke="#a8b6cb" />
                      <Tooltip contentStyle={{ background: '#101827' }} />
                      <Bar dataKey="count" fill="#22d3ee" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <p>
                  TP {metrics.truePositives} · FP {metrics.falsePositives} · TN{' '}
                  {metrics.trueNegatives} · FN {metrics.falseNegatives}
                </p>
              </section>
              <section className="panel">
                <h2>Fixture category distribution</h2>
                <p>
                  Provider associations across the fixed corpus, independent of
                  the selected scope.
                </p>
                <div className="chart">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data.categoryDistribution}>
                      <XAxis dataKey="category" stroke="#a8b6cb" />
                      <YAxis allowDecimals={false} stroke="#a8b6cb" />
                      <Tooltip contentStyle={{ background: '#101827' }} />
                      <Bar dataKey="count" fill="#a78bfa" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </section>
            </div>
            <section className="panel">
              <h2>Measured CPU latency</h2>
              <p>{data.matching.workload}</p>
              <dl>
                <dt>Linear lookup median / p95</dt>
                <dd>
                  {data.matching.linear.medianMs.toFixed(3)} /{' '}
                  {data.matching.linear.p95Ms.toFixed(3)} ms
                </dd>
                <dt>Indexed lookup median / p95</dt>
                <dd>
                  {data.matching.indexed.medianMs.toFixed(3)} /{' '}
                  {data.matching.indexed.p95Ms.toFixed(3)} ms
                </dd>
                <dt>Phase 5 full analysis median</dt>
                <dd>{data.analysis.baseline.medianMs.toFixed(3)} ms</dd>
                <dt>Current full analysis median</dt>
                <dd>{data.analysis.current.medianMs.toFixed(3)} ms</dd>
              </dl>
              <p>
                Full-analysis workloads use the same 1,000 observations; dataset
                size and metadata differ. Timings exclude DOM collection/network
                and are environment-dependent.
              </p>
            </section>
            <section className="panel">
              <h2>Labeled case evidence</h2>
              <div className="filters">
                <label>
                  Search cases
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    type="search"
                  />
                </label>
                <label>
                  Outcome
                  <select
                    value={outcome}
                    onChange={(event) => setOutcome(event.target.value)}
                  >
                    <option value="all">All outcomes</option>
                    {['TP', 'FP', 'TN', 'FN'].map((value) => (
                      <option key={value}>{value}</option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Case</th>
                      <th>Outcome</th>
                      <th>Observed providers</th>
                      <th>Coverage / score</th>
                      <th>Median / p95 ms</th>
                      <th>Ground truth rationale</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows?.map((row) => (
                      <tr key={row.id}>
                        <td>
                          {row.id}
                          <br />
                          <small>{row.family}</small>
                        </td>
                        <td>{row.outcome}</td>
                        <td>
                          {row.providers.join(', ') || 'No reference match'}
                        </td>
                        <td>
                          {row.coverage} / {row.score ?? 'Withheld'}
                        </td>
                        <td>
                          {row.latency.medianMs.toFixed(3)} /{' '}
                          {row.latency.p95Ms.toFixed(3)}
                        </td>
                        <td className="research-rationale">{row.rationale}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!rows?.length && <p>No cases match the current filters.</p>}
            </section>
            <section className="notice">
              <h2>Research limits</h2>
              {data.limitations.map((limit) => (
                <p key={limit}>{limit}</p>
              ))}
              <p>
                Reproduce with <code>npm run evaluate</code>. Measurements are
                generated locally from checked-in labels and the actual engine;
                no statistics are simulated in this page.
              </p>
            </section>
          </>
        )}
      </ResourceState>
    </>
  );
}
