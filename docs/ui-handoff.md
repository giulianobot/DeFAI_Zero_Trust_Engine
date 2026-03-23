# UI Handoff Document - Frontend Agent Guide

## Overview

This document contains everything a frontend agent needs to build the
DeFAI Zero Trust Engine UI. The backend is complete and deployed.

## Monorepo Structure

The frontend lives in `ui/` alongside the backend. Same Git repo.

```
defai-zero-trust-engine/
├── src/              # Backend (Mastra workflows) - DO NOT MODIFY
├── spacetimedb/      # Server module - DO NOT MODIFY
├── ui/               # Frontend (React + Vite) - BUILD HERE
│   ├── package.json
│   ├── vite.config.ts
│   ├── tsconfig.json
│   ├── index.html
│   └── src/
│       ├── main.tsx
│       ├── App.tsx
│       ├── pages/
│       │   ├── Landing.tsx
│       │   ├── Wallet.tsx
│       │   ├── Contacts.tsx
│       │   ├── Tokens.tsx
│       │   ├── Licensing.tsx
│       │   └── Roadmap.tsx
│       ├── components/
│       │   ├── DisclaimerModal.tsx
│       │   ├── TransactionInput.tsx
│       │   ├── TransactionStatus.tsx
│       │   ├── AgentPanel.tsx
│       │   ├── WalletBalance.tsx
│       │   ├── ContactForm.tsx
│       │   └── ModeToggle.tsx
│       └── lib/
│           ├── api.ts
│           └── spacetimedb.ts
├── mastra.config.ts  # Backend config - DO NOT MODIFY
└── CLAUDE.md         # Project rules
```

## Deployment

- Backend: Mastra Cloud (deploys from src/mastra/)
- Frontend: Vercel (deploys from ui/)

## Backend API

### Endpoint

```
POST /api/process
Content-Type: application/json
```

### Request Body

```json
{
  "raw_input": "Send 400 dollars of bitcoin to alice",
  "mode": "safe"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| raw_input | string | Yes | Natural language transaction request |
| mode | "safe" or "unsafe" | No (default: "safe") | Safe = KB + temp 0, Unsafe = no KB + temp 1 |

### Response - Success (200)

```json
{
  "status": "approved",
  "session_id": "uuid",
  "mode": "safe",
  "tx_hash": "abc123...",
  "btc_amount": 0.00588235,
  "usd_amount": 400,
  "destination_name": "Alice",
  "destination_address": "mq7se9wy...",
  "btc_price_usd": 68000.00
}
```

### Response - Rejection (422)

```json
{
  "status": "rejected",
  "session_id": "uuid",
  "mode": "unsafe",
  "rejection_reason": "Consensus failed - mismatched fields: amount",
  "rejection_workflow": "D"
}
```

### Response - Error (500)

```json
{
  "status": "error",
  "message": "Error description"
}
```

## SpacetimeDB Real-Time Connection

The frontend connects directly to SpacetimeDB for real-time data.

```
URI: wss://maincloud.spacetimedb.com
Database: defai-zero-trust-engine
```

### Tables Available (read-only from frontend)

| Table | Key Fields | Use In UI |
|-------|-----------|-----------|
| sessions | sessionId, status, rejectionReason, rejectionWorkflow | Transaction status tracking |
| workflow_results | sessionId, workflowName, resultJson | Show per-workflow output |
| contacts | tag, name, bitcoinTestnetAddress, verified | Contacts tab |
| tokens | tag, name, networkTag | Tokens tab |
| audit_log | sessionId, outcome, txHash | Transaction history |

### SpacetimeDB Client Setup (React)

Install in ui/:
```bash
pnpm add spacetimedb
```

Import from the generated bindings:
```typescript
import { DbConnection } from '../../src/module_bindings/index.js';
```

## Pages and Components

### 1. Landing Page

First thing users see. Shows disclaimer modal.

**Disclaimer text must include:**
- All transactions are monitored
- Full logs, input, and output are recorded
- Data may be used for training and UX improvement
- Cookies are collected
- Testing purposes only - Bitcoin testnet
- By clicking "I Agree" they accept these terms

**After agreement:** redirect to Wallet page.

### 2. Wallet Page (main page)

Three sections:

**a) Transaction Chat Input**
- Text input: "Send $20 of bitcoin to alice"
- Submit button
- Real-time status showing pipeline progress:
  - Workflow A: extracting... (show extracted fields)
  - Workflow B: extracting... (show extracted fields)
  - Workflow D: comparing... (show match/mismatch per field)
  - Workflow Price: checking... (show BTC price, balance)
  - Workflow Sign: signing... (show tx_hash)
- Subscribe to SpacetimeDB workflow_results by session_id

**b) Wallet Balance**
- Shows shared engine wallet BTC testnet balance
- Read from Alchemy Bitcoin Testnet RPC (can call from frontend or backend)

**c) Agent Panels (the demo feature)**
- Two panels side by side: "Agent A" and "Agent B"
- Each shows:
  - Default prompt status: [Enabled] / [Disabled]
  - KB status: [Enabled] / [Disabled]
  - Extracted fields output after each run
- Toggle buttons:
  - "Disable Prompt" - switches to unsafe mode
  - "Disable KB" - switches to unsafe mode
  - If EITHER is disabled, the request sends `mode: "unsafe"`
  - If BOTH are enabled, sends `mode: "safe"`
- Show the actual KB content (read knowledge-base-a.md and knowledge-base-b.md)
  so users can see what the agents are using

**d) Transaction History**
- Real-time list of past transactions from SpacetimeDB audit_log
- Shows: timestamp, amount, destination, status (approved/rejected), tx_hash

### 3. Contacts Page

- Form: Name (text) + BTC Testnet Address (text)
- Address validation regex: /^[mn2][a-km-zA-HJ-NP-Z1-9]{25,34}$/
- On submit: call SpacetimeDB insert_contact reducer
- List of existing contacts from SpacetimeDB contacts table
- Delete button per contact

### 4. Tokens Page

- Shows BTC Testnet as the default token
- Toggle: [Enable] / [Disable]
- On enable: call SpacetimeDB insert_token reducer
  - tag: "BTC", name: "Bitcoin", network_tag: "bitcoin"
- Token must be enabled before transactions work

### 5. Licensing Page

- Display BSL 1.1 summary
- Whitelabel options table:
  - Enterprise Self-Hosting
  - Hosted For You
  - Wrapper / Reseller
- Contact: ceoinnovator@giulianoinnovations.agency
- Link to defaizerotrustengine.space

### 6. Roadmap Page

- V0 MVP Beta (current) - 23 March 2026
- V0.1 Production - 27 March 2026
- Future levels (L3, L4) teaser
- Placeholder for more roadmap items from Giuliano

## Design Guidelines

- Minimalistic dark theme
- Clean, professional, fintech aesthetic
- No emojis in UI
- Monospace font for transaction data and agent outputs
- Status indicators: green (approved), red (rejected), yellow (pending)
- Mobile responsive
- TypeScript strict mode
- pnpm for package management

## Transaction Limits (to implement in UI validation)

- Max $50 USD per transaction
- Max 3 transactions per day per session
- Display remaining allowance to user

## CORS

Backend already sets these headers on /api/process:
- Access-Control-Allow-Origin: *
- Access-Control-Allow-Methods: POST, OPTIONS
- Access-Control-Allow-Headers: Content-Type

## Environment Variables for Frontend

The frontend only needs:
```
VITE_API_URL=http://localhost:4111  (dev) or Mastra Cloud URL (prod)
VITE_SPACETIMEDB_URI=wss://maincloud.spacetimedb.com
VITE_SPACETIMEDB_DATABASE=defai-zero-trust-engine
```

## What NOT to Do

- Do not modify any files outside the ui/ directory
- Do not install SDK packages for Alchemy or Lit (backend uses raw fetch)
- Do not create .env files with API keys (keys are backend-only)
- Do not use npm or yarn - use pnpm only
- Do not add emojis to UI components
- Do not use em dash characters anywhere
