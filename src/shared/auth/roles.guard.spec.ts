/**
 * @fileoverview RolesGuard Unit Tests
 *
 * Tests for role-based access control guard with multi-tenant support.
 */

import { RolesGuard, ROLES_KEY } from './roles.guard';
import { Reflector } from '@nestjs/core';
import { ExecutionContext } from '@nestjs/common';
import { AuthenticatedUser, TenantType } from './jwt.strategy';

describe('RolesGuard', () => {
    let guard: RolesGuard;
    let reflector: Reflector;

    beforeEach(() => {
        reflector = new Reflector();
        guard = new RolesGuard(reflector);
    });

    /**
     * Creates a mock ExecutionContext with the specified user.
     */
    const createMockContext = (user: AuthenticatedUser | null): ExecutionContext => ({
        getHandler: jest.fn(),
        getClass: jest.fn(),
        switchToHttp: () => ({
            getRequest: () => ({ user }),
            getResponse: jest.fn(),
            getNext: jest.fn(),
        }),
        getType: jest.fn(),
        getArgs: jest.fn(),
        getArgByIndex: jest.fn(),
        switchToRpc: jest.fn(),
        switchToWs: jest.fn(),
    } as unknown as ExecutionContext);

    /**
     * Creates a mock user with the specified properties.
     */
    const createUser = (
        roles: string[],
        tenantType: TenantType = 'internal',
        tenantId = 'rcm-internal',
    ): AuthenticatedUser => ({
        userId: 'test-user',
        roles,
        tenantType,
        tenantId,
    });

    describe('Role Authorization', () => {
        it('should allow access when no roles are required', () => {
            jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);
            const context = createMockContext(createUser(['auditor']));

            expect(guard.canActivate(context)).toBe(true);
        });

        it('should allow access when user has required role', () => {
            jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['auditor']);
            const context = createMockContext(createUser(['auditor']));

            expect(guard.canActivate(context)).toBe(true);
        });

        it('should deny access when user lacks required role', () => {
            jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['compliance_lead']);
            const context = createMockContext(createUser(['auditor']));

            expect(guard.canActivate(context)).toBe(false);
        });

        it('should deny access when no user is present', () => {
            jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['auditor']);
            const context = createMockContext(null);

            expect(guard.canActivate(context)).toBe(false);
        });

        it('should allow access with any matching role', () => {
            jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['auditor', 'compliance_lead']);
            const context = createMockContext(createUser(['compliance_lead']));

            expect(guard.canActivate(context)).toBe(true);
        });
    });

    describe('Admin Role', () => {
        it('should allow admin access to admin-only endpoints', () => {
            jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['admin']);
            const context = createMockContext(createUser(['admin']));

            expect(guard.canActivate(context)).toBe(true);
        });

        it('should deny non-admin access to admin-only endpoints', () => {
            jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['admin']);
            const context = createMockContext(createUser(['auditor', 'compliance_lead']));

            expect(guard.canActivate(context)).toBe(false);
        });
    });

    describe('Multi-Tenant Users', () => {
        it('should allow internal user with correct role', () => {
            jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['auditor']);
            const context = createMockContext(createUser(['auditor'], 'internal', 'rcm-internal'));

            expect(guard.canActivate(context)).toBe(true);
        });

        it('should allow external admin with admin role', () => {
            jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['admin']);
            const context = createMockContext(createUser(['admin'], 'external', 'loc-test-001'));

            expect(guard.canActivate(context)).toBe(true);
        });

        it('should deny external user without required role', () => {
            jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['compliance_lead']);
            const context = createMockContext(createUser(['admin'], 'external', 'loc-test-001'));

            expect(guard.canActivate(context)).toBe(false);
        });
    });
});
