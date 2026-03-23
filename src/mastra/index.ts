/**
 * DeFAI Zero Trust Engine - Mastra Entry Point
 *
 * Registers all workflows and configures the Mastra instance.
 * This file is the entry point referenced by mastra.config.ts.
 *
 * Workflows (safe mode - production):
 * - workflow-a: Grok extraction Path A (KB + temp 0)
 * - workflow-b: Grok extraction Path B (KB + temp 0)
 * - workflow-d: TypeScript === consensus gate
 * - workflow-price: Alchemy BTC price + balance check
 * - workflow-sign: Lit Protocol signing + Alchemy broadcast
 *
 * Workflows (unsafe mode - demo):
 * - workflow-a-unsafe: No KB, no system prompt, temp 1
 * - workflow-b-unsafe: No KB, no system prompt, temp 1
 */

import { Mastra } from '@mastra/core';
import dotenv from 'dotenv';

import { workflowA } from '../workflows/workflow-a.js';
import { workflowB } from '../workflows/workflow-b.js';
import { workflowAUnsafe } from '../workflows/workflow-a-unsafe.js';
import { workflowBUnsafe } from '../workflows/workflow-b-unsafe.js';
import { workflowD } from '../workflows/workflow-d.js';
import { workflowPrice } from '../workflows/workflow-price.js';
import { workflowSign } from '../workflows/workflow-sign.js';
import { handleProcessRequest } from '../api/webhook.js';

dotenv.config();

// -- Mastra Instance --
export const mastra = new Mastra({
  workflows: {
    workflowA,
    workflowB,
    workflowAUnsafe,
    workflowBUnsafe,
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
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*',
              'Access-Control-Allow-Methods': 'POST, OPTIONS',
              'Access-Control-Allow-Headers': 'Content-Type',
            },
          });
        },
      },
    ],
  },
});
