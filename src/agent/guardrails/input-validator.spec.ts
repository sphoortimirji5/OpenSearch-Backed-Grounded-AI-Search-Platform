/**
 * @fileoverview Input Validator Tests
 */

import { InputValidator } from './input-validator';

describe('InputValidator', () => {
    let validator: InputValidator;

    beforeEach(() => {
        validator = new InputValidator();
    });

    describe('validate', () => {
        it('should accept valid questions', () => {
            const result = validator.validate('Why does location 123 have high dropout rates?');
            expect(result.valid).toBe(true);
            expect(result.sanitized).toBeDefined();
        });

        it('should reject questions that are too short', () => {
            const result = validator.validate('Hi');
            expect(result.valid).toBe(false);
            expect(result.errors).toContain('Question too short (min 3 chars)');
        });

        it('should reject questions that are too long', () => {
            const longQuestion = 'a'.repeat(501);
            const result = validator.validate(longQuestion);
            expect(result.valid).toBe(false);
            expect(result.errors?.[0]).toContain('too long');
        });

        it('should sanitize control characters', () => {
            const result = validator.validate('Hello\x00World\x1F!');
            expect(result.valid).toBe(true);
            expect(result.sanitized).toBe('HelloWorld!');
        });

        it('should normalize whitespace', () => {
            const result = validator.validate('Hello   World');
            expect(result.valid).toBe(true);
            expect(result.sanitized).toBe('Hello World');
        });

        it('should reject excessive special characters', () => {
            const result = validator.validate('!@#$%^&*()!@#$%^&*()');
            expect(result.valid).toBe(false);
            expect(result.errors).toContain('Question contains too many special characters');
        });
    });
});
