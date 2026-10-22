# CompliKart SupplySure

CompliKart is a local prototype for food business records, batch traceability and compliance workflows. SupplySure explores a connected procurement workflow: a processor records demand, a farmer collective shares an estimate and commitment, and fulfilment events build a traceable record.

This repository is a hackathon prototype. The sample businesses and records are fictional. It is not an official FSSAI assessment, a validated regulatory service, or a production procurement network.

## Try the browser demo

The local sample workspace does not need Docker, PostgreSQL, Redis or the AI service. From the repository root:

```powershell
npm install
cd web
npm run dev -- --host 127.0.0.1
```

Open **http://127.0.0.1:5173/** and choose **Enter the local sample workspace**. Select **SupplySure** in the sidebar to view the demand plans, quantity gaps and commitment timeline. You can add sample plans and advance demo events. Those changes remain in browser memory; they are not saved to the API or sent to a collective.

## Run the local service stack

With Docker Desktop running, create a local `.env` from `.env.example`, set a private `JWT_SECRET`, then run this from the repository root:

```powershell
docker compose up --build
```

Open the web app at **http://127.0.0.1:5174/** and the API health endpoint at **http://127.0.0.1:4000/health**. The stack includes PostgreSQL 16 with pgvector, Redis, the Node API, and the web app. The AI service is optional and CPU-heavy; start it separately with:

```powershell
docker compose --profile ai up --build
```

To rebuild the API and web app after code changes while keeping the database volume:

```powershell
docker compose up -d --build backend web
```

The Compose settings are for a local demo. Do not expose the stack publicly as-is. Keep `.env` private and configure deployment-grade secrets, transport security, database access, backups and monitoring before any hosted deployment.

## What works in this prototype

- Account registration and login through the API, with scrypt password hashes and 12-hour JWT sessions.
- Product and batch API workflows with account ownership checks.
- Label generation and EPCIS-shaped traceability event records.
- An interactive browser demo with sample batches, a traceability timeline, and a local SupplySure demand board.
- A deterministic SupplySure gap indicator: requested quantity compared with confirmed quantity.

## Current limits

- SupplySure demand plans and simulated commitment events are frontend-only sample state. They are not persisted and do not notify farmer collectives.
- SupplySure forecasting is not deployed. The gap indicator is a transparent quantity comparison, not an AI prediction.
- The signed-in dashboard still contains illustrative sample records; dashboard data is not yet fully connected to each registered account.
- The compliance status API returns `assessment_required`; it does not make regulatory determinations. Generated labels require human review.
- Phone OTP delivery and an externally configured language model are not included in the local demo.

## Recommended next updates

1. Add authenticated, account-scoped SupplySure APIs and database migrations for demand plans, collective estimates, confirmations and fulfilment events.
2. Connect the dashboard to account-scoped product and batch APIs; keep sample mode clearly separate from real account data.
3. Add automated coverage for account isolation, API validation, authentication and SupplySure event transitions.
4. Build a source-verified, versioned compliance knowledge base with citations and human review before presenting regulatory guidance as actionable.
5. Run a small sourcing pilot, define baselines and collect actual fulfilment data before training or claiming predictive performance.
6. Before deployment, replace local Compose defaults with managed secrets and add backups, monitoring, retention controls and a deployment review.

## Project layout

- `web/` — React, TypeScript and Vite frontend.
- `backend/` — Node.js and Express API, PostgreSQL migrations, labels and traceability event handling.
- `ai-service/` — optional AI service profile.
- `mobile/` — mobile application workspace.
- `docker-compose.yml` — local development services.
- `outputs/CompliKart_SupplySure_Expanded_Pitch_Deck.pptx` — current hackathon presentation.
