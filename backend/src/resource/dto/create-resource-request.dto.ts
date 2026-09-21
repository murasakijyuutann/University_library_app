import { DegreeType } from '@prisma/client';
import { IsInt, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class CreatePhysicalBookRequestDto {
  @IsString()
  @MaxLength(500)
  title!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  department?: string;

  @IsOptional()
  @IsString()
  isbn?: string;

  @IsOptional()
  @IsString()
  author?: string;

  @IsOptional()
  @IsString()
  publisher?: string;

  @IsOptional()
  @IsInt()
  publicationYear?: number;

  @IsOptional()
  @IsString()
  callNumber?: string;
}

export class CreateThesisRequestDto {
  @IsString()
  @MaxLength(500)
  title!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  department?: string;

  /** A Member id — accepted as a numeric string, converted to bigint in the controller. */
  @Matches(/^\d+$/, { message: 'studentMemberId must be a numeric string.' })
  studentMemberId!: string;

  @IsOptional()
  degreeType?: DegreeType;

  @IsOptional()
  @IsString()
  embargoUntil?: string;
}

export class CreateJournalArticleRequestDto {
  @IsString()
  @MaxLength(500)
  title!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  department?: string;

  @IsOptional()
  @IsString()
  doi?: string;

  @IsOptional()
  @IsString()
  volume?: string;

  @IsOptional()
  @IsString()
  issue?: string;

  @IsOptional()
  @IsString()
  pageRange?: string;

  @IsOptional()
  @Matches(/^\d+$/, { message: 'journalId must be a numeric string.' })
  journalId?: string;

  @IsOptional()
  @Matches(/^\d+$/, { message: 'licenseId must be a numeric string.' })
  licenseId?: string;
}

export class CreateResearchReportRequestDto {
  @IsString()
  @MaxLength(500)
  title!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  department?: string;

  @IsOptional()
  @IsString()
  departmentScope?: string;

  @IsOptional()
  @IsInt()
  reportYear?: number;
}

export class CreateRareMaterialRequestDto {
  @IsString()
  @MaxLength(500)
  title!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  department?: string;

  @IsOptional()
  readingRoomOnly?: boolean;

  @IsOptional()
  @IsString()
  handlingNotes?: string;
}
