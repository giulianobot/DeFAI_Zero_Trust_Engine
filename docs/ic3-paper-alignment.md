# IC3 Liquefaction Paper Alignment

## Overview

The DeFAI Zero Trust Engine aligns with research principles from the **IC3 (Initiative for CryptoCurrencies and Contracts)** on defence-in-depth for decentralised financial systems. This document maps the engine's design decisions to IC3's research themes on DeFi security.

## Alignment Points

### 1. Defence-in-Depth
**IC3 Principle**: Multiple independent security layers prevent single points of failure.

**DeFAI Implementation**:
- Level 1 (Prompt Injection Defence): Runtime KB Fine Tuning isolates agent instructions
- Level 2 (Multi-Agent Consensus): Two independent agents must agree before proceeding
- Level 3 (Balance Verification): Real-time on-chain checks before signing
- Level 4 (Audit Trail): Complete SpacetimeDB audit log for every attempt

### 2. Transaction Verification Before Execution
**IC3 Principle**: Verify transaction parameters before committing to the blockchain.

**DeFAI Implementation**:
- Zod schema validation on all extracted fields
- Integer-only USD amounts (prevents decimal manipulation)
- Pure TypeScript `===` comparison (no LLM involvement in verification)
- Contact address validation via regex
- Balance sufficiency check before signing

### 3. Minimising Trust Assumptions
**IC3 Principle**: Reduce the number of trusted components in the system.

**DeFAI Implementation**:
- The consensus gate (Workflow D) trusts **zero** LLMs — pure TypeScript comparison
- Each agent operates independently with its own knowledge base
- No single agent can approve a transaction
- Temperature 0 minimises non-deterministic behaviour
- X search disabled — agents rely solely on user message content

### 4. Auditability and Transparency
**IC3 Principle**: All actions should be auditable after the fact.

**DeFAI Implementation**:
- Every session, workflow result, and audit entry stored in SpacetimeDB
- Real-time subscriptions enable live monitoring
- Rejection reasons include the specific workflow and field that caused failure
- Complete transaction lifecycle visible through SpacetimeDB queries

### 5. Fail-Safe Design
**IC3 Principle**: Systems should fail safely — deny by default.

**DeFAI Implementation**:
- Any workflow rejection stops the entire pipeline immediately
- The default state is "pending" — a transaction must be explicitly approved
- Extraction failure from either agent triggers rejection
- Insufficient balance triggers rejection
- Signing failure triggers rejection
- Every failure path writes an audit log entry

## The Lobster Wilde Precedent

On [date], an AI agent autonomously executed a blockchain transaction sending $250,000 USD instead of the intended $400 USD. This incident, known as the **Lobster Wilde incident**, demonstrated that:

1. AI agents can hallucinate transaction parameters
2. Single-agent architectures have no safety net
3. Blockchain transactions are irreversible — prevention is the only defence

The DeFAI Zero Trust Engine directly addresses this failure mode through multi-agent consensus. Had the Lobster Wilde agent used this engine, the $250,000 transaction would have been **rejected at Workflow D** because a second independent agent would have extracted the correct $400 amount, triggering a consensus mismatch.

## Future Research Directions

- **Level 3**: Formal verification of transaction parameters against user-defined spending limits
- **Level 4**: On-chain governance for multi-signature approval flows
- **Cross-chain consensus**: Extending multi-agent verification to non-Bitcoin networks
- **Adversarial testing**: Red-team exercises to identify prompt injection vectors

## References

- IC3 (Initiative for CryptoCurrencies and Contracts) — Cornell University
- Liquefaction: DeFi Security and Composability Research
- DeFAI Zero Trust Engine — Giuliano Innovations, 2026
