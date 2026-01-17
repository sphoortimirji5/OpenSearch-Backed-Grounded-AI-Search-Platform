/**
 * @fileoverview Locations Repository
 *
 * Data access layer for locations from PostgreSQL via TypeORM.
 */

import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LocationEntity } from './entities';
import { Location } from './interfaces';

/**
 * Pagination result for batch operations.
 */
export interface LocationScanPage {
    items: Location[];
    total: number;
    hasMore: boolean;
}

@Injectable()
export class LocationsRepository {
    private readonly logger = new Logger(LocationsRepository.name);

    constructor(
        @InjectRepository(LocationEntity)
        private readonly locationRepo: Repository<LocationEntity>,
    ) { }

    /**
     * Retrieves a location by ID.
     */
    async findById(locationId: string): Promise<Location | null> {
        const entity = await this.locationRepo.findOne({
            where: { location_id: locationId },
        });
        return entity || null;
    }

    /**
     * Retrieves all locations up to limit.
     */
    async findAll(limit = 100): Promise<Location[]> {
        return this.locationRepo.find({ take: limit });
    }

    /**
     * Paginated scan for batch indexing.
     */
    async scanPage(pageSize = 100, offset = 0): Promise<LocationScanPage> {
        const [items, total] = await this.locationRepo.findAndCount({
            take: pageSize,
            skip: offset,
            order: { location_id: 'ASC' },
        });

        return {
            items,
            total,
            hasMore: offset + items.length < total,
        };
    }

    /**
     * Counts total locations.
     */
    async count(): Promise<number> {
        return this.locationRepo.count();
    }

    /**
     * Saves a location (upsert).
     */
    async save(location: Location): Promise<void> {
        await this.locationRepo.save(location as LocationEntity);
    }
}
