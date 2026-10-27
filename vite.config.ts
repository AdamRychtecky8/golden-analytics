/// <reference types="vitest/config" />
import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { POST as suggestHandler } from './api/suggest.ts';

/**
 * Serves api/suggest.ts at /api/suggest during `npm run dev`, the same function Vercel
 * would run in production. It converts Node's request into a standard Request, calls the
 * handler, and copies the Response back. Edits to api/suggest.ts need a dev-server restart.
 */
function suggestApi(): Plugin {
  return {
    name: 'suggest-api',
    configureServer(server) {
      server.middlewares.use('/api/suggest', async (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end();
          return;
        }
        const chunks: Buffer[] = [];
        for await (const chunk of req) chunks.push(chunk as Buffer);
        const response = await suggestHandler(
          new Request('http://localhost/api/suggest', { method: 'POST', body: Buffer.concat(chunks) }),
        );
        res.statusCode = response.status;
        res.setHeader('Content-Type', 'application/json');
        res.end(await response.text());
      });
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
    plugins: [react(), suggestApi()],
    test: {
      // The logic modules are pure functions, so tests don't need a browser.
      environment: 'node',
    },
  };
});
