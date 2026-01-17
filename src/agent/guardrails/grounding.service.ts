/**
 * @fileoverview Grounding Service
 *
 * Validates that LLM responses are grounded in source data.
 * Uses a secondary LLM call to audit claims against facts.
 *
 * @remarks
 * Purpose: Prevent hallucinations by verifying every claim is supported by data
 * 
 * Security:
 * - Does not expose raw data in error responses
 * - Uses same LLM provider as main analysis
 */

import { Injectable, Logger, Inject } from '@nestjs/common';
import { LLMProvider } from '../interfaces';

export interface GroundingResult {
    grounded: boolean;
    score: number;
    reason: string;
    claims?: string[];
}

@Injectable()
export class GroundingService {
    private readonly logger = new Logger(GroundingService.name);

    constructor(
        @Inject('LLM_PROVIDER')
        private readonly llmProvider: LLMProvider,
    ) { }

    /**
     * Check if an LLM response is grounded in the provided context
     * 
     * @param context - The source data (facts) the response should be based on
     * @param response - The LLM-generated response to verify
     * @returns GroundingResult with grounded status, score, and reason
     */
    async check(context: string, response: string): Promise<GroundingResult> {
        const prompt = this.buildAuditPrompt(context, response);

        try {
            const auditResult = await this.llmProvider.analyze('Grounding Audit', prompt);
            return this.parseAuditResult(auditResult);
        } catch (error) {
            this.logger.error({ msg: 'Grounding check failed', error });
            // On failure, default to ungrounded to be safe
            return {
                grounded: false,
                score: 0,
                reason: 'Grounding verification failed',
            };
        }
    }

    /**
     * Verify a response meets grounding threshold
     * 
     * @param context - Source facts
     * @param response - Response to verify
     * @param threshold - Minimum score (default 0.8)
     * @returns true if grounded with score above threshold
     */
    async isGrounded(
        context: string,
        response: string,
        threshold: number = 0.8,
    ): Promise<boolean> {
        const result = await this.check(context, response);
        return result.grounded && result.score >= threshold;
    }

    private buildAuditPrompt(context: string, response: string): string {
        return `You are a strict Auditor verifying factual accuracy.

FACTS (source data):
${context}

CLAIM TO VERIFY:
${response}

CRITERIA:
1. Is every specific detail in the CLAIM directly supported by the FACTS?
2. Does the CLAIM introduce any information (names, numbers, rates, dates) NOT present in the FACTS?
3. Are any conclusions logically derived from the FACTS, or are they unsupported inferences?

SCORING:
- 1.0: Every claim is directly supported by facts
- 0.8-0.9: Claims are mostly supported, minor inferences acceptable
- 0.5-0.7: Some claims lack direct support
- 0.0-0.4: Significant claims are unsupported or fabricated

Respond ONLY with a JSON object:
{
  "grounded": true/false,
  "score": 0.0-1.0,
  "reason": "brief explanation of your assessment",
  "unsupported_claims": ["list of any claims not in facts"]
}`;
    }

    private parseAuditResult(result: { summary: string; confidence?: string; reasoning?: string }): GroundingResult {
        try {
            // Try to parse JSON from summary
            const jsonMatch = result.summary.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[0]);
                return {
                    grounded: Boolean(parsed.grounded),
                    score: Number(parsed.score) || 0,
                    reason: String(parsed.reason || 'No reason provided'),
                    claims: parsed.unsupported_claims,
                };
            }
        } catch (e) {
            this.logger.warn({ msg: 'Failed to parse grounding audit result', error: e });
        }

        // Fallback: use confidence from LLM response
        const confidenceScore = result.confidence === 'high' ? 0.9 :
            result.confidence === 'medium' ? 0.6 : 0.3;

        return {
            grounded: confidenceScore >= 0.8,
            score: confidenceScore,
            reason: result.reasoning || result.summary || 'Unable to parse audit result',
        };
    }
}
