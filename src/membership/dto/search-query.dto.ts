/**
 * @fileoverview Search Query DTO
 *
 * Request DTO for search endpoint with validation.
 */

import { IsOptional, IsString, IsBoolean, IsInt, Min, Max } from 'class-validator';
import { Transform, Type } from 'class-transformer';

/**
 * Search query parameters DTO.
 *
 * @example
 * ```
 * GET /search?q=violation&fuzzy=true&limit=20
 * ```
 */
export class SearchQueryDto {
    /** Free-text search query */
    @IsOptional()
    @IsString()
    q?: string;

    /** Exact email match */
    @IsOptional()
    @IsString()
    email?: string;

    /** Filter by tag */
    @IsOptional()
    @IsString()
    tag?: string;

    /** Enable fuzzy matching */
    @IsOptional()
    @Transform(({ value }) => value === 'true' || value === true)
    @IsBoolean()
    fuzzy?: boolean = false;

    /** Maximum results to return */
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(100)
    limit?: number = 20;
}
