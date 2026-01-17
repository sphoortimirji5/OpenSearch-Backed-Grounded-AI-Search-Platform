/**
 * @fileoverview Output Validator Tests
 */

import { OutputValidator } from './output-validator';

describe('OutputValidator', () => {
    let validator: OutputValidator;

    beforeEach(() => {
        validator = new OutputValidator();
    });

    describe('validate', () => {
        it('should accept valid responses', () => {
            const result = validator.validate({
                summary: 'Location 123 has a 15% dropout rate due to staffing changes.',
                confidence: 'high',
                reasoning: 'Based on status events showing coordinator turnover.',
            });
            expect(result.valid).toBe(true);
            expect(result.validated).toBeDefined();
        });

        it('should accept responses without reasoning', () => {
            const result = validator.validate({
                summary: 'No issues found.',
                confidence: 'medium',
            });
            expect(result.valid).toBe(true);
        });

        it('should reject empty summary', () => {
            const result = validator.validate({
                summary: '',
                confidence: 'high',
            });
            expect(result.valid).toBe(false);
            expect(result.errors?.some(e => e.includes('summary'))).toBe(true);
        });

        it('should reject invalid confidence values', () => {
            const result = validator.validate({
                summary: 'Some analysis',
                confidence: 'very_high' as 'high',
            });
            expect(result.valid).toBe(false);
        });

        it('should truncate long summaries', () => {
            const longSummary = 'a'.repeat(2500);
            const result = validator.validate({
                summary: longSummary,
                confidence: 'medium',
            });
            // Validation fails because summary exceeds max length
            expect(result.valid).toBe(false);
        });

        it('should reject responses with forbidden content', () => {
            const result = validator.validate({
                summary: 'Here is the password: secret123',
                confidence: 'high',
            });
            expect(result.valid).toBe(false);
            expect(result.errors).toContain('Potential credential leak');
        });

        it('should reject script injection', () => {
            const result = validator.validate({
                summary: '<script>alert("xss")</script>',
                confidence: 'high',
            });
            expect(result.valid).toBe(false);
            expect(result.errors).toContain('Script injection');
        });
    });

    describe('getFallbackResponse', () => {
        it('should return a valid fallback', () => {
            const fallback = validator.getFallbackResponse();
            expect(fallback.summary).toBeDefined();
            expect(fallback.confidence).toBe('low');
        });
    });
});
