# Inbox Pilot

Jev-gated inbox autopilot: a personal Gmail assistant that organizes recruiting email into namespaced labels, explains every decision, and asks for review when evidence is weak or consequences are sensitive.

This repository is at **Stage 2**: Gmail ingestion (mock or live OAuth), durable discovery, MIME/parser provenance, scan status UI, and dry-run decisions. Gmail **writes** remain disabled in dry run (default).

## Prerequisites

- Node.js 22 (see `.nvmrc`)
- pnpm 11.9+
- Docker Desktop or compatible engine (optional if you already have PostgreSQL)

## Quick start

Database-only setup (recommended for day-to-day):

```bash
cp .env.example .env
docker compose up -d postgres
pnpm install
pnpm -r run build
pnpm db:migrate
```

Run API and worker in separate terminals:

```bash
pnpm dev:api
pnpm dev:worker
```

Health check: [http://localhost:3000/health](http://localhost:3000/health)

Replay fixtures (persists decisions, zero Gmail writes):

```bash
pnpm fixtures:replay
```

### Mock Gmail flow

Default `GMAIL_MODE=mock` in `.env`:

1. Start API + worker
2. `pnpm --filter @inbox-pilot/review dev` → sign in with `OWNER_PASSWORD` → Connect mock Gmail → Run historical scan
3. Or `POST /internal/scans` with `Authorization: Bearer $SCHEDULER_BEARER_TOKEN`

### Full Compose

```bash
docker compose up --build
```

| Service | URL / port |
| --- | --- |
| API | http://localhost:3000 |
| Review UI (dev) | http://localhost:5173 |
| n8n editor | http://localhost:5678 |
| Postgres | localhost:5432 |

Import sanitized workflows from `workflows/n8n/` into n8n. Set `SCHEDULER_BEARER_TOKEN` and `INBOX_ACCOUNT_ID` in the n8n environment. Do not paste email bodies or tokens into workflow nodes.

### CI parity

```bash
pnpm typecheck
pnpm test
pnpm db:migrate
pnpm fixtures:replay
```

Public CI never receives real Gmail or Jev credentials.

Optional Jev spike (synthetic state only; requires an early-access key):

```bash
export TYPESAFE_API_KEY=tsk_...
pnpm --filter @inbox-pilot/jev spike
```

## What Stage 2 proves

- Mock or live Gmail connect with scope explanation and dry-run default
- Paginated discovery (200-message synthetic mailbox), history cursor, coverage-gap recovery
- MIME decode, HTML-to-text, ATS templates; company candidates never silently use ATS brands
- Scan status + parser inspection APIs; n8n workflows send account refs only
- Processing jobs persist decisions with **zero** Gmail mutations in dry run

## Modes

| Mode | Behavior |
| --- | --- |
| `dry_run` (default) | Propose labels; never mutate Gmail (including label creation) |
| `labeling` | Stage 4+; add only app-owned labels after policy / human approval |

Sensitive categories (interview, offer, rejection) always require human approval.

## Security notes

- Never commit `.env`, OAuth tokens, or real mailbox samples
- n8n workflow exports contain account references only
- Keep Google / TypeSafe keys out of tracked files and workflow JSON
