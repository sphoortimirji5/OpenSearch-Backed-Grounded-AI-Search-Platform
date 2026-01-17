/**
 * @fileoverview Member Indexer Service
 *
 * Handles transformation and indexing of member records from DynamoDB to OpenSearch.
 * Implements the Extract-Redact-Index pipeline with validation and PII protection.
 *
 * @remarks
 * Key responsibilities:
 * 1. Validate incoming member data (rejects malformed records early)
 * 2. Transform and redact PII before indexing
 * 3. Index documents to OpenSearch with idempotent upserts
 * 4. Full reindex capability for recovery and mapping changes
 *
 * This service is invoked by:
 * - Lambda indexer (DynamoDB Stream events)
 * - Admin reindex endpoint (full table reindex)
 */

import { Injectable, Logger } from '@nestjs/common';
import { OpenSearchProvider } from '../shared/opensearch';
import { RedactionService } from '../shared/redaction';
import { Member, MembershipRepository } from './membership.repository';
import { Counter } from 'prom-client';
import { z } from 'zod';
import { IndexDocument, ValidationError } from './interfaces';
import { ReindexResultDto, BulkIndexResultDto } from './dto';

/* -------------------------------------------------------------------------- */
/*                              Prometheus Metrics                             */
/* -------------------------------------------------------------------------- */

/**
 * Counter for index operations, labeled by success/error and failure reason.
 */
const indexCounter = new Counter({
    name: 'membersearch_index_operations_total',
    help: 'Total number of index operations',
    labelNames: ['status', 'reason'],
});

/**
 * Counter for reindex operations.
 */
const reindexCounter = new Counter({
    name: 'membersearch_reindex_total',
    help: 'Total number of full reindex operations',
    labelNames: ['status'],
});

/* -------------------------------------------------------------------------- */
/*                              Validation Schema                              */
/* -------------------------------------------------------------------------- */

/**
 * Zod schema for validating incoming member records.
 */
const MemberSchema = z.object({
    member_id: z.string().min(1, 'member_id is required'),
    tenant_id: z.string().optional(),
    email: z.string().email('Invalid email format'),
    fname: z.string().min(1, 'fname is required'),
    lname: z.string().min(1, 'lname is required'),
    status_notes: z.string().optional(),
    tags: z.array(z.string()).optional(),
    created_at: z.string(),
    updated_at: z.string(),
});

/* -------------------------------------------------------------------------- */
/*                              Re-exports for Convenience                     */
/* -------------------------------------------------------------------------- */

export { IndexDocument, ValidationError } from './interfaces';
export { ReindexResultDto, BulkIndexResultDto } from './dto';

/** Alias for backward compatibility */
export type ReindexResult = ReindexResultDto;

/* -------------------------------------------------------------------------- */
/*                              Service Implementation                         */
/* -------------------------------------------------------------------------- */

@Injectable()
export class MembershipIndexerService {
    private readonly logger = new Logger(MembershipIndexerService.name);

    /** OpenSearch index name for member documents */
    private readonly INDEX_NAME = 'members';

    constructor(
        private opensearchProvider: OpenSearchProvider,
        private redactionService: RedactionService,
        private membershipRepository: MembershipRepository,
    ) { }

    /**
     * Validates a member record against the schema.
     */
    private validateMember(member: Member): ValidationError | null {
        const result = MemberSchema.safeParse(member);
        if (!result.success) {
            return {
                member_id: member.member_id,
                errors: result.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`),
            };
        }
        return null;
    }

    /**
     * Transforms a member record for OpenSearch indexing.
     */
    private transformForIndex(member: Member): IndexDocument {
        return {
            member_id: member.member_id,
            tenant_id: member.tenant_id,
            email: member.email.toLowerCase(),
            fname: member.fname,
            lname: member.lname,
            status_notes: member.status_notes
                ? this.redactionService.redact(member.status_notes)
                : undefined,
            tags: member.tags,
        };
    }

    /**
     * Indexes a single member to OpenSearch.
     *
     * @param member - Member record to index
     * @throws Error if validation fails or OpenSearch rejects the document
     *
     * @remarks
     * Idempotency: Uses member_id as the document _id. Repeated calls
     * for the same member will upsert, making retries safe.
     */
    async indexMember(member: Member): Promise<void> {
        const validationError = this.validateMember(member);
        if (validationError) {
            indexCounter.inc({ status: 'error', reason: 'validation' });
            this.logger.warn({
                msg: 'Member validation failed',
                member_id: validationError.member_id,
                errors: validationError.errors,
            });
            throw new Error(`Validation failed: ${validationError.errors.join(', ')}`);
        }

        try {
            const client = this.opensearchProvider.getClient();
            const doc = this.transformForIndex(member);

            await client.index({
                index: this.INDEX_NAME,
                id: member.member_id,
                body: doc,
                refresh: true,
            });

            indexCounter.inc({ status: 'success', reason: '' });
            this.logger.log({ msg: 'Member indexed', member_id: member.member_id });
        } catch (error) {
            indexCounter.inc({ status: 'error', reason: 'opensearch' });
            this.logger.error({ msg: 'Indexing failed', member_id: member.member_id, error });
            throw error;
        }
    }

    /**
     * Bulk indexes multiple members to OpenSearch.
     *
     * @param members - Array of member records to index
     * @returns Object with success and failed counts
     * @throws Error if bulk operation fails entirely
     */
    async bulkIndex(members: Member[]): Promise<{ success: number; failed: number }> {
        const client = this.opensearchProvider.getClient();
        let success = 0;
        let failed = 0;

        // Phase 1: Validate all members
        const validationErrors: ValidationError[] = [];
        const validMembers: Member[] = [];

        for (const member of members) {
            const error = this.validateMember(member);
            if (error) {
                validationErrors.push(error);
                failed++;
                indexCounter.inc({ status: 'error', reason: 'validation' });
            } else {
                validMembers.push(member);
            }
        }

        if (validationErrors.length > 0) {
            this.logger.warn({
                msg: 'Some members failed validation',
                count: validationErrors.length,
                errors: validationErrors,
            });
        }

        if (validMembers.length === 0) {
            return { success, failed };
        }

        // Phase 2: Bulk index valid members
        const operations = validMembers.flatMap((member) => {
            const doc = this.transformForIndex(member);
            return [
                { index: { _index: this.INDEX_NAME, _id: member.member_id } },
                doc,
            ];
        });

        try {
            const response = await client.bulk({ body: operations, refresh: true });

            if (response.body.errors) {
                response.body.items.forEach((item: { index?: { error?: unknown } }) => {
                    if (item.index?.error) {
                        failed++;
                        indexCounter.inc({ status: 'error', reason: 'opensearch' });
                    } else {
                        success++;
                        indexCounter.inc({ status: 'success', reason: '' });
                    }
                });
            } else {
                success = validMembers.length;
                indexCounter.inc({ status: 'success', reason: '' }, success);
            }

            this.logger.log({ msg: 'Bulk index completed', success, failed });
        } catch (error) {
            failed += validMembers.length;
            indexCounter.inc({ status: 'error', reason: 'opensearch' }, validMembers.length);
            this.logger.error({ msg: 'Bulk index failed', error });
            throw error;
        }

        return { success, failed };
    }

    /**
     * Performs a full reindex of all members from DynamoDB to OpenSearch.
     *
     * @param batchSize - Number of records per batch (default: 100)
     * @returns ReindexResult with counts and duration
     *
     * @remarks
     * - Scans DynamoDB in batches to avoid memory issues
     * - Each batch is bulk-indexed to OpenSearch
     * - Idempotent: safe to run multiple times
     * - Use for: index corruption recovery, mapping changes, initial load
     *
     * @example
     * ```typescript
     * const result = await indexerService.reindexAll(500);
     * console.log(`Reindexed ${result.success}/${result.total} in ${result.durationMs}ms`);
     * ```
     */
    async reindexAll(batchSize = 100): Promise<ReindexResult> {
        const startTime = Date.now();
        let total = 0;
        let success = 0;
        let failed = 0;

        this.logger.log({ msg: 'Starting full reindex', batchSize });

        try {
            let page = await this.membershipRepository.scanPage(batchSize);

            while (page.items.length > 0) {
                total += page.items.length;
                const result = await this.bulkIndex(page.items);
                success += result.success;
                failed += result.failed;

                this.logger.log({
                    msg: 'Reindex batch completed',
                    batchSize: page.items.length,
                    totalProcessed: total,
                    hasMore: !!page.lastEvaluatedKey,
                });

                if (!page.lastEvaluatedKey) break;
                page = await this.membershipRepository.scanPage(batchSize, page.lastEvaluatedKey);
            }

            const durationMs = Date.now() - startTime;
            reindexCounter.inc({ status: 'success' });

            this.logger.log({
                msg: 'Full reindex completed',
                total,
                success,
                failed,
                durationMs,
            });

            return { total, success, failed, durationMs };
        } catch (error) {
            reindexCounter.inc({ status: 'error' });
            this.logger.error({ msg: 'Reindex failed', error, processed: total });
            throw error;
        }
    }
}
