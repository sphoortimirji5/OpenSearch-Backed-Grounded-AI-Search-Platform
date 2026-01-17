/**
 * @fileoverview Locations Search Service Tests
 */

import { LocationsSearchService } from './locations-search.service';

describe('LocationsSearchService', () => {
    let service: LocationsSearchService;
    let mockOpenSearchProvider: any;

    beforeEach(() => {
        mockOpenSearchProvider = {
            getClient: jest.fn().mockReturnValue({
                search: jest.fn().mockResolvedValue({
                    body: {
                        hits: {
                            hits: [
                                {
                                    _source: {
                                        location_id: 'GYM_101',
                                        name: 'Downtown Fitness',
                                        region: 'Southeast',
                                        rate_model: 'per_participant',
                                    },
                                },
                            ],
                        },
                    },
                }),
                get: jest.fn().mockResolvedValue({
                    body: {
                        _source: {
                            location_id: 'GYM_101',
                            name: 'Downtown Fitness',
                        },
                    },
                }),
            }),
        };

        service = new LocationsSearchService(mockOpenSearchProvider);
    });

    describe('search', () => {
        const mockUser = {
            userId: 'user1',
            roles: ['auditor'],
            tenantId: 'internal',
            tenantType: 'internal' as const,
        };

        it('should search locations', async () => {
            const results = await service.search({ q: 'Downtown' }, mockUser);
            expect(results).toHaveLength(1);
            expect(results[0].location_id).toBe('GYM_101');
        });

        it('should pass limit to OpenSearch', async () => {
            await service.search({ q: 'test', limit: 50 }, mockUser);
            const client = mockOpenSearchProvider.getClient();
            expect(client.search).toHaveBeenCalledWith(
                expect.objectContaining({
                    body: expect.objectContaining({
                        size: 50,
                    }),
                }),
            );
        });

        it('should apply tenant filter for external users', async () => {
            const externalUser = {
                userId: 'ext1',
                roles: ['admin'],
                tenantId: 'GYM_101',
                tenantType: 'external' as const,
            };

            await service.search({ q: 'test' }, externalUser);
            const client = mockOpenSearchProvider.getClient();
            const searchCall = client.search.mock.calls[0][0];

            expect(searchCall.body.query.bool.filter).toContainEqual({
                term: { location_id: 'GYM_101' },
            });
        });
    });

    describe('findById', () => {
        it('should return location by ID', async () => {
            const result = await service.findById('GYM_101');
            expect(result).toBeDefined();
            expect(result?.location_id).toBe('GYM_101');
        });

        it('should return null for not found', async () => {
            mockOpenSearchProvider.getClient().get.mockRejectedValue({ statusCode: 404 });
            const result = await service.findById('NONEXISTENT');
            expect(result).toBeNull();
        });
    });
});
