/**
 * DeFAI Zero Trust Engine — Workflow Price
 *
 * After consensus is reached, this workflow:
 * 1. Fetches real-time BTC/USD price from Alchemy Prices API
 * 2. Converts the integer USD amount to BTC (8 decimal places max)
 * 3. Looks up the destination contact in SpacetimeDB
 * 4. Checks the wallet balance via Alchemy Bitcoin Testnet RPC
 * 5. Verifies sufficient balance for the transaction
 *
 * Any failure (contact not found, insufficient balance) stops the pipeline.
 */

import { createWorkflow, createStep } from '@mastra/core/workflows';
import { z } from 'zod';
import dotenv from 'dotenv';
import { getDbConnection, findContactByTag } from '../lib/spacetimedb-client.js';

dotenv.config();

const ALCHEMY_API_KEY = process.env.ALCHEMY_API_KEY ?? '';

// ─── Input Schema ────────────────────────────────────────────────
const PriceInputSchema = z.object({
  session_id: z.string(),
  action: z.string(),
  amount: z.number().int().positive(),
  token_tag: z.string(),
  network_tag: z.string(),
  destination_tag: z.string(),
});

// ─── Output Schema ───────────────────────────────────────────────
const PriceOutputSchema = z.object({
  btc_price_usd: z.number(),
  usd_amount: z.number(),
  btc_amount: z.number(),
  balance_btc: z.number(),
  sufficient_balance: z.boolean(),
  destination_address: z.string(),
  destination_name: z.string(),
  status: z.enum(['success', 'contact_not_found', 'insufficient_balance', 'price_fetch_failed', 'balance_check_failed']),
});

type PriceOutput = z.infer<typeof PriceOutputSchema>;

// ─── Alchemy Prices API Response Shape ───────────────────────────
interface AlchemyPriceResponse {
  data: Array<{
    symbol: string;
    prices: Array<{
      currency: string;
      value: string;
      lastUpdatedAt: string;
    }>;
    error: null | string;
  }>;
}

// ─── Alchemy Bitcoin Testnet RPC Response ────────────────────────
interface AlchemyRpcResponse {
  jsonrpc: string;
  id: number;
  result: string;
  error?: { code: number; message: string };
}

// ─── Price and Balance Step ──────────────────────────────────────
const priceAndBalanceStep = createStep({
  id: 'price-and-balance',
  inputSchema: PriceInputSchema,
  outputSchema: PriceOutputSchema,
  execute: async ({ inputData }): Promise<PriceOutput> => {
    const { session_id, amount, destination_tag } = inputData;

    const failureResult = (status: PriceOutput['status']): PriceOutput => ({
      btc_price_usd: 0,
      usd_amount: amount,
      btc_amount: 0,
      balance_btc: 0,
      sufficient_balance: false,
      destination_address: '',
      destination_name: '',
      status,
    });

    // Step 1: Fetch BTC/USD price from Alchemy
    let btcPriceUsd: number;
    try {
      const priceUrl = `https://api.g.alchemy.com/prices/v1/${ALCHEMY_API_KEY}/tokens/by-symbol?symbols=BTC`;
      const priceResponse = await fetch(priceUrl, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!priceResponse.ok) {
        console.error(`Alchemy price API returned ${priceResponse.status}`);
        const conn = await getDbConnection();
        conn.reducers.updateSessionStatus(session_id, 'rejected', 'Price fetch failed', 'price');
        return failureResult('price_fetch_failed');
      }

      const priceData: AlchemyPriceResponse = await priceResponse.json();
      btcPriceUsd = parseFloat(priceData.data[0].prices[0].value);

      if (isNaN(btcPriceUsd) || btcPriceUsd <= 0) {
        console.error('Invalid BTC price received:', priceData.data[0].prices[0].value);
        const conn = await getDbConnection();
        conn.reducers.updateSessionStatus(session_id, 'rejected', 'Invalid BTC price', 'price');
        return failureResult('price_fetch_failed');
      }
    } catch (error) {
      console.error('Alchemy price fetch error:', error);
      const conn = await getDbConnection();
      conn.reducers.updateSessionStatus(session_id, 'rejected', 'Price fetch error', 'price');
      return failureResult('price_fetch_failed');
    }

    // Step 2: Convert USD to BTC (8 decimal places max)
    const btcAmount = parseFloat((amount / btcPriceUsd).toFixed(8));

    // Step 3: Look up destination contact in SpacetimeDB
    const contact = await findContactByTag(destination_tag);

    if (!contact) {
      console.error(`Contact not found: ${destination_tag}`);
      const conn = await getDbConnection();
      conn.reducers.updateSessionStatus(session_id, 'rejected', `CONTACT_NOT_FOUND: ${destination_tag}`, 'price');
      return failureResult('contact_not_found');
    }

    const destinationAddress = contact.bitcoinTestnetAddress;

    if (!destinationAddress) {
      console.error(`Contact ${destination_tag} has no bitcoin testnet address`);
      const conn = await getDbConnection();
      conn.reducers.updateSessionStatus(session_id, 'rejected', `Contact ${destination_tag} has no BTC address`, 'price');
      return failureResult('contact_not_found');
    }

    // Step 4: Check wallet balance via Alchemy Bitcoin Testnet RPC
    let balanceBtc: number;
    try {
      const rpcUrl = `https://bitcoin-testnet.g.alchemy.com/v2/${ALCHEMY_API_KEY}`;
      const balanceResponse = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'getbalance',
          params: [],
        }),
      });

      if (!balanceResponse.ok) {
        console.error(`Alchemy RPC returned ${balanceResponse.status}`);
        const conn = await getDbConnection();
        conn.reducers.updateSessionStatus(session_id, 'rejected', 'Balance check failed', 'price');
        return failureResult('balance_check_failed');
      }

      const balanceData: AlchemyRpcResponse = await balanceResponse.json();

      if (balanceData.error) {
        console.error('Alchemy RPC error:', balanceData.error.message);
        const conn = await getDbConnection();
        conn.reducers.updateSessionStatus(session_id, 'rejected', `RPC error: ${balanceData.error.message}`, 'price');
        return failureResult('balance_check_failed');
      }

      // Balance returned in BTC
      balanceBtc = parseFloat(balanceData.result) || 0;
    } catch (error) {
      console.error('Alchemy balance check error:', error);
      const conn = await getDbConnection();
      conn.reducers.updateSessionStatus(session_id, 'rejected', 'Balance check error', 'price');
      return failureResult('balance_check_failed');
    }

    // Step 5: Verify sufficient balance
    const sufficientBalance = balanceBtc >= btcAmount;

    if (!sufficientBalance) {
      console.error(`Insufficient balance: ${balanceBtc} BTC < ${btcAmount} BTC required`);
      const conn = await getDbConnection();
      conn.reducers.updateSessionStatus(
        session_id,
        'rejected',
        `INSUFFICIENT_BALANCE: have ${balanceBtc} BTC, need ${btcAmount} BTC`,
        'price'
      );

      conn.reducers.insertWorkflowResult(
        session_id,
        'price',
        JSON.stringify({
          btc_price_usd: btcPriceUsd,
          btc_amount: btcAmount,
          balance_btc: balanceBtc,
          sufficient: false,
        })
      );

      return {
        btc_price_usd: btcPriceUsd,
        usd_amount: amount,
        btc_amount: btcAmount,
        balance_btc: balanceBtc,
        sufficient_balance: false,
        destination_address: destinationAddress,
        destination_name: contact.name,
        status: 'insufficient_balance',
      };
    }

    // All checks passed — write success to SpacetimeDB
    const conn = await getDbConnection();
    conn.reducers.insertWorkflowResult(
      session_id,
      'price',
      JSON.stringify({
        btc_price_usd: btcPriceUsd,
        usd_amount: amount,
        btc_amount: btcAmount,
        balance_btc: balanceBtc,
        sufficient: true,
        destination_address: destinationAddress,
        destination_name: contact.name,
      })
    );

    return {
      btc_price_usd: btcPriceUsd,
      usd_amount: amount,
      btc_amount: btcAmount,
      balance_btc: balanceBtc,
      sufficient_balance: true,
      destination_address: destinationAddress,
      destination_name: contact.name,
      status: 'success',
    };
  },
});

// ─── Workflow Definition ─────────────────────────────────────────
export const workflowPrice = createWorkflow({
  id: 'workflow-price',
  inputSchema: PriceInputSchema,
  outputSchema: PriceOutputSchema,
})
  .then(priceAndBalanceStep)
  .commit();
