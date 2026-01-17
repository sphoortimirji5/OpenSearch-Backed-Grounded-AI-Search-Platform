/**
 * @fileoverview Shared Redaction Module
 *
 * PII redaction service used by all indexers.
 */

import { Module } from '@nestjs/common';
import { RedactionService } from './redaction.service';

@Module({
    providers: [RedactionService],
    exports: [RedactionService],
})
export class SharedRedactionModule { }
