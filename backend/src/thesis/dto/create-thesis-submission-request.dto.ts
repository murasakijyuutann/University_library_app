import { DegreeType } from '@prisma/client';
import { IsEnum, IsOptional } from 'class-validator';

export class CreateThesisSubmissionRequestDto {
  @IsOptional()
  @IsEnum(DegreeType)
  degreeType?: DegreeType;
}
