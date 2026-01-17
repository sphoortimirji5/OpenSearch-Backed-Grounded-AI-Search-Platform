/**
 * @fileoverview Insight Interface
 *
 * Result structure for agent analysis.
 */

/**
 * Insight from agent analysis.
 */
export interface Insight {
    question: string;
    summary: string;
    confidence: 'high' | 'medium' | 'low';
    reasoning?: string;
    dataPoints: {
        membersAnalyzed: number;
        locationsAnalyzed: number;
    };
    generatedAt: string;
    provider: string;
}
