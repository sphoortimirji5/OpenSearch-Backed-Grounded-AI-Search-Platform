/**
 * @fileoverview Search Service
 *
 * Core search logic implementing role-based access control (RBAC) and tenant isolation.
 * Queries OpenSearch and restricts returned fields and data based on user permissions.
 *
 * @remarks
 * Multi-tenant access control:
 * - **Internal RCM**: RBAC-controlled field access, sees all members
 * - **External Locations**: Admin-only access, filtered to their tenant_id
 *
 * Application-layer filtering is the PRIMARY enforcement mechanism.
 * OpenSearch FLS provides defense-in-depth only.
 */

import { Injectable, Logger } from '@nestjs/common';
import { OpenSearchProvider } from '../shared/opensearch';
import { AuthenticatedUser } from '../shared/auth';
import { Counter, Histogram } from 'prom-client';
import { SearchQuery, SearchResult } from './interfaces';

/* -------------------------------------------------------------------------- */
/*                              Prometheus Metrics                             */
/* -------------------------------------------------------------------------- */

/**
 * Counter for total search requests, labeled by role, tenant type, and status.
 */
const searchCounter = new Counter({
    name: 'membersearch_queries_total',
    help: 'Total number of search requests',
    labelNames: ['role', 'tenant_type', 'status'],
});

/**
 * Histogram for search request latency distribution.
 * Buckets aligned with SLO targets: p95 < 100ms, p99 < 250ms.
 */
const searchDuration = new Histogram({
    name: 'membersearch_query_duration_seconds',
    help: 'Search request duration',
    buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1],
});

/* -------------------------------------------------------------------------- */
/*                              Re-exports for Convenience                     */
/* -------------------------------------------------------------------------- */

export { SearchQuery, SearchResult } from './interfaces';

/* -------------------------------------------------------------------------- */
/*                              Service Implementation                         */
/* -------------------------------------------------------------------------- */

@Injectable()
export class MembershipSearchService {
    private readonly logger = new Logger(MembershipSearchService.name);

    /** OpenSearch index name for member documents */
    private readonly INDEX_NAME = 'members';

    constructor(private opensearchProvider: OpenSearchProvider) { }

    /**
     * Determines which source fields to return based on user role and tenant type.
     *
     * @param user - Authenticated user with role and tenant information
     * @returns Array of field names to include in search results
     *
     * @remarks
     * Field access rules:
     * - **Internal Auditor**: base fields only
     * - **Internal Compliance Lead**: base + sensitive fields
     * - **External Admin**: base + status_notes (for their tenant only)
     */
    private getSourceFilter(user: AuthenticatedUser): string[] {
        const baseFields = ['member_id', 'email', 'fname', 'lname', 'tags', 'tenant_id'];

        if (user.tenantType === 'external') {
            // External admins get base + status_notes (data is already tenant-filtered)
            if (user.roles.includes('admin')) {
                return [...baseFields, 'status_notes'];
            }
            return baseFields;
        }

        // Internal users: RBAC-controlled
        if (user.roles.includes('compliance_lead')) {
            return [...baseFields, 'status_notes'];
        }

        return baseFields;
    }

    /**
     * Constructs the user's search query (without tenant filtering).
     */
    private buildUserQuery(params: SearchQuery): Record<string, unknown> {
        const { q, email, fuzzy = true } = params;

        if (email) {
            return {
                term: { email: email.toLowerCase() },
            };
        }

        if (q) {
            if (fuzzy) {
                return {
                    multi_match: {
                        query: q,
                        fields: ['fname^2', 'lname^2', 'email', 'status_notes'],
                        fuzziness: 'AUTO',
                        prefix_length: 2,
                    },
                };
            }
            return {
                multi_match: {
                    query: q,
                    fields: ['fname', 'lname', 'email', 'status_notes'],
                },
            };
        }

        return { match_all: {} };
    }

    /**
     * Wraps user query with tenant isolation filter for external users.
     *
     * @param params - Search parameters from the request
     * @param user - Authenticated user for tenant context
     * @returns OpenSearch query with tenant filter if applicable
     *
     * @remarks
     * **Security Critical**: External users MUST have tenant_id filter applied.
     * This ensures data isolation between external locations.
     */
    private buildQuery(params: SearchQuery, user: AuthenticatedUser): Record<string, unknown> {
        const userQuery = this.buildUserQuery(params);

        // External tenants: enforce strict data isolation
        if (user.tenantType === 'external') {
            return {
                bool: {
                    must: [userQuery],
                    filter: [{ term: { tenant_id: user.tenantId } }],
                },
            };
        }

        // Internal users: no tenant filter (see all data)
        return userQuery;
    }

    /**
     * Executes a search query with RBAC field filtering and tenant isolation.
     *
     * @param params - Search parameters (query, email, fuzzy, limit)
     * @param user - Authenticated user for RBAC and tenant filtering
     * @returns Array of search results with appropriate fields
     * @throws Error if OpenSearch query fails
     *
     * @remarks
     * - Records metrics for SLO monitoring (latency histogram, success/error counter)
     * - Applies source filtering to restrict fields based on user role
     * - Applies tenant filtering for external users
     * - Default limit is 20 results
     */
    async search(params: SearchQuery, user: AuthenticatedUser): Promise<SearchResult[]> {
        const timer = searchDuration.startTimer();
        const role = user.roles[0] || 'unknown';

        try {
            const client = this.opensearchProvider.getClient();
            const limit = params.limit || 20;

            const response = await client.search({
                index: this.INDEX_NAME,
                body: {
                    query: this.buildQuery(params, user),
                    _source: this.getSourceFilter(user),
                    size: limit,
                },
            });

            const hits = response.body.hits.hits;
            const results = hits.map((hit: { _source: SearchResult }) => hit._source);

            searchCounter.inc({ role, tenant_type: user.tenantType, status: 'success' });
            this.logger.log({
                msg: 'Search completed',
                query: params.q,
                resultCount: results.length,
                role,
                tenantType: user.tenantType,
                tenantId: user.tenantType === 'external' ? user.tenantId : undefined,
            });

            return results;
        } catch (error) {
            searchCounter.inc({ role, tenant_type: user.tenantType, status: 'error' });
            this.logger.error({ msg: 'Search failed', error, query: params });
            throw error;
        } finally {
            timer();
        }
    }
}
