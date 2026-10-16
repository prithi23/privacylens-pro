import type { z } from 'zod';
import type {
  scanSchema,
  findingSchema,
  preferenceSchema,
} from '../schemas/index.js';
export type ScanInput = z.infer<typeof scanSchema>;
export type Finding = z.infer<typeof findingSchema>;
export type UserPreference = z.infer<typeof preferenceSchema>;
export type HealthResponse = {
  status: 'ok';
  service: 'privacylens-api';
  phase: 1 | 3;
};
