// Prints Bookshop cards as text (Key talking points, Caution around these, If they ask,
// What this data cannot tell you), for reading the wording (npm run cards:bookshop). The logic is TypeScript in src/, so this asks
// Vite (already installed) to load it the way the dev server would, then closes. Rules
// only, no AI call: the same as the app with no API key.
import { createServer } from 'vite';

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const { cardsReport } = await server.ssrLoadModule('/src/cardReport.ts');
  console.log(cardsReport());
} finally {
  await server.close();
}
