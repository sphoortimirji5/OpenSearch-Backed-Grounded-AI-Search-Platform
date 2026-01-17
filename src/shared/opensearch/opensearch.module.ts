/**
 * @fileoverview Shared OpenSearch Module
 *
 * Provides OpenSearch client to all verticals (membership, locations, agent).
 */

import { Module } from '@nestjs/common';
import { OpenSearchProvider } from './opensearch.provider';

@Module({
    providers: [OpenSearchProvider],
    exports: [OpenSearchProvider],
})
export class SharedOpenSearchModule { }
