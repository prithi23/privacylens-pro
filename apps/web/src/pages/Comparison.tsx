import { useState } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';
import { compareSchema, domainsSchema, query } from '../services/api';
import { useResource } from '../hooks/useResource';
import { Empty, ResourceState, Score } from '../components/DataUI';
const colors = ['#22d3ee', '#a78bfa', '#fbbf24', '#34d399', '#fb7185'];
export default function Comparison() {
  const domains = useResource('/analytics/domains', domainsSchema);
  const [selected, setSelected] = useState<string[]>([]);
  const [submitted, setSubmitted] = useState<string[]>([]);
  const results = useResource(
    submitted.length >= 2
      ? `/analytics/compare${query({ hostnames: submitted.join(',') })}`
      : null,
    compareSchema,
  );
  return (
    <>
      <div className="page-heading">
        <span className="eyebrow">COMPARE OBSERVED EXPOSURE</span>
        <h1>Website comparison</h1>
        <p>Select two to five websites from your saved history.</p>
      </div>
      <ResourceState {...domains}>
        {domains.data &&
          (domains.data.items.length < 2 ? (
            <Empty title="Save scans for at least two websites">
              <p>
                Comparison uses persisted scan records, never sample statistics.
              </p>
            </Empty>
          ) : (
            <section className="panel">
              <fieldset>
                <legend>Saved websites</legend>
                <div className="domain-picker">
                  {domains.data.items.map((item) => (
                    <label key={item.hostname}>
                      <input
                        type="checkbox"
                        checked={selected.includes(item.hostname)}
                        disabled={
                          !selected.includes(item.hostname) &&
                          selected.length >= 5
                        }
                        onChange={(event) =>
                          setSelected(
                            event.target.checked
                              ? [...selected, item.hostname]
                              : selected.filter(
                                  (value) => value !== item.hostname,
                                ),
                          )
                        }
                      />
                      {item.hostname}
                      <small>{item.scans} scans</small>
                    </label>
                  ))}
                </div>
              </fieldset>
              <button
                className="primary"
                disabled={selected.length < 2}
                onClick={() => setSubmitted([...selected])}
              >
                Compare websites
              </button>
            </section>
          ))}
      </ResourceState>
      {submitted.length >= 2 && (
        <ResourceState {...results}>
          {results.data && (
            <>
              <div className="comparison-grid">
                {results.data.items.map((item) => (
                  <section className="panel" key={item.hostname}>
                    <h2>{item.hostname}</h2>
                    <Score value={item.latestScore} />
                    <p>Latest score · {item.scans} stored scans</p>
                    <dl>
                      <dt>Average score</dt>
                      <dd>{item.averageScore?.toFixed(1) ?? '—'}</dd>
                      <dt>Tracker matches (all retained scans)</dt>
                      <dd>{item.trackerMatches}</dd>
                      <dt>Latest third-party domains</dt>
                      <dd>{item.latest?.thirdPartyDomainCount ?? '—'}</dd>
                      <dt>Latest transport</dt>
                      <dd>
                        {item.latest?.httpsStatus.toUpperCase() ?? 'Unknown'}
                      </dd>
                      <dt>Change from first scan</dt>
                      <dd>
                        {item.scoreChangeFromFirst === null
                          ? '—'
                          : `${item.scoreChangeFromFirst > 0 ? '+' : ''}${item.scoreChangeFromFirst}`}
                      </dd>
                    </dl>
                  </section>
                ))}
              </div>
              <section className="panel">
                <h2>Recorded score history</h2>
                <p>
                  Historical reported scores may use different or unknown
                  methodologies. Original values are preserved; a score change
                  is not necessarily a behavior change.
                </p>
                <p>
                  Up to 100 most recent records per website. Points are observed
                  scans; gaps are not filled. Compare under similar consent and
                  browsing conditions.
                </p>
                <div className="chart">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart>
                      <CartesianGrid stroke="#263249" />
                      <XAxis
                        dataKey="timestamp"
                        type="number"
                        domain={['dataMin', 'dataMax']}
                        tickFormatter={(value: number) =>
                          new Date(value).toLocaleDateString()
                        }
                        stroke="#93a6c2"
                      />
                      <YAxis domain={[0, 100]} stroke="#93a6c2" />
                      <Tooltip
                        labelFormatter={(value) =>
                          new Date(Number(value)).toLocaleString()
                        }
                        contentStyle={{ background: '#101827' }}
                      />
                      {results.data.items.map((item, index) => (
                        <Line
                          key={item.hostname}
                          data={item.history
                            .map((point) => ({
                              timestamp: Date.parse(point.scannedAt),
                              score: point.privacyScore,
                            }))
                            .reverse()}
                          dataKey="score"
                          name={item.hostname}
                          stroke={colors[index]}
                          strokeWidth={2}
                          dot
                        />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                <div className="legend">
                  {results.data.items.map((item, index) => (
                    <span key={item.hostname} style={{ color: colors[index] }}>
                      {item.hostname}
                    </span>
                  ))}
                </div>
              </section>
            </>
          )}
        </ResourceState>
      )}
    </>
  );
}
