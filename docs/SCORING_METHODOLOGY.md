# Explainable scoring: exposure-v2

The score is an educational **observed exposure** heuristic, not a probability, security rating, compliance judgment or proof of privacy. Higher means fewer scored signals in this snapshot. Detection confidence is explicitly limited to a domain association; no fabricated numeric confidence is produced.

The implementation is deterministic in `apps/extension/src/analysis/engine.ts`, with the published policy in `packages/shared/src/methodology.ts`. Registry version and scoring version are separate: changing coverage can change a score even if weights remain fixed.

| Feature                                   | Deduction                                                                      | Limit / exclusions                                                 |
| ----------------------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| HTTP top-level page                       | 25                                                                             | Once per page; unknown protocol withholds the score                |
| Recognized third-party provider           | Analytics 8; advertising 12; social 10; session replay 14; other/diagnostics 4 | Once per provider, capped at 45 total                              |
| Unclassified third-party registrable site | 3                                                                              | Capped at 25; sites belonging to matched providers excluded        |
| HTTP-referenced hostname on HTTPS         | 5                                                                              | Unique hostnames, capped at 30; not charged again for an HTTP page |

`score = max(0, min(100, 100 - sum(deductions)))`. Concern labels remain compatible: at least 75 = low, 45–74 = moderate, below 45 = high. These words describe observed exposure, not actual harm. The HTTP and provider features assess different dimensions and can both apply. DOM/timing duplicates, repeated subdomains of a provider and provider-site/unclassified overlap do not add duplicate provider/site charges.

## Unknown and partial evidence

- Neither DOM nor timing available: coverage unavailable, score withheld.
- Unknown page protocol: score withheld.
- **Zero usable resource observations: score withheld in v2**, even if collection APIs returned successfully. Empty evidence is not converted into 100/100. A valid static page may therefore receive no score; this conservative tradeoff is explicit.
- One source missing or collection capped: partial coverage. If nonempty evidence and protocol remain available, a partial score is shown with a warning.
- Both sources available, nonempty and uncapped: top-level snapshot, still not complete browser coverage.

An observed first-party resource with no penalized signals can yield 100; that is an actual nonempty snapshot, not proof that hidden tracking is absent. A resource reference may have been blocked, upgraded or never executed. Likewise, a diagnostic SDK or essential CDN is not inherently harmful. Recommendations are tied to observed protocol/provider/coverage findings and explain these limits.

## Provenance and historical compatibility

New approved uploads may carry strict `analysis` metadata: `scoringVersion`, `datasetVersion`, `coverage`, source availability/truncation/ignored-reference assessment, and four reported score components. Validation checks component uniqueness/caps, score arithmetic and coverage consistency. The server still does **not** independently rescan or certify client reports.

The additive nullable JSONB column leaves existing rows untouched. Historical records have `analysis:null` and are displayed as **Legacy / unversioned**, with methodology, reference version and coverage unknown. They are not assumed to be v1, recomputed, backfilled or overwritten. Older API clients can continue sending the original payload. New empty/unavailable scans remain local because they have no storable numeric score.

Overview identifies methodology counts; comparison/history warn that retained scores may use different or unknown methods. A change over time is not automatically a behavior change. Per-record reports show stored deductions only when provenance exists; no exact breakdown is invented for older rows.

Tests cover deterministic ordering, caps, public/private suffixes, duplicates, first-party exclusion, missing sources, empty/unknown scores, versioned persistence and unchanged legacy values. The controlled HTTP browser fixture still produces score 24 (25 HTTP + capped 45 provider + 6 unclassified deductions); this is a fixture result, not a benchmark of the Web.
