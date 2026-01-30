/**
 * @fileoverview Circuit Breaker Provider
 *
 * Wraps any LLM provider with Opossum circuit breaker for resilience.
 * When the underlying provider fails repeatedly, the circuit opens
 * and returns a graceful fallback instead of cascading failures.
 *
 * @remarks
 * States:
 * - CLOSED (0): Normal operation, requests pass through
 * - OPEN (1): Provider failing, requests fail fast with fallback
 * - HALF-OPEN (2): Testing if provider recovered
 */

import * as CircuitBreaker from 'opossum';
import { Logger } from '@nestjs/common';
import { LLMProvider, LLMAnalysisResult } from '../interfaces';
import { Gauge, Counter } from 'prom-client';

// Prometheus metrics for circuit state visibility
const circuitState = new Gauge({
    name: 'llm_circuit_breaker_state',
    help: 'Circuit breaker state (0=closed, 1=open, 2=half-open)',
    labelNames: ['provider'],
});

const circuitEvents = new Counter({
    name: 'llm_circuit_breaker_events_total',
    help: 'Circuit breaker events',
    labelNames: ['provider', 'event'],
});

export interface CircuitBreakerOptions {
    /** Request timeout in ms (default: 30000) */
    timeout?: number;
    /** Failure percentage to open circuit (default: 50) */
    errorThresholdPercentage?: number;
    /** Time before half-open attempt in ms (default: 30000) */
    resetTimeout?: number;
    /** Minimum requests before stats count (default: 3) */
    volumeThreshold?: number;
}

/**
 * Wraps an LLM provider with circuit breaker protection.
 */
export class CircuitBreakerProvider implements LLMProvider {
    private readonly logger = new Logger(CircuitBreakerProvider.name);
    private readonly breaker: CircuitBreaker;
    private readonly providerName: string;

    constructor(
        private readonly provider: LLMProvider,
        options?: CircuitBreakerOptions,
    ) {
        this.providerName = provider.getName();

        const defaults: CircuitBreaker.Options = {
            timeout: 30000,                // 30s for LLM calls (they're slow)
            errorThresholdPercentage: 50,  // Open at 50% failures
            resetTimeout: 30000,           // Half-open after 30s
            volumeThreshold: 3,            // Min 3 requests before stats count
        };

        // Create circuit breaker wrapping the analyze method
        this.breaker = new CircuitBreaker(
            (q: string, c: string, s?: string) => this.provider.analyze(q, c, s),
            { ...defaults, ...options },
        );

        this.setupEventHandlers();

        this.logger.log({
            msg: 'Circuit breaker initialized',
            provider: this.providerName,
            timeout: options?.timeout ?? defaults.timeout,
            resetTimeout: options?.resetTimeout ?? defaults.resetTimeout,
        });
    }

    getName(): string {
        return this.providerName;
    }

    async analyze(
        question: string,
        context: string,
        systemPrompt?: string,
    ): Promise<LLMAnalysisResult> {
        return this.breaker.fire(question, context, systemPrompt) as Promise<LLMAnalysisResult>;
    }

    /**
     * Check if circuit is currently open (failing fast).
     */
    isOpen(): boolean {
        return this.breaker.opened;
    }

    /**
     * Get current circuit state for diagnostics.
     */
    getState(): 'closed' | 'open' | 'half-open' {
        if (this.breaker.halfOpen) return 'half-open';
        if (this.breaker.opened) return 'open';
        return 'closed';
    }

    private setupEventHandlers(): void {
        const name = this.providerName;

        this.breaker.on('open', () => {
            circuitState.set({ provider: name }, 1);
            circuitEvents.inc({ provider: name, event: 'open' });
            this.logger.warn({
                msg: 'Circuit OPENED - LLM provider failing',
                provider: name,
            });
        });

        this.breaker.on('close', () => {
            circuitState.set({ provider: name }, 0);
            circuitEvents.inc({ provider: name, event: 'close' });
            this.logger.log({
                msg: 'Circuit CLOSED - LLM provider recovered',
                provider: name,
            });
        });

        this.breaker.on('halfOpen', () => {
            circuitState.set({ provider: name }, 2);
            circuitEvents.inc({ provider: name, event: 'halfOpen' });
            this.logger.log({
                msg: 'Circuit HALF-OPEN - testing recovery',
                provider: name,
            });
        });

        // Fallback when circuit is open
        this.breaker.fallback(() => {
            circuitEvents.inc({ provider: name, event: 'fallback' });
            this.logger.warn({
                msg: 'Circuit breaker fallback triggered',
                provider: name,
            });
            return {
                summary: 'Analysis temporarily unavailable. The AI service is experiencing issues and will recover shortly.',
                confidence: 'low' as const,
                reasoning: 'Circuit breaker active - LLM provider unavailable',
            };
        });

        // Log timeouts
        this.breaker.on('timeout', () => {
            circuitEvents.inc({ provider: name, event: 'timeout' });
            this.logger.warn({
                msg: 'LLM request timed out',
                provider: name,
            });
        });

        // Initialize metric to closed state
        circuitState.set({ provider: name }, 0);
    }
}
