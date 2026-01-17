/**
 * @fileoverview PII Scanner
 *
 * Detects PII patterns in questions and responses.
 */

import { Injectable, Logger } from '@nestjs/common';

/**
 * PII detection result.
 */
export interface PIIDetectionResult {
    containsPII: boolean;
    detectedTypes: string[];
    redacted: string;
}

/**
 * PII patterns to detect.
 */
const PII_PATTERNS: Array<{ name: string; pattern: RegExp; replacement: string }> = [
    // SSN patterns
    { name: 'SSN', pattern: /\b\d{3}[-\s]?\d{2}[-\s]?\d{4}\b/g, replacement: '[SSN REDACTED]' },

    // Email patterns
    { name: 'Email', pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, replacement: '[EMAIL REDACTED]' },

    // Phone patterns
    { name: 'Phone', pattern: /\b(?:\+1[-\s]?)?\(?\d{3}\)?[-\s]?\d{3}[-\s]?\d{4}\b/g, replacement: '[PHONE REDACTED]' },

    // Credit card patterns
    { name: 'CreditCard', pattern: /\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13}|6(?:011|5[0-9]{2})[0-9]{12})\b/g, replacement: '[CARD REDACTED]' },

    // Date of birth patterns
    { name: 'DOB', pattern: /\b(?:0[1-9]|1[0-2])[-/](?:0[1-9]|[12]\d|3[01])[-/](?:19|20)\d{2}\b/g, replacement: '[DOB REDACTED]' },

    // Address patterns (simplified)
    { name: 'ZipCode', pattern: /\b\d{5}(?:-\d{4})?\b/g, replacement: '[ZIP REDACTED]' },

    // Medical record numbers (common patterns)
    { name: 'MRN', pattern: /\bMRN[:\s#]*\d{6,10}\b/gi, replacement: '[MRN REDACTED]' },

    // Member IDs (if numeric and long)
    { name: 'MemberID', pattern: /\bmember[_\s]?id[:\s#]*\d{8,}\b/gi, replacement: '[MEMBER_ID REDACTED]' },
];

@Injectable()
export class PIIScanner {
    private readonly logger = new Logger(PIIScanner.name);

    /**
     * Scans text for PII and returns detection result.
     */
    scan(text: string): PIIDetectionResult {
        const detectedTypes: string[] = [];
        let redacted = text;

        for (const { name, pattern, replacement } of PII_PATTERNS) {
            if (pattern.test(text)) {
                detectedTypes.push(name);
                // Reset lastIndex after test
                pattern.lastIndex = 0;
                redacted = redacted.replace(pattern, replacement);
            }
        }

        if (detectedTypes.length > 0) {
            this.logger.warn({
                msg: 'PII detected in input',
                types: detectedTypes,
            });
        }

        return {
            containsPII: detectedTypes.length > 0,
            detectedTypes,
            redacted,
        };
    }

    /**
     * Throws if PII is detected in question.
     */
    assertNoPII(question: string): void {
        const result = this.scan(question);
        if (result.containsPII) {
            throw new Error(
                `Question contains sensitive information (${result.detectedTypes.join(', ')}). ` +
                'Please rephrase without including personal data.'
            );
        }
    }

    /**
     * Redacts PII from response before returning to user.
     */
    redactResponse(response: string): string {
        return this.scan(response).redacted;
    }
}
