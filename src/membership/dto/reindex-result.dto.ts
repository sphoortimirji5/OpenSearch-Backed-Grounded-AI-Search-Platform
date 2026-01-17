/**
 * @fileoverview Reindex Result DTO
 *
 * Response DTO for admin reindex endpoint.
 */

/**
 * Result of a full reindex operation.
 */
export class ReindexResultDto {
    /** Total records processed */
    total: number;

    /** Successfully indexed */
    success: number;

    /** Failed to index */
    failed: number;

    /** Duration in milliseconds */
    durationMs: number;
}

/**
 * Result of a bulk index operation.
 */
export class BulkIndexResultDto {
    success: number;
    failed: number;
}
