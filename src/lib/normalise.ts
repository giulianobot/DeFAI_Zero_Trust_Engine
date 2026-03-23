/**
 * DeFAI Zero Trust Engine — Normalisation Library
 *
 * Deterministic input normalisation applied before any workflow processes data.
 * All functions are pure, side-effect-free, and produce consistent output
 * for consistent input — essential for multi-agent consensus accuracy.
 */

import { z } from 'zod';

// ─── Token Tag Resolution Map ────────────────────────────────────
// Maps common synonyms to canonical token identifiers
const TOKEN_SYNONYMS: Record<string, string> = {
  btc: 'BTC',
  bitcoin: 'BTC',
  sat: 'BTC',
  sats: 'BTC',
  satoshi: 'BTC',
  satoshis: 'BTC',
};

// ─── Network Tag Resolution Map ──────────────────────────────────
const NETWORK_SYNONYMS: Record<string, string> = {
  bitcoin: 'bitcoin',
  btc: 'bitcoin',
  'bitcoin-testnet': 'bitcoin',
  'btc-testnet': 'bitcoin',
  testnet: 'bitcoin',
};

// ─── Zod Schemas ─────────────────────────────────────────────────

/** Schema for the 5 fields extracted by Grok agents */
export const ExtractedFieldsSchema = z.object({
  action: z.literal('send'),
  amount: z.number().int().positive(),
  token_tag: z.string().min(1),
  network_tag: z.string().min(1),
  destination_tag: z.string().min(1),
});

export type ExtractedFields = z.infer<typeof ExtractedFieldsSchema>;

/** Schema for normalised output — same shape, validated values */
export const NormalisedFieldsSchema = z.object({
  action: z.literal('send'),
  amount: z.number().int().positive(),
  token_tag: z.string().min(1),
  network_tag: z.string().min(1),
  destination_tag: z.string().min(1),
});

export type NormalisedFields = z.infer<typeof NormalisedFieldsSchema>;

/** Bitcoin testnet address validation regex */
export const BITCOIN_TESTNET_ADDRESS_REGEX = /^[mn2][a-km-zA-HJ-NP-Z1-9]{25,34}$/;

/** Zod schema for validating Bitcoin testnet addresses */
export const BitcoinTestnetAddressSchema = z
  .string()
  .regex(BITCOIN_TESTNET_ADDRESS_REGEX, 'Bitcoin testnet address must start with m, n, or 2');

// ─── Individual Normalisation Functions ──────────────────────────

/**
 * Normalises the action field.
 * Only "send" is valid for V0 MVP.
 */
export function normaliseAction(raw: string): string {
  const cleaned = raw.toLowerCase().trim();
  if (cleaned === 'send' || cleaned === 'transfer') {
    return 'send';
  }
  return cleaned;
}

/**
 * Normalises the amount field.
 * Strips currency symbols, commas, whitespace.
 * Returns integer value.
 */
export function normaliseAmount(raw: string | number): number {
  if (typeof raw === 'number') {
    return Math.floor(raw);
  }
  const cleaned = raw
    .replace(/[$£€,\s]/g, '')
    .trim();
  const parsed = parseInt(cleaned, 10);
  if (isNaN(parsed) || parsed <= 0) {
    return -1; // Signals invalid amount for upstream validation
  }
  return parsed;
}

/**
 * Normalises the token tag.
 * Resolves synonyms: btc, bitcoin, sat, sats → BTC
 */
export function normaliseTokenTag(raw: string): string {
  const cleaned = raw.toLowerCase().trim();
  return TOKEN_SYNONYMS[cleaned] ?? cleaned.toUpperCase();
}

/**
 * Normalises the network tag.
 * Resolves synonyms: btc, bitcoin-testnet → bitcoin
 */
export function normaliseNetworkTag(raw: string): string {
  const cleaned = raw.toLowerCase().trim();
  return NETWORK_SYNONYMS[cleaned] ?? cleaned;
}

/**
 * Normalises the destination tag.
 * Lowercased and trimmed for consistent contact lookup.
 */
export function normaliseDestinationTag(raw: string): string {
  return raw.toLowerCase().trim();
}

// ─── Aggregator ──────────────────────────────────────────────────

/**
 * Normalises all 5 extracted fields in one pass.
 * Returns a fully normalised, validated result.
 */
export function normaliseFields(fields: ExtractedFields): NormalisedFields {
  return {
    action: normaliseAction(fields.action) as 'send',
    amount: normaliseAmount(fields.amount),
    token_tag: normaliseTokenTag(fields.token_tag),
    network_tag: normaliseNetworkTag(fields.network_tag),
    destination_tag: normaliseDestinationTag(fields.destination_tag),
  };
}

// ─── Raw Input Preprocessing ─────────────────────────────────────

/**
 * Preprocesses the raw user input before sending to any agent.
 * Applied once at webhook level — agents receive cleaned input.
 */
export function preprocessRawInput(raw: string): string {
  return raw.toLowerCase().trim();
}
