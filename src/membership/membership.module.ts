/**
 * @fileoverview Membership Module
 *
 * Self-contained vertical for member data: repository, indexer, and search.
 * Imports shared modules for auth, opensearch, and redaction.
 */

import { Module } from '@nestjs/common';
import { SharedOpenSearchModule } from '../shared/opensearch';
import { SharedRedactionModule } from '../shared/redaction';
import { MembershipRepository } from './membership.repository';
import { MembershipIndexerService } from './membership-indexer.service';
import { MembershipIndexerController } from './membership-indexer.controller';
import { MembershipSearchService } from './membership-search.service';
import { MembershipSearchController } from './membership-search.controller';

@Module({
    imports: [SharedOpenSearchModule, SharedRedactionModule],
    controllers: [MembershipIndexerController, MembershipSearchController],
    providers: [
        MembershipRepository,
        MembershipIndexerService,
        MembershipSearchService,
    ],
    exports: [MembershipRepository, MembershipSearchService],
})
export class MembershipModule { }
