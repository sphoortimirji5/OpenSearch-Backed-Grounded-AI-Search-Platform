/**
 * @fileoverview Rate Limiter
 *
 * Per-user rate limiting for agent requests.
 */

import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';

/**
 * Rate limit configuration.
 */
interface RateLimitConfig {
    requestsPerMinute: number;
    requestsPerHour: number;
    maxConcurrent: number;
}

/**
 * User request window.
 */
interface UserWindow {
    minuteCount: number;
    hourCount: number;
    concurrent: number;
    minuteReset: number;
    hourReset: number;
}

const DEFAULT_CONFIG: RateLimitConfig = {
    requestsPerMinute: 10,
    requestsPerHour: 100,
    maxConcurrent: 5,
};

@Injectable()
export class RateLimiter {
    private readonly logger = new Logger(RateLimiter.name);
    private readonly userWindows = new Map<string, UserWindow>();
    private readonly config: RateLimitConfig;

    constructor() {
        this.config = DEFAULT_CONFIG;

        // Cleanup old windows every 5 minutes
        setInterval(() => this.cleanup(), 5 * 60 * 1000);
    }

    /**
     * Checks if request is allowed and increments counters.
     */
    checkAndIncrement(userId: string): void {
        const now = Date.now();
        let window = this.userWindows.get(userId);

        if (!window) {
            window = {
                minuteCount: 0,
                hourCount: 0,
                concurrent: 0,
                minuteReset: now + 60_000,
                hourReset: now + 3_600_000,
            };
            this.userWindows.set(userId, window);
        }

        // Reset windows if expired
        if (now > window.minuteReset) {
            window.minuteCount = 0;
            window.minuteReset = now + 60_000;
        }
        if (now > window.hourReset) {
            window.hourCount = 0;
            window.hourReset = now + 3_600_000;
        }

        // Check limits
        if (window.minuteCount >= this.config.requestsPerMinute) {
            this.logger.warn({ msg: 'Rate limit exceeded (minute)', userId });
            throw new HttpException(
                `Rate limit exceeded. Max ${this.config.requestsPerMinute} requests per minute.`,
                HttpStatus.TOO_MANY_REQUESTS,
            );
        }

        if (window.hourCount >= this.config.requestsPerHour) {
            this.logger.warn({ msg: 'Rate limit exceeded (hour)', userId });
            throw new HttpException(
                `Rate limit exceeded. Max ${this.config.requestsPerHour} requests per hour.`,
                HttpStatus.TOO_MANY_REQUESTS,
            );
        }

        if (window.concurrent >= this.config.maxConcurrent) {
            this.logger.warn({ msg: 'Concurrent limit exceeded', userId });
            throw new HttpException(
                `Too many concurrent requests. Max ${this.config.maxConcurrent}.`,
                HttpStatus.TOO_MANY_REQUESTS,
            );
        }

        // Increment
        window.minuteCount++;
        window.hourCount++;
        window.concurrent++;
    }

    /**
     * Decrements concurrent counter after request completes.
     */
    complete(userId: string): void {
        const window = this.userWindows.get(userId);
        if (window && window.concurrent > 0) {
            window.concurrent--;
        }
    }

    /**
     * Cleans up old windows.
     */
    private cleanup(): void {
        const now = Date.now();
        for (const [userId, window] of this.userWindows.entries()) {
            if (now > window.hourReset && window.concurrent === 0) {
                this.userWindows.delete(userId);
            }
        }
    }

    /**
     * Gets current usage for a user (for metrics/debugging).
     */
    getUsage(userId: string): { minute: number; hour: number; concurrent: number } | null {
        const window = this.userWindows.get(userId);
        if (!window) return null;
        return {
            minute: window.minuteCount,
            hour: window.hourCount,
            concurrent: window.concurrent,
        };
    }
}
