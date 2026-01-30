# Secure OpenSearch Discovery

**Multi-Vertical Search & Analysis Platform for Protected Data**

NestJS service providing sub-second fuzzy search over PII-redacted records from multiple data sources, with LLM-powered analysis and comprehensive guardrails.

---

## Problem

Healthcare companies partner with fitness networks (gyms, wellness centers) to provide members with access to exercise facilities as part of their health plans. This involves:

- **Members:** Health plan enrollees who use contracted gym locations
- **Locations:** Fitness facilities (gyms, studios) with contractual relationships to the company
- **Business Need:** Understand enrollment trends, location utilization, and member engagement to optimize network contracts and improve health outcomes

**Technical challenges:**
1. **Search:** Transactional databases (DynamoDB, PostgreSQL) lack full-text search capabilities
2. **Insights:** Raw data requires manual analysis; no intelligent summarization or cross-vertical reasoning

## Solution

1. **Search:** Extract → Redact → Index pipeline for PII-protected, fuzzy-searchable OpenSearch indices
2. **Insights:** Grounded LLM agent for intelligent analysis with hallucination prevention

---

## Verticals

### Membership (DynamoDB → OpenSearch)

| Aspect | Detail |
|--------|--------|
| **Source** | DynamoDB (member records) |
| **Sync** | DynamoDB Streams → Lambda → OpenSearch |
| **Index** | `members` |
| **API** | `GET /members/search?q=...` |
| **Features** | Fuzzy search, PII redaction |

### Locations (PostgreSQL → OpenSearch)

| Aspect | Detail |
|--------|--------|
| **Source** | PostgreSQL via TypeORM |
| **Sync** | Batch reindex on-demand |
| **Index** | `locations` |
| **API** | `GET /locations/search?q=...&region=...&rate_model=...` |
| **Features** | Region/rate model filters |

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

Query → PII Redaction → LLM Analysis → Grounding Check → Response

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
│   ├── redaction/     # PII masking
│   └── tracing/       # OpenTelemetry auto-instrumentation
├── membership/        # DynamoDB → OpenSearch vertical
├── locations/         # PostgreSQL → OpenSearch vertical
├── agent/
│   ├── dto/           # Request/response DTOs
│   ├── interfaces/    # LLMProvider contracts
│   ├── providers/     # Gemini, Bedrock
│   ├── grounding/     # Hallucination prevention
│   ├── resilience/    # Circuit breaker
│   └── guardrails/    # Input/output validation
└── config/            # Environment config
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
