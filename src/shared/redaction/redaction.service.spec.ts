import { RedactionService } from './redaction.service';

describe('RedactionService', () => {
    let service: RedactionService;

    beforeEach(() => {
        service = new RedactionService();
    });

    describe('redact', () => {
        it('should redact phone numbers', () => {
            const input = 'Call 555-123-4567 for info';
            const output = service.redact(input);
            expect(output).toBe('Call [PHONE-REDACTED] for info');
        });

        it('should redact email addresses', () => {
            const input = 'Contact john.doe@example.com';
            const output = service.redact(input);
            expect(output).toBe('Contact [EMAIL-REDACTED]');
        });

        it('should redact credit card numbers', () => {
            const input = 'Card: 4111-2222-3333-4444';
            const output = service.redact(input);
            expect(output).toBe('Card: [CC-REDACTED]');
        });

        it('should redact multiple PII in one string', () => {
            const input = 'Email test@test.com, phone 555-111-2222';
            const output = service.redact(input);
            expect(output).not.toContain('test@test.com');
            expect(output).not.toContain('555-111-2222');
        });

        it('should return empty string for empty input', () => {
            expect(service.redact('')).toBe('');
        });

        it('should return null/undefined as-is', () => {
            expect(service.redact(null as unknown as string)).toBeNull();
            expect(service.redact(undefined as unknown as string)).toBeUndefined();
        });
    });

    describe('containsPII', () => {
        it('should detect phone numbers', () => {
            expect(service.containsPII('Phone: 555-123-4567')).toBe(true);
        });

        it('should detect email', () => {
            expect(service.containsPII('email: test@test.com')).toBe(true);
        });

        it('should return false for clean text', () => {
            expect(service.containsPII('This is clean text')).toBe(false);
        });
    });
});
