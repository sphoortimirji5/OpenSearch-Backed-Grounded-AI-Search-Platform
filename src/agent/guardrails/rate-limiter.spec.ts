/**
 * @fileoverview Rate Limiter Tests
 */

import { RateLimiter } from './rate-limiter';

describe('RateLimiter', () => {
    let limiter: RateLimiter;

    beforeEach(() => {
        limiter = new RateLimiter();
    });

    describe('checkAndIncrement', () => {
        it('should allow first request', () => {
            expect(() => limiter.checkAndIncrement('user1')).not.toThrow();
        });

        it('should track usage after request', () => {
            limiter.checkAndIncrement('user1');
            const usage = limiter.getUsage('user1');
            expect(usage).toBeDefined();
            expect(usage!.minute).toBe(1);
            expect(usage!.hour).toBe(1);
            expect(usage!.concurrent).toBe(1);
        });

        it('should allow multiple requests under limit', () => {
            for (let i = 0; i < 5; i++) {
                limiter.checkAndIncrement('user1');
                limiter.complete('user1');
            }
            expect(limiter.getUsage('user1')!.minute).toBe(5);
        });

        it('should block after minute limit exceeded', () => {
            // Make 10 requests (the limit)
            for (let i = 0; i < 10; i++) {
                limiter.checkAndIncrement('user1');
                limiter.complete('user1');
            }

            // 11th should fail
            expect(() => limiter.checkAndIncrement('user1')).toThrow('Rate limit exceeded');
        });

        it('should block concurrent requests over limit', () => {
            // Start 5 concurrent requests (the limit)
            for (let i = 0; i < 5; i++) {
                limiter.checkAndIncrement('user1');
            }

            // 6th concurrent should fail
            expect(() => limiter.checkAndIncrement('user1')).toThrow('Too many concurrent requests');
        });

        it('should track different users separately', () => {
            limiter.checkAndIncrement('user1');
            limiter.checkAndIncrement('user2');

            expect(limiter.getUsage('user1')!.minute).toBe(1);
            expect(limiter.getUsage('user2')!.minute).toBe(1);
        });
    });

    describe('complete', () => {
        it('should decrement concurrent counter', () => {
            limiter.checkAndIncrement('user1');
            expect(limiter.getUsage('user1')!.concurrent).toBe(1);

            limiter.complete('user1');
            expect(limiter.getUsage('user1')!.concurrent).toBe(0);
        });

        it('should not go below zero', () => {
            limiter.complete('nonexistent');
            // Should not throw
        });
    });

    describe('getUsage', () => {
        it('should return null for unknown user', () => {
            expect(limiter.getUsage('unknown')).toBeNull();
        });
    });
});
