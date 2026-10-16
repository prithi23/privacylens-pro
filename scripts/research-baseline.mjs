import { build } from 'esbuild';
import { mkdir, writeFile, readdir, readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';
const root = fileURLToPath(new URL('../', import.meta.url));
await mkdir(`${root}/.browser-smoke`, { recursive: true });
await mkdir(`${root}/docs/research`, { recursive: true });
await build({
  entryPoints: [`${root}/apps/extension/src/analysis/engine.ts`],
  outfile: `${root}/.browser-smoke/phase5-engine.mjs`,
  bundle: true,
  platform: 'node',
  format: 'esm',
});
const { analyzePage } = await import(
  pathToFileURL(`${root}/.browser-smoke/phase5-engine.mjs`).href
);
const input = {
  hostname: 'example.com',
  protocol: 'https:',
  scannedAt: '2026-10-16T10:00:00.000Z',
  domStatus: 'available',
  timingStatus: 'available',
  truncated: false,
  ignoredResourceCount: 0,
  resources: Array.from({ length: 1000 }, (_, index) => ({
    hostname:
      index % 5 === 0 ? 'www.google-analytics.com' : `cdn-${index}.example.net`,
    protocol: 'https:',
    kind: 'script',
    source: 'dom',
  })),
};
for (let index = 0; index < 5; index++) analyzePage(input);
if (analyzePage(input).datasetVersion !== 'local-reference-v1')
  throw new Error(
    'Baseline capture must run against the Phase 5 checkpoint. Refusing to overwrite the historical baseline using a newer engine.',
  );
const samples = Array.from({ length: 30 }, () => {
  const start = performance.now();
  analyzePage(input);
  return performance.now() - start;
}).sort((a, b) => a - b);
const bundles = [];
for (const app of ['extension', 'web']) {
  const directory = `${root}/apps/${app}/dist/assets`;
  for (const name of await readdir(directory))
    if (name.endsWith('.js')) {
      const bytes = await readFile(`${directory}/${name}`);
      bundles.push({
        app,
        name,
        bytes: bytes.length,
        gzipBytes: gzipSync(bytes).length,
      });
    }
}
const report = {
  phase: 5,
  checkpoint: 'a97e5e0',
  measuredAt: new Date().toISOString(),
  node: process.version,
  scope:
    'Synthetic 1000-observation analysis, 5 warmups, 30 iterations; includes validation/domain grouping/scoring, excludes DOM collection/network',
  baselineUnitTests: 121,
  baselinePostgresTests: 57,
  medianMs: samples[Math.floor(samples.length / 2)],
  p95Ms: samples[Math.ceil(samples.length * 0.95) - 1],
  samplesMs: samples,
  bundles,
};
await writeFile(
  `${root}/docs/research/phase5-baseline.json`,
  `${JSON.stringify(report, null, 2)}\n`,
);
console.log(
  JSON.stringify({
    medianMs: report.medianMs,
    p95Ms: report.p95Ms,
    bundledAssets: bundles.length,
  }),
);
