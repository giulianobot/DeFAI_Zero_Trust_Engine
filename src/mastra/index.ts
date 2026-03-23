/**
 * DeFAI Zero Trust Engine — Mastra Entry Point
 *
 * Registers all workflows and configures the Mastra instance.
 * This file is the entry point referenced by mastra.config.ts.
 *
 * Workflows:
 * - workflow-a: Grok extraction Path A
 * - workflow-b: Grok extraction Path B (independent)
 * - workflow-d: TypeScript === consensus gate
 * - workflow-price: Alchemy BTC price + balance check
 * - workflow-sign: Lit Protocol signing + Alchemy broadcast
 */

import { Mastra } from '@mastra/core';
import dotenv from 'dotenv';

import { workflowA } from '../workflows/workflow-a.js';
import { workflowB } from '../workflows/workflow-b.js';
import { workflowD } from '../workflows/workflow-d.js';
import { workflowPrice } from '../workflows/workflow-price.js';
import { workflowSign } from '../workflows/workflow-sign.js';
import { handleProcessRequest } from '../api/webhook.js';

dotenv.config();

// ─── Mastra Instance ─────────────────────────────────────────────
export const mastra = new Mastra({
  workflows: {
    workflowA,
    workflowB,
    workflowD,
    workflowPrice,
    workflowSign,
  },
  server: {
    apiRoutes: [
      {
        path: '/api/process',
        method: 'POST',
        handler: async (req) => {
          const body = await req.json();
          const result = await handleProcessRequest(body);
          return new Response(JSON.stringify(result.body), {
            status: result.statusCode,
            headers: { 'Content-Type': 'application/json' },
          });
        },
      },
    ],
  },
});
