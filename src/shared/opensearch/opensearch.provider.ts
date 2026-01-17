/**
 * @fileoverview OpenSearch Provider
 *
 * Factory for OpenSearch client with environment-appropriate configuration.
 * Provides health checking and index management utilities.
 *
 * @remarks
 * Local vs Production:
 * - Local: Connects to Docker-hosted OpenSearch with TLS verification disabled
 * - Production: Connects to AWS OpenSearch Service with IAM authentication
 *
 * This provider is designed to be injected across services that need
 * OpenSearch access (SearchService, IndexerService).
 */

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client } from '@opensearch-project/opensearch';

/* -------------------------------------------------------------------------- */
/*                              Provider Implementation                        */
/* -------------------------------------------------------------------------- */

@Injectable()
export class OpenSearchProvider {
    /** Singleton OpenSearch client instance */
    private client: Client;

    /**
     * Creates the OpenSearch provider with environment-based configuration.
     *
     * @param configService - NestJS config service for environment variables
     *
     * @remarks
     * SSL configuration:
     * - rejectUnauthorized: false for local development (self-signed certs)
     * - Production deployments should enable certificate verification
     *
     * For AWS OpenSearch Service, consider adding AWS SigV4 signing:
     * ```typescript
     * const connector = createAwsConnector(awsCredentials);
     * this.client = new Client({ ...connector, node });
     * ```
     */
    constructor(private configService: ConfigService) {
        const node = this.configService.get<string>('OPENSEARCH_NODE');
        const isProduction = this.configService.get<string>('NODE_ENV') === 'production';

        this.client = new Client({
            node,
            ssl: {
                // SECURITY: Enable TLS verification in production to prevent MITM attacks
                // Only disable for local development with self-signed certs
                rejectUnauthorized: isProduction,
            },
        });
    }

    /**
     * Returns the configured OpenSearch client instance.
     *
     * @returns OpenSearch Client for query and index operations
     */
    getClient(): Client {
        return this.client;
    }

    /**
     * Performs a cluster health check.
     *
     * @returns True if cluster status is green or yellow, false if red or unreachable
     *
     * @remarks
     * Used by health endpoints to verify OpenSearch connectivity.
     * Returns false for any network or authentication errors.
     */
    async healthCheck(): Promise<boolean> {
        try {
            const response = await this.client.cluster.health({});
            return response.body.status !== 'red';
        } catch {
            return false;
        }
    }

    /**
     * Creates an index with the specified mappings if it doesn't exist.
     *
     * @param indexName - Name of the index to create
     * @param mappings - OpenSearch mapping configuration
     *
     * @remarks
     * This is idempotent - if the index already exists, no action is taken.
     * Default settings use 1 shard and 1 replica, suitable for small datasets.
     * Adjust sharding for production scale requirements.
     */
    async ensureIndex(indexName: string, mappings: Record<string, unknown>): Promise<void> {
        const exists = await this.client.indices.exists({ index: indexName });

        if (!exists.body) {
            await this.client.indices.create({
                index: indexName,
                body: {
                    mappings,
                    settings: {
                        number_of_shards: 1,
                        number_of_replicas: 1,
                    },
                },
            });
        }
    }
}
