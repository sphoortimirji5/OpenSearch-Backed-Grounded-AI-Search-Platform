/**
 * @fileoverview Location Entity
 *
 * TypeORM entity for PostgreSQL locations table.
 * Uses JSONB columns for nested structures.
 */

import { Entity, PrimaryColumn, Column } from 'typeorm';
import {
    LocationMetadata,
    LocationStaffing,
    LocationContractLogic,
    LocationOperationalRules,
    LocationStatusEvent,
} from '../interfaces';

@Entity('locations')
export class LocationEntity {
    @PrimaryColumn()
    location_id: string;

    @Column('jsonb')
    metadata: LocationMetadata;

    @Column('jsonb')
    staffing: LocationStaffing;

    @Column('jsonb')
    contract_logic: LocationContractLogic;

    @Column('jsonb')
    operational_rules: LocationOperationalRules;

    @Column('jsonb', { default: [] })
    status_events: LocationStatusEvent[];
}
