/**
 * @fileoverview Input Validator
 *
 * Validates and sanitizes user input before processing.
 */

import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { z } from 'zod';

/**
 * Validation result with sanitized data or errors.
 */
export interface ValidationResult {
    valid: boolean;
    sanitized?: string;
    errors?: string[];
}

/**
 * Input validation schema.
 */
const InputSchema = z.object({
    question: z
        .string()
        .min(3, 'Question too short (min 3 chars)')
        .max(500, 'Question too long (max 500 chars)'),
    locationId: z.string().max(100).optional(),
    limit: z.number().min(1).max(500).optional(),
});

@Injectable()
export class InputValidator {
    private readonly logger = new Logger(InputValidator.name);

    /**
     * Validates and sanitizes the question input.
     */
    validate(question: string): ValidationResult {
        // Step 1: Sanitize
        const sanitized = this.sanitize(question);

        // Step 2: Schema validation
        const schemaResult = InputSchema.shape.question.safeParse(sanitized);
        if (!schemaResult.success) {
            return {
                valid: false,
                errors: schemaResult.error.errors.map((e) => e.message),
            };
        }

        // Step 3: Content checks
        const contentErrors = this.validateContent(sanitized);
        if (contentErrors.length > 0) {
            return { valid: false, errors: contentErrors };
        }

        return { valid: true, sanitized };
    }

    /**
     * Validates full request object.
     */
    validateRequest(request: { question: string; locationId?: string; limit?: number }): void {
        const result = InputSchema.safeParse(request);
        if (!result.success) {
            const errors = result.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`);
            throw new BadRequestException(`Invalid request: ${errors.join(', ')}`);
        }

        const questionResult = this.validate(request.question);
        if (!questionResult.valid) {
            throw new BadRequestException(`Invalid question: ${questionResult.errors?.join(', ')}`);
        }
    }

    /**
     * Sanitizes input by removing control characters and normalizing whitespace.
     */
    private sanitize(input: string): string {
        return input
            // Remove control characters
            .replace(/[\x00-\x1F\x7F]/g, '')
            // Normalize whitespace
            .replace(/\s+/g, ' ')
            // Trim
            .trim();
    }

    /**
     * Validates content for forbidden patterns.
     */
    private validateContent(question: string): string[] {
        const errors: string[] = [];

        // Check for empty after sanitization
        if (question.length === 0) {
            errors.push('Question is empty after sanitization');
        }

        // Check for excessive special characters
        const specialCharRatio = (question.match(/[^a-zA-Z0-9\s]/g)?.length || 0) / question.length;
        if (specialCharRatio > 0.5) {
            errors.push('Question contains too many special characters');
        }

        return errors;
    }
}
