export const methodology = {
  version: 'exposure-v2',
  baseline: 100,
  emptyObservationPolicy: 'withhold-score',
  weights: {
    analytics: 8,
    advertising: 12,
    social: 10,
    'session-replay': 14,
    other: 4,
  },
  caps: { providers: 45, unclassified: 25, insecure: 30 },
  pageHttp: 25,
  unknownDomain: 3,
  insecureReference: 5,
  description:
    'Deterministic exposure heuristic. Deduct once per third-party provider, exclude matched provider sites from unclassified sites, count HTTP page and mixed-content references separately only on HTTPS. No deduction certifies safety.',
  limits: [
    'Top-level snapshot only',
    'No CNAME/DNS resolution',
    'No proof of request completion, tracking execution or consent compliance',
    'Partial or empty observations cannot establish absence of tracking',
  ],
} as const;
