/**
 * @fileoverview Members Repository
 *
 * Data access layer for member records in DynamoDB.
 * Provides a clean interface for CRUD operations on the members table.
 *
 * @remarks
 * This repository is the source of truth for member data. OpenSearch
 * is kept in sync via DynamoDB Streams but is not authoritative.
 *
 * Credential handling:
 * - Local: Uses environment-configured endpoint with any credentials
 * - Production: AWS SDK auto-resolves credentials from IAM Task Role
 */

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { Member, ScanPage } from './interfaces';

/* -------------------------------------------------------------------------- */
/*                              Re-exports for Convenience                     */
/* -------------------------------------------------------------------------- */

export { Member, ScanPage } from './interfaces';

/* -------------------------------------------------------------------------- */
/*                              Repository Implementation                      */
/* -------------------------------------------------------------------------- */

@Injectable()
export class MembershipRepository {
    private readonly logger = new Logger(MembershipRepository.name);
    private readonly docClient: DynamoDBDocumentClient;

    /** DynamoDB table name */
    private readonly tableName = 'members';

    /**
     * Creates the repository with DynamoDB client configuration.
     *
     * @param configService - NestJS config service for environment variables
     *
     * @remarks
     * The endpoint is optional and only used for local development with
     * DynamoDB Local. In production (ECS/Lambda), the SDK automatically
     * uses the regional DynamoDB endpoint with IAM Task Role credentials.
     */
    constructor(private configService: ConfigService) {
        const endpoint = this.configService.get<string>('DYNAMODB_ENDPOINT');
        const region = this.configService.get<string>('AWS_REGION') || 'us-east-1';

        const client = new DynamoDBClient({
            region,
            ...(endpoint && { endpoint }),
        });

        this.docClient = DynamoDBDocumentClient.from(client);
    }

    /**
     * Retrieves a member by their unique identifier.
     *
     * @param memberId - The member_id to look up
     * @returns The member record if found, null otherwise
     */
    async findById(memberId: string): Promise<Member | null> {
        const result = await this.docClient.send(new GetCommand({
            TableName: this.tableName,
            Key: { member_id: memberId },
        }));

        return (result.Item as Member) || null;
    }

    /**
     * Retrieves all members up to the specified limit.
     *
     * @param limit - Maximum number of records to return (default: 100)
     * @returns Array of member records
     *
     * @remarks
     * Uses Scan operation which is expensive at scale. For production
     * workloads, consider pagination via scanPage().
     */
    async findAll(limit = 100): Promise<Member[]> {
        const result = await this.docClient.send(new ScanCommand({
            TableName: this.tableName,
            Limit: limit,
        }));

        return (result.Items as Member[]) || [];
    }

    /**
     * Performs a paginated scan of the members table.
     *
     * @param pageSize - Number of records per page (default: 100)
     * @param exclusiveStartKey - Key to resume from (for pagination)
     * @returns ScanPage with items and optional continuation key
     *
     * @remarks
     * Use this for full table reindexing. Iterate until lastEvaluatedKey
     * is undefined to process all records.
     *
     * @example
     * ```typescript
     * let page = await repo.scanPage(100);
     * while (page.items.length > 0) {
     *     await indexer.bulkIndex(page.items);
     *     if (!page.lastEvaluatedKey) break;
     *     page = await repo.scanPage(100, page.lastEvaluatedKey);
     * }
     * ```
     */
    async scanPage(
        pageSize = 100,
        exclusiveStartKey?: Record<string, unknown>,
    ): Promise<ScanPage> {
        const result = await this.docClient.send(new ScanCommand({
            TableName: this.tableName,
            Limit: pageSize,
            ...(exclusiveStartKey && { ExclusiveStartKey: exclusiveStartKey }),
        }));

        return {
            items: (result.Items as Member[]) || [],
            lastEvaluatedKey: result.LastEvaluatedKey as Record<string, unknown> | undefined,
        };
    }

    /**
     * Saves a member record (insert or update).
     *
     * @param member - Complete member record to persist
     *
     * @remarks
     * Uses PutItem which performs an upsert - existing records with
     * the same member_id will be fully replaced.
     */
    async save(member: Member): Promise<void> {
        await this.docClient.send(new PutCommand({
            TableName: this.tableName,
            Item: member,
        }));
    }

    /**
     * Counts total records in the table.
     *
     * @returns Total number of members
     *
     * @remarks
     * Uses Scan with Select=COUNT which is still expensive but doesn't
     * transfer item data. For production, consider maintaining a separate counter.
     */
    async count(): Promise<number> {
        let total = 0;
        let lastKey: Record<string, unknown> | undefined;

        do {
            const result = await this.docClient.send(new ScanCommand({
                TableName: this.tableName,
                Select: 'COUNT',
                ...(lastKey && { ExclusiveStartKey: lastKey }),
            }));
            total += result.Count || 0;
            lastKey = result.LastEvaluatedKey as Record<string, unknown> | undefined;
        } while (lastKey);

        return total;
    }
}
