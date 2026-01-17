/**
 * @fileoverview Search Service Interfaces
 *
 * Type definitions for search operations.
 */

/**
 * Query parameters accepted by the search endpoint.
 */
export interface SearchQuery {
    /** Free-text query string for fuzzy matching */
    q?: string;

    /** Exact email match (takes precedence over q) */
    email?: string;

    /** Enable fuzzy matching. Defaults to true. */
    fuzzy?: boolean;

    /** Maximum number of results. Defaults to 20. */
    limit?: number;
}

/**
 * Member search result with role-filtered fields.
 * Sensitive fields only populated for authorized roles.
 */
export interface SearchResult {
    member_id: string;
    email?: string;
    fname?: string;
    lname?: string;

    /** Only returned for compliance_lead role (internal) or admin (external) */
    status_notes?: string;

    tags?: string[];

    /** Tenant ID for multi-tenant data */
    tenant_id?: string;
}
