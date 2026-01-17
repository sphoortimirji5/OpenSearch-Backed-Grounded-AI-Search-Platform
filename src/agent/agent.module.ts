/**
 * @fileoverview Agent Module
 *
 * LLM-powered analysis module with provider abstraction and guardrails.
 * Uses Gemini in development, Bedrock in production.
 */

import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MembershipModule } from '../membership';
import { LocationsModule } from '../locations';
import { SharedRedactionModule } from '../shared/redaction';
import { LLM_PROVIDER } from './interfaces';
import { GeminiProvider, BedrockProvider } from './providers';
import {
    InputValidator,
    PromptInjectionDetector,
    PIIScanner,
    OutputValidator,
    RateLimiter,
    GuardrailsService,
    GroundingService,
} from './guardrails';
import { AgentService } from './agent.service';
import { AgentController } from './agent.controller';

@Module({
    imports: [MembershipModule, LocationsModule, SharedRedactionModule],
    controllers: [AgentController],
    providers: [
        // LLM Providers
        GeminiProvider,
        BedrockProvider,
        {
            provide: LLM_PROVIDER,
            useFactory: (
                config: ConfigService,
                gemini: GeminiProvider,
                bedrock: BedrockProvider,
            ) => {
                const provider = config.get<string>('LLM_PROVIDER') || 'gemini';
                return provider === 'bedrock' ? bedrock : gemini;
            },
            inject: [ConfigService, GeminiProvider, BedrockProvider],
        },

        // Guardrails
        InputValidator,
        PromptInjectionDetector,
        PIIScanner,
        OutputValidator,
        RateLimiter,
        GuardrailsService,
        GroundingService,

        // Agent
        AgentService,
    ],
    exports: [AgentService, GuardrailsService, GroundingService],
})
export class AgentModule { }
