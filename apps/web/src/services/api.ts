import { z } from 'zod';
import { preferenceSchema } from '@privacylens/shared/preferences';
import { analysisSchema } from '@privacylens/shared/analysis';
const configuredBase =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '';
if (
  configuredBase &&
  !configuredBase.startsWith('https://') &&
  import.meta.env.PROD
)
  throw new Error('Production API URL must use HTTPS');
const base = configuredBase.replace(/\/$/, '');
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
export async function request<T>(
  path: string,
  schema: z.ZodType<T>,
  options: { method?: string; body?: unknown; signal?: AbortSignal } = {},
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${base}/api/v1${path}`, {
      method: options.method ?? 'GET',
      credentials: 'include',
      cache: 'no-store',
      signal: options.signal
        ? AbortSignal.any([options.signal, AbortSignal.timeout(12000)])
        : AbortSignal.timeout(12000),
      ...(options.body !== undefined
        ? {
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(options.body),
          }
        : {}),
    });
  } catch (error) {
    if (options.signal?.aborted) throw error;
    throw new ApiError(
      0,
      'UNAVAILABLE',
      'Cannot reach the server. Check that the API is running, then retry.',
    );
  }
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      error?: { code?: string; message?: string };
    } | null;
    const error = new ApiError(
      response.status,
      body?.error?.code ?? 'REQUEST_FAILED',
      body?.error?.message ?? 'The request could not be completed.',
    );
    if (response.status === 401 && !path.startsWith('/auth/'))
      window.dispatchEvent(new Event('session-expired'));
    throw error;
  }
  const body: unknown =
    response.status === 204
      ? undefined
      : await response.json().catch(() => {
          throw new ApiError(
            0,
            'INVALID_RESPONSE',
            'The server returned an unexpected response. Please retry.',
          );
        });
  const result = schema.safeParse(body);
  if (!result.success)
    throw new ApiError(
      0,
      'INVALID_RESPONSE',
      'The server returned an unexpected response. Please retry.',
    );
  return result.data;
}
export function query(values: Record<string, string | number | undefined>) {
  const params = new URLSearchParams();
  Object.entries(values).forEach(([key, value]) => {
    if (value !== undefined && value !== '') params.set(key, String(value));
  });
  return params.size ? `?${params}` : '';
}
export const preferencesSchema = preferenceSchema;
export const userSchema = z.object({
  id: z.string(),
  email: z.email(),
  createdAt: z.string(),
  preference: preferencesSchema.nullable(),
});
export const authSchema = z.object({ user: userSchema });
export type User = z.infer<typeof userSchema>;
export const scanSchema = z.object({
  analysis: analysisSchema.nullish(),
  id: z.string(),
  hostname: z.string(),
  privacyScore: z.number(),
  concernLevel: z.string(),
  httpsStatus: z.string(),
  thirdPartyDomainCount: z.number(),
  trackerMatchCount: z.number(),
  scannedAt: z.string(),
  createdAt: z.string(),
});
export type Scan = z.infer<typeof scanSchema>;
export const findingSchema = z.object({
  id: z.string(),
  category: z.string(),
  severity: z.string(),
  description: z.string(),
  evidenceHostname: z.string(),
});
export const detailSchema = z.object({
  scan: scanSchema.extend({ findings: z.array(findingSchema) }),
});
export const listSchema = z.object({
  items: z.array(scanSchema),
  total: z.number(),
  page: z.number(),
  limit: z.number(),
  totalPages: z.number(),
});
export const overviewSchema = z.object({
  scoreVersions: z
    .array(z.object({ version: z.string(), scans: z.number() }))
    .optional(),
  metrics: z.object({
    totalScans: z.number(),
    uniqueDomains: z.number(),
    trackerMatches: z.number(),
    averageScore: z.number().nullable(),
  }),
  trends: z.array(
    z.object({ date: z.string(), scans: z.number(), averageScore: z.number() }),
  ),
  trackerDistribution: z.array(
    z.object({
      category: z.string(),
      findingCount: z.number(),
      scanCount: z.number(),
    }),
  ),
  recentScans: z.array(scanSchema),
  frequentProviders: z.array(
    z.object({ name: z.string(), scanCount: z.number() }),
  ),
});
export const domainsSchema = z.object({
  items: z.array(z.object({ hostname: z.string(), scans: z.number() })),
});
export const compareSchema = z.object({
  items: z.array(
    z.object({
      hostname: z.string(),
      scans: z.number(),
      averageScore: z.number().nullable(),
      trackerMatches: z.number(),
      latestScore: z.number().nullable(),
      scoreChangeFromFirst: z.number().nullable(),
      latest: scanSchema.nullable(),
      history: z.array(
        z.object({ scannedAt: z.string(), privacyScore: z.number() }),
      ),
    }),
  ),
});
export const providersSchema = z.object({
  source: z.literal('postgresql-reference'),
  items: z.array(
    z.object({
      referenceMetadata: z
        .object({
          datasetVersion: z.string(),
          license: z.string(),
          reviewedAt: z.string(),
          rule: z.string(),
          purposes: z.array(z.string()),
          sources: z.array(
            z
              .string()
              .url()
              .refine((url) => url.startsWith('https://')),
          ),
        })
        .nullish(),
      id: z.string(),
      name: z.string(),
      category: z.string(),
      description: z.string(),
      domains: z.array(z.string()),
    }),
  ),
});
