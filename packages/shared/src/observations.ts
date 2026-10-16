import { z } from 'zod';

// Allow localhost and IP literals for local browsing; never accept a URL or path.
const observedHostname = z
  .string()
  .min(1)
  .max(253)
  .refine(
    (value) =>
      !value.includes('..') &&
      !value.startsWith('.') &&
      !value.endsWith('.') &&
      (value.includes(':')
        ? /^\[[0-9a-fA-F:]+\]$/.test(value)
        : /^[a-zA-Z0-9.-]+$/.test(value) &&
          value
            .split('.')
            .every(
              (label) =>
                label.length > 0 &&
                label.length <= 63 &&
                !label.startsWith('-') &&
                !label.endsWith('-'),
            )),
    'Expected a sanitized browser hostname',
  );
export const resourceObservationSchema = z
  .object({
    hostname: observedHostname,
    protocol: z.enum(['http:', 'https:']),
    kind: z.enum(['script', 'image', 'iframe', 'other']),
    source: z.enum(['dom', 'timing']),
  })
  .strict();
export const pageObservationSchema = z
  .object({
    hostname: observedHostname,
    protocol: z.enum(['http:', 'https:', 'unknown']),
    scannedAt: z.iso.datetime(),
    domStatus: z.enum(['available', 'unavailable']),
    timingStatus: z.enum(['available', 'unavailable']),
    truncated: z.boolean(),
    ignoredResourceCount: z.number().int().min(0),
    resources: z.array(resourceObservationSchema).max(10000),
  })
  .strict();
export type ResourceObservation = z.infer<typeof resourceObservationSchema>;
export type PageObservation = z.infer<typeof pageObservationSchema>;
