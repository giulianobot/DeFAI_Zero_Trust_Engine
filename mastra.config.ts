/**
 * DeFAI Zero Trust Engine — Mastra Configuration
 *
 * Points to the Mastra entry point at src/mastra/index.ts.
 * Run `pnpm dev` to start Mastra Studio at http://localhost:4111
 */

import { defineConfig } from 'mastra';

export default defineConfig({
  dir: 'src/mastra',
});
