# Production Deployment

AWS-based production architecture for Secure OpenSearch Discovery multi-vertical platform.

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                              VPC                                      │
│                                                                       │
│  ┌─────────────┐    ┌─────────────┐    ┌──────────────────────────┐ │
│  │  DynamoDB   │───►│   Lambda    │───►│                          │ │
│  │  + Streams  │    │  Indexer    │    │      OpenSearch          │ │
│  └─────────────┘    └─────────────┘    │       Service            │ │
│                                        │                          │ │
│  ┌─────────────┐    ┌─────────────┐    │   members index          │ │
│  │ PostgreSQL  │───►│ ECS/Lambda  │───►│   locations index        │ │
│  │    (RDS)    │    │  Indexer    │    │                          │ │
│  └─────────────┘    └─────────────┘    └──────────────────────────┘ │
│                                                     ▲                │
│                                                     │                │
│  ┌─────────────┐    ┌─────────────┐    ┌──────────┴───────────┐    │
│  │    API      │───►│    ECS      │───►│      Bedrock         │    │
│  │  Gateway    │    │  NestJS     │    │  (Claude/Titan)      │    │
│  │  + Cognito  │    │    API      │    └──────────────────────┘    │
│  └─────────────┘    └─────────────┘                                 │
│                           │                                          │
│                     ┌─────┴─────┐                                   │
│                     │  SQS DLQ  │                                   │
│                     └───────────┘                                   │
└──────────────────────────────────────────────────────────────────────┘
```

---

## Components

### Membership Vertical

| Component | Service | Purpose |
|-----------|---------|---------|
| Source | DynamoDB | Member records |
| Sync | DynamoDB Streams + Lambda | Real-time CDC |
| Index | OpenSearch `members` | Fuzzy search |

### Locations Vertical

| Component | Service | Purpose |
|-----------|---------|---------|
| Source | RDS PostgreSQL | Location records |
| Sync | Scheduled Lambda / ECS Task | Batch reindex |
| Index | OpenSearch `locations` | Filter by region/rate |

### Agent Vertical

| Component | Service | Purpose |
|-----------|---------|---------|
| LLM | AWS Bedrock | Claude/Titan inference |
| Auth | IAM Task Roles | No API keys needed |
| Guardrails | Built-in | Input/output validation |

---

## Environment Variables

```bash
# .env.production
OPENSEARCH_NODE=https://membersearch.us-east-1.es.amazonaws.com
AWS_REGION=us-east-1
JWT_ISSUER=https://cognito-idp.us-east-1.amazonaws.com/<pool-id>

# PostgreSQL (Locations)
POSTGRES_HOST=membersearch-locations.xxx.us-east-1.rds.amazonaws.com
POSTGRES_PORT=5432
POSTGRES_DB=locations

# LLM (Agent)
LLM_PROVIDER=bedrock
BEDROCK_MODEL_ID=anthropic.claude-3-haiku-20240307-v1:0
```

---

## IAM Policies

### Lambda Indexer (Membership)
```json
{
  "Effect": "Allow",
  "Action": [
    "dynamodb:GetRecords",
    "dynamodb:GetShardIterator",
    "dynamodb:DescribeStream",
    "dynamodb:ListStreams"
  ],
  "Resource": "arn:aws:dynamodb:*:*:table/members/stream/*"
}
```

### OpenSearch Access
```json
{
  "Effect": "Allow",
  "Action": ["es:ESHttpGet", "es:ESHttpPost", "es:ESHttpPut"],
  "Resource": "arn:aws:es:*:*:domain/membersearch/*"
}
```

### Bedrock Access (Agent)
```json
{
  "Effect": "Allow",
  "Action": ["bedrock:InvokeModel"],
  "Resource": "arn:aws:bedrock:*:*:foundation-model/anthropic.claude*"
}
```

### RDS Access (Locations)
```json
{
  "Effect": "Allow",
  "Action": ["rds-db:connect"],
  "Resource": "arn:aws:rds-db:*:*:dbuser:*/locations_reader"
}
```

---

## Deployment

### Lambda Indexer (Serverless Framework)
```bash
cd indexer/
serverless deploy --stage prod
```

### NestJS API (ECS)
```bash
# Build container
docker build -t membersearch-api .

# Push to ECR
aws ecr get-login-password | docker login --username AWS --password-stdin <account>.dkr.ecr.<region>.amazonaws.com
docker tag membersearch-api:latest <account>.dkr.ecr.<region>.amazonaws.com/membersearch-api:latest
docker push <account>.dkr.ecr.<region>.amazonaws.com/membersearch-api:latest

# Deploy via Terraform/CDK
terraform apply
```

### Locations Sync (Scheduled)
```yaml
# serverless.yml
functions:
  locationsReindex:
    handler: src/locations/reindex.handler
    events:
      - schedule: rate(1 hour)
    environment:
      POSTGRES_HOST: ${ssm:/membersearch/prod/postgres/host}
```

---

## Index Lifecycle Management

| Aspect | Strategy | Rationale |
|--------|----------|-----------|
| **Sharding** | 1 primary, 1 replica | Sufficient for <10M documents |
| **Rollover** | Not required initially | Single index per vertical |
| **Retention** | Indefinite | Sync with source systems |

---

## Monitoring

| Metric | Source | Alert Threshold |
|--------|--------|-----------------|
| DLQ Message Count | SQS | > 0 |
| Lambda Errors | CloudWatch | > 1% error rate |
| OpenSearch Cluster Health | OpenSearch | Yellow/Red |
| API p99 Latency | API Gateway | > 500ms |
| Bedrock Throttling | CloudWatch | > 0 |
| Agent Guardrails Blocks | Custom Metrics | > 10% |
