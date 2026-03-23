/**
 * DeFAI Zero Trust Engine — SpacetimeDB Server Module
 *
 * Defines all 5 tables and their reducers for session state and audit data.
 * Tables: sessions, workflow_results, contacts, tokens, audit_log
 *
 * SpacetimeDB 2.0 TypeScript server module.
 * After editing, run: pnpm spacetime:generate
 */

import { schema, table, t } from 'spacetimedb/server';

// ─── Sessions Table ───────────────────────────────────────────────
// Tracks each transaction request through the pipeline
const sessions = table(
  { name: 'sessions', public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    session_id: t.string().unique(),
    raw_input: t.string(),
    status: t.string(),             // "pending" | "approved" | "rejected"
    rejection_reason: t.string(),   // empty string when no rejection
    rejection_workflow: t.string(), // empty string when no rejection
    created_at: t.u64(),
  }
);

// ─── Workflow Results Table ───────────────────────────────────────
// Stores output from each workflow step independently
const workflow_results = table(
  { name: 'workflow_results', public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    session_id: t.string(),
    workflow_name: t.string(),      // "A" | "B" | "D" | "price" | "sign"
    result_json: t.string(),        // serialised JSON of workflow output
    created_at: t.u64(),
  }
);

// ─── Contacts Table ──────────────────────────────────────────────
// Maps contact tags to Bitcoin testnet addresses
const contacts = table(
  { name: 'contacts', public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    tag: t.string().unique(),
    name: t.string(),
    bitcoin_testnet_address: t.string(), // starts with m, n, or 2
    verified: t.bool(),
  }
);

// ─── Tokens Table ────────────────────────────────────────────────
// Supported token metadata for validation
const tokens = table(
  { name: 'tokens', public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    tag: t.string().unique(),
    name: t.string(),
    network_tag: t.string(),
  }
);

// ─── Audit Log Table ─────────────────────────────────────────────
// Complete audit trail of every transaction attempt
const audit_log = table(
  { name: 'audit_log', public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    session_id: t.string(),
    outcome: t.string(),            // "approved" | "rejected"
    rejection_reason: t.string(),   // empty string when approved
    rejection_workflow: t.string(), // empty string when approved
    tx_hash: t.string(),            // empty string when no transaction
    created_at: t.u64(),
  }
);

// ─── Schema Export ───────────────────────────────────────────────
const spacetimedb = schema({
  sessions,
  workflow_results,
  contacts,
  tokens,
  audit_log,
});

export default spacetimedb;

// ─── Sessions Reducers ───────────────────────────────────────────

export const insert_session = spacetimedb.reducer(
  {
    session_id: t.string(),
    raw_input: t.string(),
  },
  (ctx, { session_id, raw_input }) => {
    ctx.db.sessions.insert({
      id: 0n,
      session_id,
      raw_input,
      status: 'pending',
      rejection_reason: '',
      rejection_workflow: '',
      created_at: BigInt(Date.now()),
    });
  }
);

export const update_session_status = spacetimedb.reducer(
  {
    session_id: t.string(),
    status: t.string(),
    rejection_reason: t.string(),
    rejection_workflow: t.string(),
  },
  (ctx, { session_id, status, rejection_reason, rejection_workflow }) => {
    const existing = ctx.db.sessions.session_id.find(session_id);
    if (existing) {
      ctx.db.sessions.session_id.delete(session_id);
      ctx.db.sessions.insert({
        ...existing,
        status,
        rejection_reason,
        rejection_workflow,
      });
    }
  }
);

export const delete_session = spacetimedb.reducer(
  { session_id: t.string() },
  (ctx, { session_id }) => {
    ctx.db.sessions.session_id.delete(session_id);
  }
);

// ─── Workflow Results Reducers ────────────────────────────────────

export const insert_workflow_result = spacetimedb.reducer(
  {
    session_id: t.string(),
    workflow_name: t.string(),
    result_json: t.string(),
  },
  (ctx, { session_id, workflow_name, result_json }) => {
    ctx.db.workflow_results.insert({
      id: 0n,
      session_id,
      workflow_name,
      result_json,
      created_at: BigInt(Date.now()),
    });
  }
);

export const delete_workflow_result = spacetimedb.reducer(
  { id: t.u64() },
  (ctx, { id }) => {
    ctx.db.workflow_results.id.delete(id);
  }
);

// ─── Contacts Reducers ───────────────────────────────────────────

export const insert_contact = spacetimedb.reducer(
  {
    tag: t.string(),
    name: t.string(),
    bitcoin_testnet_address: t.string(),
    verified: t.bool(),
  },
  (ctx, { tag, name, bitcoin_testnet_address, verified }) => {
    ctx.db.contacts.insert({
      id: 0n,
      tag,
      name,
      bitcoin_testnet_address,
      verified,
    });
  }
);

export const delete_contact = spacetimedb.reducer(
  { tag: t.string() },
  (ctx, { tag }) => {
    ctx.db.contacts.tag.delete(tag);
  }
);

// ─── Tokens Reducers ─────────────────────────────────────────────

export const insert_token = spacetimedb.reducer(
  {
    tag: t.string(),
    name: t.string(),
    network_tag: t.string(),
  },
  (ctx, { tag, name, network_tag }) => {
    ctx.db.tokens.insert({
      id: 0n,
      tag,
      name,
      network_tag,
    });
  }
);

export const delete_token = spacetimedb.reducer(
  { tag: t.string() },
  (ctx, { tag }) => {
    ctx.db.tokens.tag.delete(tag);
  }
);

// ─── Audit Log Reducers ──────────────────────────────────────────

export const insert_audit_log = spacetimedb.reducer(
  {
    session_id: t.string(),
    outcome: t.string(),
    rejection_reason: t.string(),
    rejection_workflow: t.string(),
    tx_hash: t.string(),
  },
  (ctx, { session_id, outcome, rejection_reason, rejection_workflow, tx_hash }) => {
    ctx.db.audit_log.insert({
      id: 0n,
      session_id,
      outcome,
      rejection_reason,
      rejection_workflow,
      tx_hash,
      created_at: BigInt(Date.now()),
    });
  }
);

export const delete_audit_log = spacetimedb.reducer(
  { id: t.u64() },
  (ctx, { id }) => {
    ctx.db.audit_log.id.delete(id);
  }
);
