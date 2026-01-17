# Secure OpenSearch Discovery

**Multi-Vertical Search & Analysis Platform for Protected Data**

NestJS service providing sub-second fuzzy search over PII-redacted records from multiple data sources, with LLM-powered analysis and comprehensive guardrails.

---

## Problem

Transactional databases (DynamoDB, PostgreSQL) cannot support complex text searches. Querying production tables directly impacts performance and lacks full-text capabilities.

## Solution

Extract → Redact → Index pipeline creating searchable, PII-protected OpenSearch indices, plus an LLM agent for cross-vertical analysis.

---

## Verticals

### Membership (DynamoDB → OpenSearch)

| Aspect | Detail |
|--------|--------|
| **Source** | DynamoDB (member records) |
| **Sync** | DynamoDB Streams → Lambda → OpenSearch |
| **Index** | `members` |
| **API** | `GET /members/search?q=...` |
| **Features** | Fuzzy search, RBAC field filtering, PII redaction |

### Locations (PostgreSQL → OpenSearch)

| Aspect | Detail |
|--------|--------|
| **Source** | PostgreSQL via TypeORM |
| **Sync** | Batch reindex on-demand |
| **Index** | `locations` |
| **API** | `GET /locations/search?q=...&region=...&rate_model=...` |
| **Features** | Region/rate model filters, tenant isolation |

**Rate Models:** `standard`, `per_participant`, `conversion_rate`, `new_enrollee`, `admin_enrollee`

### Agent (LLM Analysis + Guardrails)

| Aspect | Detail |
|--------|--------|
| **Local** | Gemini API (`gemini-1.5-flash`) |
| **Production** | AWS Bedrock (Claude 3 Sonnet, IAM auth) |
| **API** | `POST /agent/analyze` |
| **Guardrails** | Input validation, prompt injection detection, PII blocking, output validation, rate limiting |

---

## Architecture

```
┌─────────────┐     DynamoDB      ┌─────────────────┐
│  DynamoDB   │ ───  Streams  ──► │  Lambda Indexer │
│  (Members)  │                   │  + Redaction    │
└─────────────┘                   └────────┬────────┘
                                           │
┌─────────────┐     TypeORM               │
│ PostgreSQL  │ ────────────────────┐     │
│ (Locations) │                     │     │
└─────────────┘                     ▼     ▼
                                ┌─────────────────┐
┌─────────────┐                 │   OpenSearch    │
│  NestJS API │ ◄─── Query ──── │  members idx    │
│  + Agent    │                 │  locations idx  │
└──────┬──────┘                 └─────────────────┘
       │
       ▼ LLM Analysis (Gemini/Bedrock)
   [ Insight Response ]
```

---

## Project Structure

```
src/
├── shared/
│   ├── auth/          # JWT strategy, RBAC guard
│   ├── opensearch/    # Client provider
│   └── redaction/     # PII masking
├── membership/        # DynamoDB → OpenSearch vertical
├── locations/         # PostgreSQL → OpenSearch vertical
├── agent/
│   ├── providers/     # Gemini, Bedrock
│   └── guardrails/    # Input/output validation
└── config/            # Environment config
```

---

## Environment Hub

| Environment | Purpose | Documentation |
|-------------|---------|---------------|
| Local | Docker-based development | [docs/local.md](docs/local.md) |
| Production | AWS (OpenSearch, Lambda, Bedrock) | [docs/production.md](docs/production.md) |
| Migration | Switching environments | [docs/migration.md](docs/migration.md) |

---

## Key Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Search Engine | OpenSearch | AWS-managed, fuzzy search, field-level security |
| Membership Sync | DynamoDB Streams | Near real-time, built-in retry |
| Locations Sync | Batch reindex | Simpler, controllable |
| LLM Provider | Gemini (local) / Bedrock (prod) | No API keys in prod (IAM) |
| Guardrails | Pre/post pipeline | Defense in depth |

---

## Quickstart

```bash
# 1. Start infrastructure
docker-compose up -d

# 2. Install & seed
npm install && npm run seed

# 3. Start API
npm run start:dev

# 4. Test Membership search
curl "http://localhost:3000/members/search?q=John%20Smith"

# 5. Test Locations search
curl "http://localhost:3000/locations/search?q=Downtown%20Fitness&region=Southeast"
```

---

## Documentation

- [Local Development](docs/local.md)
- [Production Deployment](docs/production.md)
- [Migration Guide](docs/migration.md)
- [Testing Strategy](docs/testing.md)
- [Observability](docs/observability.md)
- [Security](docs/security.md)
- [Scale & Failure Modes](docs/scale.md)
