import { envFromProcess } from './_shared.ts';

// Whether the server has an AI key, so the browser can say up front that typed questions
// need AI (instead of letting the user type, then failing). Never returns the key itself.

/** Vercel calls this for POST /api/status. The local dev server calls it too. */
export async function POST(): Promise<Response> {
  return Response.json({ ok: true, ai: Boolean(envFromProcess().apiKey) });
}
