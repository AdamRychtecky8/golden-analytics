import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Loads a value once per key and remembers it. Level 2's suggestions and Level 3's drafts
 * both use it: back/forward and the slider land on keys already loaded, so the AI is never
 * asked twice for the same thing. `retry()` forgets the current key's value and loads it
 * again. A null key loads nothing (e.g. Level 3 while it isn't on screen).
 *
 * <T> is a generic: the hook works for any kind of value, and TypeScript keeps track of
 * which one each caller gets back.
 */
export function useAsyncCache<T>(key: string | null, load: () => Promise<T>): { value: T | undefined; retry: () => void } {
  const [cache, setCache] = useState<Record<string, T>>({});
  // Keys already asked for. A ref, not state: remembering a request shouldn't re-render,
  // and it stops a second request for the same key while the first is still on its way.
  const requested = useRef(new Set<string>());
  // The newest `load`, so the effect can use it without re-running on every render
  // (the same "latest callback" pattern as Chart.tsx).
  const loadRef = useRef(load);
  // Bumped by retry(), so the effect runs again for the same key.
  const [attempt, setAttempt] = useState(0);

  // Effects run in the order they're declared, so this one updates the ref first.
  useEffect(() => {
    loadRef.current = load;
  });

  useEffect(() => {
    if (key === null || requested.current.has(key)) return;
    requested.current.add(key);
    // The functional update `(c) => …` adds to the newest cache, even if other answers
    // arrived while this one was loading.
    loadRef.current().then((value) => setCache((c) => ({ ...c, [key]: value })));
  }, [key, attempt]);

  // useCallback keeps the same function between renders unless the key changes.
  const retry = useCallback(() => {
    if (key === null) return;
    requested.current.delete(key);
    setCache((c) => {
      const next = { ...c };
      delete next[key];
      return next;
    });
    setAttempt((a) => a + 1);
  }, [key]);

  return { value: key === null ? undefined : cache[key], retry };
}
