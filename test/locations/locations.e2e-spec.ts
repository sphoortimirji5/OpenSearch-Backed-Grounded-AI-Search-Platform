/**
 * @fileoverview Locations E2E Tests
 *
 * Integration tests for the Locations vertical.
 * Requires Docker containers: OpenSearch, PostgreSQL.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import * as jwt from 'jsonwebtoken';
import { AppModule } from '../../src/app.module';

describe('Locations E2E Tests', () => {
    let app: INestApplication;

    const JWT_SECRET = 'local-dev-secret-do-not-use-in-prod';
    const JWT_ISSUER = 'http://localhost:3000';

    const generateToken = (
        role: string,
        tenantType: 'internal' | 'external' = 'internal',
        tenantId = 'rcm-internal',
    ): string => {
        return jwt.sign(
            {
                sub: `test-${role}`,
                'cognito:groups': [role],
                tenant_id: tenantId,
                tenant_type: tenantType,
            },
            JWT_SECRET,
            { issuer: JWT_ISSUER, expiresIn: '1h' }
        );
    };

    const auditorToken = generateToken('auditor');
    const adminToken = generateToken('admin');
    const externalAdminToken = generateToken('admin', 'external', 'GYM_101');

    beforeAll(async () => {
        const moduleFixture: TestingModule = await Test.createTestingModule({
            imports: [AppModule],
        }).compile();

        app = moduleFixture.createNestApplication();
        await app.init();
    });

    afterAll(async () => {
        await app.close();
    });

    describe('GET /locations', () => {
        it('should require authentication', async () => {
            await request(app.getHttpServer())
                .get('/locations/search')
                .expect(401);
        });

        it('should return locations for authenticated user', async () => {
            const response = await request(app.getHttpServer())
                .get('/locations/search')
                .set('Authorization', `Bearer ${auditorToken}`)
                .expect(200);

            expect(Array.isArray(response.body)).toBe(true);
        });

        it('should filter by region', async () => {
            const response = await request(app.getHttpServer())
                .get('/locations/search?region=Southeast')
                .set('Authorization', `Bearer ${auditorToken}`)
                .expect(200);

            expect(Array.isArray(response.body)).toBe(true);
        });

        it('should filter by rate_model', async () => {
            const response = await request(app.getHttpServer())
                .get('/locations/search?rate_model=per_participant')
                .set('Authorization', `Bearer ${auditorToken}`)
                .expect(200);

            expect(Array.isArray(response.body)).toBe(true);
        });

        it('should support fuzzy search', async () => {
            const response = await request(app.getHttpServer())
                .get('/locations/search?q=Downtown')
                .set('Authorization', `Bearer ${auditorToken}`)
                .expect(200);

            expect(Array.isArray(response.body)).toBe(true);
        });
    });

    describe('GET /locations/:id', () => {
        it('should return 404 for non-existent location', async () => {
            await request(app.getHttpServer())
                .get('/locations/search/NONEXISTENT_ID')
                .set('Authorization', `Bearer ${auditorToken}`)
                .expect(404);
        });
    });

    describe('POST /admin/locations/reindex', () => {
        it('should require admin role', async () => {
            await request(app.getHttpServer())
                .post('/admin/locations/reindex')
                .set('Authorization', `Bearer ${auditorToken}`)
                .expect(403);
        });

        it('should allow admin to trigger reindex', async () => {
            const response = await request(app.getHttpServer())
                .post('/admin/locations/reindex?batchSize=10')
                .set('Authorization', `Bearer ${adminToken}`)
                .expect(201);

            expect(response.body).toHaveProperty('total');
            expect(response.body).toHaveProperty('success');
            expect(response.body).toHaveProperty('durationMs');
        });
    });

    describe('External tenant isolation', () => {
        it('should filter locations for external users', async () => {
            const response = await request(app.getHttpServer())
                .get('/locations/search')
                .set('Authorization', `Bearer ${externalAdminToken}`)
                .expect(200);

            // External users should only see their own locations
            response.body.forEach((loc: { location_id: string }) => {
                expect(loc.location_id).toBe('GYM_101');
            });
        });
    });
});
