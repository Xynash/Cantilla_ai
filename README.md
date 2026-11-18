# Cantill.ai — Enterprise Procurement Intake & Deterministic Decision Platform

**Cantill.ai** is an end-to-end enterprise procurement intake, policy governance, and deterministic decision engine built with **Next.js 16**, **TypeScript 5**, **MongoDB / Mongoose**, and **Auth.js v5 (NextAuth)**.

It provides conversational Purchase Requisition (PR) intake, automated batch PR evaluation under **Corvo Procurement Policy v5.0**, multi-factor supplier intelligence scoring, contract ceiling tracking, purchase order consolidation, and full audit explainability.

---

## Key Capabilities

- **Conversational PR Intake (`/chat` & `/requisitions`)**: Deterministic rule-based NLP intake parser that extracts items, quantities, plants, need-by dates, and urgency flags while prompting for missing fields.
- **Deterministic Procurement Decision Engine (`/decisions`)**:
  1. **Pre-Validation**: Enforces plant scope (`PUN1`, `CHK1`) and positive quantity checks.
  2. **4-Tier Item Resolution**: Exact code/name matching, normalized token matching, synonym resolution, and `NEW_ITEM` detection.
  3. **Requirement Clubbing**: Non-transitive 14-day creation window and ±7-day need-by date window aggregation.
  4. **Contract & Ceiling Evaluation**: Tracks cumulative contract spend and remaining ceilings across active rate contracts.
  5. **3-Tier Valuation Engine**: Evaluates `CONTRACT_RATE` → `LATEST_PO_365D` → `STANDARD_PRICE`.
  6. **5-Factor Preferred Supplier Scoring**: Scores eligible suppliers (548-day lookback) across Frequency (`35%`), Recency (`25%`), Contract coverage (`15%`), On-Time Delivery (`15%`), and Quality (`10%`).
  7. **Policy v5.0 Route Hierarchy**: Routes requisitions to `RATE_CONTRACT_PO`, `SPOT_PO`, `EMERGENCY_PO`, `RFQ`, `RFP`, `NEW_ITEM_SOURCING`, or `POLICY_EXCEPTION` with full rule execution logs.
  8. **PO Consolidation (`/purchase-orders`)**: Groups eligible lines into proposed Purchase Orders within a 24-hour non-transitive window by `(supplier, plant, route)`.
- **Policy-as-Code & Version Comparison (`/policies`)**: Manage, compare, and extract procurement policy versions and threshold parameters.
- **Master Data & Analytics (`/items`, `/suppliers`, `/contracts`, `/plants`, `/analytics`, `/reports`)**: Full directory management, CSV data import (`/import`), supplier intelligence scorecards, and RFC 4180 12-column CSV batch export.
- **Role-Based Access Control (RBAC)**: Supports `REQUESTER`, `BUYER`, and `PROCUREMENT_ADMIN` roles.

---

## Tech Stack

| Layer | Technology |
| :--- | :--- |
| **Framework** | Next.js 16 (App Router, Server & Client Components, Route Handlers) |
| **Language & Validation** | TypeScript 5 (`strict: true`), Zod |
| **Database** | MongoDB Atlas & Mongoose 8 (with local CSV/in-memory fallback store) |
| **Authentication** | NextAuth.js v5 (`next-auth@5.0.0-beta.25`), JWT session strategy, `bcryptjs` |
| **UI & Styling** | Tailwind CSS, Radix UI primitives, Lucide Icons, Framer Motion, Recharts |
| **Testing & Tooling** | Vitest / `tsx` verification suites (`tests/phase2.test.ts` – `tests/phase8_e2e.test.ts`) |

---

## Getting Started

### 1. Clone the repository

```bash
git clone https://github.com/Xynash/Cantilla_ai.git
cd Cantilla_ai
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment variables

Copy `.env.example` to `.env.local` and update the values as needed:

```bash
cp .env.example .env.local
```

```env
NODE_ENV="development"
NEXT_PUBLIC_APP_NAME="Cantill.ai"
NEXT_PUBLIC_APP_URL="http://localhost:3000"

# MongoDB Connection (falls back to local data store if omitted in development)
MONGODB_URI="mongodb+srv://username:password@cluster.mongodb.net/cantill_db?retryWrites=true&w=majority"
MONGODB_DB_NAME="cantill_db"

# Auth.js / NextAuth v5
AUTH_SECRET="development_secret_change_in_production_min_32_characters"
AUTH_URL="http://localhost:3000"

# Initial Administrator Bootstrap
ADMIN_EMAIL="admin@cantill.ai"
ADMIN_PASSWORD="CantillAdmin2026!"
ADMIN_NAME="Cantill System Administrator"
```

### 4. Seed master data (optional)

```bash
npm run seed
```

### 5. Run the development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## Available Scripts

| Command | Description |
| :--- | :--- |
| `npm run dev` | Start the Next.js development server on port `3000` |
| `npm run build` | Build the production application (`next build --webpack`) |
| `npm run start` | Start the production server |
| `npm run lint` | Run ESLint across the codebase |
| `npm run type-check` | Run TypeScript compiler type checks (`tsc --noEmit`) |
| `npm run seed` | Seed MongoDB with master data from `data/` |
| `npm run test:all` | Execute automated verification test suites |

---

## Project Structure

```text
├── app/                  # Next.js App Router pages & REST API route handlers (app/api/*)
├── components/           # UI components (Chat, Buyer Decision Workspace, Dashboard, Policies)
├── data/                 # Master CSV datasets (Items, Suppliers, Contracts, Purchase History)
├── hooks/                # Custom React hooks (theme, toast notifications)
├── lib/                  # Auth configuration, RBAC guards, DB connection & fallback store
├── models/               # Mongoose schemas (Requisition, BatchProcessingRun, Supplier, etc.)
├── scripts/              # Master data seeding utilities
├── services/             # Core business logic
│   ├── chat-intake/      # Deterministic conversational PR parser & entity matchers
│   └── decision-engine/  # 8-stage procurement decision engine & Policy v5.0 evaluator
├── tests/                # Phase-by-phase & end-to-end verification suites
└── types/                # Shared TypeScript interfaces (API, Auth, Procurement)
```

For deep-dive architectural details and policy rule specifications, see [`APPROACH.md`](./APPROACH.md) and [`DECISIONS.md`](./DECISIONS.md).
