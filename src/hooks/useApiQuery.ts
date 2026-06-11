import { useCallback, useEffect, useMemo, useRef, useState } from "react";

// Polling/refetch-based replacement for Convex's reactive useQuery/useMutation.
//
// - useApiQuery fetches on mount and whenever args change, keeps `data`
//   undefined while the first load is in flight (Convex parity), and can
//   silently poll via `pollMs`.
// - Every mounted query registers a refetcher in a global registry;
//   useApiMutation refetches all mounted queries after a successful mutation,
//   which restores the cross-component reactivity Convex provided.

type Refetcher = () => Promise<void>;

const queryRegistry = new Set<Refetcher>();

export async function refetchQueries(): Promise<void> {
  await Promise.all(
    Array.from(queryRegistry).map(refetch =>
      refetch().catch(() => {
        // Individual refetch failures surface via each hook's `error` state.
      }),
    ),
  );
}

interface UseApiQueryOptions {
  /** Poll interval in milliseconds. Polling refetches silently (no flicker). */
  pollMs?: number;
  /** When false, the query does not run and `data` stays undefined. */
  enabled?: boolean;
}

interface UseApiQueryResult<T> {
  data: T | undefined;
  error: Error | null;
  isLoading: boolean;
  refetch: () => Promise<void>;
}

export function useApiQuery<Args, T>(
  fn: (args: Args) => Promise<T>,
  args?: Args,
  options: UseApiQueryOptions = {},
): UseApiQueryResult<T> {
  const { pollMs, enabled = true } = options;

  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState<Error | null>(null);
  const [isLoading, setIsLoading] = useState(enabled);

  const fnRef = useRef(fn);
  fnRef.current = fn;
  const argsRef = useRef(args);
  argsRef.current = args;
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  // Re-run when the args *content* changes, not the object identity.
  const argsKey = useMemo(() => JSON.stringify(args ?? null), [args]);

  // Monotonic counter guards against stale responses overwriting fresh ones.
  const requestSeq = useRef(0);

  const refetch = useCallback(async () => {
    if (!enabledRef.current) return;
    const seq = ++requestSeq.current;
    try {
      const result = await fnRef.current(argsRef.current as Args);
      if (seq === requestSeq.current) {
        setData(result);
        setError(null);
        setIsLoading(false);
      }
    } catch (e) {
      if (seq === requestSeq.current) {
        setError(e instanceof Error ? e : new Error(String(e)));
        setIsLoading(false);
      }
      throw e;
    }
  }, []);

  useEffect(() => {
    if (!enabled) {
      requestSeq.current++;
      setData(undefined);
      setError(null);
      setIsLoading(false);
      return;
    }
    setData(undefined);
    setIsLoading(true);
    refetch().catch(() => {
      // Error already captured in state.
    });
    // biome-ignore lint/correctness/useExhaustiveDependencies: argsKey is the serialized form of args
  }, [enabled, argsKey, refetch]);

  // Register in the global registry so mutations can refresh all queries.
  useEffect(() => {
    if (!enabled) return;
    const refetcher: Refetcher = () => refetch();
    queryRegistry.add(refetcher);
    return () => {
      queryRegistry.delete(refetcher);
    };
  }, [enabled, refetch]);

  // Silent polling.
  useEffect(() => {
    if (!enabled || !pollMs) return;
    const interval = setInterval(() => {
      refetch().catch(() => {
        // Error already captured in state.
      });
    }, pollMs);
    return () => clearInterval(interval);
  }, [enabled, pollMs, refetch]);

  return { data, error, isLoading, refetch };
}

interface UseApiMutationState {
  loading: boolean;
}

export function useApiMutation<Args, T>(
  fn: (args: Args) => Promise<T>,
): [(args?: Args) => Promise<T>, UseApiMutationState] {
  const [loading, setLoading] = useState(false);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  const mutate = useCallback(async (args?: Args): Promise<T> => {
    setLoading(true);
    try {
      const result = await fnRef.current(args as Args);
      // Fire-and-forget: refresh all mounted queries so dependent views
      // update without prop drilling (Convex reactivity parity).
      void refetchQueries();
      return result;
    } finally {
      setLoading(false);
    }
  }, []);

  return [mutate, { loading }];
}
