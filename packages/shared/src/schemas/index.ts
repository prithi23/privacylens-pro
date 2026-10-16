import { z } from 'zod';
import { parse } from 'tldts';
import { analysisSchema } from '../analysis.js';
export { analysisSchema } from '../analysis.js';

// Domain only: reject paths, queries, credentials, ports and IP literals.
export const hostnameSchema = z
  .string()
  .min(1)
  .max(253)
  .transform((value) => value.toLowerCase().replace(/\.$/, ''))
  .refine(
    (value) =>
      /^[a-z0-9.-]+$/.test(value) &&
      !value.includes('..') &&
      value
        .split('.')
        .every(
          (label) =>
            label.length > 0 &&
            label.length <= 63 &&
            !label.startsWith('-') &&
            !label.endsWith('-'),
        ) &&
      Boolean(parse(value, { allowPrivateDomains: true }).domain) &&
      !parse(value).isIp,
    'Expected a hostname without a URL, port, or IP address',
  );
export const categorySchema = z.enum([
  'analytics',
  'advertising',
  'social',
  'session-replay',
  'other',
]);
export const findingSchema = z
  .object({
    category: categorySchema,
    severity: z.enum(['info', 'low', 'medium', 'high']),
    description: z.string().min(1).max(500),
    evidenceHostname: hostnameSchema,
  })
  .strict();
export const scanSchema = z
  .object({
    hostname: hostnameSchema,
    privacyScore: z.number().int().min(0).max(100),
    concernLevel: z.enum(['low', 'moderate', 'high']),
    httpsStatus: z.enum(['https', 'http', 'unknown']),
    thirdPartyDomainCount: z.number().int().min(0).max(10000),
    trackerMatchCount: z.number().int().min(0).max(10000),
    scannedAt: z.iso.datetime(),
    findings: z.array(findingSchema).max(1000),
    analysis: analysisSchema.optional(),
  })
  .strict()
  .refine(
    (value) =>
      !value.analysis ||
      value.privacyScore ===
        Math.max(
          0,
          100 -
            value.analysis.components.reduce(
              (sum, component) => sum + component.deduction,
              0,
            ),
        ),
    'Score must match the reported deductions',
  );
export { preferenceSchema } from '../preferences.js';
