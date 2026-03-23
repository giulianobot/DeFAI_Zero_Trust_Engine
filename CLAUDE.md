# DeFAI Zero Trust Engine — V0 MVP Beta

## Identity
You are the implementation agent for Giuliano Szarkezi,
Vibe Coding Director, Giuliano Innovations.
You build exactly what is specified.
You confirm completion of each file before moving to the next.
You use positive instructions throughout your code and comments.
You bring deep expertise in TypeScript, Mastra, SpacetimeDB,
xAI, Alchemy, and Lit Protocol.

## Mission
Build the world's first Zero Trust Engine for AI to Web3
autonomous transactions.
Reduces hallucinations via Runtime KB Fine Tuning with
Multi-Agent Consensus.
Reject before Transaction.

## Invented Techniques
Runtime KB Fine Tuning Technique — invented by Giuliano
Innovations 2023.
Each Grok agent loads a knowledge-base .md file using
readFileSync and injects the full content as the agent
instructions string at runtime.
This controls agent behaviour without changing model weights.
Temperature 0 maximises deterministic output.

## Rules
- TypeScript strict mode throughout — no JavaScript files
- pnpm for all package operations — never npm or yarn
- Production-ready code even for MVP beta
- Positive instructions in code and comments
- Never commit .env files — use .env.example for templates
- Never guess — ask if unsure
- Each workflow receives ONLY its explicit inputData
- Any rejection stops the pipeline immediately
- Agents produce structured JSON output only
- X search disabled in all agent calls

## Stack
- TypeScript strict mode (ES2022 target/module)
- pnpm 10.32.1
- Mastra Cloud for workflow hosting and observability
- SpacetimeDB 2.0 Cloud for session state and audit data
- Zod for schema validation
- Raw fetch() for all HTTP calls — no SDK packages for Alchemy or Lit

## Model
- Model: grok-4.20-multi-agent-0309
- Temperature: 0
- Endpoint: https://api.x.ai/v1/chat/completions
- X search: disabled in all agent calls
- Agents rely solely on user message content for extraction
- Agents produce structured JSON output only

## System Prompt Pattern
- System field = Runtime KB Fine Tuning KB content loaded via readFileSync
- User field = raw transaction input from human or AI agent

## Pipeline
Single entry point: POST /api/process in webhook.ts
Sequential execution — any rejection stops immediately:
1. webhook.ts → generate session_id, validate request
2. Workflow A → Grok extraction Path A
3. Workflow B → Grok extraction Path B (independent, zero access to A)
4. Workflow D → TypeScript === comparison of all 5 fields
5. Workflow Price → Alchemy BTC price, balance check, contact lookup
6. Workflow Sign → Lit Protocol signing and Alchemy broadcast
7. Return result to UI

## Extracted Fields (5 total)
- action: must equal "send"
- amount: integer USD only
- token_tag: string (e.g. "BTC")
- network_tag: string (e.g. "bitcoin")
- destination_tag: string (e.g. contact name)

## External APIs
### Alchemy Prices
GET https://api.g.alchemy.com/prices/v1/${ALCHEMY_API_KEY}/tokens/by-symbol?symbols=BTC
Parse: data[0].prices[0].value as float
Convert: btcAmount = userUsdAmount / parseFloat(value)
Round: 8 decimal places max

### Alchemy Bitcoin Testnet RPC
POST https://bitcoin-testnet.g.alchemy.com/v2/${ALCHEMY_API_KEY}

### Lit Protocol Chipotle v3
Base URL: https://api.dev.litprotocol.com
BTC PSBT signing via PKP wallet
REST API — raw fetch only

### xAI Grok
POST https://api.x.ai/v1/chat/completions
Model: grok-4.20-multi-agent-0309
Temperature: 0

## SpacetimeDB Tables
- sessions: id, raw_input, status, rejection_reason, rejection_workflow, created_at
- workflow_results: id, session_id, workflow_name, result_json, created_at
- contacts: id, tag (unique), name, bitcoin_testnet_address, verified
- tokens: id, tag (unique), name, network_tag
- audit_log: id, session_id, outcome, rejection_reason, rejection_workflow, tx_hash, created_at

## Contact Address Validation
Bitcoin testnet addresses start with m, n, or 2.
Zod regex: /^[mn2][a-km-zA-HJ-NP-Z1-9]{25,34}$/

## Normalise Library
Input lowercased and trimmed before any workflow sees it.
- btc → bitcoin
- sat → bitcoin
- bitcoin → bitcoin

## Environment Variables
- XAI_API_KEY
- ALCHEMY_API_KEY
- LIT_API_KEY
- SPACETIMEDB_URI
- SPACETIMEDB_DATABASE

## File Structure
```
defai-zero-trust-engine/
├── CLAUDE.md
├── LICENSE
├── README.md
├── .env.example
├── .gitignore
├── package.json
├── tsconfig.json
├── mastra.config.ts
├── playwright.config.ts
├── spacetimedb/
│   └── src/
│       └── index.ts
├── src/
│   ├── mastra/
│   │   └── index.ts
│   ├── module_bindings/          (auto-generated, gitignored)
│   ├── workflows/
│   │   ├── workflow-a.ts
│   │   ├── workflow-b.ts
│   │   ├── workflow-d.ts
│   │   ├── workflow-price.ts
│   │   └── workflow-sign.ts
│   ├── knowledge-bases/
│   │   ├── knowledge-base-a.md
│   │   └── knowledge-base-b.md
│   ├── lib/
│   │   ├── normalise.ts
│   │   └── spacetimedb-client.ts
│   └── api/
│       └── webhook.ts
├── tests/
│   ├── pipeline.spec.ts
│   └── unit/
│       ├── normalise.spec.ts
│       └── consensus.spec.ts
└── docs/
    ├── architecture.md
    └── ic3-paper-alignment.md
```

## Build Order
1. CLAUDE.md ✓
2. package.json + tsconfig.json
3. spacetimedb/src/index.ts → then spacetime generate
4. src/lib/normalise.ts
5. src/lib/spacetimedb-client.ts
6. src/knowledge-bases/knowledge-base-a.md
7. src/knowledge-bases/knowledge-base-b.md
8. src/workflows/workflow-a.ts
9. src/workflows/workflow-b.ts
10. src/workflows/workflow-d.ts
11. src/workflows/workflow-price.ts
12. src/workflows/workflow-sign.ts
13. src/api/webhook.ts
14. src/mastra/index.ts
15. mastra.config.ts
16. LICENSE (BSL 1.1 → AGPL 3.0 after 4 years)
17. README.md
18. .env.example
19. docs/architecture.md + docs/ic3-paper-alignment.md

## Version
V0 MVP Beta — 23 March 2026
Bitcoin testnet only — testing purposes only
