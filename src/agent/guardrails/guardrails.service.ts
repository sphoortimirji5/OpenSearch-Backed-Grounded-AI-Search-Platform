/**
 * @fileoverview Guardrails Service
 *
 * Orchestrates all guardrails in a single pipeline.
 */

import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { InputValidator } from './input-validator';
import { PromptInjectionDetector } from './prompt-injection';
import { PIIScanner } from './pii-scanner';
import { OutputValidator } from './output-validator';
import { RateLimiter } from './rate-limiter';
import { LLMAnalysisResult } from '../interfaces';

/**
 * Pre-processing result.
 */
export interface PreProcessResult {
    allowed: boolean;
    sanitizedQuestion?: string;
    error?: string;
}

/**
 * Post-processing result.
 */
export interface PostProcessResult {
    valid: boolean;
    response?: LLMAnalysisResult;
    error?: string;
}

@Injectable()
export class GuardrailsService {
    private readonly logger = new Logger(GuardrailsService.name);

    constructor(
        private inputValidator: InputValidator,
        private injectionDetector: PromptInjectionDetector,
        private piiScanner: PIIScanner,
        private outputValidator: OutputValidator,
        private rateLimiter: RateLimiter,
    ) { }

    /**
     * Pre-processes request before sending to LLM.
     */
    preProcess(
        question: string,
        userId: string,
    ): PreProcessResult {
        try {
            // 1. Rate limiting
            this.rateLimiter.checkAndIncrement(userId);

            // 2. Input validation
            const inputResult = this.inputValidator.validate(question);
            if (!inputResult.valid) {
                return { allowed: false, error: inputResult.errors?.join(', ') };
            }

            const sanitized = inputResult.sanitized!;

            // 3. Prompt injection detection
            const injectionResult = this.injectionDetector.detect(sanitized);
            if (injectionResult.blocked) {
                return { allowed: false, error: `Blocked: ${injectionResult.reason}` };
            }

            // 4. PII scan (block if found in question)
            const piiResult = this.piiScanner.scan(sanitized);
            if (piiResult.containsPII) {
                return {
                    allowed: false,
                    error: `Question contains sensitive data (${piiResult.detectedTypes.join(', ')}). Please rephrase.`,
                };
            }

            return { allowed: true, sanitizedQuestion: sanitized };
        } catch (error) {
            this.rateLimiter.complete(userId);
            throw error;
        }
    }

    /**
     * Post-processes LLM response before returning.
     */
    postProcess(
        response: LLMAnalysisResult,
        userId: string,
    ): PostProcessResult {
        try {
            // 1. Output validation
            const validationResult = this.outputValidator.validate(response);
            if (!validationResult.valid) {
                this.logger.warn({
                    msg: 'Output validation failed, using fallback',
                    errors: validationResult.errors,
                });
                return {
                    valid: true,
                    response: this.outputValidator.getFallbackResponse(),
                };
            }

            // 2. PII scan on response
            const validated = validationResult.validated!;
            const piiResult = this.piiScanner.scan(validated.summary);

            if (piiResult.containsPII) {
                this.logger.warn({ msg: 'PII detected in LLM response, redacting' });
                validated.summary = piiResult.redacted;
            }

            if (validated.reasoning) {
                const reasoningPii = this.piiScanner.scan(validated.reasoning);
                if (reasoningPii.containsPII) {
                    validated.reasoning = reasoningPii.redacted;
                }
            }

            return { valid: true, response: validated };
        } finally {
            this.rateLimiter.complete(userId);
        }
    }

    /**
     * Handles errors and returns safe fallback.
     */
    handleError(error: unknown, userId: string): LLMAnalysisResult {
        this.rateLimiter.complete(userId);

        this.logger.error({ msg: 'Guardrails error', error });

        if (error instanceof BadRequestException) {
            throw error;
        }

        return this.outputValidator.getFallbackResponse();
    }
}
