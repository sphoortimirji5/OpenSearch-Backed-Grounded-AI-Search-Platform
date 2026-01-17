/**
 * @fileoverview Role-Based Access Control (RBAC) Guard
 *
 * NestJS guard that enforces role requirements on controller endpoints.
 * Works with the @Roles() decorator to restrict access based on user roles.
 *
 * @remarks
 * Usage pattern:
 * 1. Decorate controller/handler with @Roles('required_role')
 * 2. Apply RolesGuard (typically via APP_GUARD or @UseGuards)
 * 3. Guard checks if authenticated user has any required role
 *
 * @example
 * ```typescript
 * @Roles('compliance_lead')
 * @UseGuards(AuthGuard('jwt'), RolesGuard)
 * async sensitiveEndpoint() { ... }
 * ```
 */

import { Injectable, CanActivate, ExecutionContext, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthenticatedUser } from './jwt.strategy';

/* -------------------------------------------------------------------------- */
/*                              Decorator & Metadata                           */
/* -------------------------------------------------------------------------- */

/** Metadata key for storing required roles */
export const ROLES_KEY = 'roles';

/**
 * Decorator to specify required roles for a controller or handler.
 *
 * @param roles - One or more role names required for access
 * @returns Method/class decorator that sets role metadata
 *
 * @example
 * ```typescript
 * @Roles('auditor', 'compliance_lead')
 * @Get('protected')
 * async protectedRoute() { ... }
 * ```
 */
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);

/* -------------------------------------------------------------------------- */
/*                              Guard Implementation                           */
/* -------------------------------------------------------------------------- */

@Injectable()
export class RolesGuard implements CanActivate {
    constructor(private reflector: Reflector) { }

    /**
     * Determines if the current user has permission to access the route.
     *
     * @param context - Execution context containing request and metadata
     * @returns True if access is allowed, false otherwise
     *
     * @remarks
     * Authorization logic:
     * 1. If no @Roles() decorator is present, endpoint is public (return true)
     * 2. If user is not authenticated, deny access
     * 3. If user has ANY of the required roles, grant access
     *
     * The guard uses reflector to check both handler-level and class-level
     * role requirements, with handler taking precedence.
     */
    canActivate(context: ExecutionContext): boolean {
        const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
            context.getHandler(),
            context.getClass(),
        ]);

        // No roles specified = public endpoint
        if (!requiredRoles || requiredRoles.length === 0) {
            return true;
        }

        const request = context.switchToHttp().getRequest();
        const user: AuthenticatedUser = request.user;

        // No authenticated user = deny
        if (!user || !user.roles) {
            return false;
        }

        // Allow if user has ANY required role
        return requiredRoles.some((role) => user.roles.includes(role));
    }
}
