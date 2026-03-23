/**
 * DeFAI Zero Trust Engine - Workflow B Unsafe (Demo Mode)
 *
 * INTENTIONALLY UNSAFE variant of Workflow B for demonstration purposes.
 * No knowledge base loaded. No system prompt. Temperature 1 (maximum randomness).
 * Independent from Workflow A Unsafe - same isolation principle applies.
 *
 * When both unsafe agents produce different outputs (which they will at temp 1),
 * Workflow D will catch the mismatch and reject - proving the consensus gate works.
 * When they happen to agree on a wrong value, it demonstrates why temperature 0
 * and KB Fine Tuning matter.
 */

import { createWorkflow, createStep } from '@mastra/core/workflows';
import { Agent } from '@mastra/core/agent';
import { z } from 'zod';
import {
  ExtractedFieldsSchema,
  normaliseFields,
  type NormalisedFields,
} from '../lib/normalise.js';
import { getDbConnection } from '../lib/spacetimedb-client.js';

// -- Workflow Output Schema --
const WorkflowBUnsafeOutputSchema = z.object({
  action: z.string(),
  amount: z.number(),
  token_tag: z.string(),
  network_tag: z.string(),
  destination_tag: z.string(),
  extraction_status: z.enum(['success', 'failed']),
});

type WorkflowBUnsafeOutput = z.infer<typeof WorkflowBUnsafeOutputSchema>;

// -- Extraction Step (NO KB, NO system prompt, Temperature 1) --
const extractFieldsUnsafeStep = createStep({
  id: 'extract-fields-b-unsafe',
  inputSchema: z.object({
    raw_input: z.string(),
    session_id: z.string(),
  }),
  outputSchema: WorkflowBUnsafeOutputSchema,
  execute: async ({ inputData }) => {
    const { raw_input, session_id } = inputData;

    // NO Runtime KB Fine Tuning - agent has minimal instructions only
    const agentBUnsafe = new Agent({
      id: 'grok-extraction-agent-b-unsafe',
      name: 'Grok Extraction Agent B (Unsafe Demo)',
      model: {
        id: 'xai/grok-4.20-multi-agent-0309',
        defaultObjectGenerationMode: 'json' as const,
      },
      instructions: 'Parse the transaction request into structured JSON fields.',
    });

    // Call Grok with temperature 1 (maximum randomness)
    const response = await agentBUnsafe.generate(
      [{ role: 'user', content: raw_input }],
      {
        temperature: 1,
        output: ExtractedFieldsSchema,
      }
    );

    const parsed = ExtractedFieldsSchema.safeParse(response.object);

    if (!parsed.success || parsed.data.action === 'EXTRACTION_FAILED') {
      const conn = await getDbConnection();
      conn.reducers.insertWorkflowResult(
        session_id,
        'B-unsafe',
        JSON.stringify({ status: 'EXTRACTION_FAILED', mode: 'unsafe' })
      );

      return {
        action: 'EXTRACTION_FAILED',
        amount: 0,
        token_tag: '',
        network_tag: '',
        destination_tag: '',
        extraction_status: 'failed' as const,
      };
    }

    const normalised: NormalisedFields = normaliseFields(parsed.data);

    const conn = await getDbConnection();
    conn.reducers.insertWorkflowResult(
      session_id,
      'B-unsafe',
      JSON.stringify({ ...normalised, mode: 'unsafe' })
    );

    return {
      ...normalised,
      extraction_status: 'success' as const,
    };
  },
});

// -- Workflow Definition --
export const workflowBUnsafe = createWorkflow({
  id: 'workflow-b-unsafe',
  inputSchema: z.object({
    raw_input: z.string(),
    session_id: z.string(),
  }),
  outputSchema: WorkflowBUnsafeOutputSchema,
})
  .then(extractFieldsUnsafeStep)
  .commit();
