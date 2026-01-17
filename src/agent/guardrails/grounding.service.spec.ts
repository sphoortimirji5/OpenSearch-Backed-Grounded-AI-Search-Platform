import { GroundingService, GroundingResult } from './grounding.service';
import { LLMProvider } from '../interfaces';

describe('GroundingService', () => {
    let service: GroundingService;
    let mockLLMProvider: jest.Mocked<LLMProvider>;

    beforeEach(() => {
        mockLLMProvider = {
            analyze: jest.fn(),
            getName: jest.fn().mockReturnValue('mock'),
        };

        service = new GroundingService(mockLLMProvider);
    });

    describe('check', () => {
        it('returns grounded=true when response is supported by facts', async () => {
            mockLLMProvider.analyze.mockResolvedValue({
                summary: '{"grounded": true, "score": 0.95, "reason": "All claims supported"}',
                confidence: 'high',
            });

            const result = await service.check(
                'Location GYM_101 has rate $15.50',
                'GYM_101 charges $15.50',
            );

            expect(result.grounded).toBe(true);
            expect(result.score).toBe(0.95);
        });

        it('returns grounded=false when response has unsupported claims', async () => {
            mockLLMProvider.analyze.mockResolvedValue({
                summary: '{"grounded": false, "score": 0.3, "reason": "Claims not in facts", "unsupported_claims": ["GYM has 500 members"]}',
                confidence: 'low',
            });

            const result = await service.check(
                'Location GYM_101 exists',
                'GYM has 500 members and 20 staff',
            );

            expect(result.grounded).toBe(false);
            expect(result.score).toBe(0.3);
            expect(result.claims).toContain('GYM has 500 members');
        });

        it('handles malformed JSON response gracefully', async () => {
            mockLLMProvider.analyze.mockResolvedValue({
                summary: 'Not valid JSON at all',
                confidence: 'medium',
                reasoning: 'Could not parse',
            });

            const result = await service.check('facts', 'response');

            expect(result.grounded).toBe(false);
            expect(result.score).toBe(0.6); // medium confidence fallback
        });

        it('returns safe default when LLM call fails', async () => {
            mockLLMProvider.analyze.mockRejectedValue(new Error('API error'));

            const result = await service.check('facts', 'response');

            expect(result.grounded).toBe(false);
            expect(result.score).toBe(0);
            expect(result.reason).toBe('Grounding verification failed');
        });
    });

    describe('isGrounded', () => {
        it('returns true when grounded with high score', async () => {
            mockLLMProvider.analyze.mockResolvedValue({
                summary: '{"grounded": true, "score": 0.9, "reason": "Verified"}',
                confidence: 'high',
            });

            const isGrounded = await service.isGrounded('facts', 'response');

            expect(isGrounded).toBe(true);
        });

        it('returns false when grounded but below threshold', async () => {
            mockLLMProvider.analyze.mockResolvedValue({
                summary: '{"grounded": true, "score": 0.6, "reason": "Partial match"}',
                confidence: 'medium',
            });

            const isGrounded = await service.isGrounded('facts', 'response', 0.8);

            expect(isGrounded).toBe(false);
        });

        it('respects custom threshold', async () => {
            mockLLMProvider.analyze.mockResolvedValue({
                summary: '{"grounded": true, "score": 0.7, "reason": "Good match"}',
                confidence: 'medium',
            });

            const isGrounded = await service.isGrounded('facts', 'response', 0.6);

            expect(isGrounded).toBe(true);
        });
    });
});
