/**
 * DeFAI Zero Trust Engine — Webhook API
 *
 * Single entry point: POST /api/process
 * Sequential pipeline orchestrator with fail-fast rejection.
 *
 * Pipeline sequence:
 * 1. Generate session_id, create session in SpacetimeDB
 * 2. Run Workflow A (Grok extraction Path A)
 * 3. Run Workflow B (Grok extraction Path B — independent)
 * 4. Run Workflow D (TypeScript === consensus check)
 * 5. Run Workflow Price (Alchemy BTC price + balance + contact)
 * 6. Run Workflow Sign (Lit Protocol signing + Alchemy broadcast)
 * 7. Return result to caller
 *
 * Any workflow rejection stops the pipeline immediately.
 */

import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { preprocessRawInput } from '../lib/normalise.js';
import { getDbConnection } from '../lib/spacetimedb-client.js';
import { workflowA } from '../workflows/workflow-a.js';
import { workflowB } from '../workflows/workflow-b.js';
import { workflowD } from '../workflows/workflow-d.js';
import { workflowPrice } from '../workflows/workflow-price.js';
import { workflowSign } from '../workflows/workflow-sign.js';

// ─── Request Schema ──────────────────────────────────────────────
const ProcessRequestSchema = z.object({
  raw_input: z.string().min(1, 'raw_input is required'),
});

// ─── Response Types ──────────────────────────────────────────────
interface SuccessResponse {
  status: 'approved';
  session_id: string;
  tx_hash: string;
  btc_amount: number;
  usd_amount: number;
  destination_name: string;
  destination_address: string;
  btc_price_usd: number;
}

interface RejectionResponse {
  status: 'rejected';
  session_id: string;
  rejection_reason: string;
  rejection_workflow: string;
}

interface ErrorResponse {
  status: 'error';
  message: string;
}

type ProcessResponse = SuccessResponse | RejectionResponse | ErrorResponse;

// ─── Pipeline Orchestrator ───────────────────────────────────────

/**
 * Processes a transaction request through the full Zero Trust pipeline.
 * Called by the Mastra API route handler.
 */
export async function processTransaction(rawInput: string): Promise<ProcessResponse> {
  // Generate unique session ID
  const session_id = randomUUID();

  // Preprocess raw input
  const processed_input = preprocessRawInput(rawInput);

  try {
    // Step 0: Create session in SpacetimeDB
    const conn = await getDbConnection();
    conn.reducers.insertSession(session_id, processed_input);

    // Step 1: Run Workflow A — Grok extraction Path A
    console.log(`[${session_id}] Starting Workflow A...`);
    const runA = await workflowA.createRun();
    const resultA = await runA.start({
      inputData: { raw_input: processed_input, session_id },
    });

    if (resultA.status !== 'success') {
      return {
        status: 'rejected',
        session_id,
        rejection_reason: 'Workflow A execution failed',
        rejection_workflow: 'A',
      };
    }

    const outputA = resultA.result;
    if (outputA.extraction_status === 'failed') {
      return {
        status: 'rejected',
        session_id,
        rejection_reason: 'Agent A failed to extract transaction fields',
        rejection_workflow: 'A',
      };
    }

    // Step 2: Run Workflow B — Grok extraction Path B (independent)
    console.log(`[${session_id}] Starting Workflow B...`);
    const runB = await workflowB.createRun();
    const resultB = await runB.start({
      inputData: { raw_input: processed_input, session_id },
    });

    if (resultB.status !== 'success') {
      return {
        status: 'rejected',
        session_id,
        rejection_reason: 'Workflow B execution failed',
        rejection_workflow: 'B',
      };
    }

    const outputB = resultB.result;
    if (outputB.extraction_status === 'failed') {
      return {
        status: 'rejected',
        session_id,
        rejection_reason: 'Agent B failed to extract transaction fields',
        rejection_workflow: 'B',
      };
    }

    // Step 3: Run Workflow D — Consensus check (pure TypeScript ===)
    console.log(`[${session_id}] Starting Workflow D (consensus check)...`);
    const runD = await workflowD.createRun();
    const resultD = await runD.start({
      inputData: {
        session_id,
        result_a: outputA,
        result_b: outputB,
      },
    });

    if (resultD.status !== 'success') {
      return {
        status: 'rejected',
        session_id,
        rejection_reason: 'Workflow D execution failed',
        rejection_workflow: 'D',
      };
    }

    const outputD = resultD.result;
    if (!outputD.consensus || !outputD.approved_fields) {
      return {
        status: 'rejected',
        session_id,
        rejection_reason: `Consensus failed — mismatched fields: ${outputD.mismatches.join(', ')}`,
        rejection_workflow: 'D',
      };
    }

    // Step 4: Run Workflow Price — Alchemy BTC price + balance + contact
    console.log(`[${session_id}] Starting Workflow Price...`);
    const runPrice = await workflowPrice.createRun();
    const resultPrice = await runPrice.start({
      inputData: {
        session_id,
        ...outputD.approved_fields,
      },
    });

    if (resultPrice.status !== 'success') {
      return {
        status: 'rejected',
        session_id,
        rejection_reason: 'Workflow Price execution failed',
        rejection_workflow: 'price',
      };
    }

    const outputPrice = resultPrice.result;
    if (outputPrice.status !== 'success') {
      return {
        status: 'rejected',
        session_id,
        rejection_reason: `Price check failed: ${outputPrice.status}`,
        rejection_workflow: 'price',
      };
    }

    // Step 5: Run Workflow Sign — Lit Protocol signing + Alchemy broadcast
    console.log(`[${session_id}] Starting Workflow Sign...`);
    const runSign = await workflowSign.createRun();
    const resultSign = await runSign.start({
      inputData: {
        session_id,
        destination_address: outputPrice.destination_address,
        btc_amount: outputPrice.btc_amount,
        usd_amount: outputPrice.usd_amount,
        destination_name: outputPrice.destination_name,
      },
    });

    if (resultSign.status !== 'success') {
      return {
        status: 'rejected',
        session_id,
        rejection_reason: 'Workflow Sign execution failed',
        rejection_workflow: 'sign',
      };
    }

    const outputSign = resultSign.result;
    if (outputSign.broadcast_status !== 'broadcast_success') {
      return {
        status: 'rejected',
        session_id,
        rejection_reason: `Signing/broadcast failed: ${outputSign.broadcast_status}`,
        rejection_workflow: 'sign',
      };
    }

    // All workflows passed — transaction approved
    console.log(`[${session_id}] Transaction approved — tx_hash: ${outputSign.tx_hash}`);

    return {
      status: 'approved',
      session_id,
      tx_hash: outputSign.tx_hash,
      btc_amount: outputPrice.btc_amount,
      usd_amount: outputPrice.usd_amount,
      destination_name: outputPrice.destination_name,
      destination_address: outputPrice.destination_address,
      btc_price_usd: outputPrice.btc_price_usd,
    };
  } catch (error) {
    console.error(`[${session_id}] Pipeline error:`, error);

    // Attempt to update session status on unexpected error
    try {
      const conn = await getDbConnection();
      conn.reducers.updateSessionStatus(
        session_id,
        'rejected',
        `Unexpected pipeline error: ${error instanceof Error ? error.message : 'unknown'}`,
        'pipeline'
      );
    } catch {
      // Connection may not be available
    }

    return {
      status: 'error',
      message: error instanceof Error ? error.message : 'Unknown pipeline error',
    };
  }
}

// ─── Request Validation ──────────────────────────────────────────

/**
 * Validates and processes an incoming webhook request.
 * This is the handler used by the Mastra API route.
 */
export async function handleProcessRequest(body: unknown): Promise<{
  statusCode: number;
  body: ProcessResponse;
}> {
  // Validate request body
  const parsed = ProcessRequestSchema.safeParse(body);

  if (!parsed.success) {
    return {
      statusCode: 400,
      body: {
        status: 'error',
        message: `Invalid request: ${parsed.error.errors.map((e) => e.message).join(', ')}`,
      },
    };
  }

  const result = await processTransaction(parsed.data.raw_input);

  const statusCode =
    result.status === 'approved' ? 200 :
    result.status === 'rejected' ? 422 :
    500;

  return { statusCode, body: result };
}
