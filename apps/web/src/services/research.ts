import { z } from 'zod';
const metrics = z.object({
  truePositives: z.number(),
  falsePositives: z.number(),
  trueNegatives: z.number(),
  falseNegatives: z.number(),
  precision: z.number().nullable(),
  recall: z.number().nullable(),
  f1: z.number().nullable(),
  total: z.number(),
});
const latency = z.object({
  medianMs: z.number().nonnegative(),
  p95Ms: z.number().nonnegative(),
  samples: z.number().int(),
});
export const referenceSchema = z.object({
  dataset: z.object({
    version: z.string(),
    license: z.string(),
    reviewedAt: z.string(),
    providerCount: z.number(),
    domainCount: z.number(),
    coverage: z.string(),
  }),
  methodology: z.object({
    version: z.string(),
    description: z.string(),
    weights: z.record(z.string(), z.number()),
    limits: z.array(z.string()),
  }),
});
export const evaluationSchema = z.object({
  measuredAt: z.string(),
  sourceFingerprint: z.string(),
  scoringVersion: z.string(),
  methodology: z.string(),
  dataset: z.object({
    version: z.string(),
    providerCount: z.number(),
    domainCount: z.number(),
  }),
  overall: metrics,
  observable: metrics,
  stress: metrics,
  categoryDistribution: z.array(
    z.object({ category: z.string(), count: z.number() }),
  ),
  matching: z.object({
    workload: z.string(),
    linear: latency,
    indexed: latency,
  }),
  analysis: z.object({
    current: latency,
    baseline: z.object({ medianMs: z.number(), p95Ms: z.number() }),
  }),
  cases: z.array(
    z.object({
      id: z.string(),
      family: z.string(),
      stress: z.boolean(),
      rationale: z.string(),
      expected: z.boolean(),
      predicted: z.boolean(),
      outcome: z.enum(['TP', 'FP', 'TN', 'FN']),
      providers: z.array(z.string()),
      score: z.number().nullable(),
      coverage: z.string(),
      latency,
    }),
  ),
  limitations: z.array(z.string()),
});
