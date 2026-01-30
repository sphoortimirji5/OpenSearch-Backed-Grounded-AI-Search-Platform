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
│             │                 │  locations idx  │
└──────┬──────┘                 └─────────────────┘
       │
       ▼
┌──────────────────────────────────────────────────┐
│  Agent Pipeline                                  │
│  ┌──────────┐   ┌─────────────┐   ┌───────────┐ │
│  │ Guardrails│──▶│ LLM Provider│──▶│ Grounding │ │
│  │ (Pre)    │   │ Gemini/     │   │ Service   │ │
│  └──────────┘   │ Bedrock     │   └─────┬─────┘ │
│                 └─────────────┘         │       │
│                       ▲                 ▼       │
│                       │        [Score + Verdict]│
│            Circuit Breaker                      │
└──────────────────────────────────────────────────┘
       │
       ▼
  [ Grounded Response ]
```

---

## Queries & Inference

### Inference Flow

Query → RBAC Filter → PII Redaction → LLM Analysis → Grounding Check → Response

### Agent Analysis

```bash
POST /agent/analyze
{
  "question": "What are the enrollment trends for Q4?"
}

# Response
{
  "summary": "Q4 showed 15% increase in enrollments [mem-001, mem-042]...",
  "confidence": "high",
  "reasoning": "Based on 47 member records with enrollment dates in Oct-Dec, comparing to 41 records in Q3.",
  "provider": "bedrock"
}
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
│   ├── dto/           # Request/response DTOs
│   ├── interfaces/    # LLMProvider contracts
│   ├── providers/     # Gemini, Bedrock
│   ├── grounding/     # Hallucination prevention
│   └── guardrails/    # Input/output validation
├── config/            # Environment config
└── tracing.ts         # OpenTelemetry auto-instrumentation
```

---

## Documentation

| Doc | Purpose |
|-----|---------|
| [local.md](docs/local.md) | Local development setup |
| [production.md](docs/production.md) | AWS architecture & config |
| [migration.md](docs/migration.md) | Deploy local → production |
| [testing.md](docs/testing.md) | Test strategy & commands |
| [observability.md](docs/observability.md) | Logs, traces, metrics, alerts |
| [security.md](docs/security.md) | Auth, encryption, guardrails |
| [scale.md](docs/scale.md) | Scaling & failure modes |
