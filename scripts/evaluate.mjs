import { build } from 'esbuild';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
const root = fileURLToPath(new URL('../', import.meta.url));
const sources = [
  'apps/extension/src/analysis/engine.ts',
  'packages/shared/src/trackers.ts',
  'packages/shared/src/classification.ts',
  'packages/shared/src/methodology.ts',
  'packages/shared/src/domains.ts',
  'packages/shared/src/research-metrics.ts',
  'fixtures/research/cases.ts',
  'packages/shared/src/observations.ts',
  'packages/shared/src/analysis.ts',
  'package-lock.json',
  'scripts/evaluate.mjs',
];
const fingerprint = createHash('sha256');
for (const file of sources)
  fingerprint
    .update(file)
    .update((await readFile(`${root}/${file}`, 'utf8')).replace(/\r\n/g, '\n'));
const sourceFingerprint = fingerprint.digest('hex');
const target = `${root}/docs/research/evaluation.json`;
if (process.argv.includes('--check')) {
  const existing = JSON.parse(await readFile(target, 'utf8'));
  if (existing.sourceFingerprint !== sourceFingerprint)
    throw new Error(
      'Research artifact is stale. Run npm run evaluate and review the measured report.',
    );
  console.log(
    'Research report fingerprint matches classifier, methodology and labeled fixtures.',
  );
  process.exit(0);
}
await mkdir(`${root}/.browser-smoke`, { recursive: true });
await mkdir(`${root}/docs/research`, { recursive: true });
await build({
  stdin: {
    contents:
      "export {analyzePage} from './apps/extension/src/analysis/engine.ts'; export {researchCases} from './fixtures/research/cases.ts'; export {confusion,latency} from './packages/shared/src/research-metrics.ts'; export {trackerProviders,datasetMetadata} from './packages/shared/src/trackers.ts'; export {matchReference} from './packages/shared/src/classification.ts'; export {matchesDomain} from './packages/shared/src/domains.ts';",
    resolveDir: root,
  },
  outfile: `${root}/.browser-smoke/research.mjs`,
  bundle: true,
  platform: 'node',
  format: 'esm',
});
const {
  analyzePage,
  researchCases,
  confusion,
  latency,
  trackerProviders,
  datasetMetadata,
  matchReference,
  matchesDomain,
} = await import(pathToFileURL(`${root}/.browser-smoke/research.mjs`).href);
const categoryCounts = new Map();
const cases = researchCases.map((fixture) => {
  for (let index = 0; index < 3; index++) analyzePage(fixture.observation);
  const samples = Array.from({ length: 25 }, () => {
    const start = performance.now();
    analyzePage(fixture.observation);
    return performance.now() - start;
  });
  const result = analyzePage(fixture.observation);
  result.trackers.forEach((provider) =>
    categoryCounts.set(
      provider.category,
      (categoryCounts.get(provider.category) ?? 0) + 1,
    ),
  );
  const predicted = result.trackers.length > 0;
  return {
    id: fixture.id,
    family: fixture.family,
    stress: fixture.stress,
    rationale: fixture.rationale,
    expected: fixture.expected,
    predicted,
    outcome: fixture.expected
      ? predicted
        ? 'TP'
        : 'FN'
      : predicted
        ? 'FP'
        : 'TN',
    providers: result.trackers.map((provider) => provider.id),
    score: result.score,
    coverage: result.coverage,
    latency: latency(samples),
  };
});
const hosts = Array.from({ length: 1000 }, (_, index) =>
  index % 5 === 0 ? 'www.google-analytics.com' : `cdn-${index}.example.net`,
);
const naive = (host) =>
  trackerProviders
    .filter((provider) =>
      provider.domains.some((domain) => matchesDomain(host, domain)),
    )
    .map((provider) => provider.id)
    .sort();
for (const host of hosts)
  if (
    JSON.stringify(naive(host)) !==
    JSON.stringify(
      [...new Set(matchReference(host).map((item) => item.provider.id))].sort(),
    )
  )
    throw new Error('Indexed and linear reference matching disagree');
function measure(operation) {
  for (let i = 0; i < 5; i++) operation();
  return latency(
    Array.from({ length: 30 }, () => {
      const start = performance.now();
      operation();
      return performance.now() - start;
    }),
  );
}
const matching = {
  workload:
    '1000 host lookups; identical 13-provider dataset; 5 warmups and 30 samples; excludes DOM/network',
  linear: measure(() => hosts.forEach(naive)),
  indexed: measure(() => hosts.forEach(matchReference)),
};
const input = {
  hostname: 'example.com',
  protocol: 'https:',
  scannedAt: '2026-10-16T10:00:00.000Z',
  domStatus: 'available',
  timingStatus: 'available',
  truncated: false,
  ignoredResourceCount: 0,
  resources: hosts.map((hostname) => ({
    hostname,
    protocol: 'https:',
    kind: 'script',
    source: 'dom',
  })),
};
const analysis = {
  current: measure(() => analyzePage(input)),
  baseline: JSON.parse(
    await readFile(`${root}/docs/research/phase5-baseline.json`, 'utf8'),
  ),
};
const report = {
  reportVersion: 1,
  measuredAt: new Date().toISOString(),
  environment: { runtime: process.version, platform: process.platform },
  sourceFingerprint,
  dataset: {
    ...datasetMetadata,
    providerCount: trackerProviders.length,
    domainCount: trackerProviders.reduce(
      (sum, provider) => sum + provider.domains.length,
      0,
    ),
  },
  scoringVersion: 'exposure-v2',
  methodology:
    'One independently labeled scenario per row. TP/TN/FP/FN assess provider-domain exposure under the fixture design, not actual tracking execution. Includes deliberate out-of-band coverage-stress misses. CPU timings use performance.now, warmup and repeated samples; no DOM/network timing is implied.',
  overall: confusion(cases),
  observable: confusion(cases.filter((row) => !row.stress)),
  stress: confusion(cases.filter((row) => row.stress)),
  categoryDistribution: [...categoryCounts].map(([category, count]) => ({
    category,
    count,
  })),
  matching,
  analysis,
  cases,
  limitations: [
    'Controlled, nonrepresentative corpus; no Internet-wide accuracy claim.',
    'Positive/negative labels are fixture scenario labels; not claims about vendor behavior.',
    'Intentional unlisted/CNAME/inaccessible scenarios demonstrate false negatives.',
    'CPU timings exclude DOM collection, browser permissions, API/network and UI rendering.',
    'No confidence interval or hardware-independent performance guarantee is claimed.',
  ],
};
await writeFile(target, `${JSON.stringify(report, null, 2)}\n`);
console.log(
  JSON.stringify(
    {
      overall: report.overall,
      observable: report.observable,
      matching,
      analysis: analysis.current,
      artifact: 'docs/research/evaluation.json',
    },
    null,
    2,
  ),
);
