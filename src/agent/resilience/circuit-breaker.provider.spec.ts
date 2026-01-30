/**
 * @fileoverview Circuit Breaker Provider Unit Tests
 *
 * Tests Opossum circuit breaker behavior:
 * - Normal operation (closed circuit)
 * - Circuit opens after threshold failures
 * - Fallback response when open
 * - Recovery to half-open and closed states
 */

import { CircuitBreakerProvider, CircuitBreakerOptions } from './circuit-breaker.provider';
import { LLMProvider, LLMAnalysisResult } from '../interfaces';

describe('CircuitBreakerProvider', () => {
    let mockProvider: jest.Mocked<LLMProvider>;
    let circuitBreaker: CircuitBreakerProvider;

    const successResponse: LLMAnalysisResult = {
        summary: 'Test analysis result',
        confidence: 'high',
        reasoning: 'Based on test data',
    };

    beforeEach(() => {
        mockProvider = {
            getName: jest.fn().mockReturnValue('mock-provider'),
            analyze: jest.fn().mockResolvedValue(successResponse),
        };

        // Fast timeouts for testing
        const testOptions: CircuitBreakerOptions = {
            timeout: 100,          // 100ms timeout
            resetTimeout: 200,     // 200ms before half-open
            volumeThreshold: 2,    // Open after 2 failures
            errorThresholdPercentage: 50,
        };

        circuitBreaker = new CircuitBreakerProvider(mockProvider, testOptions);
    });

    describe('getName', () => {
        it('should return the underlying provider name', () => {
            expect(circuitBreaker.getName()).toBe('mock-provider');
        });
    });

    describe('analyze (closed circuit)', () => {
        it('should pass through to underlying provider', async () => {
            const result = await circuitBreaker.analyze('question', 'context', 'systemPrompt');

            expect(result).toEqual(successResponse);
            expect(mockProvider.analyze).toHaveBeenCalledWith('question', 'context', 'systemPrompt');
        });

        it('should propagate successful responses', async () => {
            const customResponse: LLMAnalysisResult = {
                summary: 'Custom response',
                confidence: 'medium',
            };
            mockProvider.analyze.mockResolvedValueOnce(customResponse);

            const result = await circuitBreaker.analyze('q', 'c');

            expect(result).toEqual(customResponse);
        });
    });

    describe('circuit opening', () => {
        it('should trigger fallback after threshold failures', async () => {
            mockProvider.analyze.mockRejectedValue(new Error('Provider error'));

            // First few calls may fail or trigger fallback depending on timing
            // After enough failures, circuit opens and returns fallback
            const results: LLMAnalysisResult[] = [];
            for (let i = 0; i < 5; i++) {
                try {
                    const result = await circuitBreaker.analyze('q', 'c');
                    results.push(result);
                } catch {
                    // Some may throw before fallback kicks in
                }
            }

            // At least one should be a fallback response
            const hasFallback = results.some(r =>
                r.summary.includes('temporarily unavailable')
            );
            expect(hasFallback).toBe(true);
        });

        it('should return fallback when circuit is open', async () => {
            // Force circuit open by failing multiple times
            mockProvider.analyze.mockRejectedValue(new Error('Provider error'));

            // Trigger failures to open circuit
            for (let i = 0; i < 3; i++) {
                try {
                    await circuitBreaker.analyze('q', 'c');
                } catch {
                    // Expected failures
                }
            }

            // Now circuit should be open, next call should get fallback
            const result = await circuitBreaker.analyze('q', 'c');

            expect(result.summary).toContain('temporarily unavailable');
            expect(result.confidence).toBe('low');
            expect(result.reasoning).toContain('Circuit breaker');
        });
    });

    describe('getState', () => {
        it('should return closed when circuit is healthy', () => {
            expect(circuitBreaker.getState()).toBe('closed');
        });

        it('should return open after failures', async () => {
            mockProvider.analyze.mockRejectedValue(new Error('fail'));

            // Trigger enough failures
            for (let i = 0; i < 5; i++) {
                try {
                    await circuitBreaker.analyze('q', 'c');
                } catch {
                    // Expected
                }
            }

            // Circuit should now be open
            expect(circuitBreaker.isOpen()).toBe(true);
        });
    });

    describe('isOpen', () => {
        it('should return false when circuit is closed', () => {
            expect(circuitBreaker.isOpen()).toBe(false);
        });
    });

    describe('circuit recovery', () => {
        it('should recover after reset timeout', async () => {
            mockProvider.analyze.mockRejectedValue(new Error('fail'));

            // Open the circuit
            for (let i = 0; i < 5; i++) {
                try {
                    await circuitBreaker.analyze('q', 'c');
                } catch {
                    // Expected
                }
            }

            expect(circuitBreaker.isOpen()).toBe(true);

            // Wait for reset timeout (200ms in test config)
            await new Promise(resolve => setTimeout(resolve, 250));

            // Provider now succeeds
            mockProvider.analyze.mockResolvedValue(successResponse);

            // This should trigger half-open and then close on success
            const result = await circuitBreaker.analyze('q', 'c');

            expect(result).toEqual(successResponse);
            expect(circuitBreaker.getState()).toBe('closed');
        });
    });
});
