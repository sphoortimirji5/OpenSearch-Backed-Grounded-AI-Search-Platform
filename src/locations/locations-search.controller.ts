/**
 * @fileoverview Locations Search Controller
 *
 * HTTP endpoints for location search operations.
 */

import { Controller, Get, Query, Param, UseGuards, Request } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { LocationsSearchService, LocationSearchQuery } from './locations-search.service';
import { AuthenticatedUser } from '../shared/auth';
import { LocationIndexDocument } from './interfaces';

@Controller('locations/search')
export class LocationsSearchController {
    constructor(private searchService: LocationsSearchService) { }

    /**
     * Searches locations.
     */
    @Get()
    @UseGuards(AuthGuard('jwt'))
    async search(
        @Query('q') q?: string,
        @Query('region') region?: string,
        @Query('rate_model') rate_model?: string,
        @Query('limit') limit?: string,
        @Request() req?: { user: AuthenticatedUser },
    ): Promise<LocationIndexDocument[]> {
        const query: LocationSearchQuery = {
            q,
            region,
            rate_model,
            limit: limit ? parseInt(limit, 10) : undefined,
        };

        return this.searchService.search(query, req!.user);
    }

    /**
     * Retrieves a location by ID.
     */
    @Get(':id')
    @UseGuards(AuthGuard('jwt'))
    async findById(
        @Param('id') id: string,
    ): Promise<LocationIndexDocument | null> {
        return this.searchService.findById(id);
    }
}
