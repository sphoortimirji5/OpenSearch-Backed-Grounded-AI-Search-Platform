/**
 * @fileoverview JWT Authentication Strategy
 *
 * Passport.js JWT strategy for validating Bearer tokens and extracting user identity.
 * Supports multi-tenant architecture with both internal RCM users and external locations.
 *
 * @remarks
 * **Provider Agnostic**: Works with both AWS Cognito and Auth0.
 * - Cognito uses flat claims: `tenant_id`, `cognito:groups`
 * - Auth0 uses namespaced claims: `https://membersearch/tenant_id`
 *
 * Token flow:
 * 1. Client sends Bearer token in Authorization header
 * 2. Passport extracts and validates the JWT
 * 3. validate() transforms the payload into AuthenticatedUser
 * 4. User object is attached to request for downstream handlers
 */

import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { JwtPayload, TenantType } from './interfaces';
import { AuthenticatedUserDto } from './dto';

/* -------------------------------------------------------------------------- */
/*                              Re-exports for Convenience                     */
/* -------------------------------------------------------------------------- */

export { TenantType, JwtPayload } from './interfaces';
export { AuthenticatedUserDto } from './dto';

/**
 * Alias for backward compatibility
 */
export type AuthenticatedUser = AuthenticatedUserDto;

/* -------------------------------------------------------------------------- */
/*                              Strategy Implementation                        */
/* -------------------------------------------------------------------------- */

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
    /**
     * Configures the JWT validation strategy.
     *
     * @param configService - NestJS config service for environment variables
     *
     * @remarks
     * Local development uses a symmetric secret for simplicity.
     * Production should use Cognito JWKS (RS256) for asymmetric validation.
     *
     * @example Production JWKS configuration
     * ```typescript
     * const jwksClient = jwks({ jwksUri: `${cognitoIssuer}/.well-known/jwks.json` });
     * secretOrKeyProvider: (req, rawJwtToken, done) => {
     *   const decoded = jwt.decode(rawJwtToken, { complete: true });
     *   jwksClient.getSigningKey(decoded.header.kid, (err, key) => {
     *     done(null, key.getPublicKey());
     *   });
     * }
     * ```
     */
    constructor(private configService: ConfigService) {
        const jwtSecret = configService.get<string>('JWT_SECRET');
        const isProduction = configService.get<string>('NODE_ENV') === 'production';

        // SECURITY: Fail fast in production if JWT_SECRET is not set
        if (isProduction && !jwtSecret) {
            throw new Error(
                'CRITICAL: JWT_SECRET must be set in production. ' +
                'Generate a strong secret: openssl rand -base64 64'
            );
        }

        super({
            jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
            ignoreExpiration: false,
            secretOrKey: jwtSecret || 'local-dev-secret-do-not-use-in-prod',
            issuer: configService.get<string>('JWT_ISSUER') ||
                'http://localhost:3000',
        });
    }

    /**
     * Validates and transforms the JWT payload into an AuthenticatedUser.
     *
     * @param payload - Decoded JWT claims
     * @returns Normalized user object for downstream handlers
     *
     * @remarks
     * Extracts tenant and role information from either Cognito or Auth0 claim formats.
     */
    validate(payload: JwtPayload): AuthenticatedUserDto {
        // Extract roles: Cognito groups or Auth0 namespaced roles
        const roles = payload['cognito:groups'] ||
            payload['https://membersearch/roles'] ||
            [];

        // Extract tenant ID: Cognito-style or Auth0 namespaced
        const tenantId = payload.tenant_id ||
            payload['https://membersearch/tenant_id'] ||
            'rcm-internal';

        // Extract tenant type: Cognito-style or Auth0 namespaced
        const tenantType: TenantType = payload.tenant_type ||
            payload['https://membersearch/tenant_type'] ||
            'internal';

        return {
            userId: payload.sub,
            roles,
            tenantId,
            tenantType,
        };
    }
}
