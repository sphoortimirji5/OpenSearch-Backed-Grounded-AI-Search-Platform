# Observability

Logging, metrics, and monitoring for Secure OpenSearch Discovery multi-vertical platform.

---

## Logging

### NestJS API (nestjs-pino)

```typescript
// main.ts
import { Logger } from 'nestjs-pino';

app.useLogger(app.get(Logger));
```

**Configuration:**
```typescript
// app.module.ts
PinoModule.forRoot({
  pinoHttp: {
    level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
    transport: process.env.NODE_ENV !== 'production'
      ? { target: 'pino-pretty' }
      : undefined,
    redact: ['req.headers.authorization', 'res.headers["set-cookie"]'],
  },
});
```

### Log Format

**Local (pretty):**
```
[09:45:30] INFO: Search request received
  query: "violation"
  role: "auditor"
  duration: 45ms
```

**Production (JSON):**
```json
{"level":"info","time":1705312345,"msg":"Search request received","query":"violation","role":"auditor","duration":45}
```

---

## Metrics (Prometheus)

### Setup

```typescript
// app.module.ts
import { PrometheusModule } from '@willsoto/nestjs-prometheus';

PrometheusModule.register({
  path: '/metrics',
  defaultMetrics: { enabled: true },
});
```

### Accessing Metrics

```bash
curl http://localhost:3000/metrics
```

---

## Membership Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `membersearch_queries_total` | Counter | role, tenant_type, status | Total member search requests |
| `membersearch_query_duration_seconds` | Histogram | - | Search latency distribution |
| `membersearch_index_operations_total` | Counter | status | Document index operations |
| `membersearch_reindex_total` | Counter | - | Full reindex operations |

---

## Locations Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `locations_queries_total` | Counter | role, status | Total location search requests |
| `locations_query_duration_seconds` | Histogram | - | Location search latency |
| `locations_index_operations_total` | Counter | status | Location index operations |
| `locations_reindex_total` | Counter | - | PostgreSQL→OpenSearch reindex |

---

## Agent Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `agent_analysis_total` | Counter | provider, status | Total LLM analyses |
| `agent_analysis_duration_seconds` | Histogram | - | LLM response latency |
| `agent_guardrails_total` | Counter | type, action | Guardrails pipeline results |

### Guardrails Labels

| type | action | Meaning |
|------|--------|---------|
| `input` | `allowed` | Question passed input validation |
| `input` | `blocked` | Prompt injection or PII detected |
| `output` | `passed` | LLM response validated |
| `output` | `fallback` | Fallback response used |

### LLM Provider

| Provider | Environment | Metrics Label |
|----------|-------------|---------------|
| Gemini 2.5 Flash | Local | `provider="gemini"` |
| AWS Bedrock | Production | `provider="bedrock"` |

---

## Distributed Tracing (AWS X-Ray)

### Lambda Indexer
```typescript
import AWSXRay from 'aws-xray-sdk';
const AWS = AWSXRay.captureAWS(require('aws-sdk'));
```

### NestJS (via OpenTelemetry)
```typescript
// tracing.ts
import { NodeSDK } from '@opentelemetry/sdk-node';
import { AWSXRayPropagator } from '@opentelemetry/propagator-aws-xray';

const sdk = new NodeSDK({
  textMapPropagator: new AWSXRayPropagator(),
});
sdk.start();
```

---

## Service Level Objectives (SLOs)

### Membership Search
| SLI | Target | Measurement |
|-----|--------|-------------|
| Availability | 99.9% | Successful responses / total requests |
| Latency (p99) | < 200ms | `membersearch_query_duration_seconds` |
| Index Lag | < 5 seconds | DynamoDB Stream age |

### Locations Search
| SLI | Target | Measurement |
|-----|--------|-------------|
| Availability | 99.9% | Successful responses / total requests |
| Latency (p99) | < 200ms | `locations_query_duration_seconds` |

### Agent Analysis
| SLI | Target | Measurement |
|-----|--------|-------------|
| Availability | 99% | Successful analyses / total requests |
| Latency (p99) | < 30s | `agent_analysis_duration_seconds` |
| Guardrails Block Rate | < 5% | `agent_guardrails_total{action="blocked"}` |

---

## Alerting

### CloudWatch Alarms

```yaml
# DLQ not empty
- AlarmName: MemberSearchDLQNotEmpty
  MetricName: ApproximateNumberOfMessagesVisible
  Namespace: AWS/SQS
  Threshold: 1
  ComparisonOperator: GreaterThanOrEqualToThreshold

# High error rate
- AlarmName: MemberSearchAPIErrors
  MetricName: 5XXError
  Namespace: AWS/ApiGateway
  Threshold: 1
  EvaluationPeriods: 1

# LLM rate limiting
- AlarmName: AgentHighBlockRate
  MetricName: agent_guardrails_total
  Dimensions:
    - Name: action
      Value: blocked
  Threshold: 100  # per minute
  ComparisonOperator: GreaterThanThreshold

# Index drift detection
- AlarmName: MemberSearchIndexLag
  MetricName: ApproximateAgeOfOldestRecord
  Namespace: AWS/DynamoDB
  Dimensions:
    - Name: TableName
      Value: members
  Threshold: 5000  # 5 seconds in milliseconds
  ComparisonOperator: GreaterThanThreshold
```

---

## Dashboards

### Grafana (if self-hosting metrics)
- Search RPS and latency by vertical
- Agent analysis success rate
- Guardrails block rate
- Index operations per second

### CloudWatch Dashboard
- Lambda invocations and errors
- API Gateway latency percentiles
- OpenSearch domain metrics
- Bedrock token usage (production)
