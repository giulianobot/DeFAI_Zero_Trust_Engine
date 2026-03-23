/**
 * DeFAI Zero Trust Engine — Workflow B
 *
 * Grok Agent Path B: Independent transaction field extraction.
 * Loads knowledge-base-b.md via readFileSync as Runtime KB Fine Tuning.
 * Extracts the same 5 fields from raw user input independently.
 *
 * This workflow has zero access to Workflow A results.
 * Uses different KB wording to prevent shared-prompt bias.
 */

import { createWorkflow, createStep } from '@mastra/core/workflows';
import { Agent } from '@mastra/core/agent';
import { z } from 'zod';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ExtractedFieldsSchema,
  normaliseFields,
  type NormalisedFields,
} from '../lib/normalise.js';
import { getDbConnection } from '../lib/spacetimedb-client.js';

// ─── Resolve Knowledge Base Path ─────────────────────────────────
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const KB_PATH = resolve(__dirname, '../knowledge-bases/knowledge-base-b.md');

// ─── Workflow Output Schema ──────────────────────────────────────
const WorkflowBOutputSchema = z.object({
  action: z.string(),
  amount: z.number(),
  token_tag: z.string(),
  network_tag: z.string(),
  destination_tag: z.string(),
  extraction_status: z.enum(['success', 'failed']),
});

type WorkflowBOutput = z.infer<typeof WorkflowBOutputSchema>;

// ─── Extraction Step ─────────────────────────────────────────────
const extractFieldsStep = createStep({
  id: 'extract-fields-b',
  inputSchema: z.object({
    raw_input: z.string(),
    session_id: z.string(),
  }),
  outputSchema: WorkflowBOutputSchema,
  execute: async ({ inputData }) => {
    const { raw_input, session_id } = inputData;

    // Runtime KB Fine Tuning: load knowledge base as agent instructions
    const kbContent = readFileSync(KB_PATH, 'utf-8');

    // Create Grok agent with KB-injected system prompt
    const agentB = new Agent({
      id: 'grok-extraction-agent-b',
      name: 'Grok Extraction Agent B',
      model: {
        id: 'xai/grok-4.20-multi-agent-0309',
        defaultObjectGenerationMode: 'json' as const,
      },
      instructions: kbContent,
    });

    // Call Grok with raw input as user message
    const response = await agentB.generate(
      [{ role: 'user', content: raw_input }],
      {
        temperature: 0,
        output: ExtractedFieldsSchema,
      }
    );

    // Parse and validate the structured output
    const parsed = ExtractedFieldsSchema.safeParse(response.object);

    if (!parsed.success || parsed.data.action === 'EXTRACTION_FAILED') {
      // Extraction failed — write failure to SpacetimeDB
      const conn = await getDbConnection();
      conn.reducers.insertWorkflowResult(
        session_id,
        'B',
        JSON.stringify({ status: 'EXTRACTION_FAILED' })
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

    // Normalise the extracted fields
    const normalised: NormalisedFields = normaliseFields(parsed.data);

    // Write successful result to SpacetimeDB
    const conn = await getDbConnection();
    conn.reducers.insertWorkflowResult(
      session_id,
      'B',
      JSON.stringify(normalised)
    );

    return {
      ...normalised,
      extraction_status: 'success' as const,
    };
  },
});

// ─── Workflow Definition ─────────────────────────────────────────
export const workflowB = createWorkflow({
  id: 'workflow-b',
  inputSchema: z.object({
    raw_input: z.string(),
    session_id: z.string(),
  }),
  outputSchema: WorkflowBOutputSchema,
})
  .then(extractFieldsStep)
  .commit();
