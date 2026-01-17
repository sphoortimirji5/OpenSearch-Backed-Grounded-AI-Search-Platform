/**
 * @fileoverview Locations Indexer Controller
 *
 * Admin API endpoints for location index management.
 */

import { Controller, Post, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { LocationsIndexerService, LocationsReindexResult } from './locations-indexer.service';
import { RolesGuard, Roles } from '../shared/auth';

@Controller('admin/locations')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class LocationsIndexerController {
    constructor(private indexerService: LocationsIndexerService) { }

    /**
     * Triggers full reindex of all locations from PostgreSQL.
     *
     * @param batchSize - Records per batch (default: 100, max: 1000)
     * @returns Reindex result with counts and duration
     */
    @Post('reindex')
    @Roles('admin')
    async reindex(
        @Query('batchSize') batchSizeParam?: string,
    ): Promise<LocationsReindexResult> {
        const batchSize = Math.min(
            Math.max(parseInt(batchSizeParam || '100', 10), 1),
            1000,
        );

        return this.indexerService.reindexAll(batchSize);
    }
}
