/**
 * @fileoverview JWT Payload Interface
 *
 * Defines the structure of JWT claims compatible with AWS Cognito and Auth0.
 */

/**
 * Tenant type discriminator for access control.
 * - `internal`: RCM staff with RBAC-controlled field access
 * - `external`: Location-specific admins with data isolation
 */
export type TenantType = 'internal' | 'external';

/**
 * JWT payload structure compatible with AWS Cognito and Auth0.
 *
 * @remarks
 * The strategy extracts claims from either:
 * - Cognito-style: `tenant_id`, `cognito:groups`
 * - Auth0-style: `https://membersearch/tenant_id`, `https://membersearch/roles`
 */
export interface JwtPayload {
    /** Subject claim - unique user identifier */
    sub: string;

    /** Cognito groups (used for RBAC) */
    'cognito:groups'?: string[];

    /** Custom tenant claims (Cognito-style) */
    tenant_id?: string;
    tenant_type?: TenantType;

    /** Auth0 namespaced claims (for portability) */
    'https://membersearch/tenant_id'?: string;
    'https://membersearch/tenant_type'?: TenantType;
    'https://membersearch/roles'?: string[];

    /** Standard JWT claims */
    iat?: number;
    exp?: number;
}
