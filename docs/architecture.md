# DeFAI Zero Trust Engine - Architecture

## Zero Trust Principle for AI-to-Web3

Traditional Web3 wallets trust the user's intent. AI agents introduce a new threat vector: **hallucinated transactions** - where the AI misinterprets the user's request and executes a transaction with incorrect parameters.

The DeFAI Zero Trust Engine applies the Zero Trust security model to AI-to-blockchain interactions:

> **Never trust a single AI agent's output. Always verify through independent consensus.**

## Defence Layers

### Level 1: Prompt Injection Defence
Each Grok agent receives its instructions via **Runtime KB Fine Tuning** - a technique where a `.md` knowledge base is loaded via `readFileSync` and injected as the agent's system prompt at runtime. This:

- Prevents prompt injection by isolating agent instructions from user input
- Controls agent behaviour without changing model weights
- Ensures deterministic output via temperature 0
- Limits the agent to structured JSON output only (no freeform text)

### Level 2: Multi-Agent Consensus (Anti-Hallucination)
Two independent Grok agents (A and B) extract the same 5 transaction fields from the same user input, using different knowledge bases with different wording. This prevents:

- **Single-agent hallucination**: If one agent hallucinates, the other catches it
- **Shared-prompt bias**: Different KB wording prevents correlated errors
- **Amount manipulation**: Integer-only USD amounts with Zod validation

The consensus gate (Workflow D) uses **pure TypeScript `===` comparison** with zero LLM involvement. A single field mismatch rejects the entire transaction.

## Pipeline Architecture

```
POST /api/process
    │
    ▼
┌──────────────────────┐
│ Webhook Handler       │ Generate session_id, validate request
│ webhook.ts            │ Preprocess raw input (lowercase, trim)
└──────────┬───────────┘
           │
    ┌──────▼──────┐
    │ Workflow A    │ Runtime KB Fine Tuning: knowledge-base-a.md
    │ Grok Agent A  │ Extract: action, amount, token_tag, network_tag, destination_tag
    │ Temperature 0 │ Zod validation on output
    └──────┬──────┘ Write to SpacetimeDB workflow_results
           │
    ┌──────▼──────┐
    │ Workflow B    │ Runtime KB Fine Tuning: knowledge-base-b.md
    │ Grok Agent B  │ ZERO access to Workflow A result
    │ Temperature 0 │ Independent extraction, same 5 fields
    └──────┬──────┘ Write independently to SpacetimeDB
           │
    ┌──────▼──────┐
    │ Workflow D    │ Pure TypeScript === on all 5 normalised fields
    │ Consensus     │ ZERO LLM involvement
    │ Gate          │ Single mismatch = REJECTION
    └──────┬──────┘
           │
    ┌──────▼──────┐
    │ Workflow      │ Alchemy Prices API: real-time BTC/USD
    │ Price         │ USD → BTC conversion (8 decimal max)
    │               │ SpacetimeDB contacts table lookup
    │               │ Alchemy Bitcoin Testnet: wallet balance check
    └──────┬──────┘
           │
    ┌──────▼──────┐
    │ Workflow      │ Lit Protocol Chipotle v3: PSBT signing via PKP
    │ Sign          │ Alchemy Bitcoin Testnet RPC: broadcast
    │               │ Complete audit log to SpacetimeDB
    └──────┬──────┘
           │
    ┌──────▼──────┐
    │ Response      │ 200: approved + tx_hash
    │               │ 422: rejected + reason + workflow
    └──────────────┘
```

## Data Flow Isolation

Each workflow receives **only its explicit inputData**:

| Workflow | Receives | Does NOT Receive |
|----------|----------|-----------------|
| A | raw_input, session_id | B's result |
| B | raw_input, session_id | A's result |
| D | result_a, result_b, session_id | raw_input |
| Price | approved_fields, session_id | raw_input, individual results |
| Sign | destination_address, btc_amount, session_id | price data, extraction data |

## SpacetimeDB Audit Trail

Every transaction attempt is fully audited in SpacetimeDB Cloud:

- **sessions**: Tracks the lifecycle of each request (pending → approved/rejected)
- **workflow_results**: Stores the output of each workflow step
- **contacts**: Maps human-readable tags to Bitcoin testnet addresses
- **tokens**: Supported token metadata
- **audit_log**: Complete audit trail with tx_hash, outcome, and rejection details

## Technology Choices

### Why Mastra?
Mastra provides typed workflow orchestration with built-in observability via Mastra Studio. Workflows are defined as TypeScript code with Zod schemas, ensuring type safety throughout the pipeline.

### Why SpacetimeDB?
Real-time subscriptions, persistent WebSocket connections, and auto-generated TypeScript bindings. The server module is defined in TypeScript, eliminating language boundaries. All state changes are auditable by design.

### Why Raw fetch()?
Direct HTTP calls to Alchemy and Lit Protocol (instead of SDK packages) provide full control over request construction, error handling, and retry logic. Fewer dependencies mean fewer supply chain risks - critical for a security-focused engine.

### Why Two Knowledge Bases?
Using different wording prevents correlated errors between agents. If both KBs used identical phrasing, a systematic bias in the model could cause both agents to make the same mistake. Lexical diversity is a defence mechanism.
