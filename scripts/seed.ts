/**
 * @fileoverview Local Development Seed Script
 *
 * Bootstraps the local development environment by:
 * 1. Creating a DynamoDB table for member records
 * 2. Seeding mock member data into DynamoDB
 * 3. Creating an OpenSearch index with appropriate mappings
 * 4. Indexing members into OpenSearch with PII redaction
 *
 * @remarks
 * This script is intended for LOCAL DEVELOPMENT ONLY. It uses dummy credentials
 * that are only valid for DynamoDB Local. Never run this against production.
 *
 * @example
 * ```bash
 * npm run seed
 * ```
 */

import { DynamoDBClient, CreateTableCommand, DescribeTableCommand } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { Client } from '@opensearch-project/opensearch';
import { Client as PgClient } from 'pg';

/* -------------------------------------------------------------------------- */
/*                              Configuration                                  */
/* -------------------------------------------------------------------------- */

/** DynamoDB Local endpoint. Override via DYNAMODB_ENDPOINT env var. */
const DYNAMODB_ENDPOINT = process.env.DYNAMODB_ENDPOINT || 'http://localhost:8000';

/** OpenSearch node URL. Override via OPENSEARCH_NODE env var. */
const OPENSEARCH_NODE = process.env.OPENSEARCH_NODE || 'http://localhost:9200';

/** AWS region for DynamoDB client. Override via AWS_REGION env var. */
const AWS_REGION = process.env.AWS_REGION || 'us-east-1';

/** PostgreSQL configuration for Locations */
const POSTGRES_HOST = process.env.POSTGRES_HOST || 'localhost';
const POSTGRES_PORT = parseInt(process.env.POSTGRES_PORT || '5433', 10);
const POSTGRES_USER = process.env.POSTGRES_USER || 'postgres';
const POSTGRES_PASSWORD = process.env.POSTGRES_PASSWORD || 'postgres';
const POSTGRES_DB = process.env.POSTGRES_DB || 'locations';

/* -------------------------------------------------------------------------- */
/*                              Client Setup                                   */
/* -------------------------------------------------------------------------- */

/**
 * DynamoDB client configured for local development.
 * Uses dummy credentials as DynamoDB Local doesn't validate them.
 */
const dynamoClient = new DynamoDBClient({
    region: AWS_REGION,
    endpoint: DYNAMODB_ENDPOINT,
    credentials: {
        accessKeyId: 'local',
        secretAccessKey: 'local',
    },
});

/** DynamoDB DocumentClient for high-level operations. */
const docClient = DynamoDBDocumentClient.from(dynamoClient);

/**
 * OpenSearch client with TLS verification disabled for local development.
 * @remarks Production deployments MUST enable certificate verification.
 */
const opensearchClient = new Client({ node: OPENSEARCH_NODE, ssl: { rejectUnauthorized: false } });

/* -------------------------------------------------------------------------- */
/*                              Mock Data                                      */
/* -------------------------------------------------------------------------- */

/**
 * Representative member records for local testing.
 *
 * @remarks
 * These records include intentional PII patterns (phone, email) in the
 * status_notes field to verify that redaction works correctly during indexing.
 */
const mockMembers = [
    {
        member_id: 'mem-001',
        email: 'john.doe@example.com',
        fname: 'John',
        lname: 'Doe',
        status_notes: 'Enrollment violation reported on 2024-01-15. Contact: 555-111-9999.',
        tags: ['tier1', 'active'],
        location_id: 'GYM_101',
        enrollment_date: '2024-01-01',
        monthly_visits: 12,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-15T00:00:00Z',
    },
    {
        member_id: 'mem-002',
        email: 'jane.smith@example.com',
        fname: 'Jane',
        lname: 'Smith',
        status_notes: 'Account in good standing. Contact: 555-123-4567',
        tags: ['tier2', 'active'],
        location_id: 'GYM_102',
        enrollment_date: '2024-01-02',
        monthly_visits: 18,
        created_at: '2024-01-02T00:00:00Z',
        updated_at: '2024-01-02T00:00:00Z',
    },
    {
        member_id: 'mem-003',
        email: 'bob.wilson@example.com',
        fname: 'Bob',
        lname: 'Wilson',
        status_notes: 'At-risk member. Multiple rule violations noted.',
        tags: ['tier1', 'at-risk'],
        location_id: 'GYM_103',
        enrollment_date: '2024-01-03',
        monthly_visits: 5,
        created_at: '2024-01-03T00:00:00Z',
        updated_at: '2024-01-10T00:00:00Z',
    },
    {
        member_id: 'mem-004',
        email: 'alice.johnson@example.com',
        fname: 'Alice',
        lname: 'Johnson',
        status_notes: 'Premium member since 2020. Email: alice.alt@personal.com',
        tags: ['premium', 'active'],
        location_id: 'GYM_104',
        enrollment_date: '2020-06-15',
        monthly_visits: 22,
        created_at: '2020-06-15T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
    },
    {
        member_id: 'mem-005',
        email: 'charlie.brown@example.com',
        fname: 'Charlie',
        lname: 'Brown',
        status_notes: 'Pending compliance review for enrollment discrepancy.',
        tags: ['tier2', 'pending-review'],
        location_id: 'GYM_105',
        enrollment_date: '2024-01-05',
        monthly_visits: 8,
        created_at: '2024-01-05T00:00:00Z',
        updated_at: '2024-01-12T00:00:00Z',
    },
    {
        member_id: 'mem-006',
        email: 'david.kim@example.com',
        fname: 'David',
        lname: 'Kim',
        status_notes: 'Top performer - 95% attendance rate.',
        tags: ['premium', 'active', 'high-performer'],
        location_id: 'GYM_108',
        enrollment_date: '2023-03-15',
        monthly_visits: 28,
        created_at: '2023-03-15T00:00:00Z',
        updated_at: '2025-12-01T00:00:00Z',
    },
    {
        member_id: 'mem-007',
        email: 'emily.chen@example.com',
        fname: 'Emily',
        lname: 'Chen',
        status_notes: 'New member - orientation completed.',
        tags: ['tier1', 'new'],
        location_id: 'GYM_104',
        enrollment_date: '2025-11-01',
        monthly_visits: 10,
        created_at: '2025-11-01T00:00:00Z',
        updated_at: '2025-12-10T00:00:00Z',
    },
    {
        member_id: 'mem-008',
        email: 'frank.miller@example.com',
        fname: 'Frank',
        lname: 'Miller',
        status_notes: 'Churned - cancelled membership after 3 months.',
        tags: ['tier2', 'churned'],
        location_id: 'GYM_107',
        enrollment_date: '2025-08-01',
        monthly_visits: 0,
        created_at: '2025-08-01T00:00:00Z',
        updated_at: '2025-11-01T00:00:00Z',
    },
    {
        member_id: 'mem-009',
        email: 'grace.lee@example.com',
        fname: 'Grace',
        lname: 'Lee',
        status_notes: 'VIP member - referred 5 new members.',
        tags: ['premium', 'active', 'referrer'],
        location_id: 'GYM_106',
        enrollment_date: '2022-01-15',
        monthly_visits: 20,
        created_at: '2022-01-15T00:00:00Z',
        updated_at: '2025-12-15T00:00:00Z',
    },
    {
        member_id: 'mem-010',
        email: 'henry.wang@example.com',
        fname: 'Henry',
        lname: 'Wang',
        status_notes: 'Corporate account member - Company: TechCorp Inc.',
        tags: ['corporate', 'active'],
        location_id: 'GYM_108',
        enrollment_date: '2024-06-01',
        monthly_visits: 15,
        created_at: '2024-06-01T00:00:00Z',
        updated_at: '2025-12-01T00:00:00Z',
    },
    {
        member_id: 'mem-011',
        email: 'irene.patel@example.com',
        fname: 'Irene',
        lname: 'Patel',
        status_notes: 'Personal training client - 2 sessions/week.',
        tags: ['premium', 'active', 'pt-client'],
        location_id: 'GYM_104',
        enrollment_date: '2023-09-01',
        monthly_visits: 16,
        created_at: '2023-09-01T00:00:00Z',
        updated_at: '2025-12-10T00:00:00Z',
    },
    {
        member_id: 'mem-012',
        email: 'jack.thompson@example.com',
        fname: 'Jack',
        lname: 'Thompson',
        status_notes: 'Weekend only member - discounted rate.',
        tags: ['tier1', 'active', 'weekend'],
        location_id: 'GYM_105',
        enrollment_date: '2024-02-01',
        monthly_visits: 8,
        created_at: '2024-02-01T00:00:00Z',
        updated_at: '2025-11-15T00:00:00Z',
    },
    {
        member_id: 'mem-013',
        email: 'kate.robinson@example.com',
        fname: 'Kate',
        lname: 'Robinson',
        status_notes: 'At-risk - missed last 2 billing cycles.',
        tags: ['tier2', 'at-risk', 'billing-issue'],
        location_id: 'GYM_101',
        enrollment_date: '2024-04-01',
        monthly_visits: 2,
        created_at: '2024-04-01T00:00:00Z',
        updated_at: '2025-12-01T00:00:00Z',
    },
    {
        member_id: 'mem-014',
        email: 'leo.garcia@example.com',
        fname: 'Leo',
        lname: 'Garcia',
        status_notes: 'Senior discount member - 65+ age group.',
        tags: ['tier1', 'active', 'senior'],
        location_id: 'GYM_102',
        enrollment_date: '2021-05-01',
        monthly_visits: 12,
        created_at: '2021-05-01T00:00:00Z',
        updated_at: '2025-12-05T00:00:00Z',
    },
    {
        member_id: 'mem-015',
        email: 'maria.santos@example.com',
        fname: 'Maria',
        lname: 'Santos',
        status_notes: 'Student member - university discount applied.',
        tags: ['tier1', 'active', 'student'],
        location_id: 'GYM_103',
        enrollment_date: '2025-09-01',
        monthly_visits: 14,
        created_at: '2025-09-01T00:00:00Z',
        updated_at: '2025-12-12T00:00:00Z',
    },
];

/* -------------------------------------------------------------------------- */
/*                              Locations Mock Data                            */
/* -------------------------------------------------------------------------- */

const mockLocations = [
    {
        location_id: 'GYM_101',
        metadata: { name: 'Downtown Fitness', region: 'Southeast', market_segment: 'Premium' },
        staffing: { coordinator_id: 'STF_99', coordinator_name: 'Jane Smith', coordinator_tenure_days: 45 },
        contract_logic: { rate_model: 'per_participant', base_rate: 15.50, conversion_bonus_enabled: true },
        operational_rules: { opening_hour: '06:00', closing_hour: '22:00', is_24_7: false, max_capacity: 300, utilization_rate: 0.72, monthly_revenue: 55000 },
        status_events: [{ date: '2024-01-15', event: 'COORDINATOR_ASSIGNED', detail: 'New coordinator' }],
    },
    {
        location_id: 'GYM_102',
        metadata: { name: 'Uptown Wellness', region: 'Northeast', market_segment: 'Standard' },
        staffing: { coordinator_id: 'STF_100', coordinator_name: 'John Doe', coordinator_tenure_days: 120 },
        contract_logic: { rate_model: 'standard', base_rate: 12.00, conversion_bonus_enabled: false },
        operational_rules: { opening_hour: '05:00', closing_hour: '23:00', is_24_7: false, max_capacity: 500, utilization_rate: 0.68, monthly_revenue: 62000 },
        status_events: [],
    },
    {
        location_id: 'GYM_103',
        metadata: { name: 'Coastal Health Club', region: 'Southeast', market_segment: 'Premium' },
        staffing: { coordinator_id: 'STF_101', coordinator_name: 'Sarah Wilson', coordinator_tenure_days: 200 },
        contract_logic: { rate_model: 'conversion_rate', base_rate: 20.00, conversion_bonus_enabled: true },
        operational_rules: { opening_hour: '00:00', closing_hour: '23:59', is_24_7: true, max_capacity: 400, utilization_rate: 0.81, monthly_revenue: 88000 },
        status_events: [{ date: '2024-02-01', event: 'RATE_CHANGE', detail: 'Upgraded to conversion rate' }],
    },
    {
        location_id: 'GYM_104',
        metadata: { name: 'Metro Elite Fitness', region: 'West', market_segment: 'Premium' },
        staffing: { coordinator_id: 'STF_102', coordinator_name: 'Michael Chen', coordinator_tenure_days: 365 },
        contract_logic: { rate_model: 'conversion_rate', base_rate: 25.00, conversion_bonus_enabled: true },
        operational_rules: { opening_hour: '00:00', closing_hour: '23:59', is_24_7: true, max_capacity: 800, utilization_rate: 0.85, monthly_revenue: 125000 },
        status_events: [{ date: '2025-12-01', event: 'PERFORMANCE_MILESTONE', detail: 'Exceeded revenue target by 15%' }],
    },
    {
        location_id: 'GYM_105',
        metadata: { name: 'Sunset Athletic Club', region: 'West', market_segment: 'Standard' },
        staffing: { coordinator_id: 'STF_103', coordinator_name: 'Lisa Park', coordinator_tenure_days: 180 },
        contract_logic: { rate_model: 'per_participant', base_rate: 12.00, conversion_bonus_enabled: false },
        operational_rules: { opening_hour: '05:00', closing_hour: '22:00', is_24_7: false, max_capacity: 400, utilization_rate: 0.65, monthly_revenue: 45000 },
        status_events: [{ date: '2025-11-15', event: 'COORDINATOR_ASSIGNED', detail: 'New coordinator onboarded' }],
    },
    {
        location_id: 'GYM_106',
        metadata: { name: 'Harbor Wellness Center', region: 'Northeast', market_segment: 'Premium' },
        staffing: { coordinator_id: 'STF_104', coordinator_name: 'Robert Johnson', coordinator_tenure_days: 450 },
        contract_logic: { rate_model: 'conversion_rate', base_rate: 22.50, conversion_bonus_enabled: true },
        operational_rules: { opening_hour: '04:00', closing_hour: '23:00', is_24_7: false, max_capacity: 600, utilization_rate: 0.78, monthly_revenue: 98000 },
        status_events: [{ date: '2025-10-01', event: 'RATE_CHANGE', detail: 'Upgraded to premium tier' }],
    },
    {
        location_id: 'GYM_107',
        metadata: { name: 'Valley Fitness Hub', region: 'Southeast', market_segment: 'Budget' },
        staffing: { coordinator_id: 'STF_105', coordinator_name: 'Amanda White', coordinator_tenure_days: 90 },
        contract_logic: { rate_model: 'standard', base_rate: 8.00, conversion_bonus_enabled: false },
        operational_rules: { opening_hour: '06:00', closing_hour: '21:00', is_24_7: false, max_capacity: 250, utilization_rate: 0.55, monthly_revenue: 22000 },
        status_events: [],
    },
    {
        location_id: 'GYM_108',
        metadata: { name: 'Mountain Peak Gym', region: 'West', market_segment: 'Premium' },
        staffing: { coordinator_id: 'STF_106', coordinator_name: 'David Kim', coordinator_tenure_days: 280 },
        contract_logic: { rate_model: 'conversion_rate', base_rate: 28.00, conversion_bonus_enabled: true },
        operational_rules: { opening_hour: '00:00', closing_hour: '23:59', is_24_7: true, max_capacity: 500, utilization_rate: 0.92, monthly_revenue: 145000 },
        status_events: [{ date: '2025-12-10', event: 'PERFORMANCE_MILESTONE', detail: 'Highest conversion rate in region' }],
    },
];

/* -------------------------------------------------------------------------- */
/*                          OpenSearch Configuration                           */
/* -------------------------------------------------------------------------- */

/**
 * OpenSearch index mappings for the 'members' index.
 *
 * @remarks
 * - `member_id` and `email` are keyword fields for exact matching
 * - `fname`, `lname`, `status_notes` are text fields for full-text search
 */
const indexMappings = {
    properties: {
        member_id: { type: 'keyword' },
        email: { type: 'keyword' },
        fname: { type: 'text', analyzer: 'standard' },
        lname: { type: 'text', analyzer: 'standard' },
        status_notes: { type: 'text', analyzer: 'standard' },
        tags: { type: 'keyword' },
    },
};

/* -------------------------------------------------------------------------- */
/*                              PII Redaction                                  */
/* -------------------------------------------------------------------------- */

/**
 * Regular expression patterns for detecting and redacting PII.
 * Applied to status_notes before indexing to prevent sensitive data leakage.
 */
const redactionPatterns = [
    /** Phone pattern: 555-123-4567, (555) 123-4567, +1-555-123-4567 */
    { regex: /\b(\+1[-.\\s]?)?(\(?\d{3}\)?[-.\\s]?)?\d{3}[-.\\s]?\d{4}\b/g, replacement: '[PHONE-REDACTED]' },

    /** Email pattern: user@domain.com */
    { regex: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, replacement: '[EMAIL-REDACTED]' },
];

/**
 * Applies all redaction patterns to an input string.
 *
 * @param input - The string potentially containing PII
 * @returns The sanitized string with PII replaced by redaction markers
 */
function redact(input: string): string {
    let result = input;
    for (const pattern of redactionPatterns) {
        result = result.replace(pattern.regex, pattern.replacement);
    }
    return result;
}

/* -------------------------------------------------------------------------- */
/*                              Seed Functions                                 */
/* -------------------------------------------------------------------------- */

/**
 * Creates the 'members' DynamoDB table if it doesn't already exist.
 *
 * @remarks
 * Uses PAY_PER_REQUEST billing for local development simplicity.
 * Production should consider provisioned capacity based on load patterns.
 */
async function createDynamoDBTable(): Promise<void> {
    console.log('Creating DynamoDB table...');

    try {
        await dynamoClient.send(new DescribeTableCommand({ TableName: 'members' }));
        console.log('   Table already exists');
        return;
    } catch {
        // Table doesn't exist - proceed with creation
    }

    await dynamoClient.send(new CreateTableCommand({
        TableName: 'members',
        KeySchema: [{ AttributeName: 'member_id', KeyType: 'HASH' }],
        AttributeDefinitions: [{ AttributeName: 'member_id', AttributeType: 'S' }],
        BillingMode: 'PAY_PER_REQUEST',
    }));

    console.log('   Table created');
}

/**
 * Seeds mock member records into DynamoDB.
 *
 * @remarks
 * Records are inserted individually to simulate real write patterns.
 * Production indexing uses DynamoDB Streams for event-driven sync.
 */
async function seedDynamoDB(): Promise<void> {
    console.log('Seeding DynamoDB...');

    for (const member of mockMembers) {
        await docClient.send(new PutCommand({
            TableName: 'members',
            Item: member,
        }));
        console.log(`   Added: ${member.fname} ${member.lname}`);
    }

    console.log('   DynamoDB seeded');
}

/**
 * Creates the 'members' OpenSearch index with defined mappings.
 *
 * @remarks
 * Deletes any existing index to ensure clean state for development.
 * Uses single shard and zero replicas for local performance.
 */
async function createOpenSearchIndex(): Promise<void> {
    console.log('Creating OpenSearch index...');

    const exists = await opensearchClient.indices.exists({ index: 'members' });

    if (exists.body) {
        console.log('   Deleting existing index...');
        await opensearchClient.indices.delete({ index: 'members' });
    }

    await opensearchClient.indices.create({
        index: 'members',
        body: {
            mappings: indexMappings,
            settings: {
                number_of_shards: 1,
                number_of_replicas: 0,
            },
        },
    });

    console.log('   Index created');
}

/**
 * Indexes all mock members into OpenSearch with PII redaction.
 *
 * @remarks
 * - Transforms member data before indexing
 * - Applies PII redaction to status_notes
 * - Uses member_id as document _id for idempotent upserts
 */
async function indexToOpenSearch(): Promise<void> {
    console.log('Indexing to OpenSearch (with PII redaction)...');

    for (const member of mockMembers) {
        const doc = {
            member_id: member.member_id,
            email: member.email.toLowerCase(),
            fname: member.fname,
            lname: member.lname,
            status_notes: member.status_notes ? redact(member.status_notes) : undefined,
            tags: member.tags,
        };

        await opensearchClient.index({
            index: 'members',
            id: member.member_id,
            body: doc,
            refresh: true,
        });

        console.log(`   Indexed: ${member.fname} ${member.lname}`);
        if (member.status_notes) {
            console.log(`     Original: "${member.status_notes.substring(0, 50)}..."`);
            console.log(`     Redacted: "${doc.status_notes?.substring(0, 50)}..."`);
        }
    }

    console.log('   OpenSearch indexed');
}

/**
 * Seeds location data to PostgreSQL.
 */
async function seedLocations(): Promise<void> {
    console.log('Seeding Locations to PostgreSQL...');

    const pgClient = new PgClient({
        host: POSTGRES_HOST,
        port: POSTGRES_PORT,
        user: POSTGRES_USER,
        password: POSTGRES_PASSWORD,
        database: POSTGRES_DB,
    });

    try {
        await pgClient.connect();

        // Create table if not exists
        await pgClient.query(`
            CREATE TABLE IF NOT EXISTS locations (
                location_id VARCHAR(50) PRIMARY KEY,
                metadata JSONB NOT NULL,
                staffing JSONB NOT NULL,
                contract_logic JSONB NOT NULL,
                operational_rules JSONB NOT NULL,
                status_events JSONB DEFAULT '[]'
            )
        `);

        // Clear existing data
        await pgClient.query('TRUNCATE TABLE locations');

        // Insert locations
        for (const loc of mockLocations) {
            await pgClient.query(
                `INSERT INTO locations (location_id, metadata, staffing, contract_logic, operational_rules, status_events)
                 VALUES ($1, $2, $3, $4, $5, $6)`,
                [
                    loc.location_id,
                    JSON.stringify(loc.metadata),
                    JSON.stringify(loc.staffing),
                    JSON.stringify(loc.contract_logic),
                    JSON.stringify(loc.operational_rules),
                    JSON.stringify(loc.status_events),
                ]
            );
            console.log(`   Added: ${loc.metadata.name} (${loc.location_id})`);
        }

        console.log(`   PostgreSQL seeded (${mockLocations.length} locations)`);
    } finally {
        await pgClient.end();
    }
}

/* -------------------------------------------------------------------------- */
/*                              Main Entrypoint                                */
/* -------------------------------------------------------------------------- */

/**
 * Reindexes locations from PostgreSQL to OpenSearch via the running API.
 * Requires the NestJS server to be running on localhost:3000.
 */
async function reindexLocations(): Promise<void> {
    console.log('Reindexing locations to OpenSearch...');

    try {
        // Generate admin JWT for reindex endpoint
        const jwt = require('jsonwebtoken');
        const token = jwt.sign(
            {
                sub: 'seed-script',
                'cognito:groups': ['admin'],
                tenant_id: 'rcm-internal',
                tenant_type: 'internal',
            },
            'local-dev-secret-do-not-use-in-prod',
            { issuer: 'http://localhost:3000', expiresIn: '5m' }
        );

        const response = await fetch('http://localhost:3000/admin/locations/reindex', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
        });

        if (response.ok) {
            const result = await response.json();
            console.log(`   Reindexed ${result.success} locations to OpenSearch`);
        } else {
            console.log('   Skipping reindex: Server not running on localhost:3000');
            console.log('   Run reindex manually after starting the server:');
            console.log('   curl -X POST "http://localhost:3000/admin/locations/reindex" -H "Authorization: Bearer $TOKEN"');
        }
    } catch {
        console.log('   Skipping reindex: Server not running on localhost:3000');
        console.log('   Run reindex manually after starting the server:');
        console.log('   curl -X POST "http://localhost:3000/admin/locations/reindex" -H "Authorization: Bearer $TOKEN"');
    }
}

/**
 * Main entrypoint for the seed script.
 * Seeds both Members (DynamoDB + OpenSearch) and Locations (PostgreSQL).
 */
async function main(): Promise<void> {
    console.log('\nFull Seed Script\n');
    console.log('Seeding: Members -> DynamoDB -> OpenSearch');
    console.log('Seeding: Locations -> PostgreSQL\n');

    try {
        // Members (DynamoDB + OpenSearch)
        await createDynamoDBTable();
        await seedDynamoDB();
        await createOpenSearchIndex();
        await indexToOpenSearch();

        // Locations (PostgreSQL)
        await seedLocations();

        // Try to reindex locations if server is running
        await reindexLocations();

        console.log('\nSeeding complete!\n');
        console.log('Data seeded:');
        console.log(`  - ${mockMembers.length} members in DynamoDB + OpenSearch`);
        console.log(`  - ${mockLocations.length} locations in PostgreSQL`);
        console.log('');
    } catch (error) {
        console.error('\nSeeding failed:', error);
        process.exit(1);
    }
}

main();
