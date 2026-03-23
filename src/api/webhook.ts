/**
 * DeFAI Zero Trust Engine - Webhook API
 *
 * Single entry point: POST /api/process
 * Sequential pipeline orchestrator with fail-fast rejection.
 *
 * Supports two modes:
 * - "safe" (default): Full Zero Trust pipeline with KB Fine Tuning + temp 0
 * - "unsafe" (demo): No KB, no system prompt, temp 1 - shows hallucination risk
 *
 * Pipeline sequence:
 * 1. Generate session_id, create session in SpacetimeDB
 * 2. Run Workflow A or A-unsafe (Grok extraction Path A)
 * 3. Run Workflow B or B-unsafe (Grok extraction Path B - independent)
 * 4. Run Workflow D (TypeScript === consensus check - same for both modes)
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
import { workflowAUnsafe } from '../workflows/workflow-a-unsafe.js';
import { workflowBUnsafe } from '../workflows/workflow-b-unsafe.js';
import { workflowD } from '../workflows/workflow-d.js';
import { workflowPrice } from '../workflows/workflow-price.js';
import { workflowSign } from '../workflows/workflow-sign.js';

// -- Request Schema --
const ProcessRequestSchema = z.object({
  raw_input: z.string().min(1, 'raw_input is required'),
  mode: z.enum(['safe', 'unsafe']).default('safe'),
});

// -- Response Types --
interface SuccessResponse {
  status: 'approved';
  session_id: string;
  mode: 'safe' | 'unsafe';
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
  mode: 'safe' | 'unsafe';
  rejection_reason: string;
  rejection_workflow: string;
}

interface ErrorResponse {
  status: 'error';
  message: string;
}

type ProcessResponse = SuccessResponse | RejectionResponse | ErrorResponse;

// -- Pipeline Orchestrator --

/**
 * Processes a transaction request through the Zero Trust pipeline.
 * Mode determines whether safe (KB + temp 0) or unsafe (no KB + temp 1) agents are used.
 */
export async function processTransaction(
  rawInput: string,
  mode: 'safe' | 'unsafe' = 'safe'
): Promise<ProcessResponse> {
  const session_id = randomUUID();
  const processed_input = preprocessRawInput(rawInput);

  // Select workflow variants based on mode
  const selectedWorkflowA = mode === 'safe' ? workflowA : workflowAUnsafe;
  const selectedWorkflowB = mode === 'safe' ? workflowB : workflowBUnsafe;
  const modeLabel = mode === 'safe' ? 'SAFE' : 'UNSAFE';

  try {
    // Step 0: Create session in SpacetimeDB
    const conn = await getDbConnection();
    conn.reducers.insertSession(session_id, processed_input);

    // Step 1: Run Workflow A (safe or unsafe based on mode)
    console.log(`[${session_id}] [${modeLabel}] Starting Workflow A...`);
    const runA = await selectedWorkflowA.createRun();
    const resultA = await runA.start({
      inputData: { raw_input: processed_input, session_id },
    });

    if (resultA.status !== 'success') {
      return {
        status: 'rejected',
        session_id,
        mode,
        rejection_reason: 'Workflow A execution failed',
        rejection_workflow: 'A',
      };
    }

    const outputA = resultA.result;
    if (outputA.extraction_status === 'failed') {
      return {
        status: 'rejected',
        session_id,
        mode,
        rejection_reason: 'Agent A failed to extract transaction fields',
        rejection_workflow: 'A',
      };
    }

    // Step 2: Run Workflow B (safe or unsafe based on mode - independent)
    console.log(`[${session_id}] [${modeLabel}] Starting Workflow B...`);
    const runB = await selectedWorkflowB.createRun();
    const resultB = await runB.start({
      inputData: { raw_input: processed_input, session_id },
    });

    if (resultB.status !== 'success') {
      return {
        status: 'rejected',
        session_id,
        mode,
        rejection_reason: 'Workflow B execution failed',
        rejection_workflow: 'B',
      };
    }

    const outputB = resultB.result;
    if (outputB.extraction_status === 'failed') {
      return {
        status: 'rejected',
        session_id,
        mode,
        rejection_reason: 'Agent B failed to extract transaction fields',
        rejection_workflow: 'B',
      };
    }

    // Step 3: Run Workflow D - consensus check (same for both modes)
    // The consensus gate is ALWAYS pure TypeScript === regardless of mode
    console.log(`[${session_id}] [${modeLabel}] Starting Workflow D (consensus check)...`);
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
        mode,
        rejection_reason: 'Workflow D execution failed',
        rejection_workflow: 'D',
      };
    }

    const outputD = resultD.result;
    if (!outputD.consensus || !outputD.approved_fields) {
      return {
        status: 'rejected',
        session_id,
        mode,
        rejection_reason: `Consensus failed - mismatched fields: ${outputD.mismatches.join(', ')}`,
        rejection_workflow: 'D',
      };
    }

    // Step 4: Run Workflow Price - Alchemy BTC price + balance + contact
    console.log(`[${session_id}] [${modeLabel}] Starting Workflow Price...`);
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
        mode,
        rejection_reason: 'Workflow Price execution failed',
        rejection_workflow: 'price',
      };
    }

    const outputPrice = resultPrice.result;
    if (outputPrice.status !== 'success') {
      return {
        status: 'rejected',
        session_id,
        mode,
        rejection_reason: `Price check failed: ${outputPrice.status}`,
        rejection_workflow: 'price',
      };
    }

    // Step 5: Run Workflow Sign - Lit Protocol signing + Alchemy broadcast
    console.log(`[${session_id}] [${modeLabel}] Starting Workflow Sign...`);
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
        mode,
        rejection_reason: 'Workflow Sign execution failed',
        rejection_workflow: 'sign',
      };
    }

    const outputSign = resultSign.result;
    if (outputSign.broadcast_status !== 'broadcast_success') {
      return {
        status: 'rejected',
        session_id,
        mode,
        rejection_reason: `Signing/broadcast failed: ${outputSign.broadcast_status}`,
        rejection_workflow: 'sign',
      };
    }

    // All workflows passed - transaction approved
    console.log(`[${session_id}] [${modeLabel}] Transaction approved - tx_hash: ${outputSign.tx_hash}`);

    return {
      status: 'approved',
      session_id,
      mode,
      tx_hash: outputSign.tx_hash,
      btc_amount: outputPrice.btc_amount,
      usd_amount: outputPrice.usd_amount,
      destination_name: outputPrice.destination_name,
      destination_address: outputPrice.destination_address,
      btc_price_usd: outputPrice.btc_price_usd,
    };
  } catch (error) {
    console.error(`[${session_id}] [${modeLabel}] Pipeline error:`, error);

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

// -- Request Validation --

/**
 * Validates and processes an incoming webhook request.
 * Accepts optional mode parameter: "safe" (default) or "unsafe" (demo).
 */
export async function handleProcessRequest(body: unknown): Promise<{
  statusCode: number;
  body: ProcessResponse;
}> {
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

  const result = await processTransaction(parsed.data.raw_input, parsed.data.mode);

  const statusCode =
    result.status === 'approved' ? 200 :
    result.status === 'rejected' ? 422 :
    500;

  return { statusCode, body: result };
}
