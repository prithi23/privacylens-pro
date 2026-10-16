import { z } from 'zod';
import {
  hostnameSchema,
  scanSchema,
  preferenceSchema,
} from '@privacylens/shared';
export const credentialsSchema = z
  .object({
    email: z.string().trim().toLowerCase().email().max(254),
    password: z.string().min(12).max(128),
  })
  .strict();
export const idSchema = z.object({ id: z.string().cuid() }).strict();
export const emptySchema = z.object({}).strict();
export const trackerQuerySchema = z
  .object({ q: z.string().max(100).default('') })
  .strict();
export const preferencesSchema = preferenceSchema;
export const createScanSchema = scanSchema
  .refine(
    (scan) =>
      scan.concernLevel ===
      (scan.privacyScore >= 75
        ? 'low'
        : scan.privacyScore >= 45
          ? 'moderate'
          : 'high'),
    {
      message: 'Concern label must agree with the score',
      path: ['concernLevel'],
    },
  )
  .refine((scan) => Date.parse(scan.scannedAt) <= Date.now() + 5 * 60000, {
    message: 'Scan timestamp is too far in the future',
    path: ['scannedAt'],
  });
export const filtersSchema = z
  .object({
    hostname: hostnameSchema.optional(),
    from: z.iso.datetime().optional(),
    to: z.iso.datetime().optional(),
  })
  .strict()
  .refine(
    (value) =>
      !value.from ||
      !value.to ||
      Date.parse(value.from) <= Date.parse(value.to),
    'from must precede to',
  );
export const listSchema = z
  .object({
    hostname: hostnameSchema.optional(),
    from: z.iso.datetime().optional(),
    to: z.iso.datetime().optional(),
    page: z.coerce.number().int().min(1).max(10000).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    sort: z
      .enum(['scannedAt', 'privacyScore', 'hostname'])
      .default('scannedAt'),
    order: z.enum(['asc', 'desc']).default('desc'),
  })
  .strict()
  .refine(
    (value) =>
      !value.from ||
      !value.to ||
      Date.parse(value.from) <= Date.parse(value.to),
    'from must precede to',
  );
export const comparisonSchema = z
  .object({
    hostnames: z
      .string()
      .max(1280)
      .transform((value) => value.split(','))
      .pipe(z.array(hostnameSchema).min(2).max(5))
      .refine(
        (values) => new Set(values).size === values.length,
        'Use distinct hostnames',
      ),
    from: z.iso.datetime().optional(),
    to: z.iso.datetime().optional(),
  })
  .strict()
  .refine(
    (value) =>
      !value.from ||
      !value.to ||
      Date.parse(value.from) <= Date.parse(value.to),
    'from must precede to',
  );
export type Filters = z.infer<typeof filtersSchema>;
export type ListQuery = z.infer<typeof listSchema>;
