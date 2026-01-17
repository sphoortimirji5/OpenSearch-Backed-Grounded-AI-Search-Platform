/**
 * @fileoverview Output Validator
 *
 * Validates LLM responses for schema compliance and safety.
 */

import { Injectable, Logger } from '@nestjs/common';
import { z } from 'zod';
import { LLMAnalysisResult } from '../interfaces';

/**
 * Expected response schema from LLM.
 */
const ResponseSchema = z.object({
    summary: z.string().min(1).max(2000),
    confidence: z.enum(['high', 'medium', 'low']),
    reasoning: z.string().max(1000).optional(),
});

/**
 * Validation result.
 */
export interface OutputValidationResult {
    valid: boolean;
    validated?: LLMAnalysisResult;
    errors?: string[];
    truncated?: boolean;
}

/**
 * Forbidden content patterns in responses.
 */
const FORBIDDEN_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
    { pattern: /\b(password|secret|api[_\s]?key)\b/i, reason: 'Potential credential leak' },
    { pattern: /<script|javascript:/i, reason: 'Script injection' },
    { pattern: /\b(kill|harm|illegal|drug)\b/i, reason: 'Inappropriate content' },
];

@Injectable()
export class OutputValidator {
    private readonly logger = new Logger(OutputValidator.name);
    private readonly MAX_RESPONSE_LENGTH = 2000;

    /**
     * Validates and sanitizes LLM response.
     */
    validate(response: LLMAnalysisResult): OutputValidationResult {
        const errors: string[] = [];

        // Step 1: Schema validation
        const schemaResult = ResponseSchema.safeParse(response);
        if (!schemaResult.success) {
            errors.push(...schemaResult.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`));
        }

        // Step 2: Content safety check
        const contentErrors = this.checkContent(response.summary);
        errors.push(...contentErrors);

        if (response.reasoning) {
            const reasoningErrors = this.checkContent(response.reasoning);
            errors.push(...reasoningErrors.map((e) => `reasoning: ${e}`));
        }

        if (errors.length > 0) {
            this.logger.warn({ msg: 'Output validation failed', errors });
            return { valid: false, errors };
        }

        // Step 3: Truncate if needed
        const truncated = response.summary.length > this.MAX_RESPONSE_LENGTH;
        const validated: LLMAnalysisResult = {
            summary: response.summary.slice(0, this.MAX_RESPONSE_LENGTH),
            confidence: response.confidence,
            reasoning: response.reasoning?.slice(0, 1000),
        };

        return { valid: true, validated, truncated };
    }

    /**
     * Checks content for forbidden patterns.
     */
    private checkContent(text: string): string[] {
        const errors: string[] = [];

        for (const { pattern, reason } of FORBIDDEN_PATTERNS) {
            if (pattern.test(text)) {
                errors.push(reason);
            }
        }

        return errors;
    }

    /**
     * Returns a safe fallback response.
     */
    getFallbackResponse(): LLMAnalysisResult {
        return {
            summary: 'Unable to complete analysis. Please try a different question or contact support.',
            confidence: 'low',
            reasoning: 'Analysis could not be completed due to validation or processing error.',
        };
    }
}
