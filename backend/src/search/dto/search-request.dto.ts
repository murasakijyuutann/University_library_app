import { IsInt, IsOptional, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { DEFAULT_PAGE_SIZE } from '../api';

/**
 * Query-string DTO for GET /api/search. Oversized `size` is clamped inside
 * UnifiedSearchService (Phase 5.4) rather than rejected at the boundary — so
 * both engines enforce the same DoS cap.
 */
export class SearchRequestDto {
  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @IsString()
  type?: string;

  @IsOptional()
  @IsString()
  department?: string;

  @IsOptional()
  @IsString()
  year?: string;

  @IsOptional()
  @IsString()
  language?: string;

  @IsOptional()
  @IsString()
  degreeType?: string;

  @IsOptional()
  @IsString()
  accessStatus?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  size?: number = DEFAULT_PAGE_SIZE;
}
