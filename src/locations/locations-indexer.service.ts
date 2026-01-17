/**
 * @fileoverview Locations Indexer Service
 *
 * Transforms and indexes location data from PostgreSQL to OpenSearch.
 */

import { Injectable, Logger } from '@nestjs/common';
import { OpenSearchProvider } from '../shared/opensearch';
import { LocationsRepository, LocationScanPage } from './locations.repository';
import { Location, LocationIndexDocument } from './interfaces';
import { Counter } from 'prom-client';

const indexCounter = new Counter({
    name: 'locations_index_operations_total',
    help: 'Total number of location index operations',
    labelNames: ['status'],
});

const reindexCounter = new Counter({
    name: 'locations_reindex_total',
    help: 'Total number of location reindex operations',
    labelNames: ['status'],
});

export interface LocationsReindexResult {
    total: number;
    success: number;
    failed: number;
    durationMs: number;
}

@Injectable()
export class LocationsIndexerService {
    private readonly logger = new Logger(LocationsIndexerService.name);
    private readonly INDEX_NAME = 'locations';

    constructor(
        private opensearchProvider: OpenSearchProvider,
        private locationsRepository: LocationsRepository,
    ) { }

    /**
     * Transforms a location record to flattened index document.
     */
    private transformForIndex(location: Location): LocationIndexDocument {
        const latestEvent = location.status_events?.[0];

        return {
            location_id: location.location_id,
            name: location.metadata.name,
            region: location.metadata.region,
            market_segment: location.metadata.market_segment,
            coordinator_id: location.staffing.coordinator_id,
            coordinator_name: location.staffing.coordinator_name,
            coordinator_tenure_days: location.staffing.coordinator_tenure_days,
            last_manager_change_date: location.staffing.last_manager_change_date,
            org_path: location.staffing.org_path,
            rate_model: location.contract_logic.rate_model,
            base_rate: location.contract_logic.base_rate,
            conversion_bonus_enabled: location.contract_logic.conversion_bonus_enabled,
            initial_participant_bonus: location.contract_logic.initial_participant_bonus,
            is_24_7: location.operational_rules.is_24_7,
            max_capacity: location.operational_rules.max_capacity,
            guest_policy: location.operational_rules.guest_policy,
            latest_event: latestEvent?.event,
            latest_event_date: latestEvent?.date,
            latest_event_detail: latestEvent?.detail,
        };
    }

    /**
     * Indexes a single location.
     */
    async indexLocation(location: Location): Promise<void> {
        try {
            const client = this.opensearchProvider.getClient();
            const doc = this.transformForIndex(location);

            await client.index({
                index: this.INDEX_NAME,
                id: location.location_id,
                body: doc,
                refresh: true,
            });

            indexCounter.inc({ status: 'success' });
            this.logger.log({ msg: 'Location indexed', location_id: location.location_id });
        } catch (error) {
            indexCounter.inc({ status: 'error' });
            this.logger.error({ msg: 'Location indexing failed', location_id: location.location_id, error });
            throw error;
        }
    }

    /**
     * Bulk indexes multiple locations.
     */
    async bulkIndex(locations: Location[]): Promise<{ success: number; failed: number }> {
        const client = this.opensearchProvider.getClient();
        let success = 0;
        let failed = 0;

        const operations = locations.flatMap((location) => {
            const doc = this.transformForIndex(location);
            return [
                { index: { _index: this.INDEX_NAME, _id: location.location_id } },
                doc,
            ];
        });

        try {
            const response = await client.bulk({ body: operations, refresh: true });

            if (response.body.errors) {
                response.body.items.forEach((item: { index?: { error?: unknown } }) => {
                    if (item.index?.error) {
                        failed++;
                        indexCounter.inc({ status: 'error' });
                    } else {
                        success++;
                        indexCounter.inc({ status: 'success' });
                    }
                });
            } else {
                success = locations.length;
                indexCounter.inc({ status: 'success' }, success);
            }

            this.logger.log({ msg: 'Bulk index completed', success, failed });
        } catch (error) {
            failed = locations.length;
            indexCounter.inc({ status: 'error' }, locations.length);
            this.logger.error({ msg: 'Bulk index failed', error });
            throw error;
        }

        return { success, failed };
    }

    /**
     * Full reindex of all locations from PostgreSQL.
     */
    async reindexAll(batchSize = 100): Promise<LocationsReindexResult> {
        const startTime = Date.now();
        let total = 0;
        let success = 0;
        let failed = 0;
        let offset = 0;

        this.logger.log({ msg: 'Starting locations reindex', batchSize });

        try {
            let page: LocationScanPage;
            do {
                page = await this.locationsRepository.scanPage(batchSize, offset);
                total += page.items.length;

                const result = await this.bulkIndex(page.items);
                success += result.success;
                failed += result.failed;

                this.logger.log({
                    msg: 'Reindex batch completed',
                    batchSize: page.items.length,
                    totalProcessed: total,
                    hasMore: page.hasMore,
                });

                offset += batchSize;
            } while (page.hasMore);

            const durationMs = Date.now() - startTime;
            reindexCounter.inc({ status: 'success' });

            this.logger.log({ msg: 'Locations reindex completed', total, success, failed, durationMs });
            return { total, success, failed, durationMs };
        } catch (error) {
            reindexCounter.inc({ status: 'error' });
            this.logger.error({ msg: 'Locations reindex failed', error, processed: total });
            throw error;
        }
    }
}
