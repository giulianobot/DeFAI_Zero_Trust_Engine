/**
 * DeFAI Zero Trust Engine — Workflow D (Consensus Gate)
 *
 * Pure TypeScript strict equality comparison of all 5 extracted fields.
 * Compares Workflow A output against Workflow B output.
 * ZERO LLM involvement — this is the core anti-hallucination mechanism.
 *
 * If both agents independently extracted identical normalised fields,
 * the transaction is approved for price checking.
 * A single field mismatch rejects the entire transaction.
 *
 * This prevents the next Lobster Wilde incident.
 */

import { createWorkflow, createStep } from '@mastra/core/workflows';
import { z } from 'zod';
import { getDbConnection } from '../lib/spacetimedb-client.js';

// ─── Input Schema ────────────────────────────────────────────────
const ConsensusInputSchema = z.object({
  session_id: z.string(),
  result_a: z.object({
    action: z.string(),
    amount: z.number(),
    token_tag: z.string(),
    network_tag: z.string(),
    destination_tag: z.string(),
    extraction_status: z.string(),
  }),
  result_b: z.object({
    action: z.string(),
    amount: z.number(),
    token_tag: z.string(),
    network_tag: z.string(),
    destination_tag: z.string(),
    extraction_status: z.string(),
  }),
});

// ─── Output Schema ───────────────────────────────────────────────
const ConsensusOutputSchema = z.object({
  consensus: z.boolean(),
  mismatches: z.array(z.string()),
  approved_fields: z
    .object({
      action: z.string(),
      amount: z.number(),
      token_tag: z.string(),
      network_tag: z.string(),
      destination_tag: z.string(),
    })
    .optional(),
});

type ConsensusOutput = z.infer<typeof ConsensusOutputSchema>;

// ─── The 5 Fields to Compare ─────────────────────────────────────
const COMPARISON_FIELDS = [
  'action',
  'amount',
  'token_tag',
  'network_tag',
  'destination_tag',
] as const;

// ─── Consensus Check Step ────────────────────────────────────────
const consensusCheckStep = createStep({
  id: 'consensus-check',
  inputSchema: ConsensusInputSchema,
  outputSchema: ConsensusOutputSchema,
  execute: async ({ inputData }): Promise<ConsensusOutput> => {
    const { session_id, result_a, result_b } = inputData;

    // Guard: if either extraction failed, reject immediately
    if (
      result_a.extraction_status === 'failed' ||
      result_b.extraction_status === 'failed'
    ) {
      const conn = await getDbConnection();

      // Update session to rejected
      conn.reducers.updateSessionStatus(
        session_id,
        'rejected',
        'One or both agents failed extraction',
        'D'
      );

      // Write audit log
      conn.reducers.insertWorkflowResult(
        session_id,
        'D',
        JSON.stringify({
          consensus: false,
          reason: 'extraction_failure',
          a_status: result_a.extraction_status,
          b_status: result_b.extraction_status,
        })
      );

      return {
        consensus: false,
        mismatches: ['extraction_failure'],
      };
    }

    // Pure TypeScript === comparison on all 5 fields
    const mismatches: string[] = [];

    for (const field of COMPARISON_FIELDS) {
      const valueA = result_a[field];
      const valueB = result_b[field];

      if (valueA !== valueB) {
        mismatches.push(field);
      }
    }

    const consensus = mismatches.length === 0;

    // Write result to SpacetimeDB
    const conn = await getDbConnection();

    if (consensus) {
      // All 5 fields match — approve for price checking
      conn.reducers.insertWorkflowResult(
        session_id,
        'D',
        JSON.stringify({
          consensus: true,
          fields: {
            action: result_a.action,
            amount: result_a.amount,
            token_tag: result_a.token_tag,
            network_tag: result_a.network_tag,
            destination_tag: result_a.destination_tag,
          },
        })
      );

      return {
        consensus: true,
        mismatches: [],
        approved_fields: {
          action: result_a.action,
          amount: result_a.amount,
          token_tag: result_a.token_tag,
          network_tag: result_a.network_tag,
          destination_tag: result_a.destination_tag,
        },
      };
    }

    // Mismatch detected — reject the transaction
    conn.reducers.updateSessionStatus(
      session_id,
      'rejected',
      `Consensus failed on fields: ${mismatches.join(', ')}`,
      'D'
    );

    conn.reducers.insertWorkflowResult(
      session_id,
      'D',
      JSON.stringify({
        consensus: false,
        mismatches,
        a_values: Object.fromEntries(
          mismatches.map((f) => [f, result_a[f as keyof typeof result_a]])
        ),
        b_values: Object.fromEntries(
          mismatches.map((f) => [f, result_b[f as keyof typeof result_b]])
        ),
      })
    );

    return {
      consensus: false,
      mismatches,
    };
  },
});

// ─── Workflow Definition ─────────────────────────────────────────
export const workflowD = createWorkflow({
  id: 'workflow-d',
  inputSchema: ConsensusInputSchema,
  outputSchema: ConsensusOutputSchema,
})
  .then(consensusCheckStep)
  .commit();
