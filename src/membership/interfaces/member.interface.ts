/**
 * @fileoverview Member Interface
 *
 * Defines the structure of member records as stored in DynamoDB.
 * This is the canonical definition used throughout the application.
 */

/**
 * Member record structure as stored in DynamoDB.
 *
 * @remarks
 * - member_id: Partition key (HASH), globally unique
 * - tenant_id: Tenant identifier for multi-tenant isolation
 * - status_notes: May contain PII, redacted before indexing
 */
export interface Member {
    /** Unique member identifier (partition key) */
    member_id: string;

    /** Tenant identifier for multi-tenant data isolation */
    tenant_id?: string;

    /** Member email address */
    email: string;

    /** First name */
    fname: string;

    /** Last name */
    lname: string;

    /** Administrative notes (may contain PII) */
    status_notes?: string;

    /** Classification tags */
    tags?: string[];

    /** ISO 8601 creation timestamp */
    created_at: string;

    /** ISO 8601 last update timestamp */
    updated_at: string;
}

/**
 * Result of a paginated scan operation.
 */
export interface ScanPage {
    /** Members retrieved in this page */
    items: Member[];

    /** Token for next page, undefined if no more pages */
    lastEvaluatedKey?: Record<string, unknown>;
}
