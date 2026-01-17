/**
 * @fileoverview Full Stack E2E Test
 *
 * End-to-end test that validates the complete flow:
 * 1. Fetch member data from membership search
 * 2. Fetch location data from locations search
 * 3. Use agent to analyze both and derive insights
 *
 * Requires: Docker (OpenSearch, DynamoDB, PostgreSQL) + seeded data + GEMINI_API_KEY
 */

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import * as jwt from 'jsonwebtoken';
import { AppModule } from '../../src/app.module';

describe('Full Stack E2E Test: Members → Locations → Agent', () => {
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
    const complianceToken = generateToken('compliance_lead');

    beforeAll(async () => {
        const moduleFixture: TestingModule = await Test.createTestingModule({
            imports: [AppModule],
        }).compile();

        app = moduleFixture.createNestApplication();
        await app.init();
    }, 30000);

    afterAll(async () => {
        await app.close();
    });

    describe('Step 1: Fetch Member Data', () => {
        it('should retrieve members from OpenSearch', async () => {
            const response = await request(app.getHttpServer())
                .get('/members/search?q=*&limit=10')
                .set('Authorization', `Bearer ${auditorToken}`)
                .expect(200);

            expect(Array.isArray(response.body)).toBe(true);
            console.log(`[Members] Retrieved ${response.body.length} members`);

            // Store for later assertions
            if (response.body.length > 0) {
                const sample = response.body[0];
                expect(sample).toHaveProperty('member_id');
            }
        });

        it('should support fuzzy search on member names', async () => {
            const response = await request(app.getHttpServer())
                .get('/members/search?q=John&fuzzy=true')
                .set('Authorization', `Bearer ${auditorToken}`)
                .expect(200);

            expect(Array.isArray(response.body)).toBe(true);
        });
    });

    describe('Step 2: Fetch Location Data', () => {
        it('should retrieve locations from OpenSearch', async () => {
            const response = await request(app.getHttpServer())
                .get('/locations/search?limit=10')
                .set('Authorization', `Bearer ${auditorToken}`)
                .expect(200);

            expect(Array.isArray(response.body)).toBe(true);
            console.log(`[Locations] Retrieved ${response.body.length} locations`);

            if (response.body.length > 0) {
                const sample = response.body[0];
                expect(sample).toHaveProperty('location_id');
                expect(sample).toHaveProperty('region');
                expect(sample).toHaveProperty('rate_model');
            }
        });

        it('should filter locations by region', async () => {
            const response = await request(app.getHttpServer())
                .get('/locations/search?region=Southeast')
                .set('Authorization', `Bearer ${auditorToken}`)
                .expect(200);

            expect(Array.isArray(response.body)).toBe(true);
            response.body.forEach((loc: { region: string }) => {
                expect(loc.region).toBe('Southeast');
            });
        });

        it('should filter locations by rate model', async () => {
            const response = await request(app.getHttpServer())
                .get('/locations/search?rate_model=per_participant')
                .set('Authorization', `Bearer ${auditorToken}`)
                .expect(200);

            expect(Array.isArray(response.body)).toBe(true);
        });
    });

    describe('Step 3: Agent Analysis (LLM Inference)', () => {
        it('should analyze member and location data together', async () => {
            const response = await request(app.getHttpServer())
                .post('/agent/analyze')
                .set('Authorization', `Bearer ${complianceToken}`)
                .send({
                    question: 'What patterns do you see in member enrollment across different locations?',
                    limit: 50,
                })
                .expect(201);

            // Validate response structure
            expect(response.body).toHaveProperty('question');
            expect(response.body).toHaveProperty('summary');
            expect(response.body).toHaveProperty('confidence');
            expect(response.body).toHaveProperty('dataPoints');
            expect(response.body).toHaveProperty('provider');
            expect(response.body).toHaveProperty('generatedAt');

            // Validate data points
            expect(response.body.dataPoints).toHaveProperty('membersAnalyzed');
            expect(response.body.dataPoints).toHaveProperty('locationsAnalyzed');
            expect(typeof response.body.dataPoints.membersAnalyzed).toBe('number');
            expect(typeof response.body.dataPoints.locationsAnalyzed).toBe('number');

            // Validate confidence is valid enum
            expect(['high', 'medium', 'low']).toContain(response.body.confidence);

            console.log(`[Agent] Question: ${response.body.question}`);
            console.log(`[Agent] Summary: ${response.body.summary}`);
            console.log(`[Agent] Confidence: ${response.body.confidence}`);
            console.log(`[Agent] Provider: ${response.body.provider}`);
            console.log(`[Agent] Data: ${response.body.dataPoints.membersAnalyzed} members, ${response.body.dataPoints.locationsAnalyzed} locations`);
        }, 60000); // LLM calls may take time

        it('should analyze location-specific questions', async () => {
            const response = await request(app.getHttpServer())
                .post('/agent/analyze')
                .set('Authorization', `Bearer ${auditorToken}`)
                .send({
                    question: 'Which locations have the highest member conversion rates and why?',
                })
                .expect(201);

            expect(response.body.summary).toBeDefined();
            expect(response.body.summary.length).toBeGreaterThan(10);
        }, 60000);

        it('should analyze rate model performance', async () => {
            const response = await request(app.getHttpServer())
                .post('/agent/analyze')
                .set('Authorization', `Bearer ${complianceToken}`)
                .send({
                    question: 'Compare performance of per_participant vs standard rate models',
                })
                .expect(201);

            expect(response.body.dataPoints.locationsAnalyzed).toBeGreaterThanOrEqual(0);
        }, 60000);
    });

    describe('Full Flow: Search + Analyze', () => {
        it('should complete full workflow: search members, search locations, analyze', async () => {
            // Step 1: Get members
            const membersRes = await request(app.getHttpServer())
                .get('/members/search?q=*&limit=20')
                .set('Authorization', `Bearer ${auditorToken}`)
                .expect(200);

            const memberCount = membersRes.body.length;

            // Step 2: Get locations
            const locationsRes = await request(app.getHttpServer())
                .get('/locations/search?limit=10')
                .set('Authorization', `Bearer ${auditorToken}`)
                .expect(200);

            const locationCount = locationsRes.body.length;

            // Step 3: Analyze with agent
            const analysisRes = await request(app.getHttpServer())
                .post('/agent/analyze')
                .set('Authorization', `Bearer ${complianceToken}`)
                .send({
                    question: 'Summarize the current state of member enrollment and location performance',
                    limit: 20,
                })
                .expect(201);

            // Validate the flow
            console.log('\n=== Full Workflow Results ===');
            console.log(`Members found: ${memberCount}`);
            console.log(`Locations found: ${locationCount}`);
            console.log(`Agent analyzed: ${analysisRes.body.dataPoints.membersAnalyzed} members, ${analysisRes.body.dataPoints.locationsAnalyzed} locations`);
            console.log(`Insight: ${analysisRes.body.summary.substring(0, 200)}...`);
            console.log(`Confidence: ${analysisRes.body.confidence}`);
            console.log('=============================\n');

            expect(analysisRes.body.summary).toBeDefined();
        }, 90000);
    });
});
