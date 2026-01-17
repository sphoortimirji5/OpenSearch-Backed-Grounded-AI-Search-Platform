/**
 * @fileoverview Locations Indexer Service Tests
 */

import { LocationsIndexerService } from './locations-indexer.service';

describe('LocationsIndexerService', () => {
    let service: LocationsIndexerService;
    let mockOpenSearchProvider: any;
    let mockLocationsRepository: any;

    const mockLocation = {
        location_id: 'GYM_101',
        metadata: {
            name: 'Downtown Fitness',
            region: 'Southeast',
            market_segment: 'Premium',
        },
        staffing: {
            coordinator_id: 'STF_99',
            coordinator_name: 'Jane Smith',
            coordinator_tenure_days: 45,
            last_manager_change_date: '2023-11-15T00:00:00Z',
            org_path: '/corporate/southeast/florida/gym_101',
        },
        contract_logic: {
            rate_model: 'per_participant' as const,
            base_rate: 15.50,
            conversion_bonus_enabled: true,
            initial_participant_bonus: 500.00,
        },
        operational_rules: {
            opening_hour: '06:00',
            closing_hour: '22:00',
            is_24_7: false,
            max_capacity: 300,
            guest_policy: 'Restricted',
        },
        status_events: [
            {
                date: '2023-11-15',
                event: 'COORDINATOR_ASSIGNED',
                detail: 'Jane Smith replaced Mark Evans',
            },
        ],
    };

    beforeEach(() => {
        mockOpenSearchProvider = {
            getClient: jest.fn().mockReturnValue({
                index: jest.fn().mockResolvedValue({ body: {} }),
                bulk: jest.fn().mockResolvedValue({ body: { errors: false, items: [] } }),
            }),
        };

        mockLocationsRepository = {
            scanPage: jest.fn().mockResolvedValue({
                items: [mockLocation],
                total: 1,
                hasMore: false,
            }),
        };

        service = new LocationsIndexerService(
            mockOpenSearchProvider,
            mockLocationsRepository,
        );
    });

    describe('indexLocation', () => {
        it('should index a single location', async () => {
            await service.indexLocation(mockLocation);

            const client = mockOpenSearchProvider.getClient();
            expect(client.index).toHaveBeenCalledWith(
                expect.objectContaining({
                    index: 'locations',
                    id: 'GYM_101',
                    body: expect.objectContaining({
                        location_id: 'GYM_101',
                        name: 'Downtown Fitness',
                        region: 'Southeast',
                        rate_model: 'per_participant',
                    }),
                }),
            );
        });

        it('should flatten nested data', async () => {
            await service.indexLocation(mockLocation);

            const client = mockOpenSearchProvider.getClient();
            const indexCall = client.index.mock.calls[0][0];

            expect(indexCall.body.coordinator_name).toBe('Jane Smith');
            expect(indexCall.body.base_rate).toBe(15.50);
            expect(indexCall.body.is_24_7).toBe(false);
        });

        it('should include latest event', async () => {
            await service.indexLocation(mockLocation);

            const client = mockOpenSearchProvider.getClient();
            const indexCall = client.index.mock.calls[0][0];

            expect(indexCall.body.latest_event).toBe('COORDINATOR_ASSIGNED');
            expect(indexCall.body.latest_event_date).toBe('2023-11-15');
        });
    });

    describe('bulkIndex', () => {
        it('should bulk index multiple locations', async () => {
            const result = await service.bulkIndex([mockLocation, mockLocation]);

            expect(result.success).toBe(2);
            expect(result.failed).toBe(0);
        });
    });

    describe('reindexAll', () => {
        it('should reindex all locations from repository', async () => {
            const result = await service.reindexAll(100);

            expect(result.total).toBe(1);
            expect(result.success).toBe(1);
            expect(result.failed).toBe(0);
            expect(result.durationMs).toBeDefined();
        });
    });
});
