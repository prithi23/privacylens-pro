import { readFile, writeFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { format } from 'prettier';
const root = fileURLToPath(new URL('../', import.meta.url));
const json = async (file) =>
  JSON.parse(await readFile(`${root}/${file}`, 'utf8'));
const report = await json('docs/research/evaluation.json');
const backend = await json('docs/research/backend-performance.json');
const browser = await json('docs/research/browser-performance.json');
const first = await json('docs/research/backend-first-pass.json');
const ms = (value) => Number(value).toFixed(3),
  pct = (value) =>
    value === null ? 'undefined' : `${(value * 100).toFixed(2)}%`;
const metricRow = (name, data) =>
  `| ${name} | ${data.truePositives} | ${data.falsePositives} | ${data.trueNegatives} | ${data.falseNegatives} | ${pct(data.precision)} | ${pct(data.recall)} | ${pct(data.f1)} |`;
await writeFile(
  `${root}/docs/RESEARCH_EVALUATION.md`,
  `# Reproducible research evaluation

Measured **${report.measuredAt}**, ${report.environment.runtime}/${report.environment.platform}. Dataset **${report.dataset.version}**, ${report.dataset.providerCount} providers/${report.dataset.domainCount} domains; scoring **${report.scoringVersion}**. Source fingerprint: ${report.sourceFingerprint}.

## Task, labels and scope

${report.methodology}

The 29 checked-in cases in fixtures/research/cases.ts are independently specified, not generated from the registry. They cover known provider endpoints, first parties, benign resource controls, subdomains, co.uk/private-suffix tenants, prefix/suffix impersonation, mixed transport, missing timing and restricted sources. Four deliberately out-of-band cases represent an unlisted synthetic provider, a first-party CNAME alias, hidden timing activity and a restricted environment. Their positive scenario labels are known by construction; the scanner cannot observe the missing evidence and correctly documents this limitation. They are not measurements of real DNS behavior or actual personal-data transmission. Generic CDN negatives are fixture controls, not universal claims that those services never track.

| Corpus | TP | FP | TN | FN | Precision | Recall | F1 |
| --- | --- | --- | --- | --- | --- | --- | --- |
${metricRow('All scenarios', report.overall)}
${metricRow('Observable subset', report.observable)}
${metricRow('Coverage stress subset', report.stress)}

Precision=TP/(TP+FP), recall=TP/(TP+FN), F1=2TP/(2TP+FP+FN). Undefined denominators remain null in JSON and an em dash in the UI; they are never displayed as perfect performance. Each scenario is one sample, regardless of duplicate resource observations.

## Case results

| Case | Family | Outcome | Coverage | Score | Median CPU ms | Label rationale |
| --- | --- | --- | --- | --- | --- | --- |
${report.cases.map((row) => `| ${row.id} | ${row.family} | ${row.outcome} | ${row.coverage} | ${row.score ?? 'withheld'} | ${ms(row.latency.medianMs)} | ${row.rationale.replaceAll('|', '/')} |`).join('\n')}

Per-case timings use three warmups and 25 actual calls. Full-workload benchmarks use five warmups and 30 samples; see PERFORMANCE.md. Timings exclude DOM collection, network and browser permissions. The source hash normalizes line endings and includes detection/scoring contracts, fixtures, runner and dependency lockfile. It is a freshness/provenance check, not a cryptographic certification of vendor behavior.

## Reproduce and interpret

Run npm run evaluate, npm run evaluate:check, npm run research:report, then rebuild/restart the API. The dashboard Evaluation lab reads this generated JSON through the authenticated /research/evaluation endpoint and provides scope/outcome filters, charts and case evidence. Nothing generates random results at request time.

Run npm run test:browser-scanner and npm run test:browser-sync for actual Chrome collection/action/approved-sync evidence. The controlled browser fixture uses CSP-blocked external references; four observed providers do not establish four executed trackers. Native sync additionally checks PostgreSQL provenance and owner dashboard pages. The second comparison site is an explicit HTTP test fixture. All database fixtures are isolated and cleaned up.

The sample is small, synthetic, deliberately designed and not a held-out or representative Web corpus. Perfect observable-subset scores do not establish real-world precision/recall. No confidence interval, Internet-wide false-positive rate, malware detection capability or behavioral tracking accuracy is claimed. Future research should use independently curated larger corpora, versioned real-browser sessions with consent states, representative benign CDNs, independently established DNS/proxy ground truth and repeated hardware-controlled timing runs. A first-party proxy or unavailable browser evidence is an expected failure mode, not hidden from the reported denominator.
`,
);
const currentBundles = [];
for (const app of ['extension', 'web'])
  for (const name of await readdir(`${root}/apps/${app}/dist/assets`))
    if (name.endsWith('.js')) {
      const bytes = await readFile(`${root}/apps/${app}/dist/assets/${name}`);
      currentBundles.push({
        app,
        name,
        bytes: bytes.length,
        gzipBytes: gzipSync(bytes).length,
      });
    }
const baseline = report.analysis.baseline;
const entry = (array, app) =>
  array.find((row) => row.app === app && /^index-.*\.js$/.test(row.name));
const httpRows = Object.entries(backend.http.baseline)
  .map(([path, before]) => {
    const after = backend.http.current[path];
    return `| ${path} | ${ms(before.medianMs)} / ${ms(before.p95Ms)} | ${ms(after.medianMs)} / ${ms(after.p95Ms)} |`;
  })
  .join('\n');
await writeFile(
  `${root}/docs/PERFORMANCE.md`,
  `# Measured performance and decisions

All numbers below come from checked-in docs/research JSON or actual built assets. They are local observations, not guarantees or invented targets. No new runtime dependencies or browser grants were introduced for optimization.

## Scanner and lookup

| Workload | Before median / p95 ms | After median / p95 ms |
| --- | --- | --- |
| Full analysis, same 1000 observations, Phase 5 vs current | ${ms(baseline.medianMs)} / ${ms(baseline.p95Ms)} | ${ms(report.analysis.current.medianMs)} / ${ms(report.analysis.current.p95Ms)} |
| Reference lookup, identical current 13-provider registry, linear vs indexed | ${ms(report.matching.linear.medianMs)} / ${ms(report.matching.linear.p95Ms)} | ${ms(report.matching.indexed.medianMs)} / ${ms(report.matching.indexed.p95Ms)} |

Full analysis includes schema validation, grouping, public/private suffix classification, matching and scoring. Baseline was captured before edits at a97e5e0; current adds providers and provenance, so this is a feature-rich comparison rather than a pure algorithm experiment. Indexed vs linear uses identical hosts/dataset, asserts equal provider matches, and isolates the lookup change more closely. Five warmups/30 serial samples were used. Cache/JIT/system variation remains. The engine now computes the page's registrable site once and each resource site's value once, avoiding repeated public-suffix parsing per host. No observations or score features were removed to obtain the reduction.

## Actual HTTP and PostgreSQL

Measured ${backend.measuredAt}. ${backend.scope}

| Endpoint | Phase 5 median / p95 ms | Current median / p95 ms |
| --- | --- | --- |
${httpRows}

The current history response includes provenance; overview also groups methodology versions. Health uses the same contract. CORS handlers are constructed once per app, not per request. Version aggregates were folded into the existing metrics query, avoiding an extra database round trip. Current responses/work differ and serial before/after order can favor warm caches; these figures do not establish a universal causal speedup. The history measurement regressed in this run and is retained rather than omitted.

The guarded test-only composite-index experiment measured ${ms(backend.postgres.before.latency.medianMs)} ms before and ${ms(backend.postgres.after.latency.medianMs)} ms after (p95 ${ms(backend.postgres.before.latency.p95Ms)} / ${ms(backend.postgres.after.latency.p95Ms)}). EXPLAIN ANALYZE/BUFFERS plans are retained in backend-performance.json. An earlier run also failed to justify the proposed index (${ms(first.postgres.before.latency.medianMs)} → ${ms(first.postgres.after.latency.medianMs)} ms median). The index was removed after each experiment; no extra production index or migration was added. Planner/transport overhead dominates this small warm workload. Existing owner/date/hostname indexes and bounded pools/timeouts remain; larger representative production-like experiments are future work.

## Browser responsiveness and payloads

Observed ${browser.measuredAt}: native action scan completion ${ms(browser.nativeScanObservedMs)} ms; Evaluation navigation/data-render observation ${ms(browser.evaluationRouteObservedMs)} ms. ${browser.note} Polling cadence is about 100 ms. These are single checks, not distributions or a claimed browser before/after improvement; no comparable Phase 5 browser-render baseline was recorded.

| Initial JavaScript asset | Phase 5 bytes / gzip | Current bytes / gzip |
| --- | --- | --- |
${['extension', 'web']
  .map((app) => {
    const before = entry(baseline.bundles, app),
      after = entry(currentBundles, app);
    return `| ${app} main entry | ${before.bytes} / ${before.gzipBytes} | ${after.bytes} / ${after.gzipBytes} |`;
  })
  .join('\n')}

Optional sync controls, charts and research pages load in separate chunks. The core popup remains about 241 kB uncompressed; dataset/domain code is shared in deferred chunks. The dashboard's initial entry grew with analysis-response validation and navigation; the measured size increase is retained. Tables/host evidence remain bounded or scrollable. CSS animations respect reduced motion. These choices limit initial/render work but are not a claim of measured physical-device responsiveness.

## Reproduce

Run npm run evaluate; npm run benchmark:backend; npm run build; npm run test:browser-sync; npm run research:report. The backend benchmark reconstructs Phase 5 source from local commit a97e5e0 and requires that checkpoint. It verifies separate actual database identities, creates one unique test user/session and 2000 test scans, uses only the test DB for writes/index experiments, cleans up, and checks application table counts unchanged. Production data and credentials never appear in reports. The baseline capture script refuses to overwrite Phase 5 measurements using a newer engine. For independent baseline recreation use a separate checkpoint checkout and the capture script, not a rollback of this workspace.
`,
);
for (const name of ['RESEARCH_EVALUATION.md', 'PERFORMANCE.md']) {
  const path = `${root}/docs/${name}`;
  await writeFile(
    path,
    await format(await readFile(path, 'utf8'), { parser: 'markdown' }),
  );
}
console.log(
  'Generated research methodology/results and performance documentation from actual artifacts and built asset sizes.',
);
