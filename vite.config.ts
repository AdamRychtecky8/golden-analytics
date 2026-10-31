/// <reference types="vitest/config" />
import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { POST as highlightHandler } from './api/highlight.ts';

// The same functions Vercel would run in production, one per file in api/.
const ROUTES: Record<string, (request: Request) => Promise<Response>> = {
  '/api/highlight': highlightHandler,
};

/**
 * Serves the api/ handlers during `npm run dev`. It converts Node's request into a
 * standard Request, calls the handler, and copies the Response back. Edits to files in
 * api/ need a dev-server restart.
 */
function aiApi(): Plugin {
  return {
    name: 'ai-api',
    configureServer(server) {
      for (const [route, handler] of Object.entries(ROUTES)) {
        server.middlewares.use(route, async (req, res) => {
          if (req.method !== 'POST') {
            res.statusCode = 405;
            res.end();
            return;
          }
          const chunks: Buffer[] = [];
          for await (const chunk of req) chunks.push(chunk as Buffer);
          const response = await handler(new Request(`http://localhost${route}`, { method: 'POST', body: Buffer.concat(chunks) }));
          res.statusCode = response.status;
          res.setHeader('Content-Type', 'application/json');
          res.end(await response.text());
        });
      }
    },
  };
}

export default defineConfig(({ mode }) => {
  // Copy ANTHROPIC_* settings from .env into the server's environment, where the handler
  // reads them. Vite only exposes VITE_-prefixed variables to browser code, so the key
  // stays on the server.
  const env = loadEnv(mode, process.cwd(), 'ANTHROPIC_');
  for (const [key, value] of Object.entries(env)) process.env[key] ??= value;

  return {
    plugins: [react(), aiApi()],
    test: {
      // The logic modules are pure functions, so tests don't need a browser.
      environment: 'node',
    },
  };
});
