# DECISIONS.md — Corvo Engineering Procurement Policy v5.0 Rules & Edge Cases

This document records the deterministic procurement rules, mathematical formulas, tie-breaking conventions, boundary interpretations, and data-quality exclusions implemented in the **Cantill.ai Procurement Decision Engine** (`services/decision-engine/`) for **Corvo Engineering Pvt. Ltd. Procurement Policy v5.0** (effective `01-Oct-2026`).

---

## 1. Scope & Pre-Processing Data Quality Validation (Section 1.1)

Before clubbing or valuation, each PR line in an incoming batch is validated against Policy Section 1.1:
- **In-Scope Plants**: Only **`PUN1`** (Pune Main Plant) and **`CHK1`** (Chakan Plant) are in scope for Policy v5.0.
- **Valid Quantity**: Quantity must be a finite number strictly greater than `0` (`quantity > 0`).
- **Valid Dates**: Both `created_at` and `need_by_date` must parse as valid ISO/calendar timestamps.

### Data-Quality Exclusions (`NOT_PROCESSED`)
Lines failing pre-validation are never dropped silently from the 186-row output CSV. Instead, they are retained in their original batch row position with:
- `decision = "NOT_PROCESSED"`
- `route = "NOT_PROCESSED"`
- `reason`: Explicit explanation of the validation failure.

In `sample_pr_batch.csv` (186 lines), two rows are excluded by pre-validation:
1. **`PR-26-00172` / Line `1`** (`25 sqmm power cable`, `PUN1`, `quantity = 0`): Excluded with `NOT_PROCESSED` because quantity is `0` (`non-positive quantity`).
2. **`PR-26-00173` / Line `1`** (`Hydraulic filter element`, `PUN2`, `quantity = 10`): Excluded with `NOT_PROCESSED` because plant `PUN2` is outside Policy v5.0 scope (`PUN1`, `CHK1`).

### Observation on Split / Near-Simultaneous Requisitions (`PR-26-00174` & `PR-26-00175`)
- `PR-26-00174/1` and `PR-26-00175/1` are for the same item (`ITM-1039`, `CNC Ball Screw Assembly`), same plant (`PUN1`), and same need-by date (`2026-11-05`), submitted minutes apart (`16:00` and `16:15` on `2026-10-18`).
- Because Requirement Clubbing (Section 2) automatically groups same-item, same-plant PR lines created within 14 days whose need-by dates fall within $\pm 7$ days, any attempt to split a purchase across two PRs to stay below value thresholds is automatically neutralized by deterministic clubbing (`REQ-0148`, combined quantity `4`, combined value `₹3,49,734.96` $\rightarrow$ `SOURCING_REQUEST / RFQ`).

---

## 2. Step 1 — Deterministic Item Resolution (Section 1.2)

Each valid PR line description is matched against `item_master.csv` (75 items) using a strict multi-tier deterministic hierarchy:
1. **Tier 1 (Exact Match)**: Case-insensitive, whitespace-normalized exact match on `description` (`confidence = 1.0`).
2. **Tier 2 (Normalized Punctuation & Synonym Match)**: Normalizes industrial shorthand (`"25 sqmm"` $\leftrightarrow$ `"25 sq mm"`, `"&"` $\leftrightarrow$ `"and"`, `"dia"` $\leftrightarrow$ `"diameter"`) (`confidence = 0.95`).
3. **Tier 3 (Curated Domain Alias Match)**: Deterministic alias table for unambiguous floor descriptions (e.g., `"nitrile hand gloves"` $\rightarrow$ `ITM-1027`, `"304 ss sheet 2mm"` $\rightarrow$ `ITM-1002`) (`confidence = 0.92`).
4. **Tier 4 (Token Jaccard Similarity)**: Weighted token overlap requiring score $\ge 0.72$ with a clear margin over the runner-up.
5. **Unmatched (`NEW_ITEM`)**: If no item meets the threshold, the line resolves to `itemCode = "NEW_ITEM"` and routes immediately to `SOURCING_REQUEST` / `NEW_ITEM_SOURCING` (Worked Example 13: `PR-26-00018/1`, *"Laser alignment fixture for press line"*).

---

## 3. Step 2 — Requirement Clubbing (Section 2)

Resolved PR lines are clubbed into a single **Requirement** (`REQ-XXXX`) when all four conditions hold:
1. **Same Resolved Item Code** (`itemCode !== "NEW_ITEM"` — unmatched items never club together).
2. **Same Plant** (`PUN1` or `CHK1`).
3. **Creation Window**: `created_at` is within **14.0 calendar days** (`14 × 86,400,000 ms`) of the **first** PR line in the clubbed requirement.
4. **Need-By Window**: `need_by_date` is within **$\pm 7.0$ calendar days** of the **first** PR line's `need_by_date` in the clubbed requirement.

### Non-Transitive Anchoring & Ordering
- Candidate lines for the same `(itemCode, plant)` are sorted deterministically by `created_at ASC`, then `pr_number ASC`, then `pr_line ASC`.
- Every candidate line is compared strictly against the **first** line (`anchor`) of an existing open group—never transitively against later lines added to the group.
- **Clubbed Aggregations**:
  - `totalQuantity` = sum of member line quantities.
  - `requirementCreatedAt` = **earliest** `created_at` among member lines.
  - `needByDate` = **earliest** `need_by_date` among member lines.
  - `urgency` = **highest** urgency among member lines (`CRITICAL > HIGH > STANDARD`).

---

## 4. Step 3 — Requirement Valuation Hierarchy (Section 3.1)

Every requirement is valued in INR (`₹`) using a three-tier priority hierarchy:

1. **Tier 1 — Valid Rate Contract Price (`CONTRACT_RATE`)**:
   - Used when at least one active, plant-valid, date-valid (`start_date <= req_date <= end_date`) contract for the item has **remaining ceiling $\ge$ requirement value at that contract rate** and whose supplier is active/unblocked.
   - If multiple valid contracts can cover the requirement:
     - **Primary sort**: Lowest `agreed_rate` (`ASC`).
     - **Tie-breaker**: Highest supplier preferred score (`DESC`), then contract ID (`ASC`).
   - *Worked Example 2 (`PR-26-00060/1`, `ITM-1001`, `CHK1`, qty `18`)*: `RC-2026-001` (`S001`, `₹41,000`) and `RC-2026-002` (`S002`, `₹41,500`) both cover `CHK1`; `RC-2026-001` is selected at `₹41,000` (`₹7,38,000`).

2. **Tier 2 — Latest Historical PO Price within 365 Days (`LATEST_PO_365D`)**:
   - Used when no rate contract covers the requirement (either none exists, or all matching contracts have insufficient remaining ceiling per **Clause 3.1a**).
   - Queries `po_history` for the same `item_code` where `po_date` is within `[req_date - 365 days, req_date]`.
   - **Deterministic Same-Day Tie-Breaking**: Sorted by `po_date DESC`, then `po_number DESC`.
   - *Worked Example 4 (`PR-26-00055/1`, `ITM-1010`, qty `140`)*: `RC-2026-009` has only `₹9,00,000` remaining ceiling vs `₹16,10,000` needed at contract rate; falls back to Tier 2 (`PO 7300062` at `₹13,701.21` $\rightarrow$ `₹19,18,169.40`).
   - *Worked Example 11 (`PR-26-00069/1`, `ITM-1034`, qty `50`)*: Two POs exist on `2026-04-10` (`7300215` at `₹40,929.88` and `7300220` at `₹41,415.60`). Sorting by `po_number DESC` selects `7300220` (`50 × ₹41,415.60 = ₹20,70,780`).

3. **Tier 3 — Item Master Standard Price (`STANDARD_PRICE`)**:
   - Used when no valid contract covers the requirement and no historical PO exists within 365 days (or for `NEW_ITEM` fallback `₹0`).

---

## 5. Step 4 — Contract Ceiling Consumption & PDF Annex Contracts (Section 3.2)

- **Consumption Order**: Requirements are evaluated in deterministic chronological order (`requirementCreatedAt ASC`, then `firstPrNumber ASC`, then `firstPrLine ASC`).
- **Ceiling Deduction**: Only requirements whose final decision is `PO / CONTRACT_PO` consume contract ceiling (`consumed += requirementValue`). Requirements that exceed remaining ceiling do not partially consume it; they fall back to Tier 2/3 valuation and route to `RFQ` or `RFP`.
- **Supplementary PDF Annex Contracts**: `Corvo_Procurement_Policy.pdf` (Annex A) specifies two contracts that are absent from `contracts.csv` (`RC-2026-031` for `ITM-1032` at `₹980` and `RC-2026-033` for `ITM-1064` at `₹22,000`). Both are loaded and merged deterministically with `contracts.csv` so Worked Example 14 (`PR-26-00051/1`, `ITM-1032` via `RC-2026-031`) resolves identically to the policy specification.

---

## 6. Step 5 — Preferred Supplier Eligibility & Ranking Model (Section 4 & 6.4)

### 6.1 Eligibility Gate (Section 4.1 & 5.7)
A supplier is eligible for an item as of `requirementCreatedAt` if and only if:
1. `active === true` in `suppliers.csv` (inactive/blocked suppliers such as `S019` for `ITM-1025` are strictly excluded from all recommendations and PO awards, even if they hold historical POs or contracts — see *Worked Example 8*).
2. The supplier has **at least one historical PO for the item within the preceding 548 days** (`[req_date - 548 days, req_date]`) **OR** holds a **rate contract for the item with `start_date <= req_date`**.

### 6.2 Five-Factor Weighted Scoring Formula (Section 4.2)
For all item-level eligible suppliers $s \in E$:
$$\text{TotalScore}(s) = 0.35 \cdot F(s) + 0.25 \cdot R(s) + 0.15 \cdot C(s) + 0.15 \cdot OTD(s) + 0.10 \cdot Q(s)$$

- **Frequency Score $F(s)$ (35%)**: $\frac{\text{PO count}_{548\text{d}}(s)}{\max_{k \in E} \text{PO count}_{548\text{d}}(k)}$ (or `0` if $\max = 0$).
- **Recency Score $R(s)$ (25%)**: Tiered by age of most recent PO within the 548-day window:
  - $\le 90$ days: `1.0`
  - $91 \text{ to } 180$ days: `0.5`
  - $181 \text{ to } 548$ days (or contract-only with 0 POs): `0.0`
- **Contract Score $C(s)$ (15%)**: `1.0` if the supplier has any contract for the item starting on or before `req_date`, else `0.0`.
- **On-Time Delivery $OTD(s)$ (15%)**: `on_time_percent / 100` (if `null` / missing in `suppliers.csv`, preserved as `null` and contributes `0` — never imputed).
- **Quality Score $Q(s)$ (10%)**: `quality_rating / 5.0` (if `null` / missing in `suppliers.csv`, preserved as `null` and contributes `0` — never imputed).

### 6.3 Tie-Breaking Order
1. Higher `totalScore` (rounded to 4 decimal places for display, compared cleanly).
2. Higher `onTimePercent` (`null` treated as `-1`).
3. Higher `qualityRating` (`null` treated as `-1`).
4. Lexicographical `supplierId ASC` (`S001` before `S002`).

### 6.4 Category Top-Up & Shortfall Explainability (Section 6.4)
- For `RFQ` and `RFP` sourcing events, the engine recommends up to **3 suppliers**:
  1. First, all item-level eligible preferred suppliers (in rank order).
  2. If fewer than 3 item-level eligible suppliers exist, the engine tops up from **active suppliers in the same `category`** who are not already in the list, ranked by equal weighting of On-Time Delivery and Quality:
     $$\text{TopUpScore}(s) = 0.50 \cdot \left(\frac{\text{OTD}}{100}\right) + 0.50 \cdot \left(\frac{\text{Quality}}{5.0}\right)$$
     (*Worked Example 9 (`ITM-1066`)* $\rightarrow$ `S043;S044;S042`; *Worked Example 10 (`ITM-1006`)* $\rightarrow$ `S003;S002;S005`).
  3. If fewer than 3 suppliers exist even after category top-up, all available eligible suppliers are returned and a human-readable shortfall note is recorded in `supplierShortfallExplanation`.

---

## 7. Step 6 — Procurement Route Decision Hierarchy & Boundaries (Section 5)

Each requirement is evaluated against the following rules in strict priority order:

| Priority | Rule | Condition | Decision | Route | Selected Supplier |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **1** | **Clause 1.2** | `itemCode === "NEW_ITEM"` | `SOURCING_REQUEST` | `NEW_ITEM_SOURCING` | None |
| **2** | **Clause 5.1** | `item.category === "Capex"` | `SOURCING_REQUEST` | `CAPEX_SOURCING` | Up to 3 suggested suppliers |
| **3** | **Clause 5.2** | Valid contract covers plant, date, & ceiling (and supplier active) | `PO` | `CONTRACT_PO` | Contract supplier |
| **4** | **Clause 5.3** | `urgency === "CRITICAL"` AND `value <= ₹5,00,000` AND $\ge 1$ preferred supplier | `PO` | `EMERGENCY_PO` | Rank #1 preferred supplier |
| **5** | **Clause 5.4** | `value < ₹2,00,000` AND $\ge 1$ preferred supplier | `PO` | `SPOT_PO` | Rank #1 preferred supplier |
| **6** | **Clause 5.5** | `value < ₹10,00,000` (or Spot/Emergency without preferred supplier) | `SOURCING_REQUEST` | `RFQ` | Up to 3 suggested suppliers |
| **7** | **Clause 5.6** | `value >= ₹10,00,000` | `SOURCING_REQUEST` | `RFP` | Up to 3 suggested suppliers |

### Exact Boundary Inequalities
- **Spot PO vs RFQ**: Strictly `< ₹2,00,000` (`199,999.99` is `SPOT_PO`; `200,000.00` is `RFQ`).
- **Emergency PO Cap**: Inclusive `<= ₹5,00,000` (`500,000.00` with `CRITICAL` urgency and a preferred supplier is `EMERGENCY_PO`; `500,000.01` routes to `RFQ`/`RFP`).
- **RFQ vs RFP**: Strictly `< ₹10,00,000` for `RFQ`; inclusive `>= ₹10,00,000` for `RFP`.

---

## 8. Step 7 — Proposed PO Consolidation (Section 7)

Only requirements with `decision === "PO"` (`CONTRACT_PO`, `SPOT_PO`, `EMERGENCY_PO`) are eligible for PO consolidation.
- **Grouping Keys**:
  1. Same `selectedSupplierId`
  2. Same `plant` (`PUN1` or `CHK1`)
  3. Same `route` (`CONTRACT_PO`, `SPOT_PO`, or `EMERGENCY_PO`)
  4. `requirementCreatedAt` within **24.0 hours** (`86,400,000 ms`) of the **first** requirement in the PO group (non-transitive anchor comparison).
- **Proposed Status**: Consolidated POs (`PO-0001` through `PO-0081`) are always marked with `status: "PROPOSED"` and require buyer review before ERP dispatch.
