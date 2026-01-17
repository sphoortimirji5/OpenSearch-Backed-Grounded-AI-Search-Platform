/**
 * @fileoverview Search Result DTO
 *
 * Response DTO for search results.
 */

/**
 * Individual search result item.
 * Fields present depend on user's RBAC permissions.
 */
export class SearchResultItemDto {
    member_id: string;
    email: string;
    fname: string;
    lname: string;
    tags?: string[];
    tenant_id?: string;
    /** Only visible to compliance_lead or external admin */
    status_notes?: string;
}

/**
 * Search response wrapper (optional pagination support).
 */
export class SearchResponseDto {
    results: SearchResultItemDto[];
    total?: number;
}
