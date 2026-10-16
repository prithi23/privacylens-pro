import { useState, type FormEvent } from 'react';
import { Fingerprint } from 'lucide-react';
import { providersSchema, query } from '../services/api';
import { useResource } from '../hooks/useResource';
import { Empty, ResourceState } from '../components/DataUI';
import { referenceSchema } from '../services/research';
import { z } from 'zod';
const evidenceSchema = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      evidenceHostname: z.string(),
      category: z.string(),
      description: z.string(),
      scan: z.object({
        id: z.string(),
        hostname: z.string(),
        scannedAt: z.string(),
      }),
    }),
  ),
});
export default function Intelligence() {
  const [search, setSearch] = useState('');
  const reference = useResource('/research/reference', referenceSchema);
  const evidence = useResource('/research/evidence', evidenceSchema);
  const [category, setCategory] = useState('all');
  const state = useResource(
    `/analytics/providers${query({ q: search })}`,
    providersSchema,
  );
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSearch(String(new FormData(event.currentTarget).get('q')).trim());
  }
  return (
    <>
      <div className="page-heading">
        <span className="eyebrow">KNOW THE SIGNALS</span>
        <h1>Tracker intelligence</h1>
        <p>
          Provider and domain reference records read directly from PostgreSQL.
        </p>
      </div>
      <form className="panel filters" onSubmit={submit}>
        <label>
          Search provider, category, or domain
          <input
            type="search"
            name="q"
            maxLength={100}
            placeholder="Google, analytics, hotjar.com…"
          />
        </label>
        <button className="primary">Search reference</button>
        <label>
          Classification
          <select
            value={category}
            onChange={(event) => setCategory(event.target.value)}
          >
            <option value="all">All categories</option>
            {[
              'advertising',
              'analytics',
              'social',
              'session-replay',
              'other',
            ].map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
      </form>
      <ResourceState {...reference}>
        {reference.data && (
          <section className="panel">
            <h2>Bundled classifier & methodology</h2>
            <p>
              {reference.data.dataset.version} · reviewed{' '}
              {reference.data.dataset.reviewedAt} ·{' '}
              {reference.data.dataset.license} ·{' '}
              {reference.data.dataset.providerCount} providers /{' '}
              {reference.data.dataset.domainCount} domains
            </p>
            <p>{reference.data.dataset.coverage}</p>
            <h3>{reference.data.methodology.version}</h3>
            <p>{reference.data.methodology.description}</p>
            <p>
              Provider deductions:{' '}
              {Object.entries(reference.data.methodology.weights)
                .map(([key, value]) => `${key} ${value}`)
                .join(' · ')}
              . Domain association confidence does not measure actual tracking
              or privacy compliance.
            </p>
            <a href="#/evaluation" className="cyan">
              View measured evaluation and limitations →
            </a>
          </section>
        )}
      </ResourceState>
      <div className="notice">
        Privacy tracking is not malware detection. A domain reference match
        indicates a known provider association; it does not establish malicious
        intent or prove a request transmitted personal data. The small curated
        reference is not exhaustive.
      </div>
      <ResourceState {...state}>
        {state.data &&
          (state.data.items.length ? (
            <div className="two-columns">
              {state.data.items
                .filter(
                  (provider) =>
                    category === 'all' || provider.category === category,
                )
                .map((provider) => (
                  <article className="panel" key={provider.id}>
                    <Fingerprint className="cyan" size={26} />
                    <h2>{provider.name}</h2>
                    <span className="tag">{provider.category}</span>
                    <p>{provider.description}</p>
                    <p>
                      {provider.referenceMetadata
                        ? `${provider.referenceMetadata.datasetVersion} · ${provider.referenceMetadata.rule} · ${provider.referenceMetadata.license}`
                        : 'Legacy reference metadata; source version unknown.'}
                    </p>
                    {provider.referenceMetadata?.sources.map((source) => (
                      <p key={source}>
                        <a
                          className="cyan"
                          href={source}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Vendor source ↗
                        </a>
                      </p>
                    ))}
                    <h3>Associated domains</h3>
                    <div className="domain-list">
                      {provider.domains.map((domain) => (
                        <code key={domain}>{domain}</code>
                      ))}
                    </div>
                    <p className="muted">
                      Detection context: exact hostname or a boundary-matched
                      subdomain in saved evidence. Embedded page references and
                      resource timing have limited coverage.
                    </p>
                  </article>
                ))}
            </div>
          ) : (
            <Empty title="No reference providers found">
              <p>Try another provider name, domain, or category.</p>
            </Empty>
          ))}
      </ResourceState>
      <ResourceState {...evidence}>
        <section className="panel">
          <h2>Your recent saved evidence</h2>
          <p>
            Up to 20 retained owner findings, not a live scan or proof of
            tracking execution.
          </p>
          {evidence.data?.items.length ? (
            evidence.data.items.map((item) => (
              <article className="finding" key={item.id}>
                <a className="cyan" href={`#/history/${item.scan.id}`}>
                  {item.scan.hostname} · {item.evidenceHostname}
                </a>
                <p>
                  {item.category} ·{' '}
                  {new Date(item.scan.scannedAt).toLocaleString()}
                </p>
                <p>{item.description}</p>
              </article>
            ))
          ) : (
            <p>No retained findings are available for this account.</p>
          )}
        </section>
      </ResourceState>
    </>
  );
}
