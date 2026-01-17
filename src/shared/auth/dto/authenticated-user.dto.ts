/**
 * @fileoverview Authenticated User DTO
 *
 * Normalized user object attached to authenticated requests.
 * Provides a consistent interface for RBAC and tenant isolation.
 */

import { TenantType } from '../interfaces';

/**
 * Authenticated user context attached to requests after JWT validation.
 *
 * @remarks
 * This DTO is populated by JwtStrategy.validate() and available
 * via `@Request() req.user` in controllers.
 */
export class AuthenticatedUserDto {
    /** Unique user identifier (from JWT sub claim) */
    userId: string;

    /** Array of role names for RBAC (from Cognito groups or Auth0 roles) */
    roles: string[];

    /** Tenant identifier for data isolation */
    tenantId: string;

    /** Tenant type for access control logic */
    tenantType: TenantType;
}
