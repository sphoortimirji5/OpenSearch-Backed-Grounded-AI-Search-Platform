/**
 * @fileoverview LLM Provider Interface
 *
 * Abstraction layer for LLM providers (Gemini, Bedrock).
 * Allows swapping providers without changing business logic.
 */

/**
 * Response from LLM analysis.
 */
export interface LLMAnalysisResult {
    summary: string;
    confidence: 'high' | 'medium' | 'low';
    reasoning?: string;
}

/**
 * LLM provider interface for analysis operations.
 */
export interface LLMProvider {
    /**
     * Analyzes a question given context data.
     *
     * @param question - User's question
     * @param context - Redacted data context from OpenSearch
     * @returns Analysis result with summary and confidence
     */
    analyze(question: string, context: string): Promise<LLMAnalysisResult>;

    /**
     * Returns the provider name for logging/metrics.
     */
    getName(): string;
}

/**
 * Token to inject the active LLM provider.
 */
export const LLM_PROVIDER = 'LLM_PROVIDER';
