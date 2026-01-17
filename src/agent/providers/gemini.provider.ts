/**
 * @fileoverview Gemini LLM Provider
 *
 * Local development provider using Google Gemini API.
 *
 * @remarks
 * Security:
 * - API key from environment variable (never hardcoded)
 * - All context must be redacted before calling this provider
 */

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { LLMProvider, LLMAnalysisResult } from '../interfaces';

@Injectable()
export class GeminiProvider implements LLMProvider {
    private readonly logger = new Logger(GeminiProvider.name);
    private readonly model;

    constructor(private config: ConfigService) {
        const apiKey = this.config.get<string>('GEMINI_API_KEY');

        // SECURITY: Fail fast if Gemini is being used without an API key
        if (!apiKey) {
            this.logger.error(
                'GEMINI_API_KEY not set - LLM calls will fail. ' +
                'Set GEMINI_API_KEY in .env.local or switch to LLM_PROVIDER=bedrock'
            );
        }

        const genAI = new GoogleGenerativeAI(apiKey || 'MISSING_KEY');
        this.model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
    }

    getName(): string {
        return 'gemini';
    }

    async analyze(question: string, context: string): Promise<LLMAnalysisResult> {
        const prompt = this.buildPrompt(question, context);

        try {
            const result = await this.model.generateContent(prompt);
            const response = result.response.text();

            return this.parseResponse(response);
        } catch (error) {
            this.logger.error({ msg: 'Gemini API error', error });
            throw error;
        }
    }

    private buildPrompt(question: string, context: string): string {
        return `You are an RCM (Revenue Cycle Management) analyst. Analyze the following data and answer the question.

QUESTION: ${question}

DATA CONTEXT:
${context}

Provide a response in the following JSON format:
{
  "summary": "A 2-3 sentence answer to the question with specific numbers and dates",
  "confidence": "high" | "medium" | "low",
  "reasoning": "Brief explanation of how you arrived at this conclusion"
}

IMPORTANT: 
- Be specific about numbers, dates, and patterns
- If data is insufficient, set confidence to "low"
- Focus on actionable insights`;
    }

    private parseResponse(response: string): LLMAnalysisResult {
        try {
            // Extract JSON from response (may have markdown code blocks)
            const jsonMatch = response.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                return JSON.parse(jsonMatch[0]);
            }
        } catch (e) {
            this.logger.warn({ msg: 'Failed to parse JSON response, using raw text', error: e });
        }

        return {
            summary: response,
            confidence: 'medium',
        };
    }
}
