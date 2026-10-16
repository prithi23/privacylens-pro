# Measured performance and decisions

All numbers below come from checked-in docs/research JSON or actual built assets. They are local observations, not guarantees or invented targets. No new runtime dependencies or browser grants were introduced for optimization.

## Scanner and lookup

| Workload                                                                    | Before median / p95 ms | After median / p95 ms |
| --------------------------------------------------------------------------- | ---------------------- | --------------------- |
| Full analysis, same 1000 observations, Phase 5 vs current                   | 5.788 / 9.619          | 3.454 / 6.864         |
| Reference lookup, identical current 13-provider registry, linear vs indexed | 4.121 / 7.848          | 1.123 / 1.527         |

Full analysis includes schema validation, grouping, public/private suffix classification, matching and scoring. Baseline was captured before edits at a97e5e0; current adds providers and provenance, so this is a feature-rich comparison rather than a pure algorithm experiment. Indexed vs linear uses identical hosts/dataset, asserts equal provider matches, and isolates the lookup change more closely. Five warmups/30 serial samples were used. Cache/JIT/system variation remains. The engine now computes the page's registrable site once and each resource site's value once, avoiding repeated public-suffix parsing per host. No observations or score features were removed to obtain the reduction.

## Actual HTTP and PostgreSQL

Measured 2026-10-16T10:03:17.429Z. Actual test PostgreSQL, 2000 owned fixture scans, serial loopback HTTP, 3 warmups/20 samples. Auth uses a real DB session fixture; no login benchmark. Baseline is a97e5e0; current includes new metadata/analytics. Timing variance and changed responses prevent causal attribution.

| Endpoint            | Phase 5 median / p95 ms | Current median / p95 ms |
| ------------------- | ----------------------- | ----------------------- |
| /health             | 1.556 / 2.594           | 0.819 / 1.048           |
| /scans?limit=20     | 6.874 / 8.695           | 8.480 / 10.121          |
| /analytics/overview | 15.325 / 17.811         | 12.865 / 16.920         |

The current history response includes provenance; overview also groups methodology versions. Health uses the same contract. CORS handlers are constructed once per app, not per request. Version aggregates were folded into the existing metrics query, avoiding an extra database round trip. Current responses/work differ and serial before/after order can favor warm caches; these figures do not establish a universal causal speedup. The history measurement regressed in this run and is retained rather than omitted.

The guarded test-only composite-index experiment measured 0.895 ms before and 1.033 ms after (p95 1.451 / 1.366). EXPLAIN ANALYZE/BUFFERS plans are retained in backend-performance.json. An earlier run also failed to justify the proposed index (1.373 → 2.578 ms median). The index was removed after each experiment; no extra production index or migration was added. Planner/transport overhead dominates this small warm workload. Existing owner/date/hostname indexes and bounded pools/timeouts remain; larger representative production-like experiments are future work.

## Browser responsiveness and payloads

Observed 2026-10-16T13:13:19.120Z: native action scan completion 125.300 ms; Evaluation navigation/data-render observation 423.100 ms. Single observed browser samples, including CDP/polling overhead; not pure rendering or collector timings and not a before/after claim. Polling cadence is about 100 ms. These are single checks, not distributions or a claimed browser before/after improvement; no comparable Phase 5 browser-render baseline was recorded.

| Initial JavaScript asset | Phase 5 bytes / gzip | Current bytes / gzip |
| ------------------------ | -------------------- | -------------------- |
| extension main entry     | 240671 / 75074       | 241145 / 75251       |
| web main entry           | 322562 / 98407       | 328574 / 100150      |

Optional sync controls, charts and research pages load in separate chunks. The core popup remains about 241 kB uncompressed; dataset/domain code is shared in deferred chunks. The dashboard's initial entry grew with analysis-response validation and navigation; the measured size increase is retained. Tables/host evidence remain bounded or scrollable. CSS animations respect reduced motion. These choices limit initial/render work but are not a claim of measured physical-device responsiveness.

## Reproduce

Run npm run evaluate; npm run benchmark:backend; npm run build; npm run test:browser-sync; npm run research:report. The backend benchmark reconstructs Phase 5 source from local commit a97e5e0 and requires that checkpoint. It verifies separate actual database identities, creates one unique test user/session and 2000 test scans, uses only the test DB for writes/index experiments, cleans up, and checks application table counts unchanged. Production data and credentials never appear in reports. The baseline capture script refuses to overwrite Phase 5 measurements using a newer engine. For independent baseline recreation use a separate checkpoint checkout and the capture script, not a rollback of this workspace.
