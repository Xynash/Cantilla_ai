# APPROACH.md — Cantill.ai System Architecture & Deterministic Engineering Approach

## 1. Architectural Overview

**Cantill.ai** is an enterprise procurement intake and deterministic decision platform built for **Corvo Engineering Pvt. Ltd.** using:
- **Framework**: Next.js 16 (App Router, Server & Client Components, Route Handlers)
- **Language & Validation**: TypeScript 5 (`strict: true`) + Zod schema validation
- **Database**: MongoDB Atlas + Mongoose 9 with deterministic local CSV/in-memory fallback resilience
- **Authentication & RBAC**: Auth.js v5 (NextAuth) with JWT session strategy and three enterprise roles (`REQUESTER`, `BUYER`, `PROCUREMENT_ADMIN`)
- **Zero External AI/LLM Dependency**: Both the Phase 3 Conversational PR Intake parser and the Phase 4 Procurement Decision Engine are **100% deterministic, rule-based TypeScript engines** with zero external LLM API calls.

---

## 2. End-to-End System Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        PRESENTATION LAYER (Next.js 16)                      │
│  • /chat & /requisitions   → Conversational PR Intake & Requisition View    │
│  • /decisions              → Buyer Decision Workspace (Overview, Decisions, │
│                              Explainability Modal, Proposed POs, Sourcing)  │
│  • /purchase-orders        → Proposed PO Consolidation & Line Inspection    │
│  • /items, /suppliers,     → Master Data Directories & Policy v5.0 Viewer   │
│    /contracts, /policies                                                    │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
┌──────────────────────────────────────▼──────────────────────────────────────┐
│                         API & RBAC LAYER (app/api/)                         │
│  • POST /api/process-batch            → Idempotent Batch Execution (SHA-256)│
│  • GET  /api/process-batch/[id]       → Run History & Full Audit Retrieval  │
│  • GET  /api/process-batch/[id]/export→ RFC 4180 12-Column CSV Export       │
│  • /api/chat/* & /api/requisitions/*  → Rule-Based NLP Intake & PR Storage  │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
┌──────────────────────────────────────▼──────────────────────────────────────┐
│              DETERMINISTIC DECISION ENGINE (services/decision-engine/)      │
│  1. Pre-Validation      → Plant scope (PUN1/CHK1) & positive quantity check │
│  2. Item Resolution     → 4-tier deterministic match + NEW_ITEM detection   │
│  3. Requirement Clubber → 14d creation & ±7d need-by non-transitive window  │
│  4. Contract Evaluator  → Ceiling ledger + PDF Annex contracts (RC-031/033) │
│  5. Valuation Engine    → Contract Rate → 365d Latest PO → Standard Price   │
│  6. Preferred Suppliers → 548d eligibility + 5-factor weighted scoring      │
│  7. Rule Evaluator      → Policy v5.0 hierarchy + full audit explainability │
│  8. PO Consolidator     → 24h non-transitive window (supplier+plant+route)  │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Core Engineering Modules

### 3.1 Policy-as-Code Configuration (`services/decision-engine/policy-config/`)
Rather than scattering magic numbers across services, all Corvo Procurement Policy v5.0 parameters are centralized in `BASELINE_POLICY_V5` (`baseline-v5.ts`):
- Scope plants (`["PUN1", "CHK1"]`), clubbing windows (`14` days creation, `7` days need-by), PO consolidation window (`24` hours).
- Valuation lookback (`365` days), supplier eligibility lookback (`548` days).
- Supplier scoring weights (`0.35` frequency, `0.25` recency, `0.15` contract, `0.15` OTD, `0.10` quality) and recency tiers (`90d -> 1.0`, `180d -> 0.5`, `>180d -> 0.0`).
- Financial route thresholds (`₹2,00,000` Spot PO limit, `₹5,00,000` Emergency PO cap, `₹10,00,000` RFQ/RFP boundary).

### 3.2 High-Performance Historical PO Indexing (`models/PurchaseHistory.ts`)
- Historical PO queries for valuation (365-day window) and supplier scoring (548-day window) use a dedicated compound index on `PurchaseHistory`:
  ```ts
  PurchaseHistorySchema.index({ itemCode: 1, poDate: -1, poNumber: -1 });
  ```
- Queries project only the required fields (`itemCode`, `poNumber`, `poDate`, `supplierId`, `unitPrice`, `quantity`, `plant`) with `.lean()` and a `5000ms` `maxTimeMS` safeguard.

### 3.3 Idempotent Batch Processing & Persistence (`services/decision-engine/batch-processor/`)
- Every CSV uploaded to `POST /api/process-batch` is hashed with `SHA-256` alongside the active policy version (`v5.0`).
- If an identical `(batchHash, policyVersion)` run already exists (and `forceReprocess` is not set), the persisted `BatchProcessingRun` is returned immediately with `isIdempotentHit: true`, preventing duplicate runs or drifted PO numbers.
- Each run stores the complete `lineOutputs` (186 lines), `decisions` (151 clubbed requirements with full explainability traces), `proposedPurchaseOrders` (81 proposed PO groups), and `summary` metrics.

### 3.4 Explainability by Design (`components/decisions/buyer-decision-workspace.tsx`)
Every processed line in the Buyer Decision Workspace exposes a comprehensive **Decision Explainability Modal** showing:
1. **Item Resolution Trace**: Original PR line text, matched Item Code, confidence score, and resolution tier.
2. **Requirement Clubbing Trace**: Member PR lines, anchor timestamps, combined quantity, and clubbing rationale.
3. **Valuation & Contract Ceiling Trace**: Selected valuation basis (`CONTRACT_RATE`, `LATEST_PO_365D`, or `STANDARD_PRICE`), unit price, total value, and every candidate contract's pre- and post-decision ceiling balance.
4. **Supplier Ranking Scorecard**: All evaluated suppliers with exact `F`, `R`, `C`, `OTD`, `Q` sub-scores, total weighted score, latest PO reference price, or exact exclusion reason (e.g., inactive supplier `S019`).
5. **Policy Rule Execution Log**: Step-by-step trace of every Policy v5.0 clause evaluated (`PASSED`, `SKIPPED`, or `TRIGGERED`).

---

## 4. Verification & Test Coverage

The test suite in `tests/phase4.test.ts` (and regression suites `tests/phase2.test.ts` and `tests/phase3.test.ts`) validates:
- **3 / 3 Worked Supplier Rankings** (`ITM-1008`, `ITM-1019`, `ITM-1042`) matching exact scores (`0.985`, `0.7036`, `0.955`, `0.8165`, `0.6257`, `0.5858`).
- **14 / 14 Worked Procurement Decisions** from `Worked_Examples.pdf` matching exact item codes, clubbed quantities, valuations, routes, selected/suggested suppliers, and proposed PO numbers.
- **Boundary & Tie-Breaking Tests**: Exact `₹2,00,000`, `₹5,00,000`, and `₹10,00,000` thresholds, 14-day clubbing boundary, 24-hour non-transitive PO consolidation boundary, null supplier metrics, and inactive supplier blocking.
- **Idempotency, RFC 4180 CSV Export & RBAC**: 186-row CSV export verification, comma/quote escaping, and `401`/`403` enforcement for unauthenticated and `REQUESTER` roles.

---

## 5. AI Tools Disclosure

- **In-App Runtime Engine**: **Zero external LLM/AI APIs** are called at runtime. Both the Conversational PR Intake parser (`services/chat-intake/`) and the Procurement Decision & PDF Policy Extraction engines (`services/decision-engine/`) are **100% deterministic, rule-based TypeScript engines**, guaranteeing reproducible outputs across runs and zero API latency or hallucination risk.
- **Development & Coding Assistance**: AI coding assistants (GitHub Copilot / IDE AI assistant) were used during development for TypeScript boilerplate scaffolding, UI component styling, and test case generation, with all policy thresholds, scoring formulas, and tie-breaking logic verified deterministically against `Corvo_Procurement_Policy.pdf` and `Worked_Examples.pdf`.
