/**
 * @fileoverview Locations Search Service
 *
 * Search operations for locations index with role-based filtering.
 */

import { Injectable, Logger } from '@nestjs/common';
import { OpenSearchProvider } from '../shared/opensearch';
import { AuthenticatedUser } from '../shared/auth';
import { LocationIndexDocument } from './interfaces';
import { Counter, Histogram } from 'prom-client';

const searchCounter = new Counter({
    name: 'locations_queries_total',
    help: 'Total number of location search requests',
    labelNames: ['role', 'status'],
});

const searchDuration = new Histogram({
    name: 'locations_query_duration_seconds',
    help: 'Location search request duration',
    buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1],
});

export interface LocationSearchQuery {
    q?: string;
    region?: string;
    rate_model?: string;
    limit?: number;
}

@Injectable()
export class LocationsSearchService {
    private readonly logger = new Logger(LocationsSearchService.name);
    private readonly INDEX_NAME = 'locations';

    constructor(private opensearchProvider: OpenSearchProvider) { }

    /**
     * Searches locations index.
     */
    async search(
        params: LocationSearchQuery,
        user: AuthenticatedUser,
    ): Promise<LocationIndexDocument[]> {
        const timer = searchDuration.startTimer();
        const role = user.roles[0] || 'unknown';

        try {
            const client = this.opensearchProvider.getClient();
            const limit = params.limit || 20;

            const query = this.buildQuery(params, user);

            const response = await client.search({
                index: this.INDEX_NAME,
                body: {
                    query,
                    size: limit,
                },
            });

            const hits = response.body.hits.hits;
            const results = hits.map((hit: { _source: LocationIndexDocument }) => hit._source);

            searchCounter.inc({ role, status: 'success' });
            this.logger.log({
                msg: 'Location search completed',
                query: params.q,
                resultCount: results.length,
                role,
            });

            return results;
        } catch (error) {
            searchCounter.inc({ role, status: 'error' });
            this.logger.error({ msg: 'Location search failed', error, query: params });
            throw error;
        } finally {
            timer();
        }
    }

    /**
     * Builds OpenSearch query from parameters.
     */
    private buildQuery(params: LocationSearchQuery, user: AuthenticatedUser): Record<string, unknown> {
        const must: Record<string, unknown>[] = [];
        const filter: Record<string, unknown>[] = [];

        if (params.q) {
            must.push({
                multi_match: {
                    query: params.q,
                    fields: ['name^2', 'coordinator_name', 'region', 'guest_policy'],
                    fuzziness: 'AUTO',
                },
            });
        }

        if (params.region) {
            filter.push({ term: { region: params.region } });
        }

        if (params.rate_model) {
            filter.push({ term: { rate_model: params.rate_model } });
        }

        // External tenants can only see their own locations
        if (user.tenantType === 'external') {
            filter.push({ term: { location_id: user.tenantId } });
        }

        if (must.length === 0 && filter.length === 0) {
            return { match_all: {} };
        }

        return {
            bool: {
                must: must.length > 0 ? must : undefined,
                filter: filter.length > 0 ? filter : undefined,
            },
        };
    }

    /**
     * Retrieves a single location by ID.
     */
    async findById(locationId: string): Promise<LocationIndexDocument | null> {
        try {
            const client = this.opensearchProvider.getClient();
            const response = await client.get({
                index: this.INDEX_NAME,
                id: locationId,
            });

            return response.body._source as LocationIndexDocument;
        } catch (error: unknown) {
            if ((error as { statusCode?: number }).statusCode === 404) {
                return null;
            }
            throw error;
        }
    }
}
