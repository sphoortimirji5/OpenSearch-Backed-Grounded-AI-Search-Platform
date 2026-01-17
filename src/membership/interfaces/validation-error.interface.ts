/**
 * @fileoverview Validation Error Interface
 *
 * Defines structure for validation errors during indexing.
 */

/**
 * Validation error details for failed member records.
 */
export interface ValidationError {
    /** Member ID if available */
    member_id?: string;

    /** List of validation error messages */
    errors: string[];
}
