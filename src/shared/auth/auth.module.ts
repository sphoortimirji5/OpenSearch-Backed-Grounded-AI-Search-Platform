/**
 * @fileoverview Shared Auth Module
 *
 * JWT authentication and RBAC used by all verticals.
 */

import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { JwtStrategy } from './jwt.strategy';
import { RolesGuard } from './roles.guard';

@Module({
    imports: [PassportModule.register({ defaultStrategy: 'jwt' })],
    providers: [JwtStrategy, RolesGuard],
    exports: [PassportModule, RolesGuard],
})
export class SharedAuthModule { }
