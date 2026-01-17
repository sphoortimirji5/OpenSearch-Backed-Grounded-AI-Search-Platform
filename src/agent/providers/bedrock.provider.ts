/**
 * @fileoverview Bedrock LLM Provider
 *
 * Production provider using AWS Bedrock with Claude.
 *
 * @remarks
 * Security:
 * - No API keys—uses IAM Task Role credentials
 * - Traffic stays in VPC via Bedrock endpoint
 * - All context must be redacted before calling this provider
 * - Inference data not used for model training (AWS policy)
 */

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
    BedrockRuntimeClient,
    InvokeModelCommand,
} from '@aws-sdk/client-bedrock-runtime';
import { LLMProvider, LLMAnalysisResult } from '../interfaces';

@Injectable()
export class BedrockProvider implements LLMProvider {
    private readonly logger = new Logger(BedrockProvider.name);
    private readonly client: BedrockRuntimeClient;
    private readonly modelId: string;

    constructor(private config: ConfigService) {
        const region = this.config.get<string>('AWS_REGION') || 'us-east-1';
        this.modelId = this.config.get<string>('BEDROCK_MODEL_ID')
            || 'anthropic.claude-3-sonnet-20240229-v1:0';

        this.client = new BedrockRuntimeClient({ region });
    }

    getName(): string {
        return 'bedrock';
    }

    async analyze(question: string, context: string): Promise<LLMAnalysisResult> {
        const prompt = this.buildPrompt(question, context);

        try {
            const command = new InvokeModelCommand({
                modelId: this.modelId,
                contentType: 'application/json',
                accept: 'application/json',
                body: JSON.stringify({
                    anthropic_version: 'bedrock-2023-05-31',
                    max_tokens: 1024,
                    messages: [
                        {
                            role: 'user',
                            content: prompt,
                        },
                    ],
                }),
            });

            const response = await this.client.send(command);
            const responseBody = JSON.parse(new TextDecoder().decode(response.body));
            const text = responseBody.content?.[0]?.text || '';

            return this.parseResponse(text);
        } catch (error) {
            this.logger.error({ msg: 'Bedrock API error', error, modelId: this.modelId });
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
