// One way for the browser to ask a server-side AI handler (/api/highlight, /api/card):
// post JSON, wait with a timeout, retry once if the AI couldn't be reached. It never
// throws, so callers only decide what to show for each outcome.

export type Fetcher = (url: string, init: RequestInit) => Promise<Response>;

export type AiReply = { ok: true; body: Record<string, unknown> } | { ok: false; reason: 'no-key' | 'unavailable' };

export interface AskOptions {
  fetcher?: Fetcher;
  retryDelayMs?: number; // pause before the one automatic retry
}

// A little longer than the server's own timeout, so the server gets to answer first.
const TIMEOUT_MS = 20_000;
const RETRY_DELAY_MS = 600;

export async function askAi(url: string, payload: unknown, options: AskOptions = {}): Promise<AiReply> {
  const fetcher = options.fetcher ?? ((u, init) => fetch(u, init));
  const first = await askOnce(url, payload, fetcher);
  // No key is not a failure worth retrying: the answer would be the same.
  if (first.ok || first.reason === 'no-key') return first;
  await new Promise((resolve) => setTimeout(resolve, options.retryDelayMs ?? RETRY_DELAY_MS));
  return askOnce(url, payload, fetcher);
}

async function askOnce(url: string, payload: unknown, fetcher: Fetcher): Promise<AiReply> {
  try {
    const response = await fetcher(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    // `await` pauses here until the reply arrives, without freezing the page.
    const body = (await response.json()) as Record<string, unknown>;
    if (body.ok === true) return { ok: true, body };
    return { ok: false, reason: body.reason === 'no-key' ? 'no-key' : 'unavailable' };
  } catch {
    // Network error, timeout, or a reply that isn't JSON (e.g. no server behind /api).
    return { ok: false, reason: 'unavailable' };
  }
}
