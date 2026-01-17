/**
 * @fileoverview Location Index Document
 *
 * Flattened structure for OpenSearch indexing.
 */

import { RateModel } from './location.interface';

/**
 * Denormalized location document for OpenSearch.
 */
export interface LocationIndexDocument {
    location_id: string;
    name: string;
    region: string;
    market_segment: string;
    coordinator_id: string;
    coordinator_name: string;
    coordinator_tenure_days: number;
    last_manager_change_date: string;
    org_path: string;
    rate_model: RateModel;
    base_rate: number;
    conversion_bonus_enabled: boolean;
    initial_participant_bonus?: number;
    is_24_7: boolean;
    max_capacity: number;
    guest_policy: string;
    latest_event?: string;
    latest_event_date?: string;
    latest_event_detail?: string;
}
