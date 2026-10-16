import { useEffect, useState } from 'react';
import type { z } from 'zod';
import { request } from '../services/api';
export function useResource<T>(path: string | null, schema: z.ZodType<T>) {
  const [state, setState] = useState<{
    data?: T;
    error?: string;
    loading: boolean;
  }>({ loading: true });
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setState({ loading: Boolean(path) });
    if (path)
      void request(path, schema, { signal: controller.signal })
        .then((data) => {
          if (!controller.signal.aborted) setState({ data, loading: false });
        })
        .catch((error: Error) => {
          if (!controller.signal.aborted)
            setState({ error: error.message, loading: false });
        });
    return () => controller.abort();
  }, [path, schema, version]);
  return { ...state, retry: () => setVersion((value) => value + 1) };
}
