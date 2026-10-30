// Prints the Bookshop options menu, each option's findings, and each persona's highlight
// and reason (npm run options:bookshop). The logic is TypeScript in src/, so this asks
// Vite (already installed) to load it the way the dev server would, then closes. Rules
// only, no AI call: the same as the app with no API key.
import { createServer } from 'vite';

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const { bookshopReport } = await server.ssrLoadModule('/src/optionsReport.ts');
  console.log(bookshopReport());
} finally {
  await server.close();
}
