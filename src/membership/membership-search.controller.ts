/**
 * @fileoverview Search Controller
 *
 * HTTP endpoint for member search operations.
 * Handles request parsing, authentication, and delegates to SearchService.
 *
 * @remarks
 * Endpoints:
 * - GET /search - Protected search endpoint (requires JWT)
 * - GET /search/health - Public health check
 *
 * All authenticated requests flow through JwtStrategy for token validation.
 * RBAC field filtering is applied by SearchService based on user roles.
 */

import { Controller, Get, Query, UseGuards, Request } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { MembershipSearchService, SearchQuery, SearchResult } from './membership-search.service';
import { AuthenticatedUser } from '../shared/auth';

/* -------------------------------------------------------------------------- */
/*                              Controller Implementation                      */
/* -------------------------------------------------------------------------- */

@Controller('members/search')
export class MembershipSearchController {
    constructor(private searchService: MembershipSearchService) { }

    /**
     * Executes a member search with role-based field filtering.
     *
     * @param q - Free-text query for fuzzy matching across name/email/notes
     * @param email - Exact email match (takes precedence over q)
     * @param fuzzy - Enable fuzzy matching (default: true, set 'false' to disable)
     * @param limit - Maximum results to return (default: 20)
     * @param req - Request object containing authenticated user
     * @returns Array of member search results with role-filtered fields
     *
     * @remarks
     * Authentication: Requires valid JWT Bearer token in Authorization header.
     * Field filtering: Response fields depend on user role (auditor vs compliance_lead).
     *
     * @example
     * ```bash
     * curl "http://localhost:3000/search?q=violation" \
     *   -H "Authorization: Bearer <token>"
     * ```
     */
    @Get()
    @UseGuards(AuthGuard('jwt'))
    async search(
        @Query('q') q?: string,
        @Query('email') email?: string,
        @Query('fuzzy') fuzzy?: string,
        @Query('limit') limit?: string,
        @Request() req?: { user: AuthenticatedUser },
    ): Promise<SearchResult[]> {
        const query: SearchQuery = {
            q,
            email,
            fuzzy: fuzzy !== 'false',
            limit: limit ? parseInt(limit, 10) : undefined,
        };

        return this.searchService.search(query, req!.user);
    }

    /**
     * Returns service health status.
     *
     * @returns Health status object with OpenSearch connectivity
     *
     * @remarks
     * Public endpoint - no authentication required.
     * Used by load balancers and monitoring systems for health checks.
     *
     * @todo Implement actual OpenSearch connectivity check
     */
    @Get('health')
    async health(): Promise<{ status: string; opensearch: boolean }> {
        return {
            status: 'ok',
            opensearch: true,
        };
    }
}
