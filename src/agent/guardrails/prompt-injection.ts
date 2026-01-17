/**
 * @fileoverview Prompt Injection Detector
 *
 * Detects and blocks potential prompt injection attacks.
 */

import { Injectable, Logger } from '@nestjs/common';

/**
 * Detection result.
 */
export interface InjectionDetectionResult {
    blocked: boolean;
    reason?: string;
    pattern?: string;
}

/**
 * Injection patterns to detect.
 */
const INJECTION_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
    // Direct instruction override attempts
    { pattern: /ignore\s+(all\s+)?(previous|prior|above)/i, reason: 'Instruction override attempt' },
    { pattern: /disregard\s+(all\s+)?(previous|prior|above)/i, reason: 'Instruction override attempt' },
    { pattern: /forget\s+(all\s+)?(previous|prior|above)/i, reason: 'Instruction override attempt' },

    // System prompt manipulation
    { pattern: /system\s*:/i, reason: 'System prompt manipulation' },
    { pattern: /\[system\]/i, reason: 'System prompt manipulation' },
    { pattern: /<\|system\|>/i, reason: 'System prompt manipulation' },
    { pattern: /###\s*system/i, reason: 'System prompt manipulation' },

    // Role playing attempts
    { pattern: /you\s+are\s+now\s+a/i, reason: 'Role manipulation attempt' },
    { pattern: /pretend\s+(to\s+be|you\s+are)/i, reason: 'Role manipulation attempt' },
    { pattern: /act\s+as\s+(if|a)/i, reason: 'Role manipulation attempt' },
    { pattern: /roleplay\s+as/i, reason: 'Role manipulation attempt' },

    // Jailbreak attempts
    { pattern: /DAN\s+mode/i, reason: 'Jailbreak attempt' },
    { pattern: /developer\s+mode/i, reason: 'Jailbreak attempt' },
    { pattern: /do\s+anything\s+now/i, reason: 'Jailbreak attempt' },

    // Prompt extraction attempts
    { pattern: /what\s+(is|are)\s+your\s+(instructions|prompts?|rules)/i, reason: 'Prompt extraction attempt' },
    { pattern: /show\s+(me\s+)?your\s+prompt/i, reason: 'Prompt extraction attempt' },
    { pattern: /repeat\s+your\s+(system|initial)/i, reason: 'Prompt extraction attempt' },

    // Code execution attempts
    { pattern: /```(bash|shell|sh|python|javascript|js)/i, reason: 'Code execution attempt' },
    { pattern: /exec\s*\(/i, reason: 'Code execution attempt' },
    { pattern: /eval\s*\(/i, reason: 'Code execution attempt' },

    // Data exfiltration
    { pattern: /send\s+(to|data|this)/i, reason: 'Potential data exfiltration' },
    { pattern: /http[s]?:\/\//i, reason: 'URL injection attempt' },
];

@Injectable()
export class PromptInjectionDetector {
    private readonly logger = new Logger(PromptInjectionDetector.name);

    /**
     * Scans input for prompt injection patterns.
     */
    detect(input: string): InjectionDetectionResult {
        for (const { pattern, reason } of INJECTION_PATTERNS) {
            if (pattern.test(input)) {
                this.logger.warn({
                    msg: 'Prompt injection detected',
                    reason,
                    patternMatch: pattern.toString(),
                });

                return {
                    blocked: true,
                    reason,
                    pattern: pattern.toString(),
                };
            }
        }

        return { blocked: false };
    }

    /**
     * Throws if injection detected.
     */
    assertSafe(input: string): void {
        const result = this.detect(input);
        if (result.blocked) {
            throw new Error(`Blocked: ${result.reason}`);
        }
    }
}
