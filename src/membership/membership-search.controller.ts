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
import { ApiTags, ApiOperation, ApiQuery, ApiBearerAuth } from '@nestjs/swagger';
import { MembershipSearchService, SearchQuery, SearchResult } from './membership-search.service';
import { AuthenticatedUser } from '../shared/auth';

/* -------------------------------------------------------------------------- */
/*                              Controller Implementation                      */
/* -------------------------------------------------------------------------- */

@ApiTags('members')
@Controller('members/search')
export class MembershipSearchController {
    constructor(private searchService: MembershipSearchService) { }

    /**
     * Executes a member search with role-based field filtering.
     */
    @Get()
    @UseGuards(AuthGuard('jwt'))
    @ApiBearerAuth()
    @ApiOperation({
        summary: 'Search for members',
        description: 'Search members by name, email, member_id, or status notes. Priority order: member_id > email > q (only highest priority param is used)'
    })
    @ApiQuery({ name: 'q', required: false, example: 'john', description: 'Search query (name, notes)' })
    @ApiQuery({ name: 'member_id', required: false, example: 'mem-003', description: 'Exact member ID lookup' })
    @ApiQuery({ name: 'email', required: false, example: 'john.doe@example.com', description: 'Exact email match' })
    @ApiQuery({ name: 'fuzzy', required: false, example: 'true', description: 'Enable fuzzy matching (default: true). Set to "false" for exact match.' })
    @ApiQuery({ name: 'limit', required: false, example: '10', description: 'Max results (default: 20)' })
    async search(
        @Query('q') q?: string,
        @Query('member_id') member_id?: string,
        @Query('email') email?: string,
        @Query('fuzzy') fuzzy?: string,
        @Query('limit') limit?: string,
        @Request() req?: { user: AuthenticatedUser },
    ): Promise<SearchResult[]> {
        const query: SearchQuery = {
            q,
            member_id,
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
