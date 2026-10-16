import { it, expect } from 'vitest';
import { analyzePage } from './engine';
import { researchCases } from '../../../../fixtures/research/cases';
import { confusion } from '@privacylens/shared/research-metrics';
import { analysisSchema } from '@privacylens/shared/analysis';
it('evaluates independently labeled observable and limitation fixtures with honest misses', () => {
  const rows = researchCases.map((row) => ({
    ...row,
    predicted: analyzePage(row.observation).trackers.length > 0,
  }));
  expect(confusion(rows)).toMatchObject({
    truePositives: 16,
    trueNegatives: 9,
    falsePositives: 0,
    falseNegatives: 4,
    recall: 0.8,
  });
  expect(confusion(rows.filter((row) => !row.stress)).falseNegatives).toBe(0);
  expect(
    analyzePage(
      researchCases.find((row) => row.id === 'restricted')!.observation,
    ).score,
  ).toBeNull();
});
it('emits deterministic versioned deductions and rejects inconsistent uploaded coverage', () => {
  const input = researchCases[0].observation;
  const result = analyzePage(input);
  expect(analyzePage(input)).toEqual(result);
  expect(result.scoringVersion).toBe('exposure-v2');
  const analysis = {
    scoringVersion: result.scoringVersion,
    datasetVersion: result.datasetVersion,
    coverage: result.coverage,
    assessment: result.assessment,
    components: result.components,
  };
  expect(analysisSchema.safeParse(analysis).success).toBe(true);
  expect(
    analysisSchema.safeParse({
      ...analysis,
      assessment: { ...analysis.assessment, timingAvailable: false },
    }).success,
  ).toBe(false);
  expect(
    analysisSchema.safeParse({
      ...analysis,
      components: analysis.components.map((component) => ({
        ...component,
        id: 'trackers',
      })),
    }).success,
  ).toBe(false);
});
