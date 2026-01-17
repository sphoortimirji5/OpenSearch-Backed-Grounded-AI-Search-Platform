/**
 * @fileoverview Indexer Controller
 *
 * Admin API endpoints for index management operations.
 * Protected by admin-only role requirements.
 *
 * @remarks
 * Endpoints:
 * - POST /admin/reindex - Triggers full reindex from DynamoDB to OpenSearch
 *
 * All endpoints require 'admin' role for access.
 */

import { Controller, Post, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { MembershipIndexerService, ReindexResult } from './membership-indexer.service';
import { RolesGuard, Roles } from '../shared/auth';

/* -------------------------------------------------------------------------- */
/*                              Controller Implementation                      */
/* -------------------------------------------------------------------------- */

@Controller('admin')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class MembershipIndexerController {
    constructor(private indexerService: MembershipIndexerService) { }

    /**
     * Triggers a full reindex of all members from DynamoDB to OpenSearch.
     *
     * @param batchSize - Records per batch (default: 100, max: 1000)
     * @returns ReindexResult with total, success, failed counts and duration
     *
     * @remarks
     * **Admin only**: Requires 'admin' role.
     *
     * Use cases:
     * - Index corruption recovery
     * - Mapping changes requiring full rebuild
     * - Initial production data load
     *
     * The operation is idempotent (uses member_id as _id) so safe to retry.
     *
     * @example
     * ```bash
     * curl -X POST "http://localhost:3000/admin/reindex?batchSize=500" \
     *   -H "Authorization: Bearer <admin-token>"
     * ```
     */
    @Post('reindex')
    @Roles('admin')
    async reindex(
        @Query('batchSize') batchSizeParam?: string,
    ): Promise<ReindexResult> {
        const batchSize = Math.min(
            Math.max(parseInt(batchSizeParam || '100', 10), 1),
            1000,
        );

        return this.indexerService.reindexAll(batchSize);
    }
}
