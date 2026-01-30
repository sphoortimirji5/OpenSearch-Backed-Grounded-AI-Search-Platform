/**
 * @fileoverview Agent Module
 *
 * LLM-powered analysis module with provider abstraction and guardrails.
 * Uses Gemini in development, Bedrock in production.
 * All providers are wrapped with circuit breaker for resilience.
 */

import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MembershipModule } from '../membership';
import { LocationsModule } from '../locations';
import { SharedRedactionModule } from '../shared/redaction';
import { LLM_PROVIDER } from './interfaces';
import { GeminiProvider, BedrockProvider } from './providers';
import { CircuitBreakerProvider } from './resilience';
import {
    InputValidator,
    PromptInjectionDetector,
    PIIScanner,
    OutputValidator,
    RateLimiter,
    GuardrailsService,
} from './guardrails';
import { GroundingService } from './grounding';
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
                const providerName = config.get<string>('LLM_PROVIDER') || 'gemini';
                const baseProvider = providerName === 'bedrock' ? bedrock : gemini;

                // Wrap with circuit breaker for production resilience
                return new CircuitBreakerProvider(baseProvider, {
                    timeout: config.get<number>('LLM_TIMEOUT_MS') || 30000,
                    resetTimeout: config.get<number>('LLM_CIRCUIT_RESET_MS') || 30000,
                });
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
