# Observability

Logging, metrics, tracing, and monitoring for Secure OpenSearch Discovery.

---

## Local Stack

| Service | URL | Purpose |
|---------|-----|---------|
| API Metrics | http://localhost:3000/metrics | Prometheus metrics endpoint |
| Jaeger | http://localhost:16686 | Distributed tracing UI |
| Prometheus | http://localhost:9090 | Metrics storage & queries |
| Grafana | http://localhost:3001 | Dashboards (admin/admin) |
| Loki | http://localhost:3100 | Log aggregation |

```bash
# Start observability stack
docker-compose up -d

# Start app with tracing enabled
npm run start:dev

# Generate traffic, then explore:
# - Traces: http://localhost:16686 (Service: membersearch-api)
# - Metrics: http://localhost:9090 (query: membersearch_queries_total)
# - Dashboards: http://localhost:3001
```

---

## Tracing (OpenTelemetry + Jaeger)

Auto-instrumentation via `src/tracing.ts`:

```typescript
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';

const sdk = new NodeSDK({
    resource: new Resource({
        [SemanticResourceAttributes.SERVICE_NAME]: 'membersearch-api',
    }),
    traceExporter: new OTLPTraceExporter({
        url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318/v1/traces',
    }),
    instrumentations: [getNodeAutoInstrumentations()],
});
```

### What Gets Traced

| Component | Auto-instrumented |
|-----------|-------------------|
| HTTP requests | ✅ Express/NestJS |
| Database | ✅ TypeORM/PostgreSQL |
| External HTTP | ✅ fetch/axios |
| OpenSearch | ✅ Elasticsearch client |

### Production Configuration

Set `OTEL_EXPORTER_OTLP_ENDPOINT` to your backend:

| Provider | Endpoint |
|----------|----------|
| Grafana Cloud | `https://otlp-gateway.grafana.net/otlp` |
| Self-hosted Jaeger | Your Jaeger OTLP endpoint |
| Honeycomb | `https://api.honeycomb.io:443` |

---

## Logging (Pino)

```typescript
PinoModule.forRoot({
    pinoHttp: {
        level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
        transport: process.env.NODE_ENV !== 'production'
            ? { target: 'pino-pretty' }
            : undefined,
        redact: ['req.headers.authorization'],
    },
});
```

| Environment | Format |
|-------------|--------|
| Local | Pretty-printed + Loki |
| Production | JSON (Loki or any log aggregator) |

---

## Metrics (Prometheus)

### Application Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `membersearch_queries_total` | Counter | role, status | Member search requests |
| `membersearch_query_duration_seconds` | Histogram | - | Search latency |
| `locations_queries_total` | Counter | role, status | Location search requests |
| `agent_analysis_total` | Counter | provider, status | LLM analyses |
| `agent_analysis_duration_seconds` | Histogram | - | LLM response latency |
| `agent_guardrails_total` | Counter | type, action | Guardrail pipeline results |
| `agent_grounding_total` | Counter | result | Grounding pass/fail |
| `grounding_score` | Histogram | - | Score distribution for threshold tuning |
| `grounding_check_duration_seconds` | Histogram | - | Grounding verification latency |
| `grounding_errors_total` | Counter | error_type | Grounding failures by type |
| `llm_tokens_total` | Counter | type, model | Token usage for cost tracking |
| `llm_errors_total` | Counter | error_type, model | LLM failures by type |
| `llm_circuit_breaker_state` | Gauge | provider | Circuit state (0=closed, 1=open, 2=half-open) |
| `llm_circuit_breaker_events_total` | Counter | provider, event | Circuit events (open/close/halfOpen/fallback/timeout) |

### Prometheus Configuration

```yaml
# infra/prometheus/prometheus.yml
scrape_configs:
  - job_name: 'membersearch-api'
    static_configs:
      - targets: ['host.docker.internal:3000']
    metrics_path: '/metrics'
```

---

## Service Level Objectives (SLOs)

| Service | SLI | Target |
|---------|-----|--------|
| Membership Search | Availability | 99.9% |
| Membership Search | p99 Latency | < 200ms |
| Locations Search | Availability | 99.9% |
| Agent Analysis | Availability | 99% |
| Agent Analysis | p99 Latency | < 30s |

---

## Grafana Dashboards

Auto-provisioned data sources:
- **Prometheus**: Metrics queries
- **Jaeger**: Trace exploration

### Recommended Panels

1. Request rate by vertical
2. Latency percentiles (p50, p95, p99)
3. Error rate
4. Agent guardrails block rate
5. Trace-to-logs correlation

---

## Production Alerting

### Grafana Alerting (Recommended)

Use Grafana's unified alerting with Prometheus and Loki:

```yaml
# Prometheus alert rules
groups:
  - name: membersearch
    rules:
      - alert: HighErrorRate
        expr: rate(http_requests_total{status=~"5.."}[5m]) > 0.01
        for: 5m
        labels:
          severity: critical

      - alert: HighAgentBlockRate
        expr: rate(agent_guardrails_total{action="blocked"}[5m]) > 100
        for: 5m
        labels:
          severity: warning

      - alert: HighLatency
        expr: histogram_quantile(0.99, rate(http_request_duration_seconds_bucket[5m])) > 0.2
        for: 5m
        labels:
          severity: warning
```
