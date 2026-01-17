/**
 * @fileoverview Agent Service
 *
 * Orchestrates OpenSearch queries and LLM analysis with guardrails.
 * Queries both Membership and Locations indices, builds context,
 * and delegates to the configured LLM provider.
 */

import { Injectable, Inject, Logger } from '@nestjs/common';
import { MembershipSearchService } from '../membership';
import { LocationsSearchService } from '../locations';
import { RedactionService } from '../shared/redaction';
import { AuthenticatedUser } from '../shared/auth';
import { LLMProvider, LLM_PROVIDER, Insight } from './interfaces';
import { GuardrailsService, GroundingService } from './guardrails';
import { Counter, Histogram } from 'prom-client';

const analysisCounter = new Counter({
    name: 'agent_analysis_total',
    help: 'Total number of agent analyses',
    labelNames: ['provider', 'status'],
});

const analysisDuration = new Histogram({
    name: 'agent_analysis_duration_seconds',
    help: 'Agent analysis duration',
    buckets: [0.5, 1, 2, 5, 10, 30],
});

const guardrailsCounter = new Counter({
    name: 'agent_guardrails_total',
    help: 'Guardrails activations',
    labelNames: ['type', 'action'],
});

const groundingCounter = new Counter({
    name: 'agent_grounding_total',
    help: 'Grounding verification results',
    labelNames: ['result'],
});

export interface AnalyzeRequest {
    question: string;
    locationId?: string;
    limit?: number;
}

@Injectable()
export class AgentService {
    private readonly logger = new Logger(AgentService.name);

    constructor(
        @Inject(LLM_PROVIDER) private llmProvider: LLMProvider,
        private membershipSearch: MembershipSearchService,
        private locationsSearch: LocationsSearchService,
        private redactionService: RedactionService,
        private guardrails: GuardrailsService,
        private grounding: GroundingService,
    ) { }

    /**
     * Analyzes data to answer a business question with guardrails.
     */
    async analyze(request: AnalyzeRequest, user: AuthenticatedUser): Promise<Insight> {
        const timer = analysisDuration.startTimer();
        const providerName = this.llmProvider.getName();
        const userId = user.userId;

        // Pre-process with guardrails
        const preResult = this.guardrails.preProcess(request.question, userId);
        if (!preResult.allowed) {
            guardrailsCounter.inc({ type: 'input', action: 'blocked' });
            throw new Error(preResult.error);
        }
        guardrailsCounter.inc({ type: 'input', action: 'allowed' });

        const sanitizedQuestion = preResult.sanitizedQuestion!;

        try {
            // 1. Query OpenSearch for relevant data
            // Fetch all available data for comprehensive analysis (no query filter)
            const [members, locations] = await Promise.all([
                this.membershipSearch.search(
                    { limit: request.limit || 100 },
                    user,
                ),
                this.locationsSearch.search(
                    { limit: request.limit || 50 },
                    user,
                ),
            ]);

            // 2. Build context (already redacted by search services, but ensure safety)
            const context = this.buildContext(members, locations, request);

            // 3. Redact again for safety (defense in depth)
            const redactedContext = this.redactionService.redact(context);

            // 4. Send to LLM for analysis
            const llmResult = await this.llmProvider.analyze(sanitizedQuestion, redactedContext);

            // 5. Verify grounding (prevents hallucinations)
            const groundingResult = await this.grounding.check(redactedContext, llmResult.summary);
            if (!groundingResult.grounded) {
                groundingCounter.inc({ result: 'ungrounded' });
                this.logger.warn({
                    msg: 'Response failed grounding check',
                    score: groundingResult.score,
                    reason: groundingResult.reason,
                });
            } else {
                groundingCounter.inc({ result: 'grounded' });
            }

            // 6. Post-process with guardrails
            const postResult = this.guardrails.postProcess(llmResult, userId);
            if (!postResult.valid) {
                guardrailsCounter.inc({ type: 'output', action: 'fallback' });
            } else {
                guardrailsCounter.inc({ type: 'output', action: 'passed' });
            }

            const result = postResult.response!;

            analysisCounter.inc({ provider: providerName, status: 'success' });

            this.logger.log({
                msg: 'Analysis completed',
                question: sanitizedQuestion,
                membersAnalyzed: members.length,
                locationsAnalyzed: locations.length,
                provider: providerName,
                confidence: result.confidence,
            });

            return {
                question: request.question,
                summary: result.summary,
                confidence: result.confidence,
                reasoning: result.reasoning,
                dataPoints: {
                    membersAnalyzed: members.length,
                    locationsAnalyzed: locations.length,
                },
                generatedAt: new Date().toISOString(),
                provider: providerName,
            };
        } catch (error) {
            analysisCounter.inc({ provider: providerName, status: 'error' });
            this.logger.error({ msg: 'Analysis failed', error, question: sanitizedQuestion });

            // Use guardrails fallback
            const fallback = this.guardrails.handleError(error, userId);

            return {
                question: request.question,
                summary: fallback.summary,
                confidence: fallback.confidence,
                reasoning: fallback.reasoning,
                dataPoints: { membersAnalyzed: 0, locationsAnalyzed: 0 },
                generatedAt: new Date().toISOString(),
                provider: providerName,
            };
        } finally {
            timer();
        }
    }

    /**
     * Builds context string for LLM from OpenSearch results.
     */
    private buildContext(
        members: unknown[],
        locations: unknown[],
        request: AnalyzeRequest,
    ): string {
        const memberSummary = this.summarizeMembers(members);
        const locationSummary = this.summarizeLocations(locations);

        return `
MEMBERSHIP DATA (${members.length} records):
${memberSummary}

LOCATION DATA (${locations.length} records):
${locationSummary}

${request.locationId ? `FOCUS: Location ID ${request.locationId}` : ''}
`;
    }

    private summarizeMembers(members: unknown[]): string {
        if (members.length === 0) return 'No membership records found.';

        const byStatus: Record<string, number> = {};
        members.forEach((m: unknown) => {
            const member = m as { status_notes?: string };
            const status = member.status_notes?.split(' ')[0] || 'unknown';
            byStatus[status] = (byStatus[status] || 0) + 1;
        });

        return `Status distribution: ${JSON.stringify(byStatus)}
Sample records: ${JSON.stringify(members.slice(0, 5))}`;
    }

    private summarizeLocations(locations: unknown[]): string {
        if (locations.length === 0) return 'No location records found.';

        const byRegion: Record<string, number> = {};
        locations.forEach((l: unknown) => {
            const loc = l as { region?: string };
            const region = loc.region || 'unknown';
            byRegion[region] = (byRegion[region] || 0) + 1;
        });

        return `Region distribution: ${JSON.stringify(byRegion)}
Sample records: ${JSON.stringify(locations.slice(0, 3))}`;
    }
}
