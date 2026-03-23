/**
 * DeFAI Zero Trust Engine - Workflow A Unsafe (Demo Mode)
 *
 * INTENTIONALLY UNSAFE variant of Workflow A for demonstration purposes.
 * No knowledge base loaded. No system prompt. Temperature 1 (maximum randomness).
 * This exists to let users see what happens WITHOUT the Zero Trust Engine
 * protections - the AI is far more likely to hallucinate transaction fields.
 *
 * Used when users toggle "Disable Prompt" and "Disable KB" in the UI.
 * Results are still written to SpacetimeDB for audit and comparison.
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
const WorkflowAUnsafeOutputSchema = z.object({
  action: z.string(),
  amount: z.number(),
  token_tag: z.string(),
  network_tag: z.string(),
  destination_tag: z.string(),
  extraction_status: z.enum(['success', 'failed']),
});

type WorkflowAUnsafeOutput = z.infer<typeof WorkflowAUnsafeOutputSchema>;

// -- Extraction Step (NO KB, NO system prompt, Temperature 1) --
const extractFieldsUnsafeStep = createStep({
  id: 'extract-fields-a-unsafe',
  inputSchema: z.object({
    raw_input: z.string(),
    session_id: z.string(),
  }),
  outputSchema: WorkflowAUnsafeOutputSchema,
  execute: async ({ inputData }) => {
    const { raw_input, session_id } = inputData;

    // NO Runtime KB Fine Tuning - agent has minimal instructions only
    const agentAUnsafe = new Agent({
      id: 'grok-extraction-agent-a-unsafe',
      name: 'Grok Extraction Agent A (Unsafe Demo)',
      model: {
        id: 'xai/grok-4.20-multi-agent-0309',
        defaultObjectGenerationMode: 'json' as const,
      },
      instructions: 'Extract transaction fields from the user message as JSON.',
    });

    // Call Grok with temperature 1 (maximum randomness)
    const response = await agentAUnsafe.generate(
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
        'A-unsafe',
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
      'A-unsafe',
      JSON.stringify({ ...normalised, mode: 'unsafe' })
    );

    return {
      ...normalised,
      extraction_status: 'success' as const,
    };
  },
});

// -- Workflow Definition --
export const workflowAUnsafe = createWorkflow({
  id: 'workflow-a-unsafe',
  inputSchema: z.object({
    raw_input: z.string(),
    session_id: z.string(),
  }),
  outputSchema: WorkflowAUnsafeOutputSchema,
})
  .then(extractFieldsUnsafeStep)
  .commit();
