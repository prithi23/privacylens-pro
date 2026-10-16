export function confusion(rows: { expected: boolean; predicted: boolean }[]) {
  const counts = {
    truePositives: 0,
    falsePositives: 0,
    trueNegatives: 0,
    falseNegatives: 0,
  };
  for (const row of rows) {
    if (row.expected && row.predicted) counts.truePositives++;
    else if (!row.expected && row.predicted) counts.falsePositives++;
    else if (!row.expected && !row.predicted) counts.trueNegatives++;
    else counts.falseNegatives++;
  }
  const { truePositives: tp, falsePositives: fp, falseNegatives: fn } = counts;
  const precision = tp + fp ? tp / (tp + fp) : null;
  const recall = tp + fn ? tp / (tp + fn) : null;
  const f1 = 2 * tp + fp + fn ? (2 * tp) / (2 * tp + fp + fn) : null;
  return { ...counts, precision, recall, f1, total: rows.length };
}
export function latency(samples: number[]) {
  const values = [...samples].sort((a, b) => a - b);
  return {
    medianMs: values[Math.floor(values.length / 2)] ?? 0,
    p95Ms: values[Math.max(0, Math.ceil(values.length * 0.95) - 1)] ?? 0,
    samples: values.length,
  };
}
