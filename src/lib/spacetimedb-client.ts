/**
 * DeFAI Zero Trust Engine — SpacetimeDB Client Singleton
 *
 * Provides a single persistent WebSocket connection to SpacetimeDB Cloud.
 * All workflows share this connection to avoid per-request overhead.
 *
 * Usage:
 *   const conn = await getDbConnection();
 *   conn.reducers.insertSession({ sessionId, rawInput });
 */

import { DbConnection, tables } from '../module_bindings/index.js';
import dotenv from 'dotenv';

dotenv.config();

// ─── Singleton State ─────────────────────────────────────────────
let connectionInstance: DbConnection | null = null;
let connectionReady = false;
let connectionPromise: Promise<DbConnection> | null = null;

// ─── Configuration ───────────────────────────────────────────────
const SPACETIMEDB_URI = process.env.SPACETIMEDB_URI ?? 'wss://maincloud.spacetimedb.com';
const SPACETIMEDB_DATABASE = process.env.SPACETIMEDB_DATABASE ?? '';

if (!SPACETIMEDB_DATABASE) {
  console.warn('SPACETIMEDB_DATABASE is not set — SpacetimeDB connection will not be established');
}

// ─── Connection Builder ──────────────────────────────────────────

/**
 * Returns the singleton SpacetimeDB connection.
 * Creates and connects on first call, returns cached instance after that.
 * Subscribes to all public tables for full client cache access.
 */
export async function getDbConnection(): Promise<DbConnection> {
  // Return existing connection if ready
  if (connectionInstance && connectionReady) {
    return connectionInstance;
  }

  // Return pending connection if one is being established
  if (connectionPromise) {
    return connectionPromise;
  }

  // Create a new connection
  connectionPromise = new Promise<DbConnection>((resolve, reject) => {
    try {
      const conn = DbConnection.builder()
        .withUri(SPACETIMEDB_URI)
        .withDatabaseName(SPACETIMEDB_DATABASE)
        .onConnect((connection, identity, token) => {
          console.log(`SpacetimeDB connected — identity: ${identity.toHexString()}`);

          // Subscribe to all tables for client cache access
          connection.subscriptionBuilder()
            .onApplied(() => {
              console.log('SpacetimeDB subscriptions applied — client cache ready');
              connectionReady = true;
              resolve(connection);
            })
            .onError((_ctx, error) => {
              console.error('SpacetimeDB subscription error:', error);
              reject(error);
            })
            .subscribeToAllTables();
        })
        .onConnectError((_ctx, error) => {
          console.error('SpacetimeDB connection error:', error);
          connectionReady = false;
          connectionPromise = null;
          reject(error);
        })
        .onDisconnect((_ctx, error) => {
          console.warn('SpacetimeDB disconnected:', error?.message ?? 'clean disconnect');
          connectionReady = false;
          connectionInstance = null;
          connectionPromise = null;
        })
        .build();

      connectionInstance = conn;
    } catch (error) {
      connectionPromise = null;
      reject(error);
    }
  });

  return connectionPromise;
}

// ─── Helper: Find Contact by Tag ─────────────────────────────────

/**
 * Looks up a contact by their unique tag in the SpacetimeDB client cache.
 * Returns the contact row or undefined if not found.
 */
export async function findContactByTag(tag: string) {
  const conn = await getDbConnection();
  return conn.db.contacts.tag.find(tag);
}

// ─── Helper: Find Session by Session ID ──────────────────────────

/**
 * Looks up a session by its UUID in the SpacetimeDB client cache.
 * Returns the session row or undefined if not found.
 */
export async function findSessionBySessionId(sessionId: string) {
  const conn = await getDbConnection();
  return conn.db.sessions.session_id.find(sessionId);
}

// ─── Helper: Get Workflow Results by Session ID ──────────────────

/**
 * Returns all workflow results for a given session from the client cache.
 */
export async function getWorkflowResultsBySessionId(sessionId: string) {
  const conn = await getDbConnection();
  const results: Array<{ workflowName: string; resultJson: string }> = [];
  for (const row of conn.db.workflow_results.iter()) {
    if (row.sessionId === sessionId) {
      results.push({
        workflowName: row.workflowName,
        resultJson: row.resultJson,
      });
    }
  }
  return results;
}

// ─── Export tables for query builder access ───────────────────────
export { tables };
