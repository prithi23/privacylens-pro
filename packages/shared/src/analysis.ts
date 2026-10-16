import { z } from 'zod';
const caps = { transport: 25, trackers: 45, unclassified: 25, insecure: 30 };
export const analysisSchema = z
  .object({
    scoringVersion: z.literal('exposure-v2'),
    datasetVersion: z.string().regex(/^[a-zA-Z0-9.-]{1,80}$/),
    coverage: z.enum(['snapshot', 'partial']),
    assessment: z
      .object({
        domAvailable: z.boolean(),
        timingAvailable: z.boolean(),
        truncated: z.boolean(),
        ignoredResources: z.number().int().min(0).max(100000),
      })
      .strict(),
    components: z
      .array(
        z
          .object({
            id: z.enum(['transport', 'trackers', 'unclassified', 'insecure']),
            label: z.string().max(100),
            deduction: z.number().int().min(0).max(45),
            explanation: z.string().max(1000),
          })
          .strict(),
      )
      .length(4),
  })
  .strict()
  .refine(
    (value) =>
      new Set(value.components.map((component) => component.id)).size === 4 &&
      value.components.every(
        (component) => component.deduction <= caps[component.id],
      ),
    'Components must be distinct and obey methodology caps',
  )
  .refine(
    (value) =>
      (value.assessment.domAvailable || value.assessment.timingAvailable) &&
      (value.coverage === 'snapshot') ===
        (value.assessment.domAvailable &&
          value.assessment.timingAvailable &&
          !value.assessment.truncated),
    'Coverage must agree with available observations',
  );
