/**
 * @fileoverview Agent Controller
 *
 * HTTP endpoints for LLM-powered analysis.
 */

import { Controller, Post, Body, UseGuards, Request } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AgentService, AnalyzeRequest } from './agent.service';
import { AuthenticatedUser } from '../shared/auth';
import { Insight } from './interfaces';

@Controller('agent')
export class AgentController {
    constructor(private agentService: AgentService) { }

    /**
     * Analyzes data to answer a business question.
     *
     * @example
     * ```bash
     * curl -X POST "http://localhost:3000/agent/analyze" \
     *   -H "Authorization: Bearer <token>" \
     *   -H "Content-Type: application/json" \
     *   -d '{"question": "Why does location 123 have high dropout rates?"}'
     * ```
     */
    @Post('analyze')
    @UseGuards(AuthGuard('jwt'))
    async analyze(
        @Body() request: AnalyzeRequest,
        @Request() req: { user: AuthenticatedUser },
    ): Promise<Insight> {
        return this.agentService.analyze(request, req.user);
    }
}
