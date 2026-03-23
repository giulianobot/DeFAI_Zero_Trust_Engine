# DeFAI Zero Trust Engine

**The world's first Zero Trust Engine for AI-to-Web3 autonomous transactions.**

Built by [Giuliano Innovations](https://github.com/giulianobot) | V0 MVP Beta | 23 March 2026

> **Status:** V0 MVP Beta — for testing purposes only. Production V0.1 launch target: 27 March 2026.
>
> **Try it:** [https://defaizerotrustengine.space](https://defaizerotrustengine.space)

## The Problem

AI agents are executing blockchain transactions autonomously, but without safety mechanisms. The **Lobster Wilde incident** demonstrated the catastrophic risk: an AI agent sent **$250,000 USD** instead of the intended **$400 USD** — a hallucination that reached the blockchain unchecked.

## The Solution

DeFAI Zero Trust Engine introduces **multi-agent consensus** and **Runtime KB Fine Tuning** to prevent hallucinated transactions *before* they hit the blockchain.

### Invented Technique: Runtime KB Fine Tuning

Invented by Giuliano Innovations (2023). Each Grok agent loads a knowledge-base `.md` file via `readFileSync` and injects the full content as the agent instructions string at runtime. This controls agent behaviour without changing model weights. Temperature 0 maximises deterministic output.

### How It Works

Two independent AI agents extract transaction fields from the same input. A pure TypeScript comparator checks if they agree. Only unanimous consensus proceeds to signing.

```
                    ┌─────────────┐
                    │  User Input │
                    │ "Send $400  │
                    │  BTC to     │
                    │  Alice"     │
                    └──────┬──────┘
                           │
                    ┌──────▼──────┐
                    │  Webhook    │
                    │  POST /api/ │
                    │  process    │
                    └──────┬──────┘
                           │
              ┌────────────┼────────────┐
              │                         │
       ┌──────▼──────┐          ┌──────▼──────┐
       │ Workflow A   │          │ Workflow B   │
       │ Grok Agent   │          │ Grok Agent   │
       │ KB-A loaded   │          │ KB-B loaded   │
       │ (independent) │          │ (independent) │
       └──────┬──────┘          └──────┬──────┘
              │                         │
              └────────────┬────────────┘
                           │
                    ┌──────▼──────┐
                    │ Workflow D   │
                    │ TypeScript   │
                    │ === on all   │
                    │ 5 fields     │
                    │ ZERO LLM     │
                    └──────┬──────┘
                           │
                    ┌──────▼──────┐
                    │ Workflow     │
                    │ Price        │
                    │ Alchemy BTC  │
                    │ price +      │
                    │ balance      │
                    └──────┬──────┘
                           │
                    ┌──────▼──────┐
                    │ Workflow     │
                    │ Sign         │
                    │ Lit Protocol │
                    │ PSBT + RPC   │
                    └──────┬──────┘
                           │
                    ┌──────▼──────┐
                    │  Result     │
                    │  tx_hash    │
                    │  returned   │
                    └─────────────┘
```

### IC3 Paper Alignment

This engine aligns with the IC3 (Initiative for CryptoCurrencies and Contracts) Liquefaction paper principles on defence-in-depth for DeFi systems. See `docs/ic3-paper-alignment.md`.

## Stack

| Component | Technology |
|-----------|-----------|
| Language | TypeScript (strict mode) |
| Package Manager | pnpm |
| Workflow Engine | Mastra Cloud |
| Database | SpacetimeDB 2.0 Cloud |
| AI Model | xAI Grok `grok-4.20-multi-agent-0309` |
| Signing | Lit Protocol Chipotle v3 |
| Pricing & RPC | Alchemy |
| Validation | Zod |

## Setup

### Prerequisites

- Node.js 18+
- pnpm
- SpacetimeDB CLI (`iwr https://windows.spacetimedb.com -useb | iex`)

### Installation

```bash
# Clone the repository
git clone https://github.com/giulianobot/defai-zero-trust-engine.git
cd defai-zero-trust-engine

# Install dependencies
pnpm install

# Copy environment variables
cp .env.example .env
# Edit .env with your API keys

# Generate SpacetimeDB bindings
cd spacetimedb && pnpm install && cd ..
pnpm spacetime:generate

# Start Mastra dev server
pnpm dev
```

### API Usage

```bash
curl -X POST http://localhost:4111/api/process \
  -H "Content-Type: application/json" \
  -d '{"raw_input": "Send 400 dollars of bitcoin to alice"}'
```

**Success (200):**
```json
{
  "status": "approved",
  "session_id": "uuid",
  "tx_hash": "abc123...",
  "btc_amount": 0.00588235,
  "usd_amount": 400,
  "destination_name": "Alice",
  "btc_price_usd": 68000.00
}
```

**Rejection (422):**
```json
{
  "status": "rejected",
  "session_id": "uuid",
  "rejection_reason": "Consensus failed — mismatched fields: amount",
  "rejection_workflow": "D"
}
```

## Disclaimer

This is a **V0 MVP Beta** for testing purposes only. Operates on **Bitcoin testnet** exclusively. Do not use with real funds. No warranty is provided.

## License

**Business Source License 1.1** (BSL 1.1)

You may use this software **personally** for your own cryptocurrency trading and Web3 transactions, subject to these terms:

- **Sole user only** — no shared access, multi-user deployments, or hosted services
- **No reselling** — you may not resell, sublicense, or redistribute for profit
- **No whitelabel** — modified-for-resale or rebranded versions require a separate commercial whitelabel license
- **No competing services** — you may not use this to build a competing transaction safety product

By using this repository, you agree you are the sole user and accept these terms.

**Change Date:** 23 March 2030 — automatically converts to **AGPL 3.0**

For commercial licensing or whitelabel agreements, contact: giulianoaibot@gmail.com

See [LICENSE](LICENSE) for full legal terms.
