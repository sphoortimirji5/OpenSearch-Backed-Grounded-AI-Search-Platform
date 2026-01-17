/**
 * @fileoverview Location Interface
 *
 * TypeScript interface for location data from PostgreSQL.
 */

/**
 * Rate model types for contract logic.
 */
export type RateModel =
    | 'standard'
    | 'per_participant'
    | 'conversion_rate'
    | 'new_enrollee'
    | 'admin_enrollee';

/**
 * Location metadata.
 */
export interface LocationMetadata {
    name: string;
    region: string;
    market_segment: string;
}

/**
 * Staffing information for a location.
 */
export interface LocationStaffing {
    coordinator_id: string;
    coordinator_name: string;
    coordinator_tenure_days: number;
    last_manager_change_date: string;
    org_path: string;
}

/**
 * Contract and rate logic for a location.
 */
export interface LocationContractLogic {
    rate_model: RateModel;
    base_rate: number;
    conversion_bonus_enabled: boolean;
    initial_participant_bonus?: number;
    current_promo_code?: string;
}

/**
 * Operational rules for a location.
 */
export interface LocationOperationalRules {
    opening_hour: string;
    closing_hour: string;
    is_24_7: boolean;
    max_capacity: number;
    guest_policy: string;
}

/**
 * Status event for location timeline.
 */
export interface LocationStatusEvent {
    date: string;
    event: string;
    detail: string;
}

/**
 * Complete location record from PostgreSQL.
 */
export interface Location {
    location_id: string;
    metadata: LocationMetadata;
    staffing: LocationStaffing;
    contract_logic: LocationContractLogic;
    operational_rules: LocationOperationalRules;
    status_events: LocationStatusEvent[];
}
