import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
} from 'recharts';
import { Activity, Globe, ShieldCheck, Fingerprint } from 'lucide-react';
import { overviewSchema } from '../services/api';
import { useResource } from '../hooks/useResource';
import { Empty, ResourceState, ScanTable } from '../components/DataUI';
export default function Overview({ open }: { open: (id: string) => void }) {
  const state = useResource('/analytics/overview', overviewSchema);
  const data = state.data;
  return (
    <ResourceState {...state}>
      <div className="page-heading">
        <span className="eyebrow">YOUR PRIVACY, IN FOCUS</span>
        <h1>Privacy overview</h1>
        <p>A clear view of your retained, PostgreSQL-backed scan history.</p>
      </div>
      {data && (
        <>
          <div className="metric-grid">
            {(
              [
                ['Stored scans', data.metrics.totalScans, Activity],
                ['Websites', data.metrics.uniqueDomains, Globe],
                [
                  'Average score',
                  data.metrics.averageScore === null
                    ? '—'
                    : data.metrics.averageScore.toFixed(1),
                  ShieldCheck,
                ],
                ['Tracker matches', data.metrics.trackerMatches, Fingerprint],
              ] as const
            ).map(([label, value, MetricIcon]) => {
              return (
                <section className="panel metric" key={label}>
                  <MetricIcon size={20} />
                  <p>{label}</p>
                  <strong>{String(value)}</strong>
                </section>
              );
            })}
          </div>
          {data.metrics.totalScans === 0 ? (
            <Empty />
          ) : (
            <>
              <div className="two-columns">
                <section className="panel">
                  <h2>Privacy score trend</h2>
                  <p>
                    Daily averages · UTC · Higher means fewer observed exposure
                    signals.
                  </p>
                  <div
                    className="chart"
                    role="img"
                    aria-label={`Privacy score trend across ${data.trends.length} recorded days`}
                  >
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={data.trends}>
                        <CartesianGrid stroke="#263249" />
                        <XAxis dataKey="date" stroke="#93a6c2" />
                        <YAxis domain={[0, 100]} stroke="#93a6c2" />
                        <Tooltip
                          contentStyle={{
                            background: '#101827',
                            borderColor: '#334155',
                          }}
                        />
                        <Line
                          type="monotone"
                          dataKey="averageScore"
                          name="Average score"
                          stroke="#22d3ee"
                          strokeWidth={3}
                          dot
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </section>
                <section className="panel">
                  <h2>Finding categories</h2>
                  <p>
                    Normalized finding rows, not unique provider executions.
                  </p>
                  {data.trackerDistribution.length ? (
                    <div
                      className="chart"
                      role="img"
                      aria-label="Finding counts by category"
                    >
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={data.trackerDistribution}>
                          <XAxis dataKey="category" stroke="#93a6c2" />
                          <YAxis allowDecimals={false} stroke="#93a6c2" />
                          <Tooltip contentStyle={{ background: '#101827' }} />
                          <Bar
                            dataKey="findingCount"
                            name="Findings"
                            fill="#a78bfa"
                            radius={[5, 5, 0, 0]}
                          />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <p>No saved findings in this history.</p>
                  )}
                </section>
              </div>
              <section className="panel">
                <h2>Frequently observed providers</h2>
                <p>
                  Distinct scans with finding hostnames matching the database
                  reference. Matches do not establish malware or confirm data
                  transmission.
                </p>
                <div className="provider-summary">
                  {data.frequentProviders.length ? (
                    data.frequentProviders.map((provider) => (
                      <div key={provider.name}>
                        <strong>{provider.name}</strong>
                        <span>{provider.scanCount} scans</span>
                      </div>
                    ))
                  ) : (
                    <p>No reference-provider matches in saved findings.</p>
                  )}
                </div>
              </section>
              <section className="panel">
                <h2>Recent scans</h2>
                <ScanTable items={data.recentScans} open={open} />
              </section>
            </>
          )}
          <p className="notice">
            {data.scoreVersions
              ?.map((item) => `${item.version}: ${item.scans} scans`)
              .join(' · ')}{' '}
            Historical methodology versions may differ; aggregates retain
            reported values rather than reinterpreting them. Scores and counts
            are authenticated client-reported metadata. The server does not
            rescan websites or certify their safety. Local-only extension
            results do not appear here automatically.
          </p>
        </>
      )}
    </ResourceState>
  );
}
