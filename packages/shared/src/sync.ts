import { z } from 'zod';
import { scanSchema } from './schemas/index.js';
import { deviceStatusSchema } from './devices.js';
export { deviceSchema, deviceStatusSchema } from './devices.js';
export const pairingCodeSchema = z.string().regex(/^[A-Za-z0-9_-]{22}$/);
export const pairRequestSchema = z
  .object({
    code: pairingCodeSchema,
    displayName: z.string().trim().min(1).max(100),
  })
  .strict();
export const uploadSchema = z
  .object({ uploadId: z.uuid(), consent: z.literal(true), scan: scanSchema })
  .strict();
export const pairResponseSchema = deviceStatusSchema.extend({
  credential: z.string().regex(/^pld_[A-Za-z0-9_-]{43}$/),
});
