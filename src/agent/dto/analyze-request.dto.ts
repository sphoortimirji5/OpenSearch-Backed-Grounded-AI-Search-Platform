/**
 * @fileoverview Analyze Request DTO
 */

import { IsString, IsOptional, IsNumber, Min, Max } from 'class-validator';

export class AnalyzeRequestDto {
    @IsString()
    question: string;

    @IsOptional()
    @IsString()
    locationId?: string;

    @IsOptional()
    @IsNumber()
    @Min(1)
    @Max(500)
    limit?: number;
}
