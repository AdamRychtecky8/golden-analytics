import { useEffect, useState } from 'react';

/**
 * Whether the server has an AI key (asked once). Undefined while asking; false when there's
 * no key or no server (e.g. the plain dist/ build), so the ask box can say so up front.
 */
export function useAiStatus(): boolean | undefined {
  const [ai, setAi] = useState<boolean | undefined>(undefined);
  useEffect(() => {
    let live = true;
    fetch('/api/status', { method: 'POST' })
      .then((r) => r.json())
      .then((b: { ai?: unknown }) => live && setAi(b.ai === true))
      .catch(() => live && setAi(false));
    return () => {
      live = false;
    };
  }, []);
  return ai;
}
