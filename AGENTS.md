# AGENTS.md: Autonomous Agents Architecture

## 1. Invoice Ingestion Agent
- **Trigger**: Natural language merchant requests.
- **Function**: Extracts financial amounts, item deliverables, and customer entities to create standardized pending invoice records.

## 2. PayGuard Risk Evaluator
- **Trigger**: Pre-settlement webhook execution.
- **Function**: Runs deterministic risk heuristics on transaction amounts and domain anomalies to flag potential high-risk orders prior to final ledger reconciliation.