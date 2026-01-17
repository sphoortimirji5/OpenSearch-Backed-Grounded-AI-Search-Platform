/**
 * @fileoverview Index Document Interface
 *
 * Defines the structure of documents indexed to OpenSearch.
 */

/**
 * Document structure as indexed to OpenSearch.
 *
 * @remarks
 * - member_id: Used as OpenSearch _id for idempotent upserts
 * - status_notes: Redacted before indexing to remove PII
 */
export interface IndexDocument {
    member_id: string;
    tenant_id?: string;
    email: string;
    fname: string;
    lname: string;
    status_notes?: string;
    tags?: string[];
}
