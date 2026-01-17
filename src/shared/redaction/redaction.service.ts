/**
 * @fileoverview PII Redaction Service
 *
 * Provides pattern-based detection and masking of Personally Identifiable Information (PII).
 * Used by the indexer to sanitize data BEFORE it reaches OpenSearch.
 *
 * @remarks
 * This is a critical security boundary. All member data flows through redaction
 * before indexing to prevent sensitive information leakage to the search layer.
 *
 * Supported PII patterns:
 * - Phone numbers (US format)
 * - Email addresses
 * - Credit card numbers
 */

import { Injectable } from '@nestjs/common';

/* -------------------------------------------------------------------------- */
/*                              Type Definitions                               */
/* -------------------------------------------------------------------------- */

/**
 * Defines a pattern for detecting and redacting a specific type of PII.
 */
interface RedactionPattern {
    /** Regular expression to match PII. Must use global flag. */
    regex: RegExp;
    /** Replacement string indicating what was redacted. */
    replacement: string;
}

/* -------------------------------------------------------------------------- */
/*                              Service Implementation                         */
/* -------------------------------------------------------------------------- */

@Injectable()
export class RedactionService {
    /**
     * PII detection patterns applied in order.
     *
     * @remarks
     * All patterns use the global flag to replace ALL occurrences.
     */
    private readonly patterns: RedactionPattern[] = [
        {
            // Phone: 555-123-4567, (555) 123-4567, +1-555-123-4567, 5551234567
            regex: /\b(\+1[-.\\s]?)?(\(?\d{3}\)?[-.\\s]?)?\d{3}[-.\\s]?\d{4}\b/g,
            replacement: '[PHONE-REDACTED]',
        },
        {
            // Email: user@domain.com
            regex: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
            replacement: '[EMAIL-REDACTED]',
        },
        {
            // Credit card: 1234-5678-9012-3456 or 1234567890123456
            regex: /\b\d{4}[-\\s]?\d{4}[-\\s]?\d{4}[-\\s]?\d{4}\b/g,
            replacement: '[CC-REDACTED]',
        },
    ];

    /**
     * Redacts all recognized PII patterns from a string.
     *
     * @param input - Raw string potentially containing PII
     * @returns Sanitized string with PII replaced by redaction markers
     *
     * @example
     * ```typescript
     * redactionService.redact('Contact: 555-123-4567');
     * // Returns: 'Contact: [PHONE-REDACTED]'
     * ```
     */
    redact(input: string): string {
        if (!input) return input;

        let result = input;
        for (const pattern of this.patterns) {
            result = result.replace(pattern.regex, pattern.replacement);
        }
        return result;
    }

    /**
     * Redacts PII from specified string fields of an object.
     *
     * @typeParam T - Object type with string-indexable properties
     * @param obj - Object containing fields to redact
     * @param fields - Array of field names to process
     * @returns New object with redacted field values
     *
     * @remarks
     * Performs a shallow copy. Only specified fields are processed.
     * Non-string fields in the fields array are ignored.
     *
     * @example
     * ```typescript
     * const member = { name: 'John', notes: 'Phone: 555-123-4567' };
     * redactionService.redactObject(member, ['notes']);
     * // Returns: { name: 'John', notes: 'Phone: [PHONE-REDACTED]' }
     * ```
     */
    redactObject<T extends Record<string, unknown>>(obj: T, fields: (keyof T)[]): T {
        const result = { ...obj };
        for (const field of fields) {
            if (typeof result[field] === 'string') {
                result[field] = this.redact(result[field] as string) as T[keyof T];
            }
        }
        return result;
    }

    /**
     * Checks if a string contains any recognizable PII patterns.
     *
     * @param input - String to analyze
     * @returns True if any PII pattern matches
     *
     * @remarks
     * Useful for validation or audit logging to flag potentially
     * sensitive content without modifying it.
     */
    containsPII(input: string): boolean {
        if (!input) return false;
        return this.patterns.some(pattern => pattern.regex.test(input));
    }
}
