# Local Development

Docker-based environment for developing and testing MemberSearch multi-vertical platform.

---

## Prerequisites

- Docker & Docker Compose
- Node.js 18+
- npm or yarn
- Gemini API key (for local LLM testing)

---

## Infrastructure

```bash
docker-compose up -d
```

| Service | Port | Purpose |
|---------|------|---------|
| OpenSearch | 9200 | Search cluster (single-node) |
| OpenSearch Dashboards | 5601 | Query UI (optional) |
| DynamoDB Local | 8000 | Member data store |
| PostgreSQL | 5433 | Locations data store |

---

## Environment Configuration

```bash
# .env.local
OPENSEARCH_NODE=http://localhost:9200
DYNAMODB_ENDPOINT=http://localhost:8000
AWS_REGION=us-east-1
JWT_ISSUER=http://localhost:3000
JWT_SECRET=local-dev-secret-do-not-use-in-prod
NODE_ENV=development

# PostgreSQL (Locations)
POSTGRES_PORT=5433

# LLM (Agent)
LLM_PROVIDER=gemini
GEMINI_API_KEY=your-gemini-api-key
```

### Mock JWT Setup

Generate deterministic test tokens for local development:

```bash
# Generate tokens inline
TOKEN=$(node -e "const jwt = require('jsonwebtoken'); console.log(jwt.sign({sub: 'test-auditor', 'cognito:groups': ['auditor'], tenant_id: 'rcm-internal', tenant_type: 'internal'}, 'local-dev-secret-do-not-use-in-prod', {issuer: 'http://localhost:3000', expiresIn: '1h'}))")

# Use in curl
curl "http://localhost:3000/members/search?q=John" \
  -H "Authorization: Bearer $TOKEN"
```

---

## Seeding Data

```bash
npm run seed
```

This script:
1. Creates the DynamoDB `members` table
2. Inserts mock member records
3. Creates OpenSearch indices with proper mappings
4. Runs redaction pipeline → bulk indexes documents

### Seed Locations (PostgreSQL → OpenSearch)

```bash
# Reindex locations from PostgreSQL
TOKEN=$(node -e "const jwt = require('jsonwebtoken'); console.log(jwt.sign({sub: 'admin', 'cognito:groups': ['admin'], tenant_id: 'rcm-internal', tenant_type: 'internal'}, 'local-dev-secret-do-not-use-in-prod', {issuer: 'http://localhost:3000', expiresIn: '1h'}))")

curl -X POST "http://localhost:3000/admin/locations/reindex" \
  -H "Authorization: Bearer $TOKEN"
```

---

## Running the API

```bash
npm run start:dev
```

API available at `http://localhost:3000`

### Test Endpoints

```bash
# Generate token
TOKEN=$(node -e "const jwt = require('jsonwebtoken'); console.log(jwt.sign({sub: 'test-auditor', 'cognito:groups': ['auditor'], tenant_id: 'rcm-internal', tenant_type: 'internal'}, 'local-dev-secret-do-not-use-in-prod', {issuer: 'http://localhost:3000', expiresIn: '1h'}))")

# Members search
curl "http://localhost:3000/members/search?q=John&limit=10" \
  -H "Authorization: Bearer $TOKEN"

# Locations search
curl "http://localhost:3000/locations/search?region=Southeast&limit=10" \
  -H "Authorization: Bearer $TOKEN"

# Agent analysis (requires GEMINI_API_KEY)
curl -X POST "http://localhost:3000/agent/analyze" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"question": "What are the top performing locations?"}'

# Metrics
curl "http://localhost:3000/metrics"
```

---

## Hot Reload

NestJS runs with `--watch` in dev mode. Changes to `src/` automatically restart the server.

---

## Debugging

```bash
# View OpenSearch indices
curl http://localhost:9200/_cat/indices?v

# Query members index
curl -X GET "http://localhost:9200/members/_search?pretty" \
  -H "Content-Type: application/json" \
  -d '{"query": {"match_all": {}}}'

# Query locations index
curl -X GET "http://localhost:9200/locations/_search?pretty" \
  -H "Content-Type: application/json" \
  -d '{"query": {"match_all": {}}}'

# View DynamoDB tables
aws dynamodb list-tables --endpoint-url http://localhost:8000

# Query PostgreSQL locations
docker exec membersearch-postgres psql -U postgres -d locations \
  -c "SELECT location_id, metadata->>'name' FROM locations;"
```

---

## Cleanup

```bash
docker-compose down -v  # Remove volumes too
```
