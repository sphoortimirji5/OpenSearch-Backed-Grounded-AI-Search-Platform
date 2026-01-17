/**
 * @fileoverview PII Scanner Tests
 */

import { PIIScanner } from './pii-scanner';

describe('PIIScanner', () => {
    let scanner: PIIScanner;

    beforeEach(() => {
        scanner = new PIIScanner();
    });

    describe('scan', () => {
        it('should detect SSN patterns', () => {
            const result = scanner.scan('User SSN is 123-45-6789');
            expect(result.containsPII).toBe(true);
            expect(result.detectedTypes).toContain('SSN');
            expect(result.redacted).toContain('[SSN REDACTED]');
        });

        it('should detect email patterns', () => {
            const result = scanner.scan('Contact john.doe@example.com');
            expect(result.containsPII).toBe(true);
            expect(result.detectedTypes).toContain('Email');
            expect(result.redacted).toContain('[EMAIL REDACTED]');
        });

        it('should detect phone patterns', () => {
            const result = scanner.scan('Call me at (555) 123-4567');
            expect(result.containsPII).toBe(true);
            expect(result.detectedTypes).toContain('Phone');
            expect(result.redacted).toContain('[PHONE REDACTED]');
        });

        it('should detect phone with country code', () => {
            const result = scanner.scan('Number: +1-555-123-4567');
            expect(result.containsPII).toBe(true);
            expect(result.detectedTypes).toContain('Phone');
        });

        it('should detect credit card patterns', () => {
            const result = scanner.scan('Card: 4111111111111111');
            expect(result.containsPII).toBe(true);
            expect(result.detectedTypes).toContain('CreditCard');
            expect(result.redacted).toContain('[CARD REDACTED]');
        });

        it('should detect DOB patterns', () => {
            const result = scanner.scan('Born on 01/15/1990');
            expect(result.containsPII).toBe(true);
            expect(result.detectedTypes).toContain('DOB');
            expect(result.redacted).toContain('[DOB REDACTED]');
        });

        it('should detect zip code patterns', () => {
            const result = scanner.scan('Zip: 12345-6789');
            expect(result.containsPII).toBe(true);
            expect(result.detectedTypes).toContain('ZipCode');
        });

        it('should detect MRN patterns', () => {
            const result = scanner.scan('MRN: 12345678');
            expect(result.containsPII).toBe(true);
            expect(result.detectedTypes).toContain('MRN');
        });

        it('should not flag clean text', () => {
            const result = scanner.scan('Why does location 123 have high dropout rates?');
            expect(result.containsPII).toBe(false);
            expect(result.detectedTypes).toHaveLength(0);
        });

        it('should detect multiple PII types', () => {
            const result = scanner.scan('SSN 123-45-6789, email test@test.com, phone 555-123-4567');
            expect(result.containsPII).toBe(true);
            expect(result.detectedTypes).toContain('SSN');
            expect(result.detectedTypes).toContain('Email');
            expect(result.detectedTypes).toContain('Phone');
        });
    });

    describe('assertNoPII', () => {
        it('should not throw for clean text', () => {
            expect(() => scanner.assertNoPII('Normal question')).not.toThrow();
        });

        it('should throw for text with PII', () => {
            expect(() => scanner.assertNoPII('Email: test@test.com')).toThrow('contains sensitive information');
        });
    });

    describe('redactResponse', () => {
        it('should redact PII from response', () => {
            const response = 'Contact john@test.com at 555-123-4567';
            const redacted = scanner.redactResponse(response);
            expect(redacted).not.toContain('john@test.com');
            expect(redacted).not.toContain('555-123-4567');
        });
    });
});
