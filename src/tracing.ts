/**
 * @fileoverview OpenTelemetry Tracing Setup
 *
 * Auto-instrumentation for distributed tracing with OTLP export to Jaeger.
 * This file MUST be imported before any other imports in main.ts.
 *
 * @remarks
 * Local: Exports to Jaeger at http://localhost:4318, 100% sampling
 * Production: Configure OTEL_EXPORTER_OTLP_ENDPOINT and uses 10% sampling
 */

import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { Resource } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';
import { ParentBasedSampler, TraceIdRatioBasedSampler, AlwaysOnSampler } from '@opentelemetry/sdk-trace-node';

const isProduction = process.env.NODE_ENV === 'production';

// Production: 10% sampling to reduce cost
// Local: 100% sampling for debugging
const sampler = isProduction
    ? new ParentBasedSampler({ root: new TraceIdRatioBasedSampler(0.1) })
    : new AlwaysOnSampler();

const traceExporter = new OTLPTraceExporter({
    url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318/v1/traces',
});

const sdk = new NodeSDK({
    resource: new Resource({
        [SemanticResourceAttributes.SERVICE_NAME]: 'membersearch-api',
        [SemanticResourceAttributes.SERVICE_VERSION]: '1.0.0',
        [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]: process.env.NODE_ENV || 'development',
    }),
    traceExporter,
    sampler,
    instrumentations: [
        getNodeAutoInstrumentations({
            // Disable noisy instrumentations
            '@opentelemetry/instrumentation-fs': { enabled: false },
            '@opentelemetry/instrumentation-dns': { enabled: false },
        }),
    ],
});

sdk.start();

// Graceful shutdown
process.on('SIGTERM', () => {
    sdk.shutdown()
        .then(() => console.log('Tracing terminated'))
        .catch((error: Error) => console.error('Error terminating tracing', error))
        .finally(() => process.exit(0));
});

export { sdk };
