import { z } from 'zod';
/** Shared storage-consent contract used by the API and dashboard. */
export const preferenceSchema = z
  .object({
    syncEnabled: z.boolean(),
    retentionDays: z.number().int().min(1).max(365),
  })
  .strict();
