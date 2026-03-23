/**
 * DeFAI Zero Trust Engine — Workflow Sign
 *
 * Final workflow in the pipeline. Only runs if ALL prior workflows pass.
 * 1. Constructs a Bitcoin testnet PSBT for the approved transaction
 * 2. Signs via Lit Protocol Chipotle v3 REST API using PKP wallet
 * 3. Broadcasts the signed transaction via Alchemy Bitcoin Testnet RPC
 * 4. Writes complete audit log entry to SpacetimeDB
 * 5. Returns the transaction hash
 *
 * Uses raw fetch() for all HTTP calls — no SDK packages.
 */

import { createWorkflow, createStep } from '@mastra/core/workflows';
import { z } from 'zod';
import dotenv from 'dotenv';
import { getDbConnection } from '../lib/spacetimedb-client.js';

dotenv.config();

const ALCHEMY_API_KEY = process.env.ALCHEMY_API_KEY ?? '';
const LIT_API_KEY = process.env.LIT_API_KEY ?? '';
const LIT_API_BASE = 'https://api.dev.litprotocol.com';

// ─── Input Schema ────────────────────────────────────────────────
const SignInputSchema = z.object({
  session_id: z.string(),
  destination_address: z.string(),
  btc_amount: z.number(),
  usd_amount: z.number(),
  destination_name: z.string(),
});

// ─── Output Schema ───────────────────────────────────────────────
const SignOutputSchema = z.object({
  tx_hash: z.string(),
  broadcast_status: z.enum(['broadcast_success', 'sign_failed', 'broadcast_failed']),
  signed_psbt: z.string().optional(),
});

type SignOutput = z.infer<typeof SignOutputSchema>;

// ─── Sign and Broadcast Step ─────────────────────────────────────
const signAndBroadcastStep = createStep({
  id: 'sign-and-broadcast',
  inputSchema: SignInputSchema,
  outputSchema: SignOutputSchema,
  execute: async ({ inputData }): Promise<SignOutput> => {
    const { session_id, destination_address, btc_amount, usd_amount, destination_name } = inputData;

    const failureResult = (status: SignOutput['broadcast_status']): SignOutput => ({
      tx_hash: '',
      broadcast_status: status,
    });

    // Step 1: Sign PSBT via Lit Protocol Chipotle v3
    let signedPsbt: string;
    try {
      // Execute Lit Action for BTC PSBT signing via PKP
      const litResponse = await fetch(`${LIT_API_BASE}/api/v1/actions/execute`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${LIT_API_KEY}`,
        },
        body: JSON.stringify({
          // Lit Action for BTC testnet PSBT signing
          code: `
            (async () => {
              const sigShare = await LitActions.signEcdsa({
                toSign: dataToSign,
                publicKey,
                sigName: "btc-testnet-sign",
              });
              LitActions.setResponse({ response: JSON.stringify({ signature: sigShare }) });
            })()
          `,
          jsParams: {
            dataToSign: {
              destination: destination_address,
              amount_btc: btc_amount,
              network: 'bitcoin-testnet',
            },
            publicKey: '', // PKP public key — configured in Lit Dashboard
          },
        }),
      });

      if (!litResponse.ok) {
        const errorText = await litResponse.text();
        console.error(`Lit Protocol sign failed (${litResponse.status}):`, errorText);
        const conn = await getDbConnection();
        conn.reducers.updateSessionStatus(
          session_id,
          'rejected',
          `Lit Protocol signing failed: ${litResponse.status}`,
          'sign'
        );
        conn.reducers.insertAuditLog(session_id, 'rejected', 'Lit Protocol signing failed', 'sign', '');
        return failureResult('sign_failed');
      }

      const litData = await litResponse.json();
      signedPsbt = litData.response ?? litData.signedData ?? '';

      if (!signedPsbt) {
        console.error('Lit Protocol returned empty signed data');
        const conn = await getDbConnection();
        conn.reducers.updateSessionStatus(session_id, 'rejected', 'Empty signed PSBT', 'sign');
        conn.reducers.insertAuditLog(session_id, 'rejected', 'Empty signed PSBT', 'sign', '');
        return failureResult('sign_failed');
      }
    } catch (error) {
      console.error('Lit Protocol sign error:', error);
      const conn = await getDbConnection();
      conn.reducers.updateSessionStatus(session_id, 'rejected', 'Lit Protocol error', 'sign');
      conn.reducers.insertAuditLog(session_id, 'rejected', 'Lit Protocol error', 'sign', '');
      return failureResult('sign_failed');
    }

    // Step 2: Broadcast signed transaction via Alchemy Bitcoin Testnet RPC
    let txHash: string;
    try {
      const rpcUrl = `https://bitcoin-testnet.g.alchemy.com/v2/${ALCHEMY_API_KEY}`;
      const broadcastResponse = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'sendrawtransaction',
          params: [signedPsbt],
        }),
      });

      if (!broadcastResponse.ok) {
        console.error(`Alchemy broadcast returned ${broadcastResponse.status}`);
        const conn = await getDbConnection();
        conn.reducers.updateSessionStatus(session_id, 'rejected', 'Broadcast failed', 'sign');
        conn.reducers.insertAuditLog(session_id, 'rejected', 'Broadcast failed', 'sign', '');
        return failureResult('broadcast_failed');
      }

      const broadcastData = await broadcastResponse.json();

      if (broadcastData.error) {
        console.error('Alchemy broadcast error:', broadcastData.error.message);
        const conn = await getDbConnection();
        conn.reducers.updateSessionStatus(
          session_id,
          'rejected',
          `Broadcast error: ${broadcastData.error.message}`,
          'sign'
        );
        conn.reducers.insertAuditLog(
          session_id,
          'rejected',
          `Broadcast error: ${broadcastData.error.message}`,
          'sign',
          ''
        );
        return failureResult('broadcast_failed');
      }

      txHash = broadcastData.result;
    } catch (error) {
      console.error('Alchemy broadcast error:', error);
      const conn = await getDbConnection();
      conn.reducers.updateSessionStatus(session_id, 'rejected', 'Broadcast error', 'sign');
      conn.reducers.insertAuditLog(session_id, 'rejected', 'Broadcast error', 'sign', '');
      return failureResult('broadcast_failed');
    }

    // Step 3: Write complete audit log and update session to approved
    const conn = await getDbConnection();

    conn.reducers.updateSessionStatus(session_id, 'approved', '', '');

    conn.reducers.insertAuditLog(session_id, 'approved', '', '', txHash);

    conn.reducers.insertWorkflowResult(
      session_id,
      'sign',
      JSON.stringify({
        tx_hash: txHash,
        destination_address,
        destination_name,
        btc_amount,
        usd_amount,
        broadcast_status: 'broadcast_success',
      })
    );

    console.log(`Transaction broadcast successful — tx_hash: ${txHash}`);

    return {
      tx_hash: txHash,
      broadcast_status: 'broadcast_success',
      signed_psbt: signedPsbt,
    };
  },
});

// ─── Workflow Definition ─────────────────────────────────────────
export const workflowSign = createWorkflow({
  id: 'workflow-sign',
  inputSchema: SignInputSchema,
  outputSchema: SignOutputSchema,
})
  .then(signAndBroadcastStep)
  .commit();
