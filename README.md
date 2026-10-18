# FinSight

[![Release](https://img.shields.io/badge/Release-v1.1.0-purple.svg)](https://github.com/ShivShah018/FinSight/releases)
[![Deployment](https://img.shields.io/badge/Deployment-Live-brightgreen)](https://fin-sight-beta-dusky.vercel.app)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![React](https://img.shields.io/badge/Frontend-React_19_%7C_TypeScript-61DAFB?logo=react)](https://react.dev/)
[![Express](https://img.shields.io/badge/Backend-Node.js_%7C_Express-000000?logo=nodedotjs)](https://expressjs.com/)
[![MySQL](https://img.shields.io/badge/Database-MySQL_8.0-4479A1?logo=mysql&logoColor=white)](https://www.mysql.com/)

**FinSight** is a full-stack personal finance management platform built with React 19, TypeScript, Express.js, and MySQL. It combines a bounded, human-in-the-loop agentic AI assistant, deterministic financial analytics, transparent machine learning models, and a sleek responsive dark-mode interface.

🌐 **Live Application:** [https://fin-sight-beta-dusky.vercel.app](https://fin-sight-beta-dusky.vercel.app)  
⚙️ **Backend API:** [https://finsight-backend-zsz3.onrender.com](https://finsight-backend-zsz3.onrender.com)

---

### Release `v1.1.0` Overview

FinSight **v1.1.0** introduces end-to-end conversation persistence between drawer and full-page assistant modes, an animated financial loading experience with rotating insights messages, bounded human-in-the-loop budget proposal approvals with intelligent alternatives, time-aware ML evaluation, a modernized GitHub Actions CI pipeline, and a production-grade multi-container Docker setup.

---

## Features

### 🤖 AI-Powered Financial Assistant
- **Conversational Intelligence:** Natural language financial analysis and multi-turn Q&A powered by Google Gemini with native tool-calling capabilities.
- **Bounded Multi-Step Workflow:** LangGraph-based `StateGraph` state machine with typed state, cycle limits (max 3 iterations), and deterministic fallback handlers.
- **Read-Only Financial Tools:** Grounded in actual ledger data via read-only tools (`get_monthly_spending`, `get_category_breakdown`, `get_budget_status`, etc.) without fabricating numbers.
- **Live Activity & Metrics Cards:** Visual display of tool execution stages, category spending distributions, and net cashflow metrics directly inside chat responses.
- **Human-in-the-Loop Budget Approvals:** Gemini proposes budget adjustments with explicit reasons, requiring explicit user approval before atomic execution.
- **Intelligent Alternatives on Decline:** Rejecting a proposal leaves budget limits untouched and prompts data-grounded alternatives (distinguishing flexible vs. fixed categories).
- **Persistent Multi-View Conversation:** Conversations survive seamless transitions between the embedded drawer and `/assistant` full page, preserving in-flight typewriter text and message history in user-scoped `sessionStorage`.
- **Account Isolation & Privacy:** Secure per-user session isolation ensures logout immediately purges cached conversation state, preventing cross-user data leakage.

### 📊 Analytics & Applied Machine Learning
- **Interactive Analytics & Charts:** 12-month net cashflow bar charts, monthly surplus/deficit tracking, and dynamic multi-currency rendering (`INR`, `USD`, `EUR`, `GBP`).
- **Animated Loading Experience:** Polished centered loading message (*“Crunching your numbers…”*) featuring a glowing purple gradient orb, pulsing chart bars, three bouncing indicator dots, and smooth fade transitions rotating through short insight previews.
- **Zero-CLS Skeletons & State Handling:** Layout-preserving dark-mode skeleton placeholders, independent section loading for cashflow vs. spending groups, structured retry buttons on error, and intuitive empty states.
- **Linear Regression Forecasting:** Time-series expense predictions projected from historical monthly spending.
- **K-Means Expense Clustering:** Unsupervised grouping of transaction behaviors into ranked clusters based on frequency and ticket size.
- **Chronological ML Validation:** Real-world time-series holdout evaluation without future lookahead, compared against a naive persistence baseline (last-month spending).

### 🛡️ Reliability & Engineering
- **Input Validation & Pagination:** Strict Zod schema validation across all endpoints, with bounded transaction pagination (limit capped at 100) to protect database throughput.
- **Strict JWT Configuration:** Safe secret verification rejecting insecure development fallbacks in production.
- **Health & Readiness Endpoints:** Dedicated probes (`GET /health` and `GET /health/ready`) reporting uptime, configuration state, and live MySQL database connectivity.
- **ML Subprocess Isolation & Timeouts:** Python machine learning scripts run in an isolated subprocess with graceful 20-second timeout handling and deterministic fallback outputs.
- **Automated Testing & CI/CD:** 10 backend test suites (73 tests) covering agent safety, transactional approval, and ML validation; 25 real-browser CDP tests; GitHub Actions CI pipeline; and multi-container Docker/Compose configuration.
- **Ledger Management & Security:** Full CRUD ledger with soft-delete/restore capabilities, bcrypt password hashing, and A4 PDF statement generation.

---

## Tech Stack

| Layer | Technologies & Libraries |
| :--- | :--- |
| **Frontend** | React 19, TypeScript, Vite, TanStack Query v5, Recharts, Lucide Icons, React Hook Form, Zod, Tailwind CSS |
| **Backend** | Node.js, Express.js, JWT (`jsonwebtoken`), `bcrypt`, `mysql2` (Prepared Statements), `pdfkit` |
| **Agentic AI** | LangGraph (`@langchain/langgraph`), Google Gemini (`@langchain/google-genai`), `@langchain/core`, Zod validation |
| **Database** | MySQL 8.0 (7 Relational Tables with Foreign Keys, Cascading Deletes, Unique Constraints, and Composite Indexes) |
| **Email Service** | Resend API (Transactional emails for password reset verification) |
| **Machine Learning** | Python 3, `scikit-learn` (Linear Regression, K-Means Clustering, TimeSeriesSplit) |
| **Deployment** | Vercel (Frontend SPA with URL rewrites), Render (Express.js API), MySQL Cloud Database |

---

## Architecture & System Design

FinSight uses a decoupled client-server architecture. The React single-page application communicates with the Node.js/Express backend via a RESTful JSON API. Heavy machine-learning computations are offloaded to an isolated Python service spawned on demand.

```mermaid
flowchart LR
    UI["React 19 + TS SPA (Vercel)"]
    API["Express REST API (Render)"]
    AUTH["JWT Authentication"]
    DB[("MySQL 8.0 Database")]
    ML["Python ML Subprocess"]
    EMAIL["Resend Email API"]

    UI -->|HTTPS / JSON| API
    API --> AUTH
    API --> DB
    API --> ML
    API --> EMAIL
```

### Authentication Flow

```mermaid
sequenceDiagram
    participant Client as React SPA
    participant Server as Express API
    participant DB as MySQL DB

    Client->>Server: POST /auth/login (email, password)
    Server->>DB: SELECT * FROM users WHERE email = ?
    DB-->>Server: User Record + Password Hash
    Server->>Server: Verify password with bcrypt
    Server-->>Client: JWT Access Token + User Profile

    Client->>Server: GET /transactions (Headers: Bearer <token>)
    Server->>Server: Verify JWT Token Signature
    Server->>DB: SELECT * FROM transactions WHERE user_id = ?
    DB-->>Server: Transaction Records
    Server-->>Client: JSON Response
```

---

## Repository Structure

```text
FinSight/
├── frontend/             # React 19 + TypeScript SPA
│   ├── src/
│   │   ├── api/          # Axios API service instances
│   │   ├── components/   # Modular UI components & modals
│   │   ├── contexts/     # Auth & global state providers
│   │   ├── hooks/        # Custom React hooks
│   │   ├── pages/        # Dashboard, Transactions, Goals, Budgets, Analytics, Insights, Settings
│   │   ├── types/        # TypeScript interfaces & types
│   │   └── utils/        # Formatting & currency helpers
│   ├── package.json
│   └── vite.config.ts
│
├── server/               # Express.js REST API Backend
│   ├── controllers/      # Route controllers (Auth, Tx, Goals, Budgets, Analytics, ML)
│   ├── routes/           # Express router endpoints
│   ├── database/         # MySQL database initialization schemas
│   ├── ml/               # Python ML scripts & evaluation pipeline
│   ├── utils/            # JWT middleware & email service
│   ├── db.js             # MySQL connection pool
│   ├── app.js            # Express app configuration & middleware
│   ├── server.js         # HTTP server entry point
│   └── package.json
│
├── vercel.json           # Vercel SPA routing rules
└── README.md
```

---

## API Overview

All protected endpoints require an `Authorization: Bearer <token>` header.

### Authentication & Account
- `POST /auth/register` — Register a new user account
- `POST /auth/login` — Authenticate credentials and issue JWT
- `GET /auth/me` — Retrieve current authenticated user profile
- `POST /auth/forgot-password` — Request password reset email
- `POST /auth/reset-password` — Reset password using token

### Transactions Ledger
- `GET /transactions` — Fetch user transactions (supports `month`, `year`, `limit`)
- `POST /transactions` — Create new transaction record
- `GET /transactions/:tx_id` — Fetch single transaction details
- `PUT /transactions/:tx_id` — Update existing transaction
- `DELETE /transactions/:tx_id` — Soft-delete transaction (`deleted_at = NOW()`)
- `POST /transactions/:tx_id/restore` — Restore soft-deleted transaction
- `GET /transactions/deleted/recent` — Fetch recently deleted transactions

### Savings Goals & Budgets
- `GET /goals` | `POST /goals` | `PUT /goals/:goal_id` | `DELETE /goals/:goal_id` — Goal CRUD
- `POST /goals/:goal_id/fund` — Deposit funds into savings goal
- `POST /goals/:goal_id/complete` — Mark savings goal completed
- `POST /goals/:goal_id/cancel` — Mark savings goal cancelled
- `GET /budgets` | `POST /budgets` | `PUT /budgets/:budget_id` | `DELETE /budgets/:budget_id` — Budget cap CRUD
- `GET /budgets/utilization` — Get category spending vs monthly limits

### Dashboard, Analytics & System
- `GET /dashboard` — Financial overview metrics and monthly summary
- `GET /analytics/trends` — 12-month historical cashflow aggregations
- `GET /categories` — Fetch available spending and income categories
- `POST /report/generate` — Generate downloadable A4 PDF financial statement
- `GET /currency/rates` — Live multi-currency conversion rates
- `GET /health` — Application health & Resend service configuration status

### Agentic AI Assistant
- `POST /agent/chat` — Bounded multi-step conversational query with Gemini native tool execution
- `GET /agent/proposals` — List pending and historical budget modification proposals
- `GET /agent/proposals/:proposal_id` — Get single proposal details with live staleness status
- `POST /agent/proposals/:proposal_id/approve` — Atomically approve and apply budget update
- `POST /agent/proposals/:proposal_id/reject` — Reject proposal without modifying budget limits

### ML Insights
- `GET /insights/predict` — Next-month spending prediction (Linear Regression)
- `GET /insights/suggest-category` — Automated expense category classification
- `GET /insights/cluster` — Behavioral spending cluster analysis
- `GET /insights/all` — Aggregate analytical data feed for ML pipeline

---

## Database Design

```mermaid
erDiagram
    users {
        int id PK
        varchar full_name
        varchar email UK
        varchar password_hash
        char currency
    }
    categories {
        int id PK
        int user_id FK
        varchar name
        enum type
        varchar icon
    }
    transactions {
        int id PK
        int user_id FK
        int category_id FK
        decimal amount
        enum type
        date transaction_date
        timestamp deleted_at
    }
    savings_goals {
        int id PK
        int user_id FK
        varchar name
        decimal target_amount
        decimal current_amount
        date deadline
    }
    budget_limits {
        int id PK
        int user_id FK
        int category_id FK
        decimal monthly_limit
    }
    password_reset_tokens {
        int id PK
        int user_id FK
        varchar token_hash
        datetime expires_at
        datetime used_at
    }
    agent_proposals {
        int id PK
        int user_id FK
        int target_budget_id FK
        decimal current_amount
        decimal proposed_amount
        text reason
        enum status
        datetime expires_at
    }

    users ||--o{ categories : "owns"
    users ||--o{ transactions : "records"
    users ||--o{ savings_goals : "manages"
    users ||--o{ budget_limits : "configures"
    users ||--o{ password_reset_tokens : "receives"
    users ||--o{ agent_proposals : "reviews"
    categories ||--o{ transactions : "classifies"
    categories ||--o{ budget_limits : "restricts"
    budget_limits ||--o{ agent_proposals : "targeted_by"
```

---

## Application Gallery

| Dashboard Overview | Transaction Ledger |
|:---:|:---:|
| ![Dashboard](screenshots/dashboard.png) | ![Transactions](screenshots/transactions.png) |

| Savings Goals | Budget Limits |
|:---:|:---:|
| ![Goals](screenshots/goals.png) | ![Budgets](screenshots/budgets.png) |

| Financial Analytics | User Settings |
|:---:|:---:|
| ![Analytics](screenshots/analytics.png) | ![Settings](screenshots/settings.png) |

---

## Local Setup & Installation

### Prerequisites
- **Node.js:** v18.0.0 or higher
- **MySQL:** v8.0 or higher
- **Python:** v3.10 or higher (Optional for ML service)

### 1. Clone Repository
```bash
git clone https://github.com/ShivShah018/FinSight.git
cd FinSight
```

### 2. Database Initialization
Import the schema into your local MySQL server:
```bash
mysql -u root -p < server/database/schema_railway.sql
```

### 3. Server Configuration & Startup
```bash
cd server
npm install
```
Create a `.env` file inside the `server/` directory:
```env
FINSIGHT_DB_HOST=localhost
FINSIGHT_DB_PORT=3306
FINSIGHT_DB_USER=root
FINSIGHT_DB_PASSWORD=your_mysql_password
FINSIGHT_DB_NAME=finsight
JWT_SECRET_KEY=your_secure_jwt_secret
API_PORT=8000
RESEND_API_KEY=re_your_resend_api_key

# Agentic AI (Google Gemini & LangGraph)
GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_MODEL=gemini-3.5-flash-lite
AGENT_MAX_ITERATIONS=3
AGENT_PROPOSAL_EXPIRY_HOURS=24
```
Start the backend server:
```bash
npm start
```
*Backend server will listen on `http://localhost:8000`.*

### 4. Frontend Startup
Open a new terminal window:
```bash
cd frontend
npm install
npm run dev
```
*Frontend application will launch at `http://localhost:5173`.*

---

## Automated Testing

FinSight includes comprehensive unit, integration, security, and E2E test suites:

### 1. Server Unit, Agent, ML & Approval Security Tests
Uses Node's built-in native test runner (`node --test`). Tests tool schemas, empty data handling, anomaly detection, LangGraph state transitions, bounded iteration stops, authorization boundaries, proposal staleness checks, atomic transactional approval, time-aware ML evaluation, and deployment smoke checks across 10 suites (73 automated tests):
```bash
cd server
npm test
```

### 2. Machine Learning Time-Aware Evaluation & Clustering Tests
Tests Python `ml_service.py` subprocess execution, holdout train/test split without future data leakage, naive persistence baseline comparison, and K-Means expense clustering:
```bash
cd server
node --test tests/mlService.test.js
```

### 3. Full End-to-End Integration Suite
Tests the complete realistic user lifecycle against the running backend (46 tests):
```bash
node test_e2e.js
```

### 4. Real Browser UI & Assistant Persistence Suite (Chrome CDP)
Executes end-to-end user journeys in headless Chrome using native Chrome DevTools Protocol (CDP) on port 9222 without third-party frameworks. Verifies registration, login, drawer interactions, question sequencing, route transitions between drawer and `/assistant`, follow-ups, typewriter animation, page refresh state recovery from `sessionStorage`, and strict User B account data isolation (25 tests):
```bash
# Ensure frontend dev server is running on localhost:5173 and backend on localhost:8000
node test_browser_conversation_flow.js
```

### 5. Frontend Linting & Production Build
```bash
cd frontend
npm run lint
npm run build
```

---

## Docker & Containerization

FinSight provides container definitions for a clean, reproducible local development and testing environment.

### Backend Dockerfile (`Dockerfile`)
- **Base:** `node:20-bookworm-slim` with Python 3 virtual environment for ML execution.
- **Security:** Runs as unprivileged `USER node`.
- **Health Check:** Native HTTP probe polling `GET /health` every 30 seconds.
- **Port:** Exposes port 8000 (configurable via `PORT` / `API_PORT`).

### Docker Compose (`docker-compose.yml`)
Spins up both MySQL 8.0 and the Express + Python ML backend in an isolated bridge network:

```bash
# Start MySQL and Express Backend containers
docker compose up --build -d

# View service logs
docker compose logs -f backend

# Verify health status
curl http://localhost:8000/health
curl http://localhost:8000/health/ready

# Tear down environment
docker compose down -v
```

---

## CI/CD Pipeline (GitHub Actions)

FinSight features a fully automated, gated CI/CD pipeline defined in [`.github/workflows/ci.yml`](.github/workflows/ci.yml). Pull requests execute continuous integration tests only, while merges/pushes to `main` execute CI quality gates followed by sequential deployments to Render and Vercel and post-deployment production health verification:

```
[Push to main / PR]
       │
       ├──► [Job: frontend-ci] (ESLint + TypeScript + Vite production build)
       ├──► [Job: backend-and-ml-ci] (MySQL 8.0 container + Python 3.11 ML + 77 tests)
       └──► [Job: security-audit-ci] (Blocking production audit: high/critical thresholds)
               │
   (On PR: Stops here — CI checks only)
   (On main push: Gated release triggers only after all CI checks pass)
               │
               ▼
       [Job: deploy-backend] (Triggers Render deploy hook & polls /health/ready)
               │
               ▼
       [Job: deploy-frontend] (Triggers Vercel deploy hook & polls frontend)
               │
               ▼
       [Job: verify-production-health] (Automated smoke checks: /health, /health/ready, frontend)
```

### 1. Stage 1: Continuous Integration (CI)
- **Frontend Quality Gate (`frontend-ci`):** Node.js 20 environment with npm caching, ESLint validation, TypeScript type-checking, and Vite production bundle compilation.
- **Backend & ML Validation (`backend-and-ml-ci`):**
  - Spawns disposable `mysql:8.0` service container with automated health probing.
  - Configures Python 3.11 with pip caching and installs ML dependencies (`numpy`, `scikit-learn`).
  - Initializes database schema using `server/database/schema_railway.sql`.
  - Executes all 10 backend test suites (77 automated tests) covering ACID transactions, row-level locking, multi-tenant isolation, LangGraph state machine, and Python ML holdout validation.
- **Security Audit (`security-audit-ci`):**
  - Strict, blocking vulnerability audit on production dependencies:
    - Backend: `npm audit --audit-level=high --omit=dev` (fails CI on high/critical production CVEs).
    - Frontend: `npm audit --audit-level=high` (fails CI on high/critical CVEs).

### 2. Stage 2: Continuous Deployment & Delivery (CD)
- **Branch Restriction:** Executes strictly on `push` to `refs/heads/main`. Pull requests never deploy to production.
- **Render Backend Deploy (`deploy-backend`):** Triggers Render's official Deploy Hook and polls `https://finsight-backend-zsz3.onrender.com/health/ready` until the service reports `ready` and `database: connected`.
- **Vercel Frontend Deploy (`deploy-frontend`):** Initiates after the backend is confirmed healthy, triggering Vercel's Deploy Hook and polling `https://fin-sight-beta-dusky.vercel.app` for HTTP 200.
- **Production Smoke Verification (`verify-production-health`):** Validates live production endpoints without mutating user data:
  - `GET /health`: Verifies service liveness and version info.
  - `GET /health/ready`: Confirms active cloud MySQL database connectivity.
  - `GET /`: Confirms frontend SPA availability.
- **Concurrency & Governance:**
  - `cancel-in-progress: ${{ github.ref != 'refs/heads/main' }}` (cancels redundant PR runs, but prevents in-flight production releases from aborting).
  - Least-privilege permissions (`contents: read`). Zero secrets logged or exposed.

---

## Hosting & Deployment Configuration

### Production URLs
- **Frontend (Vercel):** [https://fin-sight-beta-dusky.vercel.app](https://fin-sight-beta-dusky.vercel.app)
- **Backend (Render):** [https://finsight-backend-zsz3.onrender.com](https://finsight-backend-zsz3.onrender.com)
- **Database (Cloud MySQL):** Managed TiDB Cloud Serverless MySQL instance.

### Required GitHub Repository Secrets
To enable the gated deployment workflow, configure the following secrets in GitHub Repository **Settings** -> **Secrets and variables** -> **Actions**:

| Secret Name | Source / Provider Configuration | Purpose |
| :--- | :--- | :--- |
| `RENDER_DEPLOY_HOOK_URL` | Render Dashboard -> `finsight-backend-zsz3` -> **Settings** -> **Build & Deploy** -> Create **Deploy Hook**. *(Set **Auto-Deploy** to **No**)* | Triggers backend deployment only after CI passes. |
| `VERCEL_DEPLOY_HOOK_URL` | Vercel Dashboard -> `fin-sight-beta-dusky` -> **Settings** -> **Git** -> Create **Deploy Hook** for branch `main`. | Triggers frontend deployment only after backend is verified. |

> [!IMPORTANT]
> To prevent Vercel and Render from deploying broken commits before GitHub Actions CI finishes, set **Auto-Deploy** to **No** in Render service settings. This ensures production releases are strictly gated by GitHub Actions CI verification.

---

## Health Checks & Troubleshooting

### Health Endpoints
- `GET /health`: Returns basic service liveness and email provider configuration:
  ```json
  { "status": "healthy", "version": "1.1.0", "email": { "provider": "resend", "configured": true } }
  ```
- `GET /health/ready`: Probes active MySQL database connectivity:
  ```json
  { "status": "ready", "database": "connected", "version": "1.1.0" }
  ```

### Common Issues & Solutions
1. **Database Connection Refused (`ECONNREFUSED`):**
   - Verify MySQL server is active on `FINSIGHT_DB_HOST`:`FINSIGHT_DB_PORT`.
   - Check credentials in `server/.env`.
2. **Python Subprocess Timeout in ML Insights:**
   - On Windows cold starts, scikit-learn import may take a few seconds. FinSight defaults to a 20-second timeout, configurable via `ML_TIMEOUT_MS=20000`.
   - Ensure the virtual environment at `backend/.venv` (or Docker `/opt/venv`) has `scikit-learn` and `numpy` installed.
3. **Gemini AI Rate Limits (`429 RESOURCE_EXHAUSTED`):**
   - The assistant agent automatically detects quota exhaustion and provides structured, deterministic financial fallback insights using verified tool execution data without crashing.

---

## Known Limitations & Portfolio Notes

- **Model Complexity:** FinSight intentionally employs Linear Regression and K-Means clustering for financial transparency and rapid explainability. It avoids black-box neural architectures for simple monthly ledger analysis.
- **Holdout Evaluation:** Predictive accuracy is evaluated using a time-aware train/test split (no future lookahead) compared against a naive persistence baseline (last-month spending).
- **Conversation Storage:** Assistant conversations are persisted in `sessionStorage` scoped per user ID. Server-side session sync is intentionally avoided to preserve privacy and minimize database bloat.

---

## Engineering Highlights & Design Rationale

- **Agentic AI with LangGraph & Gemini Function Calling:** Unlike naive single-shot chatbot wrappers, FinSight coordinates a bounded multi-step state graph (`StateGraph`) with explicit typed state, deterministic evaluation nodes, and bounded iterations.
- **Human-in-the-Loop Financial Action Approvals:** Gemini is strictly restricted to read-only tool invocation and cannot execute budget changes directly. When financial optimization suggests a budget change, the agent generates a pending proposal stored in MySQL. Users must review and explicitly approve proposals.
- **Stale Proposal & Replay Protection:** Approval executes inside an isolated database transaction with row locks (`FOR UPDATE`). If the live budget changed since the proposal was created, the approval is rejected with HTTP 409 Conflict to protect the user's finances.
- **SQL Security & Performance:** All database interactions use prepared statements via `mysql2` to prevent SQL injection. Composite indexes (`idx_user_date`, `idx_user_status`) accelerate range queries.
- **Zero-CLS Skeleton UI:** Dedicated skeleton placeholders match the dark theme and preserve layout stability during chart and cluster data fetching.
- **Decoupled SPA / REST Architecture:** Frontend and backend are completely decoupled. The SPA communicates exclusively via JSON HTTP requests, enabling independent deployments on Vercel and Render.

---

## License

This project is licensed under the [MIT License](LICENSE).

