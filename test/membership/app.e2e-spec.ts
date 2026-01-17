import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import type { Response } from 'supertest';
import * as jwt from 'jsonwebtoken';
import { AppModule } from '../../src/app.module';

describe('MemberSearch E2E Tests', () => {
    let app: INestApplication;

    const JWT_SECRET = 'local-dev-secret-do-not-use-in-prod';
    const JWT_ISSUER = 'http://localhost:3000';

    /**
     * Generates a test JWT with multi-tenant claims.
     */
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
    const complianceToken = generateToken('compliance_lead');
    const adminToken = generateToken('admin');
    const externalAdminToken = generateToken('admin', 'external', 'loc-test-001');

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

    describe('Authentication', () => {
        it('GET /search - should return 401 without JWT', () => {
            return request(app.getHttpServer())
                .get('/members/search?q=test')
                .expect(401);
        });

        it('GET /search - should return 401 with invalid JWT', () => {
            return request(app.getHttpServer())
                .get('/members/search?q=test')
                .set('Authorization', 'Bearer invalid-token')
                .expect(401);
        });

        it('GET /search - should accept valid auditor JWT', () => {
            return request(app.getHttpServer())
                .get('/members/search?q=test')
                .set('Authorization', `Bearer ${auditorToken}`)
                .expect((res: Response) => {
                    // May return 200 or 500 depending on OpenSearch availability
                    // But should NOT return 401
                    expect(res.status).not.toBe(401);
                });
        });

        it('GET /search - should accept valid compliance JWT', () => {
            return request(app.getHttpServer())
                .get('/members/search?q=test')
                .set('Authorization', `Bearer ${complianceToken}`)
                .expect((res: Response) => {
                    expect(res.status).not.toBe(401);
                });
        });

        it('GET /search - should accept external admin JWT', () => {
            return request(app.getHttpServer())
                .get('/members/search?q=test')
                .set('Authorization', `Bearer ${externalAdminToken}`)
                .expect((res: Response) => {
                    expect(res.status).not.toBe(401);
                });
        });
    });

    describe('Admin Reindex Endpoint', () => {
        it('POST /admin/reindex - should return 401 without JWT', () => {
            return request(app.getHttpServer())
                .post('/admin/reindex')
                .expect(401);
        });

        it('POST /admin/reindex - should return 403 for non-admin role', () => {
            return request(app.getHttpServer())
                .post('/admin/reindex')
                .set('Authorization', `Bearer ${auditorToken}`)
                .expect(403);
        });

        it('POST /admin/reindex - should accept admin JWT', () => {
            return request(app.getHttpServer())
                .post('/admin/reindex')
                .set('Authorization', `Bearer ${adminToken}`)
                .expect((res: Response) => {
                    // May return 200 or 500 depending on DynamoDB/OpenSearch availability
                    // But should NOT return 401 or 403
                    expect([401, 403]).not.toContain(res.status);
                });
        });
    });

    describe('Health Endpoint', () => {
        it('GET /search/health - should return health status without auth', () => {
            return request(app.getHttpServer())
                .get('/members/search/health')
                .expect(200)
                .expect((res: Response) => {
                    expect(res.body).toHaveProperty('status', 'ok');
                });
        });
    });

    describe('Metrics Endpoint', () => {
        it('GET /metrics - should return Prometheus metrics', () => {
            return request(app.getHttpServer())
                .get('/metrics')
                .expect(200)
                .expect((res: Response) => {
                    expect(res.text).toContain('process_cpu');
                    expect(res.text).toContain('nodejs_heap');
                });
        });
    });
});
