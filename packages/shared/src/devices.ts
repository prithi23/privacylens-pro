import { z } from 'zod';
export const deviceSchema = z.object({
  id: z.string(),
  displayName: z.string(),
  createdAt: z.string(),
  lastUsedAt: z.string().nullable(),
  revokedAt: z.string().nullable(),
  expiresAt: z.string(),
});
export const deviceStatusSchema = z.object({
  device: deviceSchema,
  storageEnabled: z.boolean(),
  retentionDays: z.number(),
});
