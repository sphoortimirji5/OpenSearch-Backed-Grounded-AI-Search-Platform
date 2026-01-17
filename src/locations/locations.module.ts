/**
 * @fileoverview Locations Module
 *
 * Self-contained vertical for location data from PostgreSQL.
 */

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SharedOpenSearchModule } from '../shared/opensearch';
import { LocationEntity } from './entities';
import { LocationsRepository } from './locations.repository';
import { LocationsIndexerService } from './locations-indexer.service';
import { LocationsIndexerController } from './locations-indexer.controller';
import { LocationsSearchService } from './locations-search.service';
import { LocationsSearchController } from './locations-search.controller';

@Module({
    imports: [
        TypeOrmModule.forFeature([LocationEntity]),
        SharedOpenSearchModule,
    ],
    controllers: [LocationsIndexerController, LocationsSearchController],
    providers: [
        LocationsRepository,
        LocationsIndexerService,
        LocationsSearchService,
    ],
    exports: [LocationsRepository, LocationsSearchService],
})
export class LocationsModule { }
